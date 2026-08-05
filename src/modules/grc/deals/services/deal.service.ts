import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Deal,
  DealDocument,
  DealStatus,
  ChecklistStatus,
  CPType,
  CPStatus,
} from '../schemas';
import {
  Clause,
  ClauseDocument,
  Precedent,
  PrecedentDocument,
} from '../schemas';
import {
  CreateDealDto,
  SetStageDto,
  SetStatusDto,
  UpdateTermSheetDto,
  AddDDItemDto,
  UpdateDDItemDto,
  CreateContractDto,
  RenameContractDto,
  AddContractSectionDto,
  UpdateContractSectionBodyDto,
  AddContractCommentDto,
  SetContractVariableDto,
  AddCPDto,
  UpdateCPDto,
  AddSigningChecklistDto,
  AddSignatoryDto,
  UpdateSigningDetailsDto,
  AddPostCompletionDto,
  UpdatePartyDto,
  AddPartyDto,
  SubmitReviewDto,
  AddContractSectionFromPrecedentDto,
  AddRedlineDto,
  UpdateCommercialTermsDto,
} from '../dtos';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { randomBytes } from 'crypto';
import * as PDFKitImport from 'pdfkit';
import { User, UserDocument } from 'src/modules/auth/schemas';
import { htmlToParagraphs } from 'src/common/utils/html-to-paragraphs.util';
const PDFDocument = ((PDFKitImport as any).default ?? PDFKitImport) as any;

@Injectable()
export class DealService {
  constructor(
    @InjectModel(Deal.name) private readonly model: Model<DealDocument>,
    @InjectModel(Clause.name)
    private readonly clauseModel: Model<ClauseDocument>,
    @InjectModel(Precedent.name)
    private readonly precedentModel: Model<PrecedentDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
  ) {}

  // ── Pure computed helpers — single source of truth, never
  // recomputed client-side, matching every progress metric this
  // session (Risk scores, Obligation status, etc). ──────────────

  ddProgress(deal: { dd: { status: string }[] }): number {
    if (deal.dd.length === 0) return 0;
    const done = deal.dd.filter((x) => x.status === 'Complete').length;
    return Math.round((done / deal.dd.length) * 100);
  }

  // Only "Precedent"-type CPs count — "Subsequent" CPs are excluded
  // entirely, matching the original formula exactly.
  cpsProgress(deal: { cps: { type: string; status: string }[] }): {
    done: number;
    total: number;
  } {
    const preced = deal.cps.filter((c) => c.type === CPType.PRECEDENT);
    return {
      done: preced.filter((c) => c.status === CPStatus.SATISFIED).length,
      total: preced.length,
    };
  }

  private withComputed(deal: any) {
    return {
      ...deal,
      ddProgress: this.ddProgress(deal),
      cpsProgress: this.cpsProgress(deal),
      contracts: (deal.contracts ?? []).map((c: any) => ({
        ...c,
        sections: (c.sections ?? []).map((s: any) => ({
          ...s,
          lines: htmlToParagraphs(s.body),
        })),
      })),
    };
  }

  // ── Core ─────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateDealDto) {
    const client = await this.userModel
      .findOne({ _id: dto.clientId, tenantId: new Types.ObjectId(tenantId) })
      .select('firstName lastName businessName')
      .lean();
    if (!client) throw new NotFoundException('Client not found');
    const clientName =
      (client as any).businessName ||
      `${(client as any).firstName ?? ''} ${(client as any).lastName ?? ''}`.trim();

