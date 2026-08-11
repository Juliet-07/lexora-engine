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
import { CreateMandateDto, UpdateMandateDto, SetClosureItemDto } from '../dtos';

@Injectable()
export class MandateService {
  constructor(
    @InjectModel(Mandate.name)
    private readonly model: Model<MandateDocument_>,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.model.countDocuments({
      tenantId,
      ref: new RegExp(`^M-${year}-`),
    });
    return `M-${year}-${String(count + 1).padStart(3, '0')}`;
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getById(tenantId: string, id: string) {
    const m = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!m) throw new NotFoundException('Mandate not found');
    return m;
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
    return created.toObject();
  }

  async update(tenantId: string, id: string, dto: UpdateMandateDto) {
    const m = await this.getRawDoc(tenantId, id);
    if (dto.name !== undefined) m.name = dto.name;
    if (dto.rag !== undefined) m.rag = dto.rag;
    if (dto.manager !== undefined) m.manager = dto.manager;
    if (dto.teamId !== undefined) m.teamId = new Types.ObjectId(dto.teamId);
    if (dto.teamName !== undefined) m.teamName = dto.teamName;
    if (dto.team !== undefined) m.team = dto.team;
    if (dto.targetDate !== undefined) m.targetDate = new Date(dto.targetDate);
    if (dto.budget !== undefined) m.budget = dto.budget;
    if (dto.actualCost !== undefined) m.actualCost = dto.actualCost;
    if (dto.billed !== undefined) m.billed = dto.billed;
    if (dto.wip !== undefined) m.wip = dto.wip;
    if (dto.feeStructure !== undefined) m.feeStructure = dto.feeStructure;
    if (dto.progress !== undefined) m.progress = dto.progress;
    await m.save();
    return m.toObject();
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
    return { ...m.toObject(), stageTrigger: MANDATE_STAGE_META[next].trigger };
  }

  async clearConflictCheck(tenantId: string, id: string) {
    const m = await this.getRawDoc(tenantId, id);
    m.conflictCheck = ConflictCheckStatus.CLEARED;
    await m.save();
    return m.toObject();
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
    return m.toObject();
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
    return m.toObject();
  }

  async addCustomFolder(tenantId: string, id: string, folder: string) {
    const m = await this.getRawDoc(tenantId, id);
    if (!m.customFolders.includes(folder)) {
      m.customFolders.push(folder);
      await m.save();
    }
    return m.toObject();
  }
}
