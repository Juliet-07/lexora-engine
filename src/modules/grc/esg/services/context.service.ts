import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EsgOrgContext,
  EsgOrgContextDocument,
  EsgScoreHistory,
  EsgScoreHistoryDocument,
} from '../schemas';
import { UpdateContextDto, SnapshotHistoryDto } from '../dtos';

@Injectable()
export class EsgContextService {
  constructor(
    @InjectModel(EsgOrgContext.name)
    private readonly contextModel: Model<EsgOrgContextDocument>,
    @InjectModel(EsgScoreHistory.name)
    private readonly historyModel: Model<EsgScoreHistoryDocument>,
  ) {}

  async getOrCreate(tenantId: string): Promise<EsgOrgContextDocument> {
    const tId = new Types.ObjectId(tenantId);
    let ctx = await this.contextModel.findOne({ tenantId: tId });
    if (!ctx) ctx = await this.contextModel.create({ tenantId: tId });
    return ctx;
  }

  async get(tenantId: string) {
    return (await this.getOrCreate(tenantId)).toObject();
  }

  async update(tenantId: string, dto: UpdateContextDto) {
    const ctx = await this.getOrCreate(tenantId);
    if (dto.employees !== undefined) ctx.employees = dto.employees;
    if (dto.floorAreaSqm !== undefined) ctx.floorAreaSqm = dto.floorAreaSqm;
    if (dto.revenueMillions !== undefined)
      ctx.revenueMillions = dto.revenueMillions;
    if (dto.sector !== undefined) ctx.sector = dto.sector;
    if (dto.peerEnvironmental !== undefined)
      ctx.peerAverage.environmental = dto.peerEnvironmental;
    if (dto.peerSocial !== undefined) ctx.peerAverage.social = dto.peerSocial;
    if (dto.peerGovernance !== undefined)
      ctx.peerAverage.governance = dto.peerGovernance;
    await ctx.save();
    return ctx.toObject();
  }

  async getHistory(tenantId: string) {
    return this.historyModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ period: 1 })
      .lean();
  }

  // Records (or overwrites) the pillar scores for a given period —
  // an explicit action, not an automatic side effect of scoring.
  async snapshotHistory(
    tenantId: string,
    dto: SnapshotHistoryDto,
    e: number,
    s: number,
    g: number,
  ) {
    if (!dto.period.trim()) {
      throw new BadRequestException('Period is required');
    }
    const tId = new Types.ObjectId(tenantId);
    await this.historyModel.findOneAndUpdate(
      { tenantId: tId, period: dto.period },
      { $set: { e, s, g } },
      { upsert: true },
    );
    return this.getHistory(tenantId);
  }
}
