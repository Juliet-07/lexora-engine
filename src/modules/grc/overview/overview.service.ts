import { Injectable } from '@nestjs/common';
import {
  BoardMemberService,
  CommitteeService,
  MeetingService,
  GovernanceCodeService,
  ResolutionService,
} from '../governance/services';
import {
  RiskService,
  RiskAppetiteService,
  ControlService,
  DeficiencyService,
  TestPlanService,
  TreatmentPlanService,
  EmergingRiskService,
  IncidentService,
  VendorService,
  BcpService,
} from '../risk/services';
import {
  ComplianceObligationService,
  CertificationService,
  PolicyService,
  AuditService,
  RegulatoryChangeService,
} from '../compliance/services';
import {
  DealService,
  ClauseService,
  PrecedentService,
} from '../deals/services';
import {
  ValuationService,
  PortfolioService,
  ReadinessService,
} from '../intelligence/services';
import { RiskStatus } from '../risk/schemas';
import { ObligationStatus } from '../compliance/schemas';
import { IncidentStatus } from '../risk/schemas';
import { DefStatus } from '../risk/schemas';
import { computeGrcHealthScore } from 'src/common/utils/grc-health-score.util';

// ─────────────────────────────────────────────────────────────
// Read-only aggregation across every real GRC submodule. Powers
// both the GRC Overview page (KPI counts + top-N lists) and GRC
// Reporting (full raw datasets for client-side PDF/Excel export,
// same pattern ESG Reporting already uses) — both pages need
// essentially the same underlying data, just displayed differently,
// so one comprehensive endpoint serves both rather than building
// two separate aggregations.
//
// Deliberately excludes ESG — it already has its own real,
// dedicated API surface (/grc/esg/dashboard, /grc/esg/materiality,
// /grc/esg/frameworks, etc). The frontend combines this endpoint
// with those rather than this service re-deriving ESG data itself.
// ─────────────────────────────────────────────────────────────

@Injectable()
export class OverviewService {
  constructor(
    // Governance
    private readonly boardMemberService: BoardMemberService,
    private readonly committeeService: CommitteeService,
    private readonly meetingService: MeetingService,
    private readonly governanceCodeService: GovernanceCodeService,
    private readonly resolutionService: ResolutionService,
    // Risk
    private readonly riskService: RiskService,
    private readonly riskAppetiteService: RiskAppetiteService,
    private readonly controlService: ControlService,
    private readonly deficiencyService: DeficiencyService,
    private readonly testPlanService: TestPlanService,
    private readonly treatmentPlanService: TreatmentPlanService,
    private readonly emergingRiskService: EmergingRiskService,
    private readonly incidentService: IncidentService,
    private readonly vendorService: VendorService,
    private readonly bcpService: BcpService,
    // Compliance
    private readonly obligationService: ComplianceObligationService,
    private readonly certificationService: CertificationService,
    private readonly policyService: PolicyService,
    private readonly auditService: AuditService,
    private readonly regulatoryChangeService: RegulatoryChangeService,
    // Deals
    private readonly dealService: DealService,
    private readonly clauseService: ClauseService,
    private readonly precedentService: PrecedentService,
    // Deal Intelligence
    private readonly valuationService: ValuationService,
    private readonly portfolioService: PortfolioService,
    private readonly readinessService: ReadinessService,
  ) {}

  private async getGovernance(tenantId: string) {
    const [boardMembers, committees, meetings, codes, resolutions] =
      await Promise.all([
        this.boardMemberService.getAll(tenantId),
        this.committeeService.getAll(tenantId),
        this.meetingService.getAll(tenantId),
        this.governanceCodeService.getAll(tenantId),
        this.resolutionService.getAll(tenantId),
      ]);
    return { boardMembers, committees, meetings, codes, resolutions };
  }

  private async getRisk(tenantId: string) {
    const [
      risks,
      appetite,
      controls,
      deficiencies,
      controlTests,
      treatmentPlans,
      emergingRisks,
    ] = await Promise.all([
      this.riskService.getAll(tenantId),
      this.riskAppetiteService.getCurrent(tenantId),
      this.controlService.getAll(tenantId),
      this.deficiencyService.getAll(tenantId),
      this.testPlanService.getAll(tenantId),
      this.treatmentPlanService.getAll(tenantId),
      this.emergingRiskService.getAll(tenantId),
    ]);
    return {
      risks,
      appetite,
      controls,
      deficiencies,
      controlTests,
      treatmentPlans,
      emergingRisks,
    };
  }

