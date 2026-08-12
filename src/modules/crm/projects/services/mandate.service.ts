import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Mandate,
  MandateDocument_,
  MandateStage,
  MANDATE_STAGES,
  MANDATE_STAGE_META,
  ConflictCheckStatus,
  DEFAULT_CLOSURE_CHECKLIST,
} from '../schemas';
import {
  CreateMandateDto,
  UpdateMandateDto,
  SetClosureItemDto,
  AddMilestoneDto,
  UpdateMilestoneDto,
} from '../dtos';
import { TimeEntryService } from './time-entry.service';

@Injectable()
export class MandateService {
  constructor(
    @InjectModel(Mandate.name)
    private readonly model: Model<MandateDocument_>,
    private readonly timeEntryService: TimeEntryService,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.model.countDocuments({
      tenantId,
      ref: new RegExp(`^M-${year}-`),
    });
    return `M-${year}-${String(count + 1).padStart(3, '0')}`;
  }

  // .lean() returns the raw MongoDB document with no schema defaults
  // applied — mandates created before `milestones` existed genuinely
  // have no such key stored, so it comes back undefined here even
  // though the schema says `default: []`. Normalize explicitly
  // rather than relying on every caller to guard for it.
  //
  // wip is no longer a stored value the tenant sets by hand — it's
  // the sum of this mandate's Approved, billable time entries, so
  // this normalization is now async.
  private async normalize(m: any, wip?: number) {
    return {
      ...m,
      description: m.description ?? '',
      milestones: m.milestones ?? [],
      customFolders: m.customFolders ?? [],
      wip:
        wip ??
        (await this.timeEntryService.getApprovedBillableValueForMandate(
          String(m.tenantId),
          String(m._id),
        )),
    };
  }

  async getAll(tenantId: string) {
    const rows = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
    const wipMap =
      await this.timeEntryService.getApprovedBillableValueByMandateIds(
        tenantId,
        rows.map((r) => String(r._id)),
      );
    return Promise.all(
      rows.map((m) => this.normalize(m, wipMap.get(String(m._id)) ?? 0)),
    );
  }

