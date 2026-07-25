import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TreatmentPlan,
  TreatmentPlanDocument,
  ApprovalStatus,
} from '../schemas';
import { Risk, RiskDocument } from '../schemas';
import { CreateTreatmentPlanDto, DecideTreatmentPlanDto } from '../dtos';
import { RiskService } from './risk.service';

const APPROVAL_THRESHOLD = 50000;

@Injectable()
export class TreatmentPlanService {
  constructor(
    @InjectModel(TreatmentPlan.name)
    private readonly planModel: Model<TreatmentPlanDocument>,
    @InjectModel(Risk.name) private readonly riskModel: Model<RiskDocument>,
    private readonly riskService: RiskService,
  ) {}

  // Real eligibility check — the client can't be trusted to only ever
  // submit a High/Extreme risk, even though the dropdown it's shown is
  // already filtered client-side.
  async create(tenantId: string, dto: CreateTreatmentPlanDto) {
    const risk = await this.riskModel
      .findOne({ _id: dto.riskId, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!risk) throw new NotFoundException('Risk not found');

    const residual = this.riskService.residualScore(risk as any);
    const band = this.riskService.scoreToBand(residual);
    if (!['High', 'Extreme'].includes(band)) {
      throw new BadRequestException(
        'Only High or Extreme residual risks are eligible for a treatment plan.',
      );
    }

    const approvalStatus =
      dto.investment >= APPROVAL_THRESHOLD
        ? ApprovalStatus.PENDING_APPROVAL
        : ApprovalStatus.DRAFT;

    return this.planModel.create({
      tenantId: new Types.ObjectId(tenantId),
      riskId: new Types.ObjectId(dto.riskId),
      strategy: dto.strategy,
      justification: dto.justification,
      targetResidualLevel: dto.targetResidualLevel,
      actions: dto.actions,
      resourceNeeds: dto.resourceNeeds ?? '',
      owner: dto.owner ?? '',
      timeline: dto.timeline ?? '',
      successCriteria: dto.successCriteria ?? '',
      investment: dto.investment,
      approvalStatus,
    });
  }

  async getAll(tenantId: string) {
    return this.planModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getEligibleRisks(tenantId: string) {
    const risks = await this.riskModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        status: { $ne: 'Closed' },
      })
      .lean();
    return risks
      .map((r) => ({
        ...r,
        residualBand: this.riskService.scoreToBand(
          this.riskService.residualScore(r as any),
        ),
      }))
      .filter((r) => ['High', 'Extreme'].includes(r.residualBand));
  }

  async decide(tenantId: string, id: string, dto: DecideTreatmentPlanDto) {
    const plan = await this.planModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!plan) throw new NotFoundException('Treatment plan not found');
    if (plan.approvalStatus !== ApprovalStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'Only a plan pending approval can be decided.',
      );
    }
    plan.approvalStatus = dto.status;
    await plan.save();
    return plan;
  }
}
