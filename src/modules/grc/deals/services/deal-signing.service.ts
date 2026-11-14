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
import {
  Deal,
  DealDocument,
  DealPartySide,
  SigningBlock,
  partySide,
} from '../schemas';
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
  describeDevice,
} from 'src/common/utils/pdf/deal-signing.util';

// A deal has two independent signing slots: the contract (default) and the
// term sheet. `kind` picks one everywhere below.
export type SignKind = 'contract' | 'term_sheet';
export const signKind = (v?: string): SignKind =>
  v === 'term_sheet' ? 'term_sheet' : 'contract';
const NOUN: Record<SignKind, string> = {
  contract: 'contract',
  term_sheet: 'term sheet',
};

const SIDES = [DealPartySide.PARTY_A, DealPartySide.PARTY_B] as const;
const MAX_DRAWN_BYTES = 400 * 1024;
const CHANGED_MESSAGE =
  'This document was changed after it was sent for signing. Ask the sender to send it again.';

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

  private block(deal: DealDocument, kind: SignKind): SigningBlock {
    return kind === 'term_sheet' ? deal.termSheetSigning : deal.signing;
  }

  private path(kind: SignKind): string {
    return kind === 'term_sheet' ? 'termSheetSigning' : 'signing';
  }

  private audit(
    b: SigningBlock,
    type: string,
    text: string,
    ip: string | null = null,
  ) {
    b.audit.push({ at: new Date(), type, text, ip } as any);
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

  private contractOf(deal: DealDocument, b: SigningBlock): any | null {
    const id = b?.document?.contractId;
    if (!id) return null;
    return deal.contracts.find((c) => String(c._id) === String(id)) ?? null;
  }

  private completed(b: SigningBlock): boolean {
    const sigs = b?.signatories ?? [];
    return sigs.length > 0 && sigs.every((s) => s.signed);
  }

  private pack(
    deal: DealDocument,
    b: SigningBlock,
    businessName: string,
  ): SigningPackData {
    const doc = b.document;
    return {
      businessName,
      dealName: deal.name,
      documentName: doc?.name ?? '',
      reference: doc?.reference ?? '',
      hash: doc?.hash ?? '',
      initiatedAt: doc?.sentAt ?? null,
      completedAt: doc?.completedAt ?? null,
      signatories: b.signatories.map((s) => ({
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
      audit: b.audit.map((a) => ({
        at: a.at,
        text: a.text,
        ip: a.ip,
      })),
    };
  }

  private async signedPdfBuffer(
    deal: DealDocument,
    b: SigningBlock,
    businessName: string,
    kind: SignKind,
  ): Promise<Buffer> {
    const contract = this.contractOf(deal, b);
    if (!contract)
      throw new BadRequestException(`No ${NOUN[kind]} is out for signing.`);
    const pack = this.pack(deal, b, businessName);
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
    kind: SignKind = 'contract',
  ) {
    const deal = await this.getDeal(tenantId, id);
    const b = this.block(deal, kind);
    const contract: any = deal.contracts.find(
      (c) => String(c._id) === dto.contractId,
    );
    if (!contract) throw new NotFoundException('Document not found');
    if ((contract.kind ?? 'contract') !== kind)
      throw new BadRequestException(
        kind === 'term_sheet'
          ? 'Choose a term sheet to send.'
          : 'Only contracts are signed here. Term sheets are signed from the Term Sheet tab.',
      );
    if ((contract.sections ?? []).length === 0)
      throw new BadRequestException(`This ${NOUN[kind]} has no text yet.`);
    if (b.signatories.some((s) => s.signed))
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
    b.signatories = chosen.map(({ side, party }) => ({
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
    b.document = {
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
      b,
      'send',
      `${actor} sent "${contract.name}" for signing to ${chosen
        .map((c) => `${c.party.name} (${c.side})`)
        .join(' and ')}`,
    );
    deal.markModified(this.path(kind));
    await deal.save();

    const failed: string[] = [];
    for (const s of b.signatories) {
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
    return { sent: b.signatories.length - failed.length, failed };
  }

  async remind(
    tenantId: string,
    id: string,
    dto: RemindSignatoryDto,
    businessName: string,
    kind: SignKind = 'contract',
  ) {
    const deal = await this.getDeal(tenantId, id);
    const b = this.block(deal, kind);
    const contract = this.contractOf(deal, b);
    if (!contract)
      throw new BadRequestException('No document is out for signing.');
    const targets = b.signatories.filter(
      (s, i) =>
        !s.signed && s.token && (dto.index === undefined || i === dto.index),
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
        this.audit(b, 'remind', `Reminder sent to ${s.name} (${s.party})`);
      } catch {
        failed.push(s.email);
      }
    }
    deal.markModified(this.path(kind));
    await deal.save();
    return { reminded: targets.length - failed.length, failed };
  }

  // Cancels signing that nobody has signed yet — to pick another document or
  // another signatory.
  async reset(tenantId: string, id: string, kind: SignKind = 'contract') {
    const deal = await this.getDeal(tenantId, id);
    const b = this.block(deal, kind);
    if (b.signatories.some((s) => s.signed))
      throw new BadRequestException(
        'Someone has already signed, so signing cannot be cancelled.',
      );
    b.signatories = [] as any;
    b.document = null;
    this.audit(b, 'reset', 'Signing was cancelled');
    deal.markModified(this.path(kind));
    await deal.save();
    return { ok: true };
  }

  async getSignedPdf(
    tenantId: string,
    id: string,
    businessName: string,
    kind: SignKind = 'contract',
  ): Promise<Buffer> {
    const deal = await this.getDeal(tenantId, id);
    const b = this.block(deal, kind);
    const url = b.document?.signedPdfUrl;
    // Once everyone has signed the executed copy is kept as it was.
    if (url) {
      const path = join(process.cwd(), url.replace(/^\//, ''));
      if (existsSync(path)) return readFileSync(path);
    }
    return this.signedPdfBuffer(deal, b, businessName, kind);
  }

  async getCertificate(
    tenantId: string,
    id: string,
    businessName: string,
    kind: SignKind = 'contract',
  ): Promise<Buffer> {
    const deal = await this.getDeal(tenantId, id);
    const b = this.block(deal, kind);
    if (!b.document)
      throw new BadRequestException('No document is out for signing.');
    return buildSigningCertificate(this.pack(deal, b, businessName));
  }

  async sendExecutedCopies(
    tenantId: string,
    id: string,
    dto: SendExecutedCopiesDto,
    businessName: string,
    kind: SignKind = 'contract',
  ) {
    const deal = await this.getDeal(tenantId, id);
    const b = this.block(deal, kind);
    if (!this.completed(b))
      throw new BadRequestException('Everyone has to sign first.');
    const name = b.document?.name ?? 'Document';
    const attachments = [
      {
        filename: `${name} (Executed).pdf`,
        content: await this.getSignedPdf(tenantId, id, businessName, kind),
      },
    ];
    if (dto.includeCertificate !== false) {
      attachments.push({
        filename: `${name} (Signing certificate).pdf`,
        content: await buildSigningCertificate(
          this.pack(deal, b, businessName),
        ),
      });
    }
    const failed: string[] = [];
    for (const s of b.signatories) {
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
        this.audit(b, 'copies', `Executed copy sent to ${s.name} (${s.party})`);
      } catch {
        failed.push(s.email);
      }
    }
    deal.markModified(this.path(kind));
    await deal.save();
    return { sent: b.signatories.length - failed.length, failed };
  }

  // Signing is done: file the executed copy in the data room and move the
  // deal on to CPs Tracking.
  async advance(
    tenantId: string,
    id: string,
    actor: string,
    kind: SignKind = 'contract',
  ) {
    const deal = await this.getDeal(tenantId, id);
    const b = this.block(deal, kind);
    if (!this.completed(b))
      throw new BadRequestException('Everyone has to sign first.');
    const doc = b.document!;
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
    // The executed term sheet carries the deal on from Term Sheet to Due
    // Diligence; the executed contract, from Signing to CPs Tracking.
    if (kind === 'term_sheet') {
      if (deal.stage === 'Term Sheet') deal.stage = 'Due Diligence' as any;
      this.audit(b, 'complete', `${actor} moved the deal to Due Diligence`);
    } else {
      if (deal.stage === 'Signing') deal.stage = 'CPs Tracking' as any;
      this.audit(b, 'complete', `${actor} moved the deal to CPs Tracking`);
    }
    deal.markModified(this.path(kind));
    deal.markModified('dataRoom');
    await deal.save();
    return { ok: true, stage: deal.stage };
  }

  // ── Signatory side (public, by link) ─────────────────────────

  private async byToken(token: string) {
    // A link belongs to either the contract or the term sheet envelope.
    const deal = await this.model.findOne({
      $or: [
        { 'signing.signatories.token': token },
        { 'termSheetSigning.signatories.token': token },
      ],
    });
    if (!deal) throw new NotFoundException('This signing link is not valid.');
    const kind: SignKind = deal.termSheetSigning?.signatories?.some(
      (s) => s.token === token,
    )
      ? 'term_sheet'
      : 'contract';
    const b = this.block(deal, kind);
    const sig = b.signatories.find((s) => s.token === token);
    if (!sig) throw new NotFoundException('This signing link is not valid.');
    return { deal, sig, b, kind };
  }

  async getPublic(token: string, ip: string | null) {
    const { deal, sig, b, kind } = await this.byToken(token);
    const contract = this.contractOf(deal, b);
    if (!contract)
      throw new NotFoundException('This signing link is not valid.');
    const changed = this.documentHash(contract) !== b.document?.hash;
    if (!sig.viewedAt && !sig.signed) {
      sig.viewedAt = new Date();
      this.audit(b, 'view', `${sig.name} opened the document`, ip);
      deal.markModified(this.path(kind));
      await deal.save();
    }
    const sigs = b.signatories;
    return {
      businessName: await this.businessNameOf(deal),
      dealName: deal.name,
      documentName: contract.name,
      documentKind: kind,
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
      completed: this.completed(b),
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
    const { deal, sig, b, kind } = await this.byToken(token);
    if (sig.signed) throw new BadRequestException('You have already signed.');
    if (!dto.consent)
      throw new BadRequestException('Please confirm you agree to sign.');
    const name = (dto.name ?? '').trim();
    if (!name) throw new BadRequestException('Type your full name.');
    const contract = this.contractOf(deal, b);
    if (!contract)
      throw new NotFoundException('This signing link is not valid.');
    const hash = this.documentHash(contract);
    if (hash !== b.document?.hash)
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
      b,
      'sign',
      `${name} signed as the authorised signatory for ${sig.party} (${dto.method} signature)`,
      ip,
    );

    const done = this.completed(b);
    if (done) {
      const businessName = await this.businessNameOf(deal);
      b.document!.completedAt = new Date();
      this.audit(
        b,
        'complete',
        'Everyone has signed — the document is executed',
      );
      const pdf = await this.signedPdfBuffer(deal, b, businessName, kind);
      const dir = join(process.cwd(), 'uploads', 'deals', 'signed');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const file = `${deal._id}-${Date.now()}.pdf`;
      writeFileSync(join(dir, file), pdf);
      b.document!.signedPdfUrl = `/uploads/deals/signed/${file}`;
    }
    deal.markModified(this.path(kind));
    await deal.save();
    return { success: true, completed: done };
  }
}