  async getById(tenantId: string, id: string) {
    const m = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!m) throw new NotFoundException('Mandate not found');
    return this.normalize(m);
  }

  private async getRawDoc(tenantId: string, id: string) {
    const m = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!m) throw new NotFoundException('Mandate not found');
    return m;
  }

  async create(tenantId: string, dto: CreateMandateDto) {
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      name: dto.name,
      description: dto.description ?? '',
      clientUserId: new Types.ObjectId(dto.clientUserId),
      clientName: dto.clientName,
      type: dto.type,
      manager: dto.manager ?? '',
      teamId: dto.teamId ? new Types.ObjectId(dto.teamId) : null,
      teamName: dto.teamName ?? '',
      team: [],
      startDate: new Date(),
      targetDate: new Date(dto.targetDate),
      budget: dto.budget,
      feeStructure: dto.feeStructure,
      currency: dto.currency ?? 'USD',
      closureChecklist: DEFAULT_CLOSURE_CHECKLIST.map((label) => ({
        label,
        done: false,
      })),
    });
    // A brand-new mandate has no time entries yet — 0 without a query.
    return this.normalize(created.toObject(), 0);
  }

  async update(tenantId: string, id: string, dto: UpdateMandateDto) {
    const m = await this.getRawDoc(tenantId, id);
    if (dto.name !== undefined) m.name = dto.name;
    if (dto.description !== undefined) m.description = dto.description;
    if (dto.rag !== undefined) m.rag = dto.rag;
    if (dto.manager !== undefined) m.manager = dto.manager;
    if (dto.teamId !== undefined) m.teamId = new Types.ObjectId(dto.teamId);
    if (dto.teamName !== undefined) m.teamName = dto.teamName;
    if (dto.team !== undefined) m.team = dto.team;
    if (dto.targetDate !== undefined) m.targetDate = new Date(dto.targetDate);
    if (dto.budget !== undefined) m.budget = dto.budget;
    if (dto.actualCost !== undefined) m.actualCost = dto.actualCost;
    if (dto.billed !== undefined) m.billed = dto.billed;
    // wip intentionally not settable here anymore — it's derived
    // from Approved, billable time entries. See UpdateMandateDto.
    if (dto.feeStructure !== undefined) m.feeStructure = dto.feeStructure;
    if (dto.progress !== undefined) m.progress = dto.progress;
    await m.save();
    return this.normalize(m.toObject());
  }

  // Same gate as the confirmed prototype: can't reach Setup with an
  // uncleared conflict check.
  async advanceStage(tenantId: string, id: string) {
    const m = await this.getRawDoc(tenantId, id);
    const idx = MANDATE_STAGES.indexOf(m.stage);
    if (idx === MANDATE_STAGES.length - 1) {
      throw new BadRequestException('Mandate is already at its final stage');
    }
    const next = MANDATE_STAGES[idx + 1];
    if (
      next === MandateStage.SETUP &&
      m.conflictCheck !== ConflictCheckStatus.CLEARED
    ) {
      throw new BadRequestException(
        'Clear the conflict check before moving to Setup',
      );
    }
    m.stage = next;
    await m.save();
    const normalized = await this.normalize(m.toObject());
    return { ...normalized, stageTrigger: MANDATE_STAGE_META[next].trigger };
  }

  async clearConflictCheck(tenantId: string, id: string) {
    const m = await this.getRawDoc(tenantId, id);
    m.conflictCheck = ConflictCheckStatus.CLEARED;
    await m.save();
    return this.normalize(m.toObject());
  }

  async setClosureItem(
    tenantId: string,
    id: string,
    itemId: string,
    dto: SetClosureItemDto,
  ) {
    const m = await this.getRawDoc(tenantId, id);
    const item = m.closureChecklist.id(itemId);
    if (!item) throw new NotFoundException('Closure checklist item not found');
    item.done = dto.done;
    await m.save();
    return this.normalize(m.toObject());
  }

  // Only closeable once every checklist item is done — same rule as
  // the confirmed prototype's disabled Close button.
  async close(tenantId: string, id: string) {
    const m = await this.getRawDoc(tenantId, id);
    if (!m.closureChecklist.every((c) => c.done)) {
      throw new BadRequestException(
        'All closure checklist items must be complete first',
      );
    }
    m.stage = MandateStage.CLOSE;
    m.progress = 100;
    await m.save();
    return this.normalize(m.toObject());
  }

  async addCustomFolder(tenantId: string, id: string, folder: string) {
    const m = await this.getRawDoc(tenantId, id);
    if (!m.customFolders.includes(folder)) {
      m.customFolders.push(folder);
      await m.save();
    }
    return this.normalize(m.toObject());
  }

  // ── Milestones ───────────────────────────────────────────────

  async addMilestone(tenantId: string, id: string, dto: AddMilestoneDto) {
    const m = await this.getRawDoc(tenantId, id);
    m.milestones.push({
      name: dto.name,
      date: new Date(dto.date),
    } as any);
    await m.save();
    return this.normalize(m.toObject());
  }

  async updateMilestone(
    tenantId: string,
    id: string,
    milestoneId: string,
    dto: UpdateMilestoneDto,
  ) {
    const m = await this.getRawDoc(tenantId, id);
    const milestone = m.milestones.id(milestoneId);
    if (!milestone) throw new NotFoundException('Milestone not found');
    if (dto.name !== undefined) milestone.name = dto.name;
    if (dto.date !== undefined) milestone.date = new Date(dto.date);
    if (dto.status !== undefined) milestone.status = dto.status as any;
    await m.save();
    return this.normalize(m.toObject());
  }

  async deleteMilestone(tenantId: string, id: string, milestoneId: string) {
    const m = await this.getRawDoc(tenantId, id);
    const milestone = m.milestones.id(milestoneId);
    if (!milestone) throw new NotFoundException('Milestone not found');
    milestone.deleteOne();
    await m.save();
    return this.normalize(m.toObject());
  }
}
