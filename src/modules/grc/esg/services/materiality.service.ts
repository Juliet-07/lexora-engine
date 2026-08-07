import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Stakeholder,
  StakeholderDocument,
  MaterialTopic,
  MaterialTopicDocument,
  MaterialityCycle,
  MaterialityCycleDocument,
  MaterialityCycleStatus,
} from '../schemas';
import {
  CreateStakeholderDto,
  RecordEngagementDto,
  CreateTopicDto,
  UpdateTopicScoreDto,
  UpdateThresholdDto,
  ApproveCycleDto,
} from '../dtos';
import {
  topicStatus,
  topicShift,
} from 'src/common/utils/esg-calculations.util';
import { RiskService } from '../../risk/services';
import { RiskCategory } from '../../risk/schemas';

@Injectable()
export class EsgMaterialityService {
  constructor(
    @InjectModel(Stakeholder.name)
    private readonly stakeholderModel: Model<StakeholderDocument>,
    @InjectModel(MaterialTopic.name)
    private readonly topicModel: Model<MaterialTopicDocument>,
    @InjectModel(MaterialityCycle.name)
    private readonly cycleModel: Model<MaterialityCycleDocument>,
    private readonly riskService: RiskService,
  ) {}

  // ── Cycle (singleton per tenant) ─────────────────────────────

  async getOrCreateCycle(tenantId: string): Promise<MaterialityCycleDocument> {
    const tId = new Types.ObjectId(tenantId);
    let c = await this.cycleModel.findOne({ tenantId: tId });
    if (!c) c = await this.cycleModel.create({ tenantId: tId });
    return c;
  }

  async getCycle(tenantId: string) {
    return (await this.getOrCreateCycle(tenantId)).toObject();
  }

  async updateThreshold(tenantId: string, dto: UpdateThresholdDto) {
    const c = await this.getOrCreateCycle(tenantId);
    c.threshold = dto.threshold;
    await c.save();
    return c.toObject();
  }

  async approveCycle(tenantId: string, dto: ApproveCycleDto) {
    const c = await this.getOrCreateCycle(tenantId);
    c.status = MaterialityCycleStatus.APPROVED;
    c.approvedBy = dto.approvedBy;
    c.approvedAt = new Date();
    await c.save();
    return c.toObject();
  }

  // Opens the next assessment cycle: bumps the year, resets
  // approval, and rolls every topic's current scores into its
  // "prior" fields so the new cycle can show movement against them.
  async openNextCycle(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const c = await this.getOrCreateCycle(tenantId);
    c.year = String(Number(c.year) + 1);
    c.status = MaterialityCycleStatus.IN_PROGRESS;
    c.approvedBy = null;
    c.approvedAt = null;
    c.nextReviewDate = new Date(Date.now() + 365 * 86400000);
    await c.save();

    const topics = await this.topicModel.find({ tenantId: tId });
    for (const t of topics) {
      t.priorFinancial = t.financial;
      t.priorImpact = t.impact;
    }
    await Promise.all(topics.map((t) => t.save()));

    return c.toObject();
  }

  // ── Stakeholders ─────────────────────────────────────────────

  async getStakeholders(tenantId: string) {
    return this.stakeholderModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .lean();
  }

  async addStakeholder(tenantId: string, dto: CreateStakeholderDto) {
    const created = await this.stakeholderModel.create({
      ...dto,
      tenantId: new Types.ObjectId(tenantId),
    });
    return created.toObject();
  }

  async recordEngagement(
    tenantId: string,
    id: string,
    dto: RecordEngagementDto,
  ) {
    const s = await this.stakeholderModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      {
        $set: {
          lastEngaged: new Date(),
          ...(dto.input !== undefined ? { input: dto.input } : {}),
        },
      },
      { new: true },
    );
    if (!s) throw new NotFoundException('Stakeholder group not found');
    return s.toObject();
  }

  // ── Topics ───────────────────────────────────────────────────

  async getTopics(tenantId: string) {
    const cycle = await this.getCycle(tenantId);
    const rows = await this.topicModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
    return rows.map((t) => ({
      ...t,
      status: topicStatus(t, cycle.threshold),
      shift: topicShift(t),
    }));
  }

  async getAllTopicsRaw(tenantId: string) {
    return this.topicModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .lean();
  }

  async addTopic(tenantId: string, dto: CreateTopicDto) {
    const created = await this.topicModel.create({
      tenantId: new Types.ObjectId(tenantId),
      topic: dto.topic,
      pillar: dto.pillar,
      financial: dto.financial,
      impact: dto.impact,
      rationale: dto.rationale ?? '',
      priorFinancial: null,
      priorImpact: null,
      escalatedToRisk: false,
      riskId: null,
    });
    return created.toObject();
  }

  async updateTopicScore(
    tenantId: string,
    id: string,
    dto: UpdateTopicScoreDto,
  ) {
    const t = await this.topicModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      { $set: dto },
      { new: true },
    );
    if (!t) throw new NotFoundException('Topic not found');
    return t.toObject();
  }

  // Creates a real Risk Register entry from a material topic — the
  // same cross-module "infused" pattern as Investor Readiness reading
  // Governance/HR data directly, just as a write this time. Mapping
  // is transcribed exactly from the confirmed prototype's escalate().
  async escalateToRisk(tenantId: string, id: string) {
    const t = await this.topicModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!t) throw new NotFoundException('Topic not found');
    if (t.escalatedToRisk) {
      throw new BadRequestException('Topic is already escalated');
    }
    const cycle = await this.getCycle(tenantId);

    const category =
      t.pillar === 'Environmental'
        ? RiskCategory.OPERATIONAL
        : t.pillar === 'Social'
          ? RiskCategory.REPUTATIONAL
          : RiskCategory.COMPLIANCE;

    const risk = await this.riskService.create(tenantId, {
      title: `ESG — ${t.topic}`,
      category,
      description: `Escalated from the ${cycle.year} double materiality assessment. ${t.rationale}`,
      rootCauses:
        'Identified through stakeholder engagement and materiality scoring.',
      affectedProcesses: 'Sustainability reporting, operations',
      owner: 'Sustainability Lead',
      likelihood: t.impact,
      impact: t.financial,
      financialExposure: 0,
    });

    t.escalatedToRisk = true;
    t.riskId = (risk as any)._id;
    await t.save();
    return t.toObject();
  }
}
