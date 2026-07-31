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
import { Clause, ClauseDocument } from '../schemas';
import {
  CreateDealDto,
  SetStageDto,
  SetStatusDto,
  UpdateTermSheetDto,
  AddDDItemDto,
  UpdateDDItemDto,
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
} from '../dtos';

@Injectable()
export class DealService {
  constructor(
    @InjectModel(Deal.name) private readonly model: Model<DealDocument>,
    @InjectModel(Clause.name)
    private readonly clauseModel: Model<ClauseDocument>,
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
    };
  }

  // ── Core ─────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateDealDto) {
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
      client: dto.client,
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

  // ── Contract ─────────────────────────────────────────────────

  async addContractSection(
    tenantId: string,
    id: string,
    dto: AddContractSectionDto,
  ) {
    const deal = await this.getRawDoc(tenantId, id);
    const clause = await this.clauseModel
      .findOne({ _id: dto.clauseId, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!clause) throw new NotFoundException('Clause not found');
    deal.contract.sections.push({
      clauseId: clause._id,
      title: clause.title,
      body: clause.body,
      comments: [],
    } as any);
    deal.markModified('contract');
    await deal.save();
    return deal;
  }

  async removeContractSection(tenantId: string, id: string, index: number) {
    const deal = await this.getRawDoc(tenantId, id);
    if (!deal.contract.sections[index])
      throw new NotFoundException('Section not found');
    deal.contract.sections.splice(index, 1);
    deal.markModified('contract');
    await deal.save();
    return deal;
  }

  async updateContractSectionBody(
    tenantId: string,
    id: string,
    index: number,
    dto: UpdateContractSectionBodyDto,
  ) {
    const deal = await this.getRawDoc(tenantId, id);
    const section = deal.contract.sections[index];
    if (!section) throw new NotFoundException('Section not found');
    section.body = dto.body;
    deal.markModified('contract');
    await deal.save();
    return deal;
  }

  async addContractComment(
    tenantId: string,
    id: string,
    index: number,
    dto: AddContractCommentDto,
  ) {
    const deal = await this.getRawDoc(tenantId, id);
    const section = deal.contract.sections[index];
    if (!section) throw new NotFoundException('Section not found');
    section.comments.push({
      author: dto.author,
      text: dto.text,
      resolved: false,
      createdAt: new Date(),
    } as any);
    deal.markModified('contract');
    await deal.save();
    return deal;
  }

  async toggleContractComment(
    tenantId: string,
    id: string,
    sectionIndex: number,
    commentIndex: number,
  ) {
    const deal = await this.getRawDoc(tenantId, id);
    const comment =
      deal.contract.sections[sectionIndex]?.comments[commentIndex];
    if (!comment) throw new NotFoundException('Comment not found');
    comment.resolved = !comment.resolved;
    deal.markModified('contract');
    await deal.save();
    return deal;
  }

  async setContractVariable(
    tenantId: string,
    id: string,
    dto: SetContractVariableDto,
  ) {
    const deal = await this.getRawDoc(tenantId, id);
    deal.contract.variables[dto.key] = dto.value;
    deal.markModified('contract');
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
}
