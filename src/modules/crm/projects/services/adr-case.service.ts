import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AdrCase, AdrCaseDocument } from '../schemas';
import {
  CreateAdrCaseDto,
  UpdateAdrStageDto,
  AddAdrSessionDto,
  RecordAdrSettlementDto,
  RecordAdrOutcomeDto,
} from '../dtos';

@Injectable()
export class AdrCaseService {
  constructor(
    @InjectModel(AdrCase.name)
    private readonly model: Model<AdrCaseDocument>,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const count = await this.model.countDocuments({ tenantId });
    return `ADR-${String(count + 1).padStart(3, '0')}`;
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getById(tenantId: string, id: string) {
    const c = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!c) throw new NotFoundException('Case not found');
    return c;
  }

  private async getRawDoc(tenantId: string, id: string) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Case not found');
    return c;
  }

  async create(tenantId: string, dto: CreateAdrCaseDto) {
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      title: dto.title,
      type: dto.type,
      parties: dto.parties,
      neutralUserId: dto.neutralUserId
        ? new Types.ObjectId(dto.neutralUserId)
        : null,
      neutral: dto.neutral,
      claimValue: dto.claimValue ?? 0,
      currency: dto.currency ?? 'USD',
      filedOn: new Date(),
    });
    return created.toObject();
  }

  async setStage(tenantId: string, id: string, dto: UpdateAdrStageDto) {
    const c = await this.getRawDoc(tenantId, id);
    c.stage = dto.stage;
    await c.save();
    return c.toObject();
  }

  // Stage is left alone here — unlike Task/Mandate workflows, ADR
  // sessions can legitimately happen before or after settlement
  // discussions start, so auto-advancing the stage on every session
  // would sometimes be wrong. Stage stays a manual, explicit choice.
  async addSession(tenantId: string, id: string, dto: AddAdrSessionDto) {
    const c = await this.getRawDoc(tenantId, id);
    c.sessions.push({
      date: new Date(dto.date),
      mode: dto.mode,
      venue: dto.venue ?? '',
      outcome: dto.outcome ?? '',
    } as any);
    await c.save();
    return c.toObject();
  }

  // Amount and terms are genuinely negotiated — not auto-computed
  // from a fixed percentage of the claim value the way the
  // prototype's placeholder did.
  async recordSettlement(
    tenantId: string,
    id: string,
    dto: RecordAdrSettlementDto,
  ) {
    const c = await this.getRawDoc(tenantId, id);
    c.settlement = {
      amount: dto.amount,
      date: new Date(),
      terms: dto.terms ?? '',
    } as any;
    c.stage = 'Settlement' as any;
    await c.save();
    return c.toObject();
  }

  async recordOutcome(tenantId: string, id: string, dto: RecordAdrOutcomeDto) {
    const c = await this.getRawDoc(tenantId, id);
    c.outcome = dto.outcome;
    c.stage = 'Award / Outcome' as any;
    await c.save();
    return c.toObject();
  }
}
