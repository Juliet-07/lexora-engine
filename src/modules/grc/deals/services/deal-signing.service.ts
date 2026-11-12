import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Deal, DealDocument, DealPartySide, partySide } from '../schemas';
import {
  PublicSignDto,
  RemindSignatoryDto,
  SendExecutedCopiesDto,
  SendForSigningDto,
} from '../dtos';
import { DealService } from './deal.service';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import {
  SigningPackData,
  buildSigningCertificate,
  drawSignaturePage,
  pngFromDataUrl,
} from 'src/common/utils/pdf/deal-signing.util';

const SIDES = [DealPartySide.PARTY_A, DealPartySide.PARTY_B] as const;
const MAX_DRAWN_BYTES = 400 * 1024;
const CHANGED_MESSAGE =
  'This document was changed after it was sent for signing. Ask the sender to send it again.';

// What a browser says about itself, boiled down to "Chrome 119 / macOS".
function describeDevice(ua: string | null): string | null {
  if (!ua) return null;
  const pick = (re: RegExp) => re.exec(ua)?.[1];
  const browser = pick(/Edg\/(\d+)/)
    ? `Edge ${pick(/Edg\/(\d+)/)}`
    : pick(/Firefox\/(\d+)/)
      ? `Firefox ${pick(/Firefox\/(\d+)/)}`
      : pick(/Chrome\/(\d+)/)
        ? `Chrome ${pick(/Chrome\/(\d+)/)}`
        : pick(/Version\/(\d+).*Safari/)
          ? `Safari ${pick(/Version\/(\d+).*Safari/)}`
          : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} / ${os}` : browser;
}

// Signing, kept deliberately simple: the document goes to the authorised
// signatory of Party A and of Party B, each signs from a personal emailed
// link (typed or drawn), and when both have, the executed PDF and a
// certificate are available. No signing order, witnesses or settings.
@Injectable()
export class DealSigningService {
  constructor(
    @InjectModel(Deal.name) private readonly model: Model<DealDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly dealService: DealService,
    private readonly emailService: EmailService,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────

  private async getDeal(tenantId: string, id: string): Promise<DealDocument> {
    const deal = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  private audit(
    deal: DealDocument,
    type: string,
    text: string,
    ip: string | null = null,
  ) {
    deal.signing.audit.push({ at: new Date(), type, text, ip } as any);
  }

  /** SHA-256 of the document text a signatory reads and signs. */
  private documentHash(contract: any): string {
    return createHash('sha256')
      .update(JSON.stringify(this.dealService.documentPreview(contract)))
      .digest('hex');
  }

  private link(token: string): string {
    return `${process.env.TENANT_APP_URL}/deal-sign/${token}`;
  }

  private contractOf(deal: DealDocument): any | null {
    const id = deal.signing?.document?.contractId;
    if (!id) return null;
    return deal.contracts.find((c) => String(c._id) === String(id)) ?? null;
  }

  private completed(deal: DealDocument): boolean {
    const sigs = deal.signing?.signatories ?? [];
    return sigs.length > 0 && sigs.every((s) => s.signed);
  }

  private pack(deal: DealDocument, businessName: string): SigningPackData {
    const doc = deal.signing.document;
    return {
      businessName,
      dealName: deal.name,
      documentName: doc?.name ?? '',
      reference: doc?.reference ?? '',
      hash: doc?.hash ?? '',
      initiatedAt: doc?.sentAt ?? null,
      completedAt: doc?.completedAt ?? null,
      signatories: deal.signing.signatories.map((s) => ({
        name: s.name,
        title: s.title,
        side: s.party,
        email: s.email,
        signed: !!s.signed,
        method: s.signatureMethod,
        data: s.signatureData,
        signedAt: s.signedAt,
        ip: s.ip,
        device: s.device,
        hash: s.hash,
      })),
      audit: deal.signing.audit.map((a) => ({
        at: a.at,
        text: a.text,
        ip: a.ip,
      })),
    };
  }

  private async signedPdfBuffer(
    deal: DealDocument,
    businessName: string,
  ): Promise<Buffer> {
    const contract = this.contractOf(deal);
    if (!contract) throw new BadRequestException('No document is out for signing.');
    const pack = this.pack(deal, businessName);
    return this.dealService.buildContractPdf(
      deal,
      contract,
      businessName,
      (pdf) => drawSignaturePage(pdf, pack),
    );
  }

  private async businessNameOf(deal: DealDocument): Promise<string> {
    const u: any = await this.userModel
      .findById(deal.tenantId)
      .select('businessName firstName lastName')
      .lean();
    return (
      u?.businessName ||
      `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() ||
      'Lexora'
    );
  }

  // ── Tenant side ──────────────────────────────────────────────

  async send(
    tenantId: string,
    id: string,
    dto: SendForSigningDto,
    actor: string,
    businessName: string,
  ) {
    const deal = await this.getDeal(tenantId, id);
    const contract: any = deal.contracts.find(
      (c) => String(c._id) === dto.contractId,
    );
    if (!contract) throw new NotFoundException('Document not found');
    if ((contract.kind ?? 'contract') !== 'contract')
      throw new BadRequestException('Only contracts are signed.');
    if ((contract.sections ?? []).length === 0)
      throw new BadRequestException('This contract has no text yet.');
    if (deal.signing.signatories.some((s) => s.signed))
      throw new BadRequestException(
        'Signing has already started on this deal. Use reminders to chase the remaining signatory.',
      );

    // Each side's authorised signatory, from the deal's parties.
    const chosen = SIDES.map((side) => {
      const p = deal.parties.find(
        (x) => partySide(x.side) === side && x.authorizedSignatory,
      );
      if (!p)
        throw new BadRequestException(
          `Select an authorised signatory for ${side} in the deal's parties first.`,
        );
      if (!p.email)
        throw new BadRequestException(`${p.name} has no email address.`);
      return { side, party: p };
    });

    const hash = this.documentHash(contract);
    const now = new Date();
    deal.signing.signatories = chosen.map(({ side, party }) => ({
      name: party.name,
      party: side,
      role: party.title,
      title: party.title,
      email: party.email,
      token: randomBytes(24).toString('hex'),
      status: 'sent',
      sentAt: now,
      signed: false,
    })) as any;
    deal.signing.document = {
      contractId: contract._id,
      name: contract.name,
      reference: contract.reference ?? '',
      hash,
      sentAt: now,
      sentBy: actor,
      completedAt: null,
      signedPdfUrl: null,
      archivedToDataRoom: false,
    } as any;
    this.audit(
      deal,
      'send',
      `${actor} sent "${contract.name}" for signing to ${chosen
        .map((c) => `${c.party.name} (${c.side})`)
        .join(' and ')}`,
    );
    deal.markModified('signing');
    await deal.save();

    const failed: string[] = [];
    for (const s of deal.signing.signatories) {
      try {
        await this.emailService.sendDealSigningEmail({
          to: s.email,
          recipientName: s.name,
          dealName: deal.name,
          documentName: contract.name,
          kind: 'request',
          signLink: this.link(s.token),
          message: dto.message,
          businessName,
        });
      } catch {
        failed.push(s.email);
      }
    }
    return { sent: deal.signing.signatories.length - failed.length, failed };
  }

  async remind(
    tenantId: string,
    id: string,
    dto: RemindSignatoryDto,
    businessName: string,
  ) {
    const deal = await this.getDeal(tenantId, id);
    const contract = this.contractOf(deal);
    if (!contract) throw new BadRequestException('No document is out for signing.');
    const targets = deal.signing.signatories.filter(
      (s, i) => !s.signed && s.token && (dto.index === undefined || i === dto.index),
    );
    if (targets.length === 0)
      throw new BadRequestException('Nobody is waiting to sign.');
    const failed: string[] = [];
    for (const s of targets) {
      try {
        await this.emailService.sendDealSigningEmail({
          to: s.email,
          recipientName: s.name,
          dealName: deal.name,
          documentName: contract.name,
          kind: 'reminder',
          signLink: this.link(s.token),
          businessName,
        });
        s.lastRemindedAt = new Date();
        this.audit(deal, 'remind', `Reminder sent to ${s.name} (${s.party})`);
      } catch {
        failed.push(s.email);
      }
    }
    deal.markModified('signing');
    await deal.save();
    return { reminded: targets.length - failed.length, failed };
  }

  // Cancels signing that nobody has signed yet — to pick another document or
  // another signatory.
  async reset(tenantId: string, id: string) {
    const deal = await this.getDeal(tenantId, id);
    if (deal.signing.signatories.some((s) => s.signed))
      throw new BadRequestException(
        'Someone has already signed, so signing cannot be cancelled.',
      );
    deal.signing.signatories = [] as any;
    deal.signing.document = null;
    this.audit(deal, 'reset', 'Signing was cancelled');
    deal.markModified('signing');
    await deal.save();
    return { ok: true };
  }

  async getSignedPdf(
    tenantId: string,
    id: string,
    businessName: string,
  ): Promise<Buffer> {
    const deal = await this.getDeal(tenantId, id);
    const url = deal.signing.document?.signedPdfUrl;
    // Once everyone has signed the executed copy is kept as it was.
    if (url) {
      const path = join(process.cwd(), url.replace(/^\//, ''));
      if (existsSync(path)) return readFileSync(path);
    }
    return this.signedPdfBuffer(deal, businessName);
  }

  async getCertificate(
    tenantId: string,
    id: string,
    businessName: string,
  ): Promise<Buffer> {
    const deal = await this.getDeal(tenantId, id);
    if (!deal.signing.document)
      throw new BadRequestException('No document is out for signing.');
    return buildSigningCertificate(this.pack(deal, businessName));
  }

  async sendExecutedCopies(
    tenantId: string,
    id: string,
    dto: SendExecutedCopiesDto,
    businessName: string,
  ) {
    const deal = await this.getDeal(tenantId, id);
    if (!this.completed(deal))
      throw new BadRequestException('Everyone has to sign first.');
    const name = deal.signing.document?.name ?? 'Document';
    const attachments = [
      {
        filename: `${name} (Executed).pdf`,
        content: await this.getSignedPdf(tenantId, id, businessName),
      },
    ];
    if (dto.includeCertificate !== false) {
      attachments.push({
        filename: `${name} (Signing certificate).pdf`,
        content: await buildSigningCertificate(this.pack(deal, businessName)),
      });
    }
    const failed: string[] = [];
    for (const s of deal.signing.signatories) {
      try {
        await this.emailService.sendDealSigningEmail(
          {
            to: s.email,
            recipientName: s.name,
            dealName: deal.name,
            documentName: name,
            kind: 'executed',
            message: dto.message,
            businessName,
          },
          attachments,
        );
        this.audit(deal, 'copies', `Executed copy sent to ${s.name} (${s.party})`);
      } catch {
        failed.push(s.email);
      }
    }
    deal.markModified('signing');
    await deal.save();
    return { sent: deal.signing.signatories.length - failed.length, failed };
  }

  // Signing is done: file the executed copy in the data room and move the
  // deal on to CPs Tracking.
  async advance(tenantId: string, id: string, actor: string) {
    const deal = await this.getDeal(tenantId, id);
    if (!this.completed(deal))
      throw new BadRequestException('Everyone has to sign first.');
    const doc = deal.signing.document!;
    if (!doc.archivedToDataRoom && doc.signedPdfUrl) {
      const folder = 'Executed documents';
      if (!deal.dataRoom.folders.some((f) => f.name === folder))
        deal.dataRoom.folders.push({ name: folder } as any);
      const path = join(process.cwd(), doc.signedPdfUrl.replace(/^\//, ''));
      deal.dataRoom.files.push({
        name: `${doc.name} (Executed).pdf`,
        fileUrl: doc.signedPdfUrl,
        mimeType: 'application/pdf',
        size: existsSync(path) ? readFileSync(path).length : 0,
        folder,
        uploadedAt: new Date(),
        uploadedBy: actor,
        version: 1,
        views: 0,
      } as any);
      doc.archivedToDataRoom = true;
    }
    if (deal.stage === 'Signing') deal.stage = 'CPs Tracking' as any;
    this.audit(deal, 'complete', `${actor} moved the deal to CPs Tracking`);
    deal.markModified('signing');
    deal.markModified('dataRoom');
    await deal.save();
    return { ok: true, stage: deal.stage };
  }

  // ── Signatory side (public, by link) ─────────────────────────

  private async byToken(token: string) {
    const deal = await this.model.findOne({
      'signing.signatories.token': token,
    });
    const sig = deal?.signing.signatories.find((s) => s.token === token);
    if (!deal || !sig)
      throw new NotFoundException('This signing link is not valid.');
    return { deal, sig };
  }

  async getPublic(token: string, ip: string | null) {
    const { deal, sig } = await this.byToken(token);
    const contract = this.contractOf(deal);
    if (!contract) throw new NotFoundException('This signing link is not valid.');
    const changed = this.documentHash(contract) !== deal.signing.document?.hash;
    if (!sig.viewedAt && !sig.signed) {
      sig.viewedAt = new Date();
      this.audit(deal, 'view', `${sig.name} opened the document`, ip);
      deal.markModified('signing');
      await deal.save();
    }
    const sigs = deal.signing.signatories;
    return {
      businessName: await this.businessNameOf(deal),
      dealName: deal.name,
      documentName: contract.name,
      state: sig.signed ? 'signed' : changed ? 'changed' : 'ready',
      signatory: {
        name: sig.name,
        email: sig.email,
        title: sig.title,
        side: sig.party,
      },
      signedAt: sig.signedAt,
      signatureMethod: sig.signatureMethod,
      signatureData: sig.signed ? sig.signatureData : null,
      completed: this.completed(deal),
      others: sigs
        .filter((s) => s.token !== token)
        .map((s) => ({ name: s.name, side: s.party, signed: !!s.signed })),
      preview: this.dealService.documentPreview(contract),
    };
  }

  async submitPublic(
    token: string,
    dto: PublicSignDto,
    ip: string | null,
    userAgent: string | null,
  ) {
    const { deal, sig } = await this.byToken(token);
    if (sig.signed) throw new BadRequestException('You have already signed.');
    if (!dto.consent)
      throw new BadRequestException('Please confirm you agree to sign.');
    const name = (dto.name ?? '').trim();
    if (!name) throw new BadRequestException('Type your full name.');
    const contract = this.contractOf(deal);
    if (!contract) throw new NotFoundException('This signing link is not valid.');
    const hash = this.documentHash(contract);
    if (hash !== deal.signing.document?.hash)
      throw new BadRequestException(CHANGED_MESSAGE);

    let data = name;
    if (dto.method === 'drawn') {
      const png = pngFromDataUrl(dto.signatureData ?? null);
      if (!png) throw new BadRequestException('Draw your signature first.');
      if (png.length > MAX_DRAWN_BYTES)
        throw new BadRequestException('That signature is too large.');
      data = dto.signatureData!;
    }
    sig.name = name;
    sig.signed = true;
    sig.status = 'signed';
    sig.signedAt = new Date();
    sig.signatureMethod = dto.method as any;
    sig.signatureData = data;
    sig.ip = ip;
    sig.device = describeDevice(userAgent);
    sig.hash = hash;
    this.audit(
      deal,
      'sign',
      `${name} signed as the authorised signatory for ${sig.party} (${dto.method} signature)`,
      ip,
    );

    const done = this.completed(deal);
    if (done) {
      const businessName = await this.businessNameOf(deal);
      deal.signing.document!.completedAt = new Date();
      this.audit(deal, 'complete', 'Everyone has signed — the document is executed');
      const pdf = await this.signedPdfBuffer(deal, businessName);
      const dir = join(process.cwd(), 'uploads', 'deals', 'signed');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const file = `${deal._id}-${Date.now()}.pdf`;
      writeFileSync(join(dir, file), pdf);
      deal.signing.document!.signedPdfUrl = `/uploads/deals/signed/${file}`;
    }
    deal.markModified('signing');
    await deal.save();
    return { success: true, completed: done };
  }
}
