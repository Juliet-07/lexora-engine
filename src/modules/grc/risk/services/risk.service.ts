import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Risk,
  RiskDocument,
  RiskStatus,
  ControlEffectiveness,
  RiskCategory,
  TreatmentPlan,
  TreatmentPlanDocument,
} from '../schemas';
import {
  CreateRiskDto,
  UpdateRiskDto,
  SetRiskStatusDto,
  LinkControlDto,
  LinkRelatedRiskDto,
} from '../dtos';
import { RiskAppetiteService } from './risk-appetite.service';

export interface AppetiteEntryLike {
  category: RiskCategory;
  maxLossPerEvent: number;
  amberThresholdPct: number;
}

const BAND_THRESHOLDS: [number, string][] = [
  [17, 'Extreme'],
  [10, 'High'],
  [5, 'Medium'],
  [1, 'Low'],
];
const REVIEW_FREQUENCY_DAYS: Record<string, number> = {
  Extreme: 90,
  High: 180,
  Medium: 365,
  Low: 730,
};

@Injectable()
export class RiskService {
  constructor(
    @InjectModel(Risk.name) private readonly riskModel: Model<RiskDocument>,
    private readonly appetiteService: RiskAppetiteService,
    @InjectModel(TreatmentPlan.name)
    private readonly treatmentPlanModel: Model<TreatmentPlanDocument>,
  ) {}

  inherentScore(risk: { likelihood: number; impact: number }): number {
    return risk.likelihood * risk.impact;
  }

  scoreToBand(score: number): 'Extreme' | 'High' | 'Medium' | 'Low' {
    for (const [min, band] of BAND_THRESHOLDS) {
      if (score >= min) return band as any;
    }
    return 'Low';
  }

  residualScore(risk: {
    likelihood: number;
    impact: number;
    controls: { effectiveness: ControlEffectiveness }[];
  }): number {
    const best = risk.controls.reduce<ControlEffectiveness | null>((acc, c) => {
      if (c.effectiveness === ControlEffectiveness.EFFECTIVE)
        return ControlEffectiveness.EFFECTIVE;
      if (
        c.effectiveness === ControlEffectiveness.PARTIALLY_EFFECTIVE &&
        acc !== ControlEffectiveness.EFFECTIVE
      ) {
        return ControlEffectiveness.PARTIALLY_EFFECTIVE;
      }
      return acc;
    }, null);
    let likelihood = risk.likelihood;
    if (best === ControlEffectiveness.EFFECTIVE)
      likelihood = Math.max(1, likelihood - 2);
    else if (best === ControlEffectiveness.PARTIALLY_EFFECTIVE)
      likelihood = Math.max(1, likelihood - 1);
    return likelihood * risk.impact;
  }

  reviewFrequencyDays(band: string): number {
    return REVIEW_FREQUENCY_DAYS[band] ?? 365;
  }

  riskZone(
    risk: { category: RiskCategory; financialExposure: number },
    appetite: AppetiteEntryLike[],
  ): 'Green' | 'Amber' | 'Red' {
    const entry = appetite.find((a) => a.category === risk.category);
    if (!entry || entry.maxLossPerEvent === 0) return 'Green';
    const amberFloor = entry.maxLossPerEvent * (entry.amberThresholdPct / 100);
    if (risk.financialExposure >= entry.maxLossPerEvent) return 'Red';
    if (risk.financialExposure >= amberFloor) return 'Amber';
    return 'Green';
  }

