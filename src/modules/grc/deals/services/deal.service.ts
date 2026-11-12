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
  DealPartySide,
  partySide,
} from '../schemas';
import {
  CreateDealDto,
  SetStageDto,
  SetStatusDto,
  UpdateTermSheetDto,
  AddDDItemDto,
  UpdateDDItemDto,
  RenameContractDto,
  UpdateContractSectionBodyDto,
  AddContractCommentDto,
  AddCommentReplyDto,
  SendContractReviewDto,
  RemindContractReviewDto,
  SetContractVariableDto,
  AddCPDto,
  UpdateCPDto,
  AddSigningChecklistDto,
  UpdateSigningDetailsDto,
  AddPostCompletionDto,
  UpdatePartyDto,
  AddPartyDto,
  SubmitReviewDto,
  AddRedlineDto,
  UpdateCommercialTermsDto,
} from '../dtos';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { randomBytes } from 'crypto';
import { dealContractExecuted } from './deal-variation.service';
import * as PDFKitImport from 'pdfkit';
import { User, UserDocument } from 'src/modules/auth/schemas';
import { htmlToParagraphs } from 'src/common/utils/html-to-paragraphs.util';
import { renderRichText } from 'src/common/utils/pdf/render-rich-text.util';
import { escapeMergeValue } from 'src/common/utils/contract-fields.util';
import {
  buildDealToc,
  describeContractFields,
  normalizeFieldValue,
  renderDealContractBody,
} from '../../../../common/utils/deal.contract.util';
const PDFDocument = ((PDFKitImport as any).default ?? PDFKitImport) as any;

