import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EsgContextService } from './context.service';
import { EsgMetricsService } from './metrics.service';
import { EsgMaterialityService } from './materiality.service';
import { EsgFrameworkService } from './framework.service';
import { MetricPillar } from '../schemas';
import {
  pillarScore,
  consolidatedScore,
  scoreGrade,
  targetProgress,
  improvement,
} from 'src/common/utils/esg-calculations.util';
import { computeGrcHealthScore } from 'src/common/utils/grc-health-score.util';
import { RiskService } from '../../risk/services';
import {
  Risk,
  RiskDocument,
  RiskStatus,
  Deficiency,
  DeficiencyDocument,
  DefStatus,
  Incident,
  IncidentDocument,
  IncidentStatus,
} from '../../risk/schemas';
import {
  ComplianceObligation,
  ComplianceObligationDocument,
  ObligationStatus,
} from '../../compliance/schemas';

@Injectable()
export class EsgDashboardService {
  constructor(
    private readonly contextService: EsgContextService,
    private readonly metricsService: EsgMetricsService,
    private readonly materialityService: EsgMaterialityService,
    private readonly frameworkService: EsgFrameworkService,
    private readonly riskService: RiskService,
    @InjectModel(Risk.name) private readonly riskModel: Model<RiskDocument>,
    @InjectModel(Deficiency.name)
    private readonly deficiencyModel: Model<DeficiencyDocument>,
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
    @InjectModel(ComplianceObligation.name)
    private readonly obligationModel: Model<ComplianceObligationDocument>,
  ) {}

  // Real composite Governance score, ported from the confirmed
  // prototype's grcHealthScore formula but sourced from the actual
  // Risk, Deficiency, Incident and Compliance data — not the
  // orphaned localStorage mock the Dashboard was reading from
  // before. The formula itself lives in the shared util since the
  // GRC Overview page needs the identical composite.
  private async computeGovernanceScore(tenantId: string): Promise<number> {
    const tId = new Types.ObjectId(tenantId);
    const [openRisks, overdueObligations, openIncidents, openDeficiencies] =
      await Promise.all([
        this.riskModel
          .find({ tenantId: tId, status: { $ne: RiskStatus.CLOSED } })
          .lean(),
        this.obligationModel.countDocuments({
          tenantId: tId,
          status: ObligationStatus.OVERDUE,
        }),
        this.incidentModel.countDocuments({
          tenantId: tId,
          status: { $ne: IncidentStatus.CLOSED },
        }),
        this.deficiencyModel.countDocuments({
          tenantId: tId,
          status: { $ne: DefStatus.CLOSED },
        }),
      ]);

    const openRiskBands = openRisks.map((r) =>
      this.riskService.scoreToBand(this.riskService.residualScore(r as any)),
    );

    return computeGrcHealthScore({
      openRiskBands,
      overdueObligations,
      openIncidents,
      openDeficiencies,
    });
  }

  async getDashboard(tenantId: string) {
    const [context, envRows, socialRows, g, cycle, topics, history, coverage] =
      await Promise.all([
        this.contextService.get(tenantId),
        this.metricsService.getAllRaw(tenantId, MetricPillar.ENVIRONMENTAL),
        this.metricsService.getAllRaw(tenantId, MetricPillar.SOCIAL),
        this.computeGovernanceScore(tenantId),
        this.materialityService.getCycle(tenantId),
        this.materialityService.getTopics(tenantId),
        this.contextService.getHistory(tenantId),
        this.frameworkService.getAllFrameworks(tenantId, false),
      ]);

    const e = pillarScore(envRows);
    const s = pillarScore(socialRows);
    const total = consolidatedScore(e, s, g);
    const materialTopics = topics.filter((t) => t.status === 'Material');

    const currentPeriod = String(new Date().getFullYear());
    const trend = [
      ...history.filter((h) => h.period !== currentPeriod),
      { period: currentPeriod, e, s, g },
    ].sort((a, b) => a.period.localeCompare(b.period));

    const frameworkAlignment = await Promise.all(
      coverage.map(async (f: any) => ({
        framework: f.label,
        frameworkId: String(f._id),
        ...(await this.frameworkService.coverageFor(tenantId, String(f._id))),
      })),
    );

    const allMetrics = [...envRows, ...socialRows];
    const furthestFromTarget = allMetrics
      .map((m: any) => ({
        ...m,
        targetProgress: targetProgress(m),
        improvement: improvement(m),
      }))
      .sort((a, b) => a.targetProgress - b.targetProgress)
      .slice(0, 6);

    return {
      environmental: e,
      social: s,
      governance: g,
      total,
      grade: scoreGrade(total),
      context,
      trend,
      materialTopics: materialTopics.length,
      materialTopicsList: materialTopics,
      frameworkAlignment,
      furthestFromTarget,
      peerBenchmark: {
        environmental: { ours: e, peer: context.peerAverage.environmental },
        social: { ours: s, peer: context.peerAverage.social },
        governance: { ours: g, peer: context.peerAverage.governance },
      },
    };
  }
}