    const startDate = new Date();
    const targetClose = dto.targetClose
      ? new Date(dto.targetClose)
      : new Date(Date.now() + 90 * 86400000);
    const longstopDate = dto.longstopDate
      ? new Date(dto.longstopDate)
      : new Date(Date.now() + 180 * 86400000);
    return this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      clientId: client._id,
      client: clientName,
      counterparty: dto.counterparty ?? 'TBD',
      type: dto.type,
      stage: 'Origination',
      status: DealStatus.ACTIVE,
      leadPartner: dto.leadPartner ?? 'Unassigned',
      team: [],
      value: dto.value,
      currency: dto.currency ?? 'USD',
      jurisdiction: 'Rwanda',
      startDate,
      targetClose,
      longstopDate,
    });
  }

  async addParty(tenantId: string, id: string, dto: AddPartyDto) {
    const deal = await this.getRawDoc(tenantId, id);
    deal.parties.push({
      side: dto.side,
      title: dto.title,
      name: dto.name,
      email: dto.email.toLowerCase(),
      phone: dto.phone ?? '',
      permissions: {
        dataRoom: dto.permissions?.dataRoom ?? false,
        contractReview: dto.permissions?.contractReview ?? false,
        offerReview: dto.permissions?.offerReview ?? false,
      },
    } as any);
    deal.markModified('parties');
    await deal.save();
    return deal;
  }

  async updateParty(
    tenantId: string,
    id: string,
    index: number,
    dto: UpdatePartyDto,
  ) {
    const deal = await this.getRawDoc(tenantId, id);
    const p = deal.parties[index];
    if (!p) throw new NotFoundException('Party not found');
    if (dto.side !== undefined) p.side = dto.side;
    if (dto.title !== undefined) p.title = dto.title;
    if (dto.name !== undefined) p.name = dto.name;
    if (dto.email !== undefined) p.email = dto.email.toLowerCase();
    if (dto.phone !== undefined) p.phone = dto.phone;
    if (dto.permissions) Object.assign(p.permissions, dto.permissions);
    deal.markModified('parties');
    await deal.save();
    return deal;
  }

  async removeParty(tenantId: string, id: string, index: number) {
    const deal = await this.getRawDoc(tenantId, id);
    if (!deal.parties[index]) throw new NotFoundException('Party not found');
    deal.parties.splice(index, 1);
    deal.markModified('parties');
    await deal.save();
    return deal;
  }

  async addFolder(tenantId: string, id: string, dto: { name: string }) {
    const deal = await this.getRawDoc(tenantId, id);
    deal.dataRoom.folders.push({ name: dto.name } as any);
    deal.markModified('dataRoom');
    await deal.save();
    return deal;
  }

  async removeFolder(tenantId: string, id: string, index: number) {
    const deal = await this.getRawDoc(tenantId, id);
    const folder = deal.dataRoom.folders[index];
    if (!folder) throw new NotFoundException('Folder not found');
    deal.dataRoom.folders.splice(index, 1);
    deal.dataRoom.files = deal.dataRoom.files.filter(
      (f) => f.folder !== folder.name,
    ) as any;
    deal.markModified('dataRoom');
    await deal.save();
    return deal;
  }

  async removeDataRoomFile(tenantId: string, id: string, index: number) {
    const deal = await this.getRawDoc(tenantId, id);
    if (!deal.dataRoom.files[index])
      throw new NotFoundException('File not found');
    deal.dataRoom.files.splice(index, 1);
    deal.markModified('dataRoom');
    await deal.save();
    return deal;
  }

  async getAll(tenantId: string) {
    const deals = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
    return deals.map((d) => this.withComputed(d));
  }

  async getById(tenantId: string, id: string) {
    const deal = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!deal) throw new NotFoundException('Deal not found');
    return this.withComputed(deal);
  }

  private async getRawDoc(tenantId: string, id: string): Promise<DealDocument> {
    const deal = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  // Real server-side gate, matching the frontend's own rule exactly:
  // cannot move to Signing while pre-signing checklist items remain
  // outstanding.
  async setStage(tenantId: string, id: string, dto: SetStageDto) {
    const deal = await this.getRawDoc(tenantId, id);
    if (dto.stage === 'Signing') {
      const remaining = deal.signing.checklist.filter(
        (c) => c.status !== ChecklistStatus.DONE,
      ).length;
      if (deal.signing.checklist.length > 0 && remaining > 0) {
        throw new BadRequestException(
          `Cannot move to Signing — ${remaining} pre-signing item(s) outstanding.`,
        );
      }
    }
    deal.stage = dto.stage as any;
    await deal.save();
    return deal;
  }

  async setStatus(tenantId: string, id: string, dto: SetStatusDto) {
    const deal = await this.getRawDoc(tenantId, id);
    deal.status = dto.status;
    await deal.save();
    return deal;
  }

  // ── Term Sheet ───────────────────────────────────────────────

  async updateTermSheet(tenantId: string, id: string, dto: UpdateTermSheetDto) {
    const deal = await this.getRawDoc(tenantId, id);
    Object.assign(deal.termSheet, dto, { updatedAt: new Date() });
    await deal.save();
    return deal;
  }

  // ── Data Room ────────────────────────────────────────────────

  async addDataRoomFile(
    tenantId: string,
    id: string,
    file: Express.Multer.File,
    folder: string,
    uploadedBy: string,
  ) {
    const deal = await this.getRawDoc(tenantId, id);
    deal.dataRoom.files.push({
      name: file.originalname,
      fileUrl: `/uploads/deals/data-room/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      folder,
      uploadedAt: new Date(),
      uploadedBy,
      version: 1,
      views: 0,
    } as any);
    deal.markModified('dataRoom');
    await deal.save();
    return deal;
  }

  // ── Due Diligence ────────────────────────────────────────────

  async addDDItem(tenantId: string, id: string, dto: AddDDItemDto) {
    const deal = await this.getRawDoc(tenantId, id);
    deal.dd.push({
      workstream: dto.workstream,
      item: dto.item,
      owner: dto.owner ?? 'Unassigned',
    } as any);
    deal.markModified('dd');
    await deal.save();
    return deal;
  }

  async updateDDItem(
    tenantId: string,
    id: string,
    index: number,
    dto: UpdateDDItemDto,
  ) {
    const deal = await this.getRawDoc(tenantId, id);
    const item = deal.dd[index];
    if (!item) throw new NotFoundException('DD item not found');
    if (dto.status !== undefined) item.status = dto.status;
    if (dto.finding !== undefined) item.finding = dto.finding;
    if (dto.materiality !== undefined) item.materiality = dto.materiality;
    deal.markModified('dd');
    await deal.save();
    return deal;
  }

  // ── Contracts (multiple per deal) ───────────────────────────

  private getContractOrThrow(deal: DealDocument, contractId: string) {
    const contract = deal.contracts.id(contractId);
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }

  async createContract(
    tenantId: string,
    dealId: string,
    dto: CreateContractDto,
  ) {
    const deal = await this.getRawDoc(tenantId, dealId);
    deal.contracts.push({
      name: dto.name,
      sections: [],
      variables: {},
      reviewLoop: { tokens: [], responses: [] },
      pdfUrl: null,
    } as any);
    await deal.save();
    return deal;
  }

  async renameContract(
    tenantId: string,
    dealId: string,
    contractId: string,
    dto: RenameContractDto,
  ) {
    const deal = await this.getRawDoc(tenantId, dealId);
    const contract = this.getContractOrThrow(deal, contractId);
    contract.name = dto.name;
    await deal.save();
    return deal;
  }

  async deleteContract(tenantId: string, dealId: string, contractId: string) {
    const deal = await this.getRawDoc(tenantId, dealId);
    const contract = this.getContractOrThrow(deal, contractId);
    contract.deleteOne();
    await deal.save();
    return deal;
  }

  async addContractSection(
    tenantId: string,
    dealId: string,
    contractId: string,
    dto: AddContractSectionDto,
  ) {
    const deal = await this.getRawDoc(tenantId, dealId);
    const contract = this.getContractOrThrow(deal, contractId);
    const clause = await this.clauseModel
      .findOne({ _id: dto.clauseId, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!clause) throw new NotFoundException('Clause not found');
    contract.sections.push({
      clauseId: clause._id,
      title: clause.title,
      body: clause.body,
      comments: [],
    } as any);
    await deal.save();
    return deal;
  }

  async addContractSectionFromPrecedent(
    tenantId: string,
    dealId: string,
    contractId: string,
    dto: AddContractSectionFromPrecedentDto,
  ) {
    const deal = await this.getRawDoc(tenantId, dealId);
    const contract = this.getContractOrThrow(deal, contractId);
    const precedent = await this.precedentModel
      .findOne({ _id: dto.precedentId, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!precedent) throw new NotFoundException('Precedent not found');
    contract.sections.push({
      clauseId: null,
      precedentId: precedent._id,
      title: precedent.name,
      body: precedent.content,
      comments: [],
    } as any);
    await deal.save();
    return deal;
  }

  async removeContractSection(
    tenantId: string,
    dealId: string,
    contractId: string,
    index: number,
  ) {
    const deal = await this.getRawDoc(tenantId, dealId);
    const contract = this.getContractOrThrow(deal, contractId);
    if (!contract.sections[index])
      throw new NotFoundException('Section not found');
    contract.sections.splice(index, 1);
    await deal.save();
    return deal;
  }

  async updateContractSectionBody(
    tenantId: string,
    dealId: string,
    contractId: string,
    index: number,
    dto: UpdateContractSectionBodyDto,
  ) {
    const deal = await this.getRawDoc(tenantId, dealId);
    const contract = this.getContractOrThrow(deal, contractId);
    const section = contract.sections[index];
    if (!section) throw new NotFoundException('Section not found');
    section.body = dto.body;
    await deal.save();
    return deal;
  }

  async addContractComment(
    tenantId: string,
    dealId: string,
    contractId: string,
    index: number,
    dto: AddContractCommentDto,
  ) {
    const deal = await this.getRawDoc(tenantId, dealId);
    const contract = this.getContractOrThrow(deal, contractId);
    const section = contract.sections[index];
    if (!section) throw new NotFoundException('Section not found');
    section.comments.push({
      author: dto.author,
      text: dto.text,
      resolved: false,
      createdAt: new Date(),
    } as any);
    await deal.save();
    return deal;
  }

  async toggleContractComment(
    tenantId: string,
    dealId: string,
    contractId: string,
    sectionIndex: number,
    commentIndex: number,
  ) {
    const deal = await this.getRawDoc(tenantId, dealId);
    const contract = this.getContractOrThrow(deal, contractId);
    const comment = contract.sections[sectionIndex]?.comments[commentIndex];
    if (!comment) throw new NotFoundException('Comment not found');
    comment.resolved = !comment.resolved;
    await deal.save();
    return deal;
  }

  // ── Redlines ─────────────────────────────────────────────────

  async addRedline(
    tenantId: string,
    dealId: string,
    contractId: string,
    sectionIndex: number,
    dto: AddRedlineDto,
    authorName: string,
    authorEmail: string,
  ) {
    const deal = await this.getRawDoc(tenantId, dealId);
    const contract = this.getContractOrThrow(deal, contractId);
    const section = contract.sections[sectionIndex];
    if (!section) throw new NotFoundException('Section not found');
    const lines = htmlToParagraphs(section.body);
    const quotedText = lines[dto.lineIndex] ?? '';
    section.redlines.push({
      lineIndex: dto.lineIndex,
      quotedText,
      comment: dto.comment,
      authorName,
      authorEmail: authorEmail.toLowerCase(),
      source: 'internal',
      createdAt: new Date(),
    } as any);
    await deal.save();
    return deal;
  }

  // Public — identity resolved from the review token, exactly like
  // submitContractReview, never trusted from the request body.
  async addExternalRedline(
    token: string,
    sectionIndex: number,
    dto: AddRedlineDto,
  ) {
    const deal = await this.model.findOne({
      'contracts.reviewLoop.tokens.token': token,
    });
    if (!deal) throw new NotFoundException('This review link is invalid.');
    const contract = deal.contracts.find((c) =>
      c.reviewLoop.tokens.some((t) => t.token === token),
    );
    if (!contract) throw new NotFoundException('This review link is invalid.');
    const tokenEntry = contract.reviewLoop.tokens.find(
      (t) => t.token === token,
    );
    const section = contract.sections[sectionIndex];
    if (!section) throw new NotFoundException('Section not found');
    const lines = htmlToParagraphs(section.body);
    const quotedText = lines[dto.lineIndex] ?? '';
    section.redlines.push({
      lineIndex: dto.lineIndex,
      quotedText,
      comment: dto.comment,
      authorName: tokenEntry.partyName,
      authorEmail: tokenEntry.partyEmail,
      source: 'external',
      createdAt: new Date(),
    } as any);
    await deal.save();
    return deal;
  }

  async setContractVariable(
    tenantId: string,
    dealId: string,
    contractId: string,
    dto: SetContractVariableDto,
  ) {
    const deal = await this.getRawDoc(tenantId, dealId);
    const contract = this.getContractOrThrow(deal, contractId);
    contract.variables[dto.key] = dto.value;
    contract.markModified('variables');
    await deal.save();
    return deal;
  }

  // ── CPs ──────────────────────────────────────────────────────

  async addCP(tenantId: string, id: string, dto: AddCPDto) {
    const deal = await this.getRawDoc(tenantId, id);
    deal.cps.push({
      type: dto.type,
      description: dto.description,
      responsible: dto.responsible ?? 'TBD',
      deadline: new Date(dto.deadline),
      status: 'Pending',
    } as any);
    deal.markModified('cps');
    await deal.save();
    return deal;
  }

  async updateCP(
    tenantId: string,
    id: string,
    index: number,
    dto: UpdateCPDto,
  ) {
    const deal = await this.getRawDoc(tenantId, id);
    const cp = deal.cps[index];
    if (!cp) throw new NotFoundException('Condition not found');
    if (dto.status !== undefined) cp.status = dto.status;
    if (dto.evidence !== undefined) cp.evidence = dto.evidence;
    deal.markModified('cps');
    await deal.save();
    return deal;
  }

  // ── Signing ──────────────────────────────────────────────────

  async addSigningChecklistItem(
    tenantId: string,
    id: string,
    dto: AddSigningChecklistDto,
  ) {
    const deal = await this.getRawDoc(tenantId, id);
    deal.signing.checklist.push({
      item: dto.item,
      owner: dto.owner ?? 'TBD',
      status: 'Pending',
    } as any);
    deal.markModified('signing');
    await deal.save();
    return deal;
  }

  async toggleSigningChecklistItem(
    tenantId: string,
    id: string,
    index: number,
  ) {
    const deal = await this.getRawDoc(tenantId, id);
    const item = deal.signing.checklist[index];
    if (!item) throw new NotFoundException('Checklist item not found');
    item.status =
      item.status === ChecklistStatus.DONE
        ? ChecklistStatus.PENDING
        : ChecklistStatus.DONE;
    deal.markModified('signing');
    await deal.save();
    return deal;
  }

  async addSignatory(tenantId: string, id: string, dto: AddSignatoryDto) {
    const deal = await this.getRawDoc(tenantId, id);
    deal.signing.signatories.push({
      name: dto.name,
      party: dto.party,
      role: dto.role ?? '',
      signed: false,
      signedAt: null,
    } as any);
    deal.markModified('signing');
    await deal.save();
    return deal;
  }

  async markSignatorySigned(tenantId: string, id: string, index: number) {
    const deal = await this.getRawDoc(tenantId, id);
    const s = deal.signing.signatories[index];
    if (!s) throw new NotFoundException('Signatory not found');
    s.signed = true;
    s.signedAt = new Date();
    deal.markModified('signing');
    await deal.save();
    return deal;
  }

  async updateSigningDetails(
    tenantId: string,
    id: string,
    dto: UpdateSigningDetailsDto,
  ) {
    const deal = await this.getRawDoc(tenantId, id);
    if (dto.signingDate !== undefined)
      deal.signing.signingDate = new Date(dto.signingDate);
    if (dto.venue !== undefined) deal.signing.venue = dto.venue;
    deal.markModified('signing');
    await deal.save();
    return deal;
  }

  // ── Post-Completion ──────────────────────────────────────────

  async addPostCompletion(
    tenantId: string,
    id: string,
    dto: AddPostCompletionDto,
  ) {
    const deal = await this.getRawDoc(tenantId, id);
    deal.postCompletion.push({
      item: dto.item,
      dueDate: new Date(dto.dueDate),
      status: 'Pending',
    } as any);
    deal.markModified('postCompletion');
    await deal.save();
    return deal;
  }

  async togglePostCompletion(tenantId: string, id: string, index: number) {
    const deal = await this.getRawDoc(tenantId, id);
    const item = deal.postCompletion[index];
    if (!item) throw new NotFoundException('Register item not found');
    item.status =
      item.status === ChecklistStatus.DONE
        ? ChecklistStatus.PENDING
        : ChecklistStatus.DONE;
    deal.markModified('postCompletion');
    await deal.save();
    return deal;
  }

  // ── Data room delivery ──────────────────────────────────────

  async sendDataRoomEmail(
    tenantId: string,
    id: string,
    partyIndex: number,
    businessName: string,
  ) {
    const deal = await this.getRawDoc(tenantId, id);
    const party = deal.parties[partyIndex];
    if (!party) throw new NotFoundException('Party not found');
    if (!party.permissions.dataRoom) {
      throw new BadRequestException(
        'This party does not have data room access enabled.',
      );
    }
    if (deal.dataRoom.files.length === 0) {
      throw new BadRequestException('No files in the data room to send yet.');
    }

    const zipBuffer = await this.buildDataRoomZip(deal);
    await this.emailService.sendDataRoomDelivery(
      {
        to: party.email,
        recipientName: party.name,
        dealName: deal.name,
        businessName,
      },
      [{ filename: `${deal.name} - Data Room.zip`, content: zipBuffer }],
    );

    return { success: true, sentTo: party.email };
  }

  // ── Offer (Term Sheet) review — deal-level ──────────────────

  async sendOfferForReview(
    tenantId: string,
    dealId: string,
    businessName: string,
  ) {
    const deal = await this.getRawDoc(tenantId, dealId);
    const eligible = deal.parties.filter((p) => p.permissions.offerReview);
    if (eligible.length === 0)
      throw new BadRequestException(
        'No party has offer review access enabled.',
      );
    const sent: string[] = [];
    for (const party of eligible) {
      let entry = deal.offerReviewLoop.tokens.find(
        (t) => t.partyEmail === party.email,
      );
      if (!entry) {
        entry = {
          token: randomBytes(24).toString('hex'),
          partyEmail: party.email,
          partyName: party.name,
          sentAt: new Date(),
        } as any;
        deal.offerReviewLoop.tokens.push(entry as any);
      } else {
        entry.sentAt = new Date();
      }
      const link = `${process.env.TENANT_APP_URL}/deal-review/offer/${entry.token}`;
      await this.emailService
        .sendDealReviewInvite({
          to: party.email,
          recipientName: party.name,
          dealName: deal.name,
          kind: 'offer',
          reviewLink: link,
          businessName,
        })
        .catch(() => {});
      sent.push(party.email);
    }
    deal.markModified('offerReviewLoop');
    await deal.save();
    return { sent };
  }

  async getOfferReviewSnapshot(token: string) {
    const deal = await this.model
      .findOne({ 'offerReviewLoop.tokens.token': token })
      .lean();
    if (!deal) throw new NotFoundException('This review link is invalid.');
    const loop: any = (deal as any).offerReviewLoop;
    const tokenEntry = loop.tokens.find((t: any) => t.token === token);
    const already = loop.responses.find(
      (r: any) => r.partyEmail === tokenEntry.partyEmail,
    );
    return {
      dealName: deal.name,
      termSheet: deal.termSheet,
      prefillName: tokenEntry.partyName,
      alreadyResponded: !!already,
      previousDecision: already?.decision ?? null,
    };
  }

  async submitOfferReview(token: string, dto: SubmitReviewDto) {
    const deal = await this.model.findOne({
      'offerReviewLoop.tokens.token': token,
    });
    if (!deal) throw new NotFoundException('This review link is invalid.');
    const tokenEntry = deal.offerReviewLoop.tokens.find(
      (t) => t.token === token,
    );
    if (!tokenEntry)
      throw new NotFoundException('This review link is invalid.');
    if (
      deal.offerReviewLoop.responses.some(
        (r) =>
          r.partyEmail === tokenEntry.partyEmail && r.decision === 'Approved',
      )
    ) {
      throw new BadRequestException('You have already approved this.');
    }
    deal.offerReviewLoop.responses.push({
      partyEmail: tokenEntry.partyEmail,
      partyName: dto.name || tokenEntry.partyName,
      decision: dto.decision,
      comment: dto.comment ?? '',
      respondedAt: new Date(),
    } as any);
    deal.markModified('offerReviewLoop');
    await deal.save();
    return { success: true };
  }

  // ── Contract review — per-contract ──────────────────────────

  async sendContractForReview(
    tenantId: string,
    dealId: string,
    contractId: string,
    businessName: string,
  ) {
    const deal = await this.getRawDoc(tenantId, dealId);
    const contract = this.getContractOrThrow(deal, contractId);
    const eligible = deal.parties.filter((p) => p.permissions.contractReview);
    if (eligible.length === 0)
      throw new BadRequestException(
        'No party has contract review access enabled.',
      );

    const pdfBuffer = await this.generateContractPdf(
      deal,
      contract,
      businessName,
    );
    const dir = join(process.cwd(), 'uploads', 'deals', 'contract-review');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const filename = `${deal._id}-${contract._id}-${Date.now()}.pdf`;
    writeFileSync(join(dir, filename), pdfBuffer);
    contract.pdfUrl = `/uploads/deals/contract-review/${filename}`;

    const sent: string[] = [];
    for (const party of eligible) {
      let entry = contract.reviewLoop.tokens.find(
        (t) => t.partyEmail === party.email,
      );
      if (!entry) {
        entry = {
          token: randomBytes(24).toString('hex'),
          partyEmail: party.email,
          partyName: party.name,
          sentAt: new Date(),
        } as any;
        contract.reviewLoop.tokens.push(entry as any);
      } else {
        entry.sentAt = new Date();
      }
      const link = `${process.env.TENANT_APP_URL}/deal-review/contract/${entry.token}`;
      await this.emailService
        .sendDealReviewInvite({
          to: party.email,
          recipientName: party.name,
          dealName: `${deal.name} — ${contract.name}`,
          kind: 'contract',
          reviewLink: link,
          businessName,
        })
        .catch(() => {});
      sent.push(party.email);
    }
    await deal.save();
    return { sent };
  }

  async getContractReviewSnapshot(token: string) {
    const deal = await this.model
      .findOne({ 'contracts.reviewLoop.tokens.token': token })
      .lean();
    if (!deal) throw new NotFoundException('This review link is invalid.');
    const contract = (deal as any).contracts.find((c: any) =>
      c.reviewLoop.tokens.some((t: any) => t.token === token),
    );
    if (!contract) throw new NotFoundException('This review link is invalid.');
    const tokenEntry = contract.reviewLoop.tokens.find(
      (t: any) => t.token === token,
    );
    const already = contract.reviewLoop.responses.find(
      (r: any) => r.partyEmail === tokenEntry.partyEmail,
    );
    return {
      dealName: deal.name,
      contractName: contract.name,
      pdfUrl: contract.pdfUrl ?? null,
      prefillName: tokenEntry.partyName,
      alreadyResponded: !!already,
      previousDecision: already?.decision ?? null,
      sections: contract.sections.map((s: any, i: number) => ({
        index: i,
        title: s.title,
        lines: htmlToParagraphs(s.body),
        redlines: s.redlines ?? [],
      })),
    };
  }

  async submitContractReview(token: string, dto: SubmitReviewDto) {
    const deal = await this.model.findOne({
      'contracts.reviewLoop.tokens.token': token,
    });
    if (!deal) throw new NotFoundException('This review link is invalid.');
    const contract = deal.contracts.find((c) =>
      c.reviewLoop.tokens.some((t) => t.token === token),
    );
    if (!contract) throw new NotFoundException('This review link is invalid.');
    const tokenEntry = contract.reviewLoop.tokens.find(
      (t) => t.token === token,
    );
    if (
      contract.reviewLoop.responses.some(
        (r) =>
          r.partyEmail === tokenEntry.partyEmail && r.decision === 'Approved',
      )
    ) {
      throw new BadRequestException('You have already approved this.');
    }
    contract.reviewLoop.responses.push({
      partyEmail: tokenEntry.partyEmail,
      partyName: dto.name || tokenEntry.partyName,
      decision: dto.decision,
      comment: dto.comment ?? '',
      respondedAt: new Date(),
    } as any);
    await deal.save();
    return { success: true };
  }

  // ── PRIVATE HELPERS ──────────────────────────────────────────

  private async buildDataRoomZip(deal: DealDocument): Promise<Buffer> {
    const { ZipArchive } = require('archiver');
    return new Promise((resolve, reject) => {
      const archive = new ZipArchive({ zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      for (const file of deal.dataRoom.files) {
        if (!file.fileUrl) continue;
        const diskPath = join(process.cwd(), file.fileUrl);
        if (existsSync(diskPath)) {
          archive.file(diskPath, { name: `${file.folder}/${file.name}` });
        }
      }
      archive.finalize();
    });
  }

  private renderBody(
    contract: { variables: Record<string, string> },
    body: string,
  ): string {
    return body.replace(/\[([A-Z_]+)\]/g, (_, k) =>
      contract.variables[k] ? contract.variables[k] : `[${k}]`,
    );
  }

  private generateContractPdf(
    deal: DealDocument,
    contract: any,
    businessName: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .text(contract.name, { align: 'center' });
      doc.moveDown(0.2);
      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor('#666666')
        .text(deal.name, { align: 'center' });
      doc.moveDown(0.3);
      doc
        .fontSize(10)
        .fillColor('#666666')
        .text(
          `${businessName} · Generated ${new Date().toLocaleDateString()}`,
          { align: 'center' },
        );
      doc.moveDown(0.3);
      doc
        .fontSize(11)
        .fillColor('#000000')
        .text(`${deal.client} vs ${deal.counterparty}`, { align: 'center' });
      doc.moveDown(1.5);

      doc.fontSize(14).font('Helvetica-Bold').text('Parties to this Agreement');
      doc.moveDown(0.5);
      for (const side of ['Buyer', 'Seller'] as const) {
        const sideParties = deal.parties.filter((p) => p.side === side);
        doc.fontSize(12).font('Helvetica-Bold').text(`${side} Side`);
        if (sideParties.length === 0) {
          doc
            .fontSize(10)
            .font('Helvetica-Oblique')
            .text('No parties recorded.');
        } else {
          sideParties.forEach((p) => {
            doc
              .fontSize(10)
              .font('Helvetica')
              .text(`${p.name} — ${p.title}${p.email ? ` (${p.email})` : ''}`);
          });
        }
        doc.moveDown(0.5);
      }
      doc.moveDown(1);

      doc.fontSize(14).font('Helvetica-Bold').text('Term Sheet');
      doc.moveDown(0.5);
      const tsFields: [string, string][] = [
        ['Structure', deal.termSheet.structure],
        ['Consideration', deal.termSheet.consideration],
        ['Conditions', deal.termSheet.conditions],
        ['Exclusivity', deal.termSheet.exclusivity],
        ['Confidentiality', deal.termSheet.confidentiality],
        ['Timeline', deal.termSheet.timeline],
      ];
      tsFields.forEach(([label, value]) => {
        doc.fontSize(11).font('Helvetica-Bold').text(`${label}:`);
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(value || '—');
        doc.moveDown(0.4);
      });
      doc.moveDown(1);

      doc.fontSize(14).font('Helvetica-Bold').text(contract.name);
      doc.moveDown(0.5);
      if (contract.sections.length === 0) {
        doc
          .fontSize(10)
          .font('Helvetica-Oblique')
          .text('No sections have been drafted yet.');
      } else {
        contract.sections.forEach((s: any) => {
          doc.fontSize(12).font('Helvetica-Bold').text(s.title);
          const paragraphs = htmlToParagraphs(
            this.renderBody(contract, s.body),
          );
          paragraphs.forEach((p) => {
            doc.fontSize(10).font('Helvetica').text(p);
            doc.moveDown(0.2);
          });
          doc.moveDown(0.4);
        });
      }

      doc.end();
    });
  }

  private generateRedlinedContractPdf(
    deal: DealDocument,
    contract: any,
    businessName: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .text(`${contract.name} — Redlined`, { align: 'center' });
      doc.moveDown(0.2);
      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor('#666666')
        .text(deal.name, { align: 'center' });
      doc.moveDown(0.3);
      doc
        .fontSize(10)
        .fillColor('#666666')
        .text(
          `${businessName} · Generated ${new Date().toLocaleDateString()}`,
          { align: 'center' },
        );
      doc.moveDown(1.5);

      if (contract.sections.length === 0) {
        doc
          .fontSize(10)
          .font('Helvetica-Oblique')
          .fillColor('#000000')
          .text('No sections have been drafted yet.');
      } else {
        contract.sections.forEach((s: any) => {
          doc
            .fontSize(12)
            .font('Helvetica-Bold')
            .fillColor('#000000')
            .text(s.title);
          doc.moveDown(0.3);
          const lines = htmlToParagraphs(this.renderBody(contract, s.body));
          lines.forEach((line: string, lineIndex: number) => {
            doc.fontSize(10).font('Helvetica').fillColor('#000000').text(line);
            const redlinesHere = (s.redlines ?? []).filter(
              (r: any) => r.lineIndex === lineIndex,
            );
            redlinesHere.forEach((r: any) => {
              doc.moveDown(0.1);
              doc
                .fontSize(9)
                .font('Helvetica-Oblique')
                .fillColor('#b91c1c')
                .text(
                  `  ↳ [${r.source === 'external' ? 'External' : 'Internal'} — ${r.authorName}, ${new Date(r.createdAt).toLocaleDateString()}]: ${r.comment}`,
                );
            });
            doc.moveDown(0.3);
          });
          doc.moveDown(0.5);
        });
      }

      doc.end();
    });
  }

  async getRedlinedContractPdf(
    tenantId: string,
    dealId: string,
    contractId: string,
    businessName: string,
  ): Promise<Buffer> {
    const deal = await this.getRawDoc(tenantId, dealId);
    const contract = this.getContractOrThrow(deal, contractId);
    return this.generateRedlinedContractPdf(deal, contract, businessName);
  }

  async getContractPdf(
    tenantId: string,
    dealId: string,
    contractId: string,
    businessName: string,
  ): Promise<Buffer> {
    const deal = await this.getRawDoc(tenantId, dealId);
    const contract = this.getContractOrThrow(deal, contractId);
    return this.generateContractPdf(deal, contract, businessName);
  }

  async updateCommercialTerms(
    tenantId: string,
    id: string,
    dto: UpdateCommercialTermsDto,
  ) {
    const deal = await this.getRawDoc(tenantId, id);
    if (dto.feeRate !== undefined) deal.feeRate = dto.feeRate;
    if (dto.feeRecovered !== undefined) deal.feeRecovered = dto.feeRecovered;
    await deal.save();
    return deal;
  }
}