@Injectable()
export class DealService {
  constructor(
    @InjectModel(Deal.name) private readonly model: Model<DealDocument>,
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

  // Where a document (contract or term sheet) stands with the parties it
  // has been sent to: each party's latest answer counts.
  //   draft              not sent yet
  //   in_review          sent, at least one party has not answered
  //   changes_requested  a party asked for changes
  //   approved           every party it was sent to has approved
  reviewStatus(doc: any): {
    status: 'draft' | 'in_review' | 'changes_requested' | 'approved';
    sent: number;
    approved: number;
    changesRequested: number;
    lastSentAt: Date | null;
    approvedAt: Date | null;
  } {
    const tokens: any[] = doc.reviewLoop?.tokens ?? [];
    const responses: any[] = doc.reviewLoop?.responses ?? [];
    const latest = new Map<string, any>();
    for (const r of responses) {
      const prev = latest.get(r.partyEmail);
      if (!prev || new Date(r.respondedAt) >= new Date(prev.respondedAt))
        latest.set(r.partyEmail, r);
    }
    const sent = tokens.length;
    let approved = 0;
    let changesRequested = 0;
    for (const t of tokens) {
      const r = latest.get(t.partyEmail);
      if (r?.decision === 'Approved') approved++;
      else if (r?.decision) changesRequested++;
    }
    const status =
      sent === 0
        ? 'draft'
        : changesRequested > 0
          ? 'changes_requested'
          : approved === sent
            ? 'approved'
            : 'in_review';
    const times = tokens.map((t) => new Date(t.sentAt).getTime());
    const approvals = [...latest.values()]
      .filter((r) => r.decision === 'Approved')
      .map((r) => new Date(r.respondedAt).getTime());
    return {
      status,
      sent,
      approved,
      changesRequested,
      lastSentAt: times.length ? new Date(Math.max(...times)) : null,
      approvedAt:
        status === 'approved' && approvals.length
          ? new Date(Math.max(...approvals))
          : null,
    };
  }

  private withComputed(deal: any) {
    return {
      ...deal,
      ddProgress: this.ddProgress(deal),
      cpsProgress: this.cpsProgress(deal),
      // A signatory's link is their credential — it never leaves the server.
      signing: deal.signing
        ? {
            ...deal.signing,
            signatories: (deal.signing.signatories ?? []).map(
              ({ token: _token, ...rest }: any) => rest,
            ),
          }
        : deal.signing,
      // Deals saved when the sides were Buyer / Seller read as Party A / B.
      parties: (deal.parties ?? []).map((p: any) => ({
        ...p,
        side: partySide(p.side),
        authorizedSignatory: !!p.authorizedSignatory,
      })),
      contracts: (deal.contracts ?? []).map((c: any) => ({
        ...c,
        // Documents made before term sheets were their own are contracts.
        kind: c.kind ?? 'contract',
        // Once executed, a contract is changed by variations (Amendments
        // tab), not by editing its text.
        executed: dealContractExecuted(deal, c),
        variations: c.variations ?? [],
        round: c.round ?? 1,
        penParty: partySide(c.penParty ?? DealPartySide.PARTY_A),
        // The as-executed snapshot is only for the redline view.
        originalSections: undefined,
        hasOriginal: !!c.originalSections,
        review: this.reviewStatus(c),
        // Merge fields resolved — what the document actually reads as. The
        // stored body keeps {{token}} so a field can be changed later.
        sections: (c.sections ?? []).map((s: any) => {
          const renderedBody = renderDealContractBody(c.variables, s.body);
          const rawLines = htmlToParagraphs(s.body ?? '');
          return {
            ...s,
            renderedBody,
            // Negotiation: the lines as stored ({{fields}} unresolved, which
            // tracked changes anchor to), the lines before any change was
            // accepted, and the changes with a plain id.
            rawLines,
            originalLines: s.draftBody
              ? htmlToParagraphs(s.draftBody)
              : rawLines,
            draftBody: undefined,
            changes: (s.changes ?? []).map((ch: any) => ({
              ...ch,
              id: String(ch._id),
              party: partySide(ch.party),
            })),
            // Redlines anchor to these lines, so they come from the
            // resolved text — what every reader (and the PDF) sees.
            lines: htmlToParagraphs(renderedBody),
          };
        }),
        fields: describeContractFields(c),
        // The structured pages: a cover (fields resolved) and a contents
        // page built from the sections as they now stand.
        cover: renderDealContractBody(c.variables, c.coverPage ?? ''),
        toc: {
          enabled: !!c.tocEnabled,
          title: c.tocTitle || 'Table of Contents',
          entries: c.tocEnabled ? buildDealToc(c.variables, c.sections) : [],
        },
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
      authorizedSignatory: false,
      permissions: {
        dataRoom: dto.permissions?.dataRoom ?? false,
        contractReview: dto.permissions?.contractReview ?? false,
        offerReview: dto.permissions?.offerReview ?? false,
      },
    } as any);
    if (dto.authorizedSignatory) {
      this.setAuthorizedSignatory(deal, deal.parties.length - 1);
    }
    deal.markModified('parties');
    await deal.save();
    return deal;
  }

  // One authorised signatory per side: choosing one clears the others on
  // the same side.
  private setAuthorizedSignatory(deal: DealDocument, index: number) {
    const side = partySide(deal.parties[index].side);
    deal.parties.forEach((p, i) => {
      if (partySide(p.side) === side) p.authorizedSignatory = i === index;
    });
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
    if (dto.authorizedSignatory === true) {
      this.setAuthorizedSignatory(deal, index);
    } else if (dto.authorizedSignatory === false) {
      p.authorizedSignatory = false;
    } else if (dto.side !== undefined && p.authorizedSignatory) {
      // Moved to the other side: they no longer sign for the one they left,
      // and are not automatically the signatory of the new one.
      p.authorizedSignatory = false;
    }
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

  async removeContractSection(
    tenantId: string,
    dealId: string,
    contractId: string,
    index: number,
  ) {
    const deal = await this.getRawDoc(tenantId, dealId);
    const contract = this.getContractOrThrow(deal, contractId);
    if (dealContractExecuted(deal, contract))
      throw new BadRequestException(
        'This contract has been executed, so its text can no longer be edited directly. Use the Amendments tab to vary it.',
      );
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
    if (dealContractExecuted(deal, contract))
      throw new BadRequestException(
        'This contract has been executed, so its text can no longer be edited directly. Use the Amendments tab to vary it.',
      );
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
      party: dto.party ?? null,
      internal: !!dto.internal,
      quote: (dto.quote ?? '').slice(0, 300),
      replies: [],
      resolvedBy: '',
      resolvedAt: null,
    } as any);
    await deal.save();
    return deal;
  }

  async replyToContractComment(
    tenantId: string,
    dealId: string,
    contractId: string,
    sectionIndex: number,
    commentIndex: number,
    dto: AddCommentReplyDto,
  ) {
    const deal = await this.getRawDoc(tenantId, dealId);
    const contract = this.getContractOrThrow(deal, contractId);
    const comment = contract.sections[sectionIndex]?.comments[commentIndex];
    if (!comment) throw new NotFoundException('Comment not found');
    comment.replies.push({
      author: dto.author,
      text: dto.text,
      party: dto.party ?? null,
      internal: !!dto.internal,
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
    actorName = '',
  ) {
    const deal = await this.getRawDoc(tenantId, dealId);
    const contract = this.getContractOrThrow(deal, contractId);
    const comment = contract.sections[sectionIndex]?.comments[commentIndex];
    if (!comment) throw new NotFoundException('Comment not found');
    comment.resolved = !comment.resolved;
    comment.resolvedBy = comment.resolved ? actorName : '';
    comment.resolvedAt = comment.resolved ? new Date() : null;
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
    const lines = htmlToParagraphs(
      renderDealContractBody(contract.variables, section.body),
    );
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
    const lines = htmlToParagraphs(
      renderDealContractBody(contract.variables, section.body),
    );
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
    const value = normalizeFieldValue(dto.key, dto.value.trim());
    // A blank value puts the field back to "not filled in yet": it shows
    // as {{token}} again rather than leaving an empty gap in the text.
    if (value) contract.variables[dto.key] = value;
    else delete contract.variables[dto.key];
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
    dto: SendContractReviewDto = {},
    actorName = '',
  ) {
    const deal = await this.getRawDoc(tenantId, dealId);
    const contract = this.getContractOrThrow(deal, contractId);
    // A term sheet goes to the parties allowed to review the term sheet /
    // offer; a contract to those allowed to review contracts.
    const isTermSheet = contract.kind === 'term_sheet';
    const allowed = deal.parties.filter((p) =>
      isTermSheet ? p.permissions.offerReview : p.permissions.contractReview,
    );
    if (allowed.length === 0)
      throw new BadRequestException(
        isTermSheet
          ? 'No party has term sheet review access enabled. Turn it on for a party in the deal’s Parties.'
          : 'No party has contract review access enabled.',
      );
    const wanted = (dto.recipients ?? []).map((e) => e.toLowerCase());
    const eligible = wanted.length
      ? allowed.filter((p) => wanted.includes(p.email.toLowerCase()))
      : allowed;
    if (eligible.length === 0)
      throw new BadRequestException(
        'None of the people you picked can review this document.',
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

    const message = (dto.message ?? '').trim();
    const round = contract.round ?? 1;
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
        entry =
          contract.reviewLoop.tokens[contract.reviewLoop.tokens.length - 1];
      }
      // Every send starts a fresh look: the reviewer has not opened this
      // version yet and has not answered it.
      entry.sentAt = new Date();
      entry.round = round;
      entry.sentBy = actorName;
      entry.message = message;
      entry.viewedAt = null;
      entry.lastRemindedAt = null;
      contract.reviewLoop.history.push({
        type: 'sent',
        at: entry.sentAt,
        by: actorName,
        partyEmail: party.email,
        round,
        detail: `Sent to ${party.name}`,
      } as any);
      const link = `${process.env.TENANT_APP_URL}/deal-review/contract/${entry.token}`;
      await this.emailService
        .sendDealReviewInvite({
          to: party.email,
          recipientName: party.name,
          dealName: `${deal.name} — ${contract.name}`,
          kind: isTermSheet ? 'offer' : 'contract',
          reviewLink: link,
          businessName,
          message,
          round,
        })
        .catch(() => {});
      sent.push(party.email);
    }
    await deal.save();
    return { sent };
  }

  // The reviewer's answer to the version they were last sent, if any.
  private answerSinceSent(contract: any, tokenEntry: any) {
    const since = new Date(tokenEntry.sentAt).getTime();
    return [...(contract.reviewLoop.responses ?? [])]
      .reverse()
      .find(
        (r: any) =>
          r.partyEmail === tokenEntry.partyEmail &&
          new Date(r.respondedAt).getTime() >= since,
      );
  }

  // A nudge to the reviewers who have not answered what they were sent.
  async remindContractReviewers(
    tenantId: string,
    dealId: string,
    contractId: string,
    businessName: string,
    dto: RemindContractReviewDto = {},
    actorName = '',
  ) {
    const deal = await this.getRawDoc(tenantId, dealId);
    const contract = this.getContractOrThrow(deal, contractId);
    const wanted = (dto.recipients ?? []).map((e) => e.toLowerCase());
    const waiting = contract.reviewLoop.tokens.filter(
      (t) =>
        !this.answerSinceSent(contract, t) &&
        (!wanted.length || wanted.includes(t.partyEmail.toLowerCase())),
    );
    if (waiting.length === 0)
      throw new BadRequestException('Nobody is waiting to respond.');
    const isTermSheet = contract.kind === 'term_sheet';
    const reminded: string[] = [];
    for (const entry of waiting) {
      entry.lastRemindedAt = new Date();
      contract.reviewLoop.history.push({
        type: 'reminded',
        at: entry.lastRemindedAt,
        by: actorName,
        partyEmail: entry.partyEmail,
        round: entry.round ?? 1,
        detail: `Reminder sent to ${entry.partyName}`,
      } as any);
      await this.emailService
        .sendDealReviewInvite({
          to: entry.partyEmail,
          recipientName: entry.partyName,
          dealName: `${deal.name} — ${contract.name}`,
          kind: isTermSheet ? 'offer' : 'contract',
          reviewLink: `${process.env.TENANT_APP_URL}/deal-review/contract/${entry.token}`,
          businessName,
          message: entry.message,
          reminder: true,
          round: entry.round ?? 1,
        })
        .catch(() => {});
      reminded.push(entry.partyEmail);
    }
    await deal.save();
    return { reminded };
  }

  async getContractReviewSnapshot(token: string) {
    const doc = await this.model.findOne({
      'contracts.reviewLoop.tokens.token': token,
    });
    if (!doc) throw new NotFoundException('This review link is invalid.');
    const liveContract = doc.contracts.find((c) =>
      c.reviewLoop.tokens.some((t) => t.token === token),
    );
    if (!liveContract)
      throw new NotFoundException('This review link is invalid.');
    const liveToken = liveContract.reviewLoop.tokens.find(
      (t) => t.token === token,
    );
    // The first time the reviewer opens what they were sent is recorded, so
    // the deal team can see it has been looked at. Never fails the page.
    if (!liveToken.viewedAt) {
      try {
        liveToken.viewedAt = new Date();
        liveContract.reviewLoop.history.push({
          type: 'viewed',
          at: liveToken.viewedAt,
          by: liveToken.partyName,
          partyEmail: liveToken.partyEmail,
          round: liveToken.round ?? 1,
          detail: 'Opened the document',
        } as any);
        await doc.save();
      } catch {
        /* viewing is not worth failing over */
      }
    }
    const deal: any = doc.toObject();
    const contract = deal.contracts.find((c: any) =>
      c.reviewLoop.tokens.some((t: any) => t.token === token),
    );
    const tokenEntry = contract.reviewLoop.tokens.find(
      (t: any) => t.token === token,
    );
    const already = this.answerSinceSent(contract, tokenEntry);
    return {
      dealName: deal.name,
      contractName: contract.name,
      kind: contract.kind ?? 'contract',
      pdfUrl: contract.pdfUrl ?? null,
      prefillName: tokenEntry.partyName,
      alreadyResponded: !!already,
      previousDecision: already?.decision ?? null,
      // The same pages the deal team sees in the app's preview: cover,
      // contents, then the body with every merge field filled in.
      preview: this.documentPreview(contract),
      sections: contract.sections.map((s: any, i: number) => ({
        index: i,
        title: s.title,
        lines: htmlToParagraphs(
          renderDealContractBody(contract.variables, s.body),
        ),
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
    const earlier = this.answerSinceSent(contract, tokenEntry);
    if (earlier?.decision === 'Approved') {
      throw new BadRequestException('You have already approved this.');
    }
    const round = tokenEntry.round ?? 1;
    const name = dto.name || tokenEntry.partyName;
    contract.reviewLoop.responses.push({
      partyEmail: tokenEntry.partyEmail,
      partyName: name,
      decision: dto.decision,
      comment: dto.comment ?? '',
      respondedAt: new Date(),
      round,
    } as any);
    contract.reviewLoop.history.push({
      type: 'responded',
      at: new Date(),
      by: name,
      partyEmail: tokenEntry.partyEmail,
      round,
      detail:
        dto.decision === 'Approved'
          ? 'Approved'
          : `Requested changes${dto.comment ? ` — ${dto.comment}` : ''}`,
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

  // A contract made from a template with a cover page and/or a contents
  // page starts with those, each on its own page, before the body.
  private isStructured(contract: any): boolean {
    return (
      !!(contract.coverPage ?? '').replace(/<[^>]*>/g, '').trim() ||
      !!contract.tocEnabled
    );
  }

  private renderFrontPages(doc: any, contract: any) {
    const cover = renderDealContractBody(
      contract.variables,
      contract.coverPage ?? '',
    );
    const entries = contract.tocEnabled
      ? buildDealToc(contract.variables, contract.sections)
      : [];
    const parts: string[] = [];
    if (cover.replace(/<[^>]*>/g, '').trim()) {
      parts.push(`<section data-contract-part="cover">${cover}</section>`);
    }
    if (entries.length) {
      const title = escapeMergeValue(contract.tocTitle || 'Table of Contents');
      parts.push(
        `<section data-contract-part="toc"><h2 data-toc-heading>${title}</h2>` +
          entries
            .map(
              (e) =>
                `<div data-toc-entry data-level="${e.level}">${escapeMergeValue(e.title)}</div>`,
            )
            .join('') +
          `</section>`,
      );
    }
    if (parts.length) renderRichText(doc, parts.join(''));
    // Whatever follows (the body) starts on a fresh page.
    doc.addPage();
  }

  // A document as a reader sees it, for the public review and signing pages.
  documentPreview(contract: any) {
    return {
      name: contract.name,
      cover: renderDealContractBody(
        contract.variables,
        contract.coverPage ?? '',
      ),
      toc: {
        enabled: !!contract.tocEnabled,
        title: contract.tocTitle || 'Table of Contents',
        entries: contract.tocEnabled
          ? buildDealToc(contract.variables, contract.sections)
          : [],
      },
      sections: (contract.sections ?? []).map((s: any) => ({
        title: s.title,
        html: renderDealContractBody(contract.variables, s.body),
      })),
    };
  }

  private renderBody(
    contract: { variables: Record<string, string> },
    body: string,
  ): string {
    return renderDealContractBody(contract.variables, body);
  }

  private generateContractPdf(
    deal: DealDocument,
    contract: any,
    businessName: string,
    // Appended after the body (the signature page of a signed copy).
    extra?: (doc: any) => void,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const structured = this.isStructured(contract);
      if (structured) {
        this.renderFrontPages(doc, contract);
      } else {
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

        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .text(
            contract.kind === 'term_sheet'
              ? 'Parties to this Term Sheet'
              : 'Parties to this Agreement',
          );
        doc.moveDown(0.5);
        for (const side of [
          DealPartySide.PARTY_A,
          DealPartySide.PARTY_B,
        ] as const) {
          const sideParties = deal.parties.filter(
            (p) => partySide(p.side) === side,
          );
          doc.fontSize(12).font('Helvetica-Bold').text(side);
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
                .text(
                  `${p.name} — ${p.title}${p.email ? ` (${p.email})` : ''}`,
                );
            });
          }
          doc.moveDown(0.5);
        }
        doc.moveDown(1);

        doc.moveDown(1);
      }

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

      if (extra) extra(doc);
      doc.end();
    });
  }

  // The plain PDF of a document, optionally with extra pages after it —
  // used by signing, which snapshots it and then adds the signature page.
  buildContractPdf(
    deal: DealDocument,
    contract: any,
    businessName: string,
    extra?: (doc: any) => void,
  ): Promise<Buffer> {
    return this.generateContractPdf(deal, contract, businessName, extra);
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

      if (this.isStructured(contract)) this.renderFrontPages(doc, contract);
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
          // Tracked changes proposed in negotiation: the wording struck
          // through, the proposal beside it, who proposed it and when.
          (s.changes ?? []).forEach((ch: any) => {
            const who = `${partySide(ch.party)} · Round ${ch.round ?? 1}${ch.authorName ? ` — ${ch.authorName}` : ''}`;
            const accepted = ch.status === 'accepted';
            doc
              .fontSize(9)
              .font('Helvetica-Oblique')
              .fillColor('#555555')
              .text(`  ✎ [${who}${accepted ? ', accepted' : ''}] `, {
                continued: true,
              });
            if (ch.del) {
              doc
                .fillColor('#b91c1c')
                .text(ch.del, { continued: true, strike: true });
              doc
                .fillColor('#555555')
                .text(' → ', { continued: true, strike: false });
            }
            doc
              .fillColor('#067647')
              .text(
                [ch.ins, ...(ch.addedLines ?? [])]
                  .filter(Boolean)
                  .join(' / ') || '(no wording)',
                { strike: false },
              );
            doc.moveDown(0.2);
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
