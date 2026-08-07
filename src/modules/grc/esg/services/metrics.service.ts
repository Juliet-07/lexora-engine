import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EsgMetric,
  EsgMetricDocument,
  EsgInitiative,
  EsgInitiativeDocument,
  MetricPillar,
} from '../schemas';
import {
  UpsertMetricDto,
  CreateInitiativeDto,
  SetInitiativeStatusDto,
} from '../dtos';
import {
  targetProgress,
  improvement,
  intensity,
  pillarScore,
  OrgContextLike,
} from 'src/common/utils/esg-calculations.util';

@Injectable()
export class EsgMetricsService {
  constructor(
    @InjectModel(EsgMetric.name)
    private readonly metricModel: Model<EsgMetricDocument>,
    @InjectModel(EsgInitiative.name)
    private readonly initiativeModel: Model<EsgInitiativeDocument>,
  ) {}

  private withComputed(m: any, ctx: OrgContextLike) {
    return {
      ...m,
      targetProgress: targetProgress(m),
      improvement: improvement(m),
      intensity: intensity(m, ctx),
    };
  }

  async getAll(tenantId: string, ctx: OrgContextLike, pillar?: MetricPillar) {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (pillar) query.pillar = pillar;
    const rows = await this.metricModel.find(query).sort({ name: 1 }).lean();
    return rows.map((m) => this.withComputed(m, ctx));
  }

  // Raw (real) documents, used internally by pillarScoreFor / dashboard
  // aggregation so scores aren't affected by pagination or filtering.
  async getAllRaw(tenantId: string, pillar?: MetricPillar) {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (pillar) query.pillar = pillar;
    return this.metricModel.find(query).lean();
  }

  async pillarScoreFor(tenantId: string, pillar: MetricPillar) {
    const rows = await this.getAllRaw(tenantId, pillar);
    return pillarScore(rows);
  }

  async upsert(tenantId: string, id: string | null, dto: UpsertMetricDto) {
    const tId = new Types.ObjectId(tenantId);
    if (id) {
      const m = await this.metricModel.findOneAndUpdate(
        { _id: id, tenantId: tId },
        { $set: dto },
        { new: true },
      );
      if (!m) throw new NotFoundException('Metric not found');
      return m.toObject();
    }
    const created = await this.metricModel.create({ ...dto, tenantId: tId });
    return created.toObject();
  }

  async delete(tenantId: string, id: string) {
    const res = await this.metricModel.deleteOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!res.deletedCount) throw new NotFoundException('Metric not found');
    return { deleted: true };
  }

  // ── Initiatives ──────────────────────────────────────────────

  async getInitiatives(tenantId: string) {
    return this.initiativeModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async createInitiative(tenantId: string, dto: CreateInitiativeDto) {
    const created = await this.initiativeModel.create({
      ...dto,
      tenantId: new Types.ObjectId(tenantId),
    });
    return created.toObject();
  }

  async setInitiativeStatus(
    tenantId: string,
    id: string,
    dto: SetInitiativeStatusDto,
  ) {
    const i = await this.initiativeModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      { $set: { status: dto.status } },
      { new: true },
    );
    if (!i) throw new NotFoundException('Initiative not found');
    return i.toObject();
  }
}
