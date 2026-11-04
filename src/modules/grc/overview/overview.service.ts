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
  BcpService,
} from '../risk/services';
import {
  ComplianceObligationService,
  CertificationService,
  PolicyService,
  AuditService,
  RegulatoryChangeService,
} from '../compliance/services';
import { DealService } from '../deals/services';
import {
  ValuationService,
  PortfolioService,
  ReadinessService,
} from '../intelligence/services';
import { HealthScoreService } from '../health-score/health-score.service';

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
    private readonly bcpService: BcpService,
    // Compliance
    private readonly obligationService: ComplianceObligationService,
    private readonly certificationService: CertificationService,
    private readonly policyService: PolicyService,
    private readonly auditService: AuditService,
    private readonly regulatoryChangeService: RegulatoryChangeService,
    // Deals
    private readonly dealService: DealService,
    // Deal Intelligence
    private readonly valuationService: ValuationService,
    private readonly portfolioService: PortfolioService,
    private readonly readinessService: ReadinessService,
    // The single GRC health score
    private readonly healthScoreService: HealthScoreService,
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

  // Extended (PO feedback, Oct 2026) to carry every BCP/DR dataset the
  // module has grown since this aggregation was first written — BIA
  // processes, vendor resilience, incidents and test findings all
  // exist as real tenant records now (see BcpService) but were never
  // added here, so GRC Reporting's "Business Continuity & DR" report
  // was missing them entirely.
  private async getThirdPartyBcp(tenantId: string) {
    const [
      bcpPlans,
      bcpTests,
      testFindings,
      rtoRpo,
      crisisContacts,
      biaProcesses,
      vendorResilience,
      bcpIncidents,
    ] = await Promise.all([
      this.bcpService.getAllPlans(tenantId),
      this.bcpService.getAllTests(tenantId),
      this.bcpService.getAllFindings(tenantId),
      this.bcpService.getAllRtoRpo(tenantId),
      this.bcpService.getAllContacts(tenantId),
      this.bcpService.getAllProcesses(tenantId),
      this.bcpService.getAllVendorResilience(tenantId),
      this.bcpService.getAllIncidents(tenantId),
    ]);
    return {
      bcpPlans,
      bcpTests,
      testFindings,
      rtoRpo,
      crisisContacts,
      biaProcesses,
      vendorResilience,
      bcpIncidents,
    };
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
    const deals = await this.dealService.getAll(tenantId);
    return { deals };
  }

  private async getDealIntelligence(tenantId: string) {
    const [valuations, readiness, portfolio] = await Promise.all([
      this.valuationService.getAll(tenantId),
      this.readinessService.getAll(tenantId),
      this.portfolioService.getPortfolio(tenantId),
    ]);
    return { valuations, readiness, portfolio };
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

    // The one GRC health score — the same figure the Health Score tab,
    // GRC Reporting and the main dashboard show.
    const healthScore = (await this.healthScoreService.summary(tenantId))
      .composite;

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
