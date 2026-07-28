import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EmergingRisk,
  EmergingRiskDocument,
  EmergingStatus,
  Velocity,
  WatchList,
  ReviewRecommendation,
} from '../schemas';
import {
  CreateEmergingRiskDto,
  UpdateEmergingRiskDto,
  AddTriggerDto,
  AddReviewDto,
  EscalateEmergingRiskDto,
} from '../dtos';
import { RiskService } from './risk.service';

@Injectable()
export class EmergingRiskService {
  constructor(
    @InjectModel(EmergingRisk.name)
    private readonly model: Model<EmergingRiskDocument>,
    private readonly riskService: RiskService,
  ) {}

  // Single source of truth for watch-list categorisation — never
  // trusted from the client, always recomputed server-side.
  categoriseWatchList(impact: number, velocity: Velocity): WatchList {
    const fast =
      velocity === Velocity.IMMEDIATE || velocity === Velocity.SHORT_TERM;
    if (impact >= 4 && fast) return WatchList.ACTIVE_WATCH;
    if (impact >= 3) return WatchList.MONITOR;
    return WatchList.LOW_PRIORITY;
  }

  async create(tenantId: string, dto: CreateEmergingRiskDto) {
    const watchList = this.categoriseWatchList(dto.impact, dto.velocity);
    return this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      category: dto.category,
      source: dto.source,
      description: dto.description ?? '',
      impact: dto.impact,
      velocity: dto.velocity,
      watchList,
      owner: dto.owner ?? '',
      triggers: [],
      reviews: [],
      status: EmergingStatus.WATCHING,
      escalatedAt: null,
      escalationNote: '',
    });
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  private async getRawDoc(
    tenantId: string,
    id: string,
  ): Promise<EmergingRiskDocument> {
    const risk = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!risk) throw new NotFoundException('Emerging risk not found');
    return risk;
  }

  async update(tenantId: string, id: string, dto: UpdateEmergingRiskDto) {
    const risk = await this.getRawDoc(tenantId, id);
    if (dto.impact !== undefined) risk.impact = dto.impact;
    if (dto.velocity !== undefined) risk.velocity = dto.velocity;
    risk.watchList = this.categoriseWatchList(risk.impact, risk.velocity);
    await risk.save();
    return risk;
  }

  async addTrigger(tenantId: string, id: string, dto: AddTriggerDto) {
    const risk = await this.getRawDoc(tenantId, id);
    risk.triggers.push({
      kind: dto.kind,
      condition: dto.condition,
      fired: false,
      firedAt: null,
    } as any);
    risk.markModified('triggers');
    await risk.save();
    return risk;
  }

  async fireTrigger(tenantId: string, id: string, triggerIndex: number) {
    const risk = await this.getRawDoc(tenantId, id);
    const trigger = risk.triggers[triggerIndex];
    if (!trigger) throw new NotFoundException('Trigger not found');
    trigger.fired = true;
    trigger.firedAt = new Date();
    risk.markModified('triggers');
    await risk.save();
    return risk;
  }

  async addReview(tenantId: string, id: string, dto: AddReviewDto) {
    const risk = await this.getRawDoc(tenantId, id);
    risk.reviews.unshift({
      at: new Date(),
      quarter: dto.quarter,
      recommendation: dto.recommendation,
      note: dto.note ?? '',
    } as any);
    if (dto.recommendation === ReviewRecommendation.REMOVE) {
      risk.status = EmergingStatus.REMOVED;
    }
    risk.markModified('reviews');
    await risk.save();
    return risk;
  }

  async escalate(tenantId: string, id: string, dto: EscalateEmergingRiskDto) {
    const risk = await this.getRawDoc(tenantId, id);
    if (risk.status !== EmergingStatus.WATCHING) {
      throw new BadRequestException('Only a watched risk can be escalated.');
    }

    const created = await this.riskService.create(tenantId, {
      title: risk.title,
      category: risk.category,
      description: risk.description,
      owner: risk.owner,
      likelihood: dto.likelihood,
      impact: risk.impact,
    });

    risk.status = EmergingStatus.ESCALATED;
    risk.escalatedAt = new Date();
    risk.escalationNote =
      dto.escalationNote?.trim() || 'Escalated by Risk Committee.';
    risk.linkedRiskId = created._id as Types.ObjectId;
    await risk.save();
    return risk;
  }

  // Genuine hard delete — the sheet's "Delete" button. Distinct from
  // the soft "Removed" status set by addReview above.
  async delete(tenantId: string, id: string): Promise<void> {
    const deleted = await this.model.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Emerging risk not found');
  }
}