  // ── CRUD ─────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateRiskDto) {
    const band = this.scoreToBand(dto.likelihood * dto.impact);
    const nextReviewDate = new Date(
      Date.now() + this.reviewFrequencyDays(band) * 86400000,
    );
    return this.riskModel.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      category: dto.category,
      description: dto.description ?? '',
      rootCauses: dto.rootCauses ?? '',
      affectedProcesses: dto.affectedProcesses ?? '',
      owner: dto.owner ?? '',
      likelihood: dto.likelihood,
      impact: dto.impact,
      financialExposure: dto.financialExposure ?? 0,
      controls: [],
      relatedRiskIds: [],
      status: RiskStatus.OPEN,
      nextReviewDate,
      changes: [{ at: new Date(), note: 'Risk created' }],
    });
  }

  async getAll(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const [risks, appetite, plans] = await Promise.all([
      this.riskModel
        .find({ tenantId: new Types.ObjectId(tenantId) })
        .sort({ createdAt: -1 })
        .lean(),
      this.appetiteService.getCurrent(tenantId),
      this.treatmentPlanModel
        .find({ tenantId: tId })
        .select('riskId strategy approvalStatus')
        .lean(),
    ]);
    const plansByRisk = this.groupPlansByRisk(plans);
    return risks.map((r) =>
      this.withComputed(
        r as any,
        appetite,
        plansByRisk.get(r._id.toString()) ?? [],
      ),
    );
  }

  async getById(tenantId: string, id: string) {
    const risk = await this.riskModel
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!risk) throw new NotFoundException('Risk not found');
    const [appetite, plans] = await Promise.all([
      this.appetiteService.getCurrent(tenantId),
      this.treatmentPlanModel
        .find({ tenantId: new Types.ObjectId(tenantId), riskId: risk._id })
        .select('riskId strategy approvalStatus')
        .lean(),
    ]);
    return this.withComputed(risk as any, appetite, plans as any);
  }

  private groupPlansByRisk(plans: any[]): Map<string, any[]> {
    const map = new Map<string, any[]>();
    for (const p of plans) {
      const key = p.riskId.toString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({
        _id: p._id,
        strategy: p.strategy,
        approvalStatus: p.approvalStatus,
      });
    }
    return map;
  }

  private withComputed(
    risk: any,
    appetite: AppetiteEntryLike[],
    treatmentPlans: any[] = [],
  ) {
    const inherent = this.inherentScore(risk);
    const residual = this.residualScore(risk);
    return {
      ...risk,
      inherentScore: inherent,
      residualScore: residual,
      inherentBand: this.scoreToBand(inherent),
      residualBand: this.scoreToBand(residual),
      zone: this.riskZone(risk, appetite),
      treatmentPlans: treatmentPlans.map((p) => ({
        _id: p._id.toString(),
        strategy: p.strategy,
        approvalStatus: p.approvalStatus,
      })),
    };
  }

  private async getRawDoc(tenantId: string, id: string): Promise<RiskDocument> {
    const risk = await this.riskModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!risk) throw new NotFoundException('Risk not found');
    return risk;
  }

  // ── Gap #3: edit + close/reopen, both logged to change history ────

  async update(tenantId: string, id: string, dto: UpdateRiskDto) {
    const risk = await this.getRawDoc(tenantId, id);
    const fields: (keyof UpdateRiskDto)[] = [
      'title',
      'description',
      'rootCauses',
      'affectedProcesses',
      'owner',
      'likelihood',
      'impact',
      'financialExposure',
    ];
    for (const f of fields) {
      if (dto[f] !== undefined) (risk as any)[f] = dto[f];
    }
    risk.changes.push({ at: new Date(), note: dto.note } as any);
    risk.markModified('changes');
    await risk.save();
    return risk;
  }

  async setStatus(tenantId: string, id: string, dto: SetRiskStatusDto) {
    const risk = await this.getRawDoc(tenantId, id);
    risk.status = dto.status;
    risk.changes.push({
      at: new Date(),
      note: `Status → ${dto.status}: ${dto.note}`,
    } as any);
    risk.markModified('changes');
    await risk.save();
    return risk;
  }

  // ── Gap #1: risk ↔ control linking, lives on the Risk resource ────

  async linkControl(tenantId: string, id: string, dto: LinkControlDto) {
    const risk = await this.getRawDoc(tenantId, id);
    if (risk.controls.some((c) => c.controlId.toString() === dto.controlId)) {
      throw new BadRequestException(
        'This control is already linked to this risk.',
      );
    }
    risk.controls.push({
      controlId: new Types.ObjectId(dto.controlId),
      effectiveness: dto.effectiveness ?? ControlEffectiveness.NOT_TESTED,
    } as any);
    risk.changes.push({ at: new Date(), note: 'Control linked' } as any);
    risk.markModified('controls');
    risk.markModified('changes');
    await risk.save();
    return risk;
  }

  async unlinkControl(tenantId: string, id: string, controlId: string) {
    const risk = await this.getRawDoc(tenantId, id);
    risk.controls = risk.controls.filter(
      (c) => c.controlId.toString() !== controlId,
    ) as any;
    risk.changes.push({ at: new Date(), note: 'Control unlinked' } as any);
    risk.markModified('controls');
    risk.markModified('changes');
    await risk.save();
    return risk;
  }

  // ── Gap #2: risk ↔ risk relationships, symmetric ──────────────────

  async linkRelatedRisk(tenantId: string, id: string, dto: LinkRelatedRiskDto) {
    if (id === dto.relatedRiskId) {
      throw new BadRequestException('A risk cannot be related to itself.');
    }
    const [risk, related] = await Promise.all([
      this.getRawDoc(tenantId, id),
      this.getRawDoc(tenantId, dto.relatedRiskId),
    ]);
    const relatedObjId = new Types.ObjectId(dto.relatedRiskId);
    if (!risk.relatedRiskIds.some((r) => r.toString() === dto.relatedRiskId)) {
      risk.relatedRiskIds.push(relatedObjId);
      risk.changes.push({
        at: new Date(),
        note: `Related to: ${related.title}`,
      } as any);
      risk.markModified('relatedRiskIds');
      risk.markModified('changes');
      await risk.save();
    }
    // Symmetric — relating A to B also relates B to A, so the
    // relationship shows correctly from either risk's own page.
    if (!related.relatedRiskIds.some((r) => r.toString() === id)) {
      related.relatedRiskIds.push(new Types.ObjectId(id));
      related.changes.push({
        at: new Date(),
        note: `Related to: ${risk.title}`,
      } as any);
      related.markModified('relatedRiskIds');
      related.markModified('changes');
      await related.save();
    }
    return risk;
  }

  async unlinkRelatedRisk(tenantId: string, id: string, relatedRiskId: string) {
    const [risk, related] = await Promise.all([
      this.getRawDoc(tenantId, id),
      this.riskModel.findOne({
        _id: relatedRiskId,
        tenantId: new Types.ObjectId(tenantId),
      }),
    ]);
    risk.relatedRiskIds = risk.relatedRiskIds.filter(
      (r) => r.toString() !== relatedRiskId,
    ) as any;
    risk.markModified('relatedRiskIds');
    await risk.save();
    if (related) {
      related.relatedRiskIds = related.relatedRiskIds.filter(
        (r) => r.toString() !== id,
      ) as any;
      related.markModified('relatedRiskIds');
      await related.save();
    }
    return risk;
  }

  async getHeatmapData(tenantId: string) {
    const risks = await this.riskModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        status: { $ne: RiskStatus.CLOSED },
      })
      .lean();
    return risks.map((r) => ({
      id: r._id,
      title: r.title,
      likelihood: r.likelihood,
      impact: r.impact,
    }));
  }
}