  private async getOperations(tenantId: string) {
    const [incidents, audits] = await Promise.all([
      this.incidentService.getAll(tenantId),
      this.auditService.getAll(tenantId),
    ]);
    return { incidents, audits };
  }

  private async getThirdPartyBcp(tenantId: string) {
    const [vendors, bcpPlans, bcpTests, rtoRpo, crisisContacts] =
      await Promise.all([
        this.vendorService.getAll(tenantId),
        this.bcpService.getAllPlans(tenantId),
        this.bcpService.getAllTests(tenantId),
        this.bcpService.getAllRtoRpo(tenantId),
        this.bcpService.getAllContacts(tenantId),
      ]);
    return { vendors, bcpPlans, bcpTests, rtoRpo, crisisContacts };
  }

  private async getCompliance(tenantId: string) {
    const [obligations, filings, certifications, policies, regulatoryChanges] =
      await Promise.all([
        this.obligationService.getAll(tenantId),
        this.obligationService.getAllFilings(tenantId),
        this.certificationService.getAll(tenantId),
        this.policyService.getAll(tenantId),
        this.regulatoryChangeService.getAll(tenantId),
      ]);
    return {
      obligations,
      filings,
      certifications,
      policies,
      regulatoryChanges,
    };
  }

  private async getDeals(tenantId: string) {
    const [deals, clauses, precedents] = await Promise.all([
      this.dealService.getAll(tenantId),
      this.clauseService.getAll(tenantId),
      this.precedentService.getAll(tenantId),
    ]);
    return { deals, clauses, precedents };
  }

  private async getDealIntelligence(tenantId: string) {
    const [valuations, readiness, portfolio] = await Promise.all([
      this.valuationService.getAll(tenantId),
      this.readinessService.getAll(tenantId),
      this.portfolioService.getPortfolio(tenantId),
    ]);
    return { valuations, readiness, portfolio };
  }

  // Real GRC Health Score — same formula and shared util as ESG
  // Dashboard's Governance pillar, so the number on this page and
  // the number on ESG Dashboard never disagree. Computed from the
  // same raw Risk/Compliance/Incident/Deficiency data this endpoint
  // already fetches, so no extra queries beyond what's below.
  private computeHealthScore(
    risk: Awaited<ReturnType<OverviewService['getRisk']>>,
    operations: Awaited<ReturnType<OverviewService['getOperations']>>,
    compliance: Awaited<ReturnType<OverviewService['getCompliance']>>,
  ): number {
    const openRiskBands = risk.risks
      .filter((r: any) => r.status !== RiskStatus.CLOSED)
      .map(
        (r: any) =>
          r.residualBand ?? this.riskService.scoreToBand(r.residualScore ?? 0),
      );
    const overdueObligations = compliance.obligations.filter(
      (o: any) => o.status === ObligationStatus.OVERDUE,
    ).length;
    const openIncidents = operations.incidents.filter(
      (i: any) => i.status !== IncidentStatus.CLOSED,
    ).length;
    const openDeficiencies = risk.deficiencies.filter(
      (d: any) => d.status !== DefStatus.CLOSED,
    ).length;
    return computeGrcHealthScore({
      openRiskBands,
      overdueObligations,
      openIncidents,
      openDeficiencies,
    });
  }

  async getOverview(tenantId: string) {
    const [
      governance,
      risk,
      operations,
      thirdPartyBcp,
      compliance,
      deals,
      dealIntelligence,
    ] = await Promise.all([
      this.getGovernance(tenantId),
      this.getRisk(tenantId),
      this.getOperations(tenantId),
      this.getThirdPartyBcp(tenantId),
      this.getCompliance(tenantId),
      this.getDeals(tenantId),
      this.getDealIntelligence(tenantId),
    ]);

    const healthScore = this.computeHealthScore(risk, operations, compliance);

    return {
      healthScore,
      governance,
      risk,
      operations,
      thirdPartyBcp,
      compliance,
      deals,
      dealIntelligence,
    };
  }
}
