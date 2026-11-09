import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import {
  ReadinessAssessment,
  ReadinessAssessmentDocument,
  ReadinessDimension,
  READINESS_DIMENSIONS,
  DIMENSION_COMPUTE_MODE,
  DIMENSION_SOURCE,
  GapStatus,
  GapPriority,
  ReadinessWorkspace,
  ReadinessWorkspaceDocument,
  INDICATOR_CATALOGUE,
  INVESTOR_WEIGHT_PRESETS,
  BASE_WEIGHTS,
  DEAL_TYPE_LABEL,
  INVESTOR_TYPE_LABEL,
  DATA_ROOM_TEMPLATE,
  REPORT_SECTION_DEFS,
  SECTION_DIMENSION,
  effectiveRoomStatus,
  DealType,
  InvestorType,
} from '../schemas';
import {
  CreateAssessmentDto,
  UpdateThresholdDto,
  SetOverrideDto,
  ClearOverrideDto,
  AddGapDto,
  SetGapStatusDto,
  SetReportSectionDto,
  UpdateNotesDto,
  UpdateContextDto,
  UpdateWeightsDto,
  SetIndicatorDto,
  UpdateGapDto,
  UpdateReportMetaDto,
  UpdateSectionDto,
  RedraftSectionDto,
} from '../dtos';
import {
  BoardMember,
  BoardMemberDocument,
  Committee,
  CommitteeDocument,
  GovernanceCode,
  GovernanceCodeDocument,
  GovernanceCodeStatus,
  GovernanceMeeting,
  GovernanceMeetingDocument,
  MeetingStatus,
} from '../../governance/schemas';
import {
  ComplianceObligation,
  ComplianceObligationDocument,
  ObligationStatus,
  Regulator,
} from '../../compliance/schemas';
import {
  Employee,
  EmployeeDocument,
  EmploymentStatus,
  Contract,
  ContractDocument,
  ContractStatus,
  PerformanceReview,
  PerformanceReviewDocument,
  ReviewStatus,
} from 'src/modules/hr/schemas';
import {
  LedgerAccount,
  LedgerAccountDocument,
  AccountType,
  GlEntry,
  GlEntryDocument,
  AccountingPeriod,
  AccountingPeriodDocument,
  InvoiceStage,
} from 'src/modules/crm/finance/schemas';
import {
  Mandate,
  MandateDocument_,
  MandateStage,
  Rag,
} from 'src/modules/crm/projects/schemas';
import { InvoiceService } from 'src/modules/crm/finance/services';
import { Deal, DealDocument, DDStatus } from '../../deals/schemas';
import { EsgDashboardService } from '../../esg/services';
import {
  buildReportPdf,
  ReportDefinition,
} from 'src/common/utils/pdf/report-builder.util';

@Injectable()
export class ReadinessService {
  constructor(
    @InjectModel(ReadinessAssessment.name)
    private readonly model: Model<ReadinessAssessmentDocument>,
    @InjectModel(BoardMember.name)
    private readonly boardMemberModel: Model<BoardMemberDocument>,
    @InjectModel(Committee.name)
    private readonly committeeModel: Model<CommitteeDocument>,
    @InjectModel(GovernanceCode.name)
    private readonly governanceCodeModel: Model<GovernanceCodeDocument>,
    @InjectModel(GovernanceMeeting.name)
    private readonly meetingModel: Model<GovernanceMeetingDocument>,
    @InjectModel(ComplianceObligation.name)
    private readonly obligationModel: Model<ComplianceObligationDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    @InjectModel(PerformanceReview.name)
    private readonly reviewModel: Model<PerformanceReviewDocument>,
    @InjectModel(LedgerAccount.name)
    private readonly ledgerAccountModel: Model<LedgerAccountDocument>,
    @InjectModel(GlEntry.name)
    private readonly glEntryModel: Model<GlEntryDocument>,
    @InjectModel(AccountingPeriod.name)
    private readonly periodModel: Model<AccountingPeriodDocument>,
    @InjectModel(Mandate.name)
    private readonly mandateModel: Model<MandateDocument_>,
    @InjectModel(Deal.name)
    private readonly dealModel: Model<DealDocument>,
    @InjectModel(ReadinessWorkspace.name)
    private readonly wsModel: Model<ReadinessWorkspaceDocument>,
    private readonly invoiceService: InvoiceService,
    private readonly esgDashboardService: EsgDashboardService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  // ── Real auto-scoring — one method per connected dimension ─────

  // Starts at 100, deducts for the four structural gaps a real
  // investor diligence would flag first. Deliberately simple and
  // easy to refine once seen in practice, same spirit as Portfolio's
  // first-pass concentration/fee formulas.
  private async scoreGovernance(tenantId: string): Promise<number> {
    const tId = new Types.ObjectId(tenantId);
    let score = 100;
    const [memberCount, committeeCount, publishedCode, recentMeeting] =
      await Promise.all([
        this.boardMemberModel.countDocuments({ tenantId: tId, isActive: true }),
        this.committeeModel.countDocuments({ tenantId: tId }),
        this.governanceCodeModel.exists({
          tenantId: tId,
          status: GovernanceCodeStatus.PUBLISHED,
        }),
        this.meetingModel.exists({
          tenantId: tId,
          status: MeetingStatus.HELD,
          date: { $gte: new Date(Date.now() - 365 * 86400000) },
        }),
      ]);
    if (memberCount === 0) score -= 40;
    if (committeeCount === 0) score -= 20;
    if (!publishedCode) score -= 20;
    if (!recentMeeting) score -= 20;
    return Math.max(0, score);
  }

  // % of applicable (non-"Not Applicable") obligations currently
  // Compliant. Shared by both Legal & Regulatory and Tax Compliance
  // — the latter just filters to regulator === RRA.
  private async scoreObligations(
    tenantId: string,
    regulatorFilter?: Regulator,
  ): Promise<number> {
    const tId = new Types.ObjectId(tenantId);
    const query: any = {
      tenantId: tId,
      status: { $ne: ObligationStatus.NOT_APPLICABLE },
    };
    if (regulatorFilter) query.regulator = regulatorFilter;
    const [total, compliant] = await Promise.all([
      this.obligationModel.countDocuments(query),
      this.obligationModel.countDocuments({
        ...query,
        status: ObligationStatus.COMPLIANT,
      }),
    ]);
    if (total === 0) return 0;
    return Math.round((compliant / total) * 100);
  }

  // Three rates across active employees: contract signed, onboarding
  // completed, at least one completed performance review. "Active"
  // excludes only Terminated/Resigned — on-leave, suspended and
  // probationary staff still count, since they're still real headcount
  // a diligence would review. Null when there are no employees.
  private async hrRates(
    tenantId: string,
  ): Promise<{ onboarded: number; contract: number; review: number } | null> {
    const tId = new Types.ObjectId(tenantId);
    const activeEmployees = await this.employeeModel
      .find({
        tenantId: tId,
        employmentStatus: {
          $nin: [EmploymentStatus.TERMINATED, EmploymentStatus.RESIGNED],
        },
      })
      .select('_id onboardingCompleted')
      .lean();
    if (activeEmployees.length === 0) return null;
    const employeeIds = activeEmployees.map((e) => e._id);

    const [signedEmployeeIds, reviewedEmployeeIds] = await Promise.all([
      this.contractModel.distinct('employeeId', {
        tenantId: tId,
        employeeId: { $in: employeeIds },
        status: {
          $in: [
            ContractStatus.SIGNED,
            ContractStatus.COUNTERSIGNED,
            ContractStatus.ISSUED,
          ],
        },
      }),
      this.reviewModel.distinct('employeeId', {
        tenantId: tId,
        employeeId: { $in: employeeIds },
        status: ReviewStatus.COMPLETED,
      }),
    ]);
    return {
      onboarded:
        activeEmployees.filter((e) => e.onboardingCompleted).length /
        activeEmployees.length,
      contract: signedEmployeeIds.length / activeEmployees.length,
      review: reviewedEmployeeIds.length / activeEmployees.length,
    };
  }

  private async scoreHr(tenantId: string): Promise<number> {
    const r = await this.hrRates(tenantId);
    if (!r) return 0;
    return Math.round(
      Math.min(100, ((r.onboarded + r.contract + r.review) / 3) * 100),
    );
  }

  // Real balance-sheet balance check — the same Assets = Liabilities
  // + Equity + Retained Earnings test Accounting's own balance sheet
  // uses, recomputed here directly from raw GL data (the "infused"
  // pattern this whole service already follows) rather than calling
  // FinancialStatementsService cross-module.
  private async isBalanceSheetBalanced(tenantId: string): Promise<boolean> {
    const tId = new Types.ObjectId(tenantId);
    const [accounts, balances] = await Promise.all([
      this.ledgerAccountModel.find({ tenantId: tId }).lean(),
      this.glEntryModel.aggregate([
        { $match: { tenantId: tId } },
        {
          $group: {
            _id: '$accountCode',
            debit: { $sum: '$debit' },
            credit: { $sum: '$credit' },
          },
        },
      ]),
    ]);
    if (!accounts.length) return false;
    const balanceMap = new Map(
      balances.map((b) => [b._id, b.debit - b.credit]),
    );

    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    let totalRevenue = 0;
    let totalExpenses = 0;
    for (const a of accounts) {
      const net = balanceMap.get(a.code) ?? 0;
      if (a.type === AccountType.ASSET) totalAssets += net;
      else if (a.type === AccountType.LIABILITY) totalLiabilities += -net;
      else if (a.type === AccountType.EQUITY) totalEquity += -net;
      else if (a.type === AccountType.REVENUE) totalRevenue += -net;
      else if (a.type === AccountType.EXPENSE) totalExpenses += net;
    }
    const retainedEarnings = totalRevenue - totalExpenses;
    return (
      Math.abs(
        totalAssets - (totalLiabilities + totalEquity + retainedEarnings),
      ) < 0.01
    );
  }

  // The Finance module's own signals a financial diligence checks first:
  // books current, a period formally closed, the balance sheet balancing,
  // and this year's bank reconciliations actually signed off. Null when
  // there is no chart of accounts at all — everything else is moot
  // without one.
  private async financeSignals(tenantId: string): Promise<{
    recent: boolean;
    closed: boolean;
    balanced: boolean;
    reconciled: boolean;
  } | null> {
    const tId = new Types.ObjectId(tenantId);
    const accountCount = await this.ledgerAccountModel.countDocuments({
      tenantId: tId,
    });
    if (accountCount === 0) return null;
    const year = new Date().getUTCFullYear();
    const [recentEntry, closedPeriod, balanced, reconciliations] =
      await Promise.all([
        this.glEntryModel.exists({
          tenantId: tId,
          date: { $gte: new Date(Date.now() - 90 * 86400000) },
        }),
        this.periodModel.exists({ tenantId: tId, locked: true }),
        this.isBalanceSheetBalanced(tenantId),
        this.connection
          .collection('crm_reconciliations')
          .find({ tenantId: tId, period: { $regex: `^${year}-` } })
          .toArray()
          .catch(() => [] as any[]),
      ]);
    return {
      recent: !!recentEntry,
      closed: !!closedPeriod,
      balanced,
      reconciled: reconciliations.some((r: any) => r.signedOffAt),
    };
  }

  private async scoreFinancialStatements(tenantId: string): Promise<number> {
    const f = await this.financeSignals(tenantId);
    if (!f) return 0;
    let score = 100;
    if (!f.recent) score -= 25;
    if (!f.closed) score -= 25;
    if (!f.balanced) score -= 30;
    if (!f.reconciled) score -= 20;
    return Math.max(0, score);
  }

  // GRC's RRA obligations and the Finance module's tax returns both say
  // something about tax compliance, so the two are blended. Where only one
  // has anything recorded, that one stands alone.
  private async scoreTax(tenantId: string): Promise<number> {
    const tId = new Types.ObjectId(tenantId);
    const [grc, filings] = await Promise.all([
      this.scoreObligations(tenantId, Regulator.RRA),
      this.connection
        .collection('crm_tax_obligations')
        .find({
          tenantId: tId,
          dueOn: {
            $gte: new Date(Date.now() - 365 * 86400000),
            $lt: new Date(),
          },
        })
        .toArray()
        .catch(() => [] as any[]),
    ]);
    if (!filings.length) return grc;
    const onTime = filings.filter(
      (f: any) =>
        f.status === 'Filed' &&
        f.filedAt &&
        new Date(f.filedAt) <= new Date(new Date(f.dueOn).getTime() + 86400000),
    ).length;
    const finance = Math.round((onTime / filings.length) * 100);
    return grc > 0 ? Math.round((grc + finance) / 2) : finance;
  }

  // Two real rates: what share of active client mandates are healthy
  // (not RAG Red — genuinely at risk), and what share of invoiced
  // amounts have actually been collected. Either is null where there is
  // nothing to measure (no mandates / no issued invoices).
  private async commercialRates(
    tenantId: string,
  ): Promise<{ healthy: number | null; collection: number | null }> {
    const tId = new Types.ObjectId(tenantId);
    const mandates = await this.mandateModel
      .find({ tenantId: tId, stage: { $ne: MandateStage.CREATE } })
      .select('rag')
      .lean();
    const healthy = mandates.length
      ? mandates.filter((m) => m.rag !== Rag.RED).length / mandates.length
      : null;

    // Real payable per invoice, including VAT/WHT — via InvoiceService
    // itself rather than re-deriving that calculation here, so this can
    // never quietly drift from what Invoicing itself considers owed.
    const allInvoices = await this.invoiceService.getAll(tenantId);
    const invoices = (allInvoices as any[]).filter(
      (i) => i.stage !== InvoiceStage.DRAFT,
    );
    let collection: number | null = null;
    if (invoices.length > 0) {
      const totalPayable = invoices.reduce((s, i) => s + i.payable, 0);
      const totalPaid = invoices.reduce((s, i) => s + i.paidAmount, 0);
      collection = totalPayable > 0 ? Math.min(1, totalPaid / totalPayable) : 1;
    }
    return { healthy, collection };
  }

  // No mandates at all means there's no real commercial activity yet to
  // show a diligence, so this returns 0 rather than a neutral default.
  private async scoreOperationalCommercial(tenantId: string): Promise<number> {
    const r = await this.commercialRates(tenantId);
    if (r.healthy === null) return 0;
    return Math.round(((r.healthy + (r.collection ?? 1)) / 2) * 100);
  }

  // The ESG submodule already computes a real, weighted E/S/G
  // composite (0-100) for its own dashboard — reusing it here keeps
  // this single source of truth rather than re-deriving the same
  // formula a second time. A tenant with no ESG metrics recorded yet
  // naturally scores low (pillarScore returns 0 for an empty metric
  // set), so no separate "no data" branch is needed here.
  private async scoreESG(tenantId: string): Promise<number> {
    const dashboard = await this.esgDashboardService.getDashboard(tenantId);
    return dashboard.total;
  }

  // The Deal module's data room is deliberately per-transaction (one
  // room per deal), not a single company-wide room — so "readiness"
  // here is a company-wide rollup across every deal: how often a
  // data room actually got used, blended with how far due-diligence
  // checklists across those deals have actually progressed. No deals
  // at all means no real diligence practice to show yet, same "no
  // data = 0" precedent as scoreOperationalCommercial above.
  private async scoreDataRoom(tenantId: string): Promise<number> {
    const tId = new Types.ObjectId(tenantId);
    const deals = await this.dealModel
      .find({ tenantId: tId })
      .select('dataRoom dd')
      .lean();
    if (deals.length === 0) return 0;

    const dealsWithFiles = deals.filter(
      (d: any) => (d.dataRoom?.files?.length ?? 0) > 0,
    ).length;
    const dataRoomUsageRate = dealsWithFiles / deals.length;

    const allDdItems = deals.flatMap((d: any) => d.dd ?? []);
    const ddProgressRate =
      allDdItems.length === 0
        ? 0
        : allDdItems.filter((i: any) => i.status !== DDStatus.NOT_STARTED)
            .length / allDdItems.length;

    return Math.round(((dataRoomUsageRate + ddProgressRate) / 2) * 100);
  }

  private async computeAutoScore(
    tenantId: string,
    dim: ReadinessDimension,
  ): Promise<number> {
    switch (dim) {
      case ReadinessDimension.GOVERNANCE:
        return this.scoreGovernance(tenantId);
      case ReadinessDimension.FINANCIAL_STATEMENTS:
        return this.scoreFinancialStatements(tenantId);
      case ReadinessDimension.LEGAL_COMPLIANCE:
        return this.scoreObligations(tenantId);
      case ReadinessDimension.TAX_COMPLIANCE:
        return this.scoreTax(tenantId);
      case ReadinessDimension.OPERATIONAL_COMMERCIAL:
        return this.scoreOperationalCommercial(tenantId);
      case ReadinessDimension.HR_MANAGEMENT:
        return this.scoreHr(tenantId);
      case ReadinessDimension.ESG:
        return this.scoreESG(tenantId);
      case ReadinessDimension.DATA_ROOM:
        return this.scoreDataRoom(tenantId);
      default:
        return 0;
    }
  }

  // ── Indicator model ──────────────────────────────────────────
  // Each dimension is scored from weighted indicators: a value is
  // normalised between its floor (0) and its target (100). The value
  // used is what the tenant typed in, else what live module data says,
  // else nothing — and nothing scores 0 rather than being guessed.

  private norm(v: number, floor: number, target: number): number {
    if (target === floor) return v >= target ? 100 : 0;
    return Math.max(0, Math.min(100, ((v - floor) / (target - floor)) * 100));
  }

  indicatorValue(i: any): number | null {
    return i.value ?? i.autoValue ?? null;
  }

  indicatorScore(i: any): number {
    const v = this.indicatorValue(i);
    return v === null ? 0 : this.norm(v, i.floor, i.target);
  }

  private dimensionFromIndicators(a: any, dim: ReadinessDimension): number {
    let ws = 0;
    let wt = 0;
    for (const i of a.indicators ?? []) {
      if (i.dimension !== dim) continue;
      wt += this.indicatorScore(i) * i.weight;
      ws += i.weight;
    }
    return ws ? Math.round(wt / ws) : 0;
  }

  // Brings every dimension's stored auto-score back in line with its
  // indicators. A legacy version (no indicators) is left alone.
  private rescore(a: any) {
    if (!(a.indicators?.length > 0)) return;
    for (const s of a.scores) {
      if (s.computeMode === 'auto') {
        s.autoScore = this.dimensionFromIndicators(a, s.dimension);
      }
    }
    if (typeof a.markModified === 'function') a.markModified('scores');
  }

  private weightOf(a: any, dim: ReadinessDimension): number | null {
    return a.weights?.find((w: any) => w.dimension === dim)?.weight ?? null;
  }

  private presetWeights(investorType?: string) {
    const p =
      INVESTOR_WEIGHT_PRESETS[(investorType ?? 'mixed') as InvestorType] ??
      BASE_WEIGHTS;
    return READINESS_DIMENSIONS.map((d) => ({ dimension: d, weight: p[d] }));
  }

  private validateWeights(weights: { dimension: string; weight: number }[]) {
    const seen = new Set(weights.map((w) => w.dimension));
    if (
      seen.size !== READINESS_DIMENSIONS.length ||
      READINESS_DIMENSIONS.some((d) => !seen.has(d))
    ) {
      throw new BadRequestException(
        'Weights must cover all eight dimensions exactly once.',
      );
    }
    const total = weights.reduce((s, w) => s + w.weight, 0);
    if (Math.abs(total - 100) > 0.5) {
      throw new BadRequestException(
        `Dimension weights must total 100% (currently ${Math.round(total * 10) / 10}%).`,
      );
    }
    return READINESS_DIMENSIONS.map((d) => ({
      dimension: d,
      weight: weights.find((w) => w.dimension === d)!.weight,
    }));
  }

  // Data Room Completeness indicators come from the checklist the tenant
  // keeps in its data room: the share of expected documents, per
  // category, that are held and current. Not-applicable items drop out
  // of the denominator.
  private async roomValues(
    tenantId: string,
  ): Promise<Record<string, number | null>> {
    const out: Record<string, number | null> = {};
    for (const c of DATA_ROOM_TEMPLATE)
      if (c.indicator) out[c.indicator] = null;
    const ws = await this.wsModel
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .select('room.category room.status room.expiresAt')
      .lean();
    if (!ws) return out;
    for (const c of DATA_ROOM_TEMPLATE) {
      if (!c.indicator) continue;
      const items = ws.room.filter(
        (r: any) => r.category === c.category && r.status !== 'not_applicable',
      );
      if (!items.length) continue;
      const held = items.filter((r: any) => {
        const st = effectiveRoomStatus(r);
        return st === 'uploaded' || st === 'review';
      }).length;
      out[c.indicator] = Math.round((held / items.length) * 100);
    }
    return out;
  }

  private async obligationRate(
    tenantId: string,
    regulator?: Regulator,
  ): Promise<number | null> {
    const tId = new Types.ObjectId(tenantId);
    const query: any = {
      tenantId: tId,
      status: { $ne: ObligationStatus.NOT_APPLICABLE },
    };
    if (regulator) query.regulator = regulator;
    const [total, compliant] = await Promise.all([
      this.obligationModel.countDocuments(query),
      this.obligationModel.countDocuments({
        ...query,
        status: ObligationStatus.COMPLIANT,
      }),
    ]);
    return total === 0 ? null : Math.round((compliant / total) * 100);
  }

  // Share of the last twelve months' returns of the given types that
  // were filed by their due date (a day's grace). Null where none fell due.
  private async taxOnTime(
    tenantId: string,
    types: string[],
  ): Promise<number | null> {
    const rows = await this.connection
      .collection('crm_tax_obligations')
      .find({
        tenantId: new Types.ObjectId(tenantId),
        type: { $in: types },
        dueOn: {
          $gte: new Date(Date.now() - 365 * 86400000),
          $lt: new Date(),
        },
      })
      .toArray()
      .catch(() => [] as any[]);
    if (!rows.length) return null;
    const onTime = rows.filter(
      (f: any) =>
        f.status === 'Filed' &&
        f.filedAt &&
        new Date(f.filedAt) <= new Date(new Date(f.dueOn).getTime() + 86400000),
    ).length;
    return Math.round((onTime / rows.length) * 100);
  }

  // Live values for every indicator a module can back. A key missing from
  // the result, or null, means "no data" — the tenant types it in.
  async computeAutoIndicators(
    tenantId: string,
  ): Promise<Record<string, number | null>> {
    const tId = new Types.ObjectId(tenantId);
    const out: Record<string, number | null> = {};

    const [
      members,
      committeeCount,
      publishedCode,
      heldMeetings,
      finance,
      filings,
      ipAssets,
      cit,
      vat,
      paye,
      commercial,
      hr,
      orgNodes,
      room,
    ] = await Promise.all([
      this.boardMemberModel
        .find({ tenantId: tId, isActive: true })
        .select('role skills successorId')
        .lean(),
      this.committeeModel.countDocuments({ tenantId: tId }),
      this.governanceCodeModel.exists({
        tenantId: tId,
        status: GovernanceCodeStatus.PUBLISHED,
      }),
      this.meetingModel.countDocuments({
        tenantId: tId,
        status: MeetingStatus.HELD,
        date: { $gte: new Date(Date.now() - 365 * 86400000) },
      }),
      this.financeSignals(tenantId),
      this.obligationRate(tenantId),
      this.connection
        .collection('grc_ip_assets')
        .find({ tenantId: tId })
        .project({ owner: 1 })
        .toArray()
        .catch(() => [] as any[]),
      this.taxOnTime(tenantId, ['CIT provisional']),
      this.taxOnTime(tenantId, ['VAT return']),
      this.taxOnTime(tenantId, ['PAYE remittance', 'WHT remittance']),
      this.commercialRates(tenantId),
      this.hrRates(tenantId),
      this.connection
        .collection('grc_org_structure_nodes')
        .countDocuments({ tenantId: tId })
        .catch(() => 0),
      this.roomValues(tenantId),
    ]);

    // Governance
    if (members.length) {
      const independent = members.filter(
        (m: any) =>
          m.role === 'Independent Director' ||
          m.role === 'Non-Executive Director',
      ).length;
      out.board_composition = Math.round((independent / members.length) * 100);
      out.skills_matrix = Math.round(
        (members.filter((m: any) => (m.skills?.length ?? 0) > 0).length /
          members.length) *
          100,
      );
      out.succession_plan = Math.round(
        (members.filter((m: any) => !!m.successorId).length / members.length) *
          100,
      );
      out.meeting_regularity = Math.min(
        100,
        Math.round((heldMeetings / 4) * 100),
      );
    }
    if (publishedCode || committeeCount) {
      out.board_charter = (publishedCode ? 60 : 0) + (committeeCount ? 40 : 0);
    }

    // Financial
    if (finance) {
      out.financial_reporting =
        (finance.recent ? 25 : 0) +
        (finance.closed ? 25 : 0) +
        (finance.balanced ? 25 : 0) +
        (finance.reconciled ? 25 : 0);
    }

    // Legal & tax
    if (filings !== null) out.regulatory_filings = filings;
    if (ipAssets.length) {
      out.ip_ownership = Math.round(
        (ipAssets.filter((i: any) => !!(i.owner ?? '').trim()).length /
          ipAssets.length) *
          100,
      );
    }
    if (cit !== null) out.corporate_tax = cit;
    if (vat !== null) out.vat_compliance = vat;
    if (paye !== null) out.paye_compliance = paye;

    // Commercial
    if (commercial.collection !== null)
      out.revenue_collection = Math.round(commercial.collection * 100);
    if (commercial.healthy !== null)
      out.sla_compliance = Math.round(commercial.healthy * 100);

    // People
    if (hr) {
      out.employment_contracts = Math.round(hr.contract * 100);
      out.performance_reviews = Math.round(hr.review * 100);
    }
    if (orgNodes > 0) out.org_chart = 100;

    // ESG — the ESG submodule's own composite, when it has any metrics.
    const esg = await this.scoreESG(tenantId).catch(() => 0);
    if (esg > 0) out.esg_reporting = Math.round(esg);

    Object.assign(out, room);
    return out;
  }

  // A fresh indicator set. A value typed in on the previous version
  // carries forward (along with its note) — live values never do, they
  // are recomputed.
  private async buildIndicators(tenantId: string, carry?: any[]) {
    const auto = await this.computeAutoIndicators(tenantId);
    const out: any[] = [];
    for (const dim of READINESS_DIMENSIONS) {
      for (const def of INDICATOR_CATALOGUE[dim]) {
        const prior = carry?.find((c) => c.key === def.key);
        out.push({
          dimension: dim,
          key: def.key,
          label: def.label,
          weight: def.weight,
          floor: def.floor,
          target: def.target,
          unit: def.unit,
          value: prior?.value ?? null,
          autoValue: auto[def.key] ?? null,
          note: prior?.note ?? '',
        });
      }
    }
    return out;
  }

  // ── Pure derived helpers — the single source of truth both this
  // service and the PDF/DOCX reports compute from. ───────────────

  effectiveScore(d: any): number {
    return d.override ?? d.autoScore;
  }

  // Weighted by the version's own dimension weights; a legacy version
  // (no weights stored) keeps its equal-weight average.
  overallScore(a: any): number {
    if (!a.scores.length) return 0;
    if (a.weights?.length) {
      let ws = 0;
      let wt = 0;
      for (const s of a.scores) {
        const w = this.weightOf(a, s.dimension) ?? 0;
        ws += w;
        wt += this.effectiveScore(s) * w;
      }
      return ws ? Math.round(wt / ws) : 0;
    }
    return Math.round(
      a.scores.reduce((s: number, d: any) => s + this.effectiveScore(d), 0) /
        a.scores.length,
    );
  }

  readinessBand(score: number) {
    if (score >= 90)
      return {
        label: 'Investor Ready',
        tone: 'text-emerald-600 border-emerald-500/40',
      };
    if (score >= 75)
      return {
        label: 'Near Ready',
        tone: 'text-sky-600 border-sky-500/40',
      };
    if (score >= 60)
      return {
        label: 'In Progress',
        tone: 'text-amber-600 border-amber-500/40',
      };
    return { label: 'Not Ready', tone: 'text-rose-600 border-rose-500/40' };
  }

  private isGapOpen(g: any): boolean {
    return g.status === GapStatus.OPEN || g.status === GapStatus.IN_PROGRESS;
  }

  projectedReadyDate(a: any): string {
    const closed = a.gaps.filter(
      (g: any) => g.status === GapStatus.CLOSED,
    ).length;
    const open = a.gaps.filter((g: any) => this.isGapOpen(g)).length;
    if (open === 0) return 'Ready now';
    const weeks =
      new Set(
        a.gaps
          .filter((g: any) => g.closedAt)
          .map((g: any) => new Date(g.closedAt).toISOString().slice(0, 7)),
      ).size || 1;
    const velocity = Math.max(closed / weeks, 0.5);
    const months = Math.ceil(open / velocity);
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  private withComputed(a: any) {
    const overall = this.overallScore(a);
    const scores = a.scores.map((s: any) => ({
      ...s,
      effective: this.effectiveScore(s),
      weight: this.weightOf(a, s.dimension),
    }));
    return {
      ...a,
      mode: a.indicators?.length ? 'indicators' : 'legacy',
      title: a.title ?? '',
      dealContext: a.dealContext ?? {
        dealType: 'general',
        investorType: 'mixed',
        raiseAmount: 0,
        currency: 'USD',
        targetClose: null,
        useOfFunds: '',
      },
      weights: a.weights ?? [],
      reportStatus: a.reportStatus ?? 'Draft',
      confidentiality: a.confidentiality ?? 'Strictly confidential',
      versionNotes: a.versionNotes ?? '',
      reportSections: (a.reportSections ?? []).map((r: any) => ({
        owner: '',
        content: '',
        updatedAt: null,
        ...r,
      })),
      scores,
      indicators: (a.indicators ?? []).map((i: any) => {
        const v = this.indicatorValue(i);
        return {
          ...i,
          effectiveValue: v,
          score: Math.round(this.indicatorScore(i)),
          source:
            i.value !== null && i.value !== undefined
              ? 'manual'
              : i.autoValue !== null && i.autoValue !== undefined
                ? 'auto'
                : 'none',
        };
      }),
      overallScore: overall,
      band: this.readinessBand(overall),
      projectedReadyDate: this.projectedReadyDate(a),
      gapsClosed: a.gaps.filter((g: any) => g.status === GapStatus.CLOSED)
        .length,
      gapsOpen: a.gaps.filter((g: any) => this.isGapOpen(g)).length,
      gapsAccepted: a.gaps.filter(
        (g: any) => g.status === GapStatus.RISK_ACCEPTED,
      ).length,
      dimensionsBelowThreshold: scores.filter(
        (s: any) => s.effective < a.threshold,
      ).length,
    };
  }

  // ── CRUD ─────────────────────────────────────────────────────

  async getAll(tenantId: string) {
    const rows = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ version: 1 })
      .lean();
    return rows.map((a) => this.withComputed(a));
  }

  async getById(tenantId: string, id: string) {
    const a = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!a) throw new NotFoundException('Assessment not found');
    return this.withComputed(a);
  }

  private async getRawDoc(
    tenantId: string,
    id: string,
  ): Promise<ReadinessAssessmentDocument> {
    const a = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!a) throw new NotFoundException('Assessment not found');
    return a;
  }

  private mergeContext(base: any, patch?: any) {
    const ctx: any = {
      dealType: 'general',
      investorType: 'mixed',
      raiseAmount: 0,
      currency: 'USD',
      targetClose: null,
      useOfFunds: '',
      ...(base ?? {}),
    };
    if (patch) {
      for (const k of Object.keys(patch)) {
        if (patch[k] === undefined) continue;
        ctx[k] =
          k === 'targetClose'
            ? patch[k]
              ? new Date(patch[k])
              : null
            : patch[k];
      }
    }
    return ctx;
  }

  async create(
    tenantId: string,
    businessName: string,
    dto: CreateAssessmentDto,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const prior = await this.model
      .find({ tenantId: tId })
      .sort({ version: -1 })
      .limit(1)
      .lean();
    const base: any = prior[0];

    const dealContext = this.mergeContext(base?.dealContext, dto.dealContext);
    // Explicit weights win; a newly chosen investor type (or no prior
    // weights at all) takes that type's preset; otherwise last version's
    // weights carry on.
    const weights = dto.weights
      ? this.validateWeights(dto.weights)
      : dto.dealContext?.investorType || !base?.weights?.length
        ? this.presetWeights(dealContext.investorType)
        : base.weights.map((w: any) => ({
            dimension: w.dimension,
            weight: w.weight,
          }));

    const indicators = await this.buildIndicators(tenantId, base?.indicators);
    const scores = READINESS_DIMENSIONS.map((d) => ({
      dimension: d,
      computeMode: 'auto',
      autoScore: 0,
      override: null,
      overrideReason: null,
    }));
    const gaps = base
      ? base.gaps
          .filter(
            (g: any) =>
              this.isGapOpen(g) || g.status === GapStatus.RISK_ACCEPTED,
          )
          .map((g: any) => ({
            dimension: g.dimension,
            priority: g.priority,
            description: g.description,
            impact: g.impact,
            remediation: g.remediation,
            owner: g.owner,
            targetDate: g.targetDate,
            status: g.status,
            source: g.source ?? 'manual',
            closedAt: null,
          }))
      : [];

    const draft: any = {
      company: businessName,
      version: (base?.version ?? 0) + 1,
      threshold: base?.threshold ?? 70,
      advisor: dto.advisor ?? base?.advisor ?? '',
      dealContext,
      weights,
      indicators,
      scores,
      gaps,
    };
    this.rescore(draft);

    const ws = await this.wsModel.findOne({ tenantId: tId }).lean();
    // Hand-written sections carry forward; drafted ones are re-drafted
    // from this version's own numbers.
    const reportSections = REPORT_SECTION_DEFS.map((def) => {
      const prev = base?.reportSections?.find((r: any) => r.name === def.name);
      const drafted = this.draftSection(draft, def.name, ws);
      if (drafted !== null && (def.auto || !prev?.content)) {
        return {
          name: def.name,
          state: def.auto ? 'Auto' : 'Review',
          owner: prev?.owner ?? '',
          content: drafted,
          updatedAt: new Date(),
        };
      }
      return {
        name: def.name,
        state: prev?.content ? prev.state : 'Incomplete',
        owner: prev?.owner ?? '',
        content: prev?.content ?? '',
        updatedAt: prev?.updatedAt ?? null,
      };
    });

    const assessment = await this.model.create({
      tenantId: tId,
      company: businessName,
      title: dto.title ?? '',
      version: draft.version,
      advisor: draft.advisor,
      threshold: draft.threshold,
      dealContext,
      weights,
      indicators,
      scores: draft.scores,
      gaps,
      reportSections,
      reportStatus: 'Draft',
      confidentiality: base?.confidentiality ?? 'Strictly confidential',
    });
    return this.withComputed(assessment.toObject());
  }

  async updateContext(tenantId: string, id: string, dto: UpdateContextDto) {
    const a = await this.getRawDoc(tenantId, id);
    if (dto.title !== undefined) a.title = dto.title;
    if (dto.advisor !== undefined) a.advisor = dto.advisor;
    if (dto.dealContext) {
      a.dealContext = this.mergeContext(
        (a.dealContext as any)?.toObject?.() ?? a.dealContext,
        dto.dealContext,
      );
      a.markModified('dealContext');
    }
    await a.save();
    return this.withComputed(a.toObject());
  }

  async updateWeights(tenantId: string, id: string, dto: UpdateWeightsDto) {
    const a = await this.getRawDoc(tenantId, id);
    a.weights = this.validateWeights(dto.weights) as any;
    a.markModified('weights');
    await a.save();
    return this.withComputed(a.toObject());
  }

  async setIndicator(tenantId: string, id: string, dto: SetIndicatorDto) {
    const a = await this.getRawDoc(tenantId, id);
    const ind = a.indicators.find((i) => i.key === dto.key);
    if (!ind) {
      throw new NotFoundException(
        a.indicators.length
          ? 'Indicator not found'
          : 'This assessment pre-dates indicators — create a new version to score by indicator.',
      );
    }
    if (dto.value !== undefined) {
      if (dto.value !== null && !Number.isFinite(dto.value)) {
        throw new BadRequestException('Indicator value must be a number.');
      }
      ind.value = dto.value;
    }
    if (dto.note !== undefined) ind.note = dto.note;
    a.markModified('indicators');
    this.rescore(a);
    await a.save();
    return this.withComputed(a.toObject());
  }

  async updateThreshold(tenantId: string, id: string, dto: UpdateThresholdDto) {
    const a = await this.getRawDoc(tenantId, id);
    a.threshold = dto.threshold;
    await a.save();
    return this.withComputed(a.toObject());
  }

  async setOverride(tenantId: string, id: string, dto: SetOverrideDto) {
    const a = await this.getRawDoc(tenantId, id);
    const dim = a.scores.find((s) => s.dimension === dto.dimension);
    if (!dim) throw new NotFoundException('Dimension not found');
    dim.override = dto.value;
    dim.overrideReason = dto.reason;
    a.markModified('scores');
    await a.save();
    return this.withComputed(a.toObject());
  }

  async clearOverride(tenantId: string, id: string, dto: ClearOverrideDto) {
    const a = await this.getRawDoc(tenantId, id);
    const dim = a.scores.find((s) => s.dimension === dto.dimension);
    if (!dim) throw new NotFoundException('Dimension not found');
    if (dim.computeMode === 'manual') {
      throw new BadRequestException(
        'Manual dimensions require an override — there is no auto-score to fall back to.',
      );
    }
    dim.override = null;
    dim.overrideReason = null;
    a.markModified('scores');
    await a.save();
    return this.withComputed(a.toObject());
  }

  // Refreshes live values against current module data without creating
  // a new version — for checking updated numbers mid-cycle rather than
  // only at the next formal version. Typed-in values are untouched.
  async recomputeAutoScores(tenantId: string, id: string) {
    const a = await this.getRawDoc(tenantId, id);
    if (a.indicators.length) {
      const auto = await this.computeAutoIndicators(tenantId);
      for (const i of a.indicators) i.autoValue = auto[i.key] ?? null;
      a.markModified('indicators');
      this.rescore(a);
    } else {
      for (const dim of a.scores) {
        if (dim.computeMode === 'auto') {
          dim.autoScore = await this.computeAutoScore(tenantId, dim.dimension);
        }
      }
      a.markModified('scores');
    }
    await a.save();
    return this.withComputed(a.toObject());
  }

  // Called when the data room checklist changes: the newest version's
  // Data Room Completeness indicators follow it straight away.
  async syncDataRoom(tenantId: string): Promise<void> {
    const latest = await this.model
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ version: -1 });
    if (!latest || !latest.indicators.length) return;
    const room = await this.roomValues(tenantId);
    let changed = false;
    for (const i of latest.indicators) {
      if (i.key in room && i.autoValue !== room[i.key]) {
        i.autoValue = room[i.key];
        changed = true;
      }
    }
    if (!changed) return;
    latest.markModified('indicators');
    this.rescore(latest);
    await latest.save();
  }

  // ── Gaps ─────────────────────────────────────────────────────

  async addGap(tenantId: string, id: string, dto: AddGapDto) {
    const a = await this.getRawDoc(tenantId, id);
    a.gaps.push({
      dimension: dto.dimension,
      priority: dto.priority,
      description: dto.description,
      impact: dto.impact ?? '',
      remediation: dto.remediation ?? '',
      owner: dto.owner ?? '',
      targetDate: new Date(dto.targetDate),
      status: GapStatus.OPEN,
      source: 'manual',
      closedAt: null,
    } as any);
    await a.save();
    return this.withComputed(a.toObject());
  }

  // Raises a gap for every dimension sitting below the threshold that
  // doesn't already have an open one. The gap text names the weakest
  // indicators, so it says what to fix rather than just that something
  // is wrong.
  async generateGaps(tenantId: string, id: string) {
    const a = await this.getRawDoc(tenantId, id);
    const plain: any = a.toObject();
    let created = 0;
    for (const s of plain.scores) {
      const eff = this.effectiveScore(s);
      if (eff >= a.threshold) continue;
      const exists = a.gaps.some(
        (g) =>
          g.dimension === s.dimension &&
          (this.isGapOpen(g) || g.status === GapStatus.RISK_ACCEPTED),
      );
      if (exists) continue;
      const worst = plain.indicators
        .filter((i: any) => i.dimension === s.dimension)
        .map((i: any) => ({
          i,
          shortfall: (100 - this.indicatorScore(i)) * i.weight,
        }))
        .sort((x: any, y: any) => y.shortfall - x.shortfall)
        .slice(0, 3)
        .map(({ i }: any) => {
          const v = this.indicatorValue(i);
          return `${i.label} (${v === null ? 'no data' : this.fmt(v, i.unit)})`;
        });
      const w = this.weightOf(plain, s.dimension);
      a.gaps.push({
        dimension: s.dimension,
        priority:
          eff < 40
            ? GapPriority.P1
            : eff < 60
              ? GapPriority.P2
              : GapPriority.P3,
        description: worst.length
          ? `${s.dimension} scores ${eff}, below the ${a.threshold} threshold. Weakest: ${worst.join('; ')}.`
          : `${s.dimension} scores ${eff}, below the ${a.threshold} threshold.`,
        impact:
          w !== null
            ? `Carries ${w}% of the overall readiness score.`
            : 'Pulls down the overall readiness score.',
        remediation: '',
        owner: '',
        targetDate: new Date(Date.now() + 90 * 86400000),
        status: GapStatus.OPEN,
        source: 'score',
        closedAt: null,
      } as any);
      created++;
    }
    await a.save();
    return { ...this.withComputed(a.toObject()), created };
  }

  async updateGap(
    tenantId: string,
    id: string,
    gapId: string,
    dto: UpdateGapDto,
  ) {
    const a = await this.getRawDoc(tenantId, id);
    const gap = a.gaps.id(gapId);
    if (!gap) throw new NotFoundException('Gap not found');
    if (dto.priority !== undefined) gap.priority = dto.priority;
    if (dto.description !== undefined) gap.description = dto.description;
    if (dto.impact !== undefined) gap.impact = dto.impact;
    if (dto.remediation !== undefined) gap.remediation = dto.remediation;
    if (dto.owner !== undefined) gap.owner = dto.owner;
    if (dto.targetDate !== undefined) gap.targetDate = new Date(dto.targetDate);
    await a.save();
    return this.withComputed(a.toObject());
  }

  async setGapStatus(
    tenantId: string,
    id: string,
    gapId: string,
    dto: SetGapStatusDto,
  ) {
    const a = await this.getRawDoc(tenantId, id);
    const gap = a.gaps.id(gapId);
    if (!gap) throw new NotFoundException('Gap not found');
    gap.status = dto.status;
    gap.closedAt = dto.status === GapStatus.CLOSED ? new Date() : null;
    await a.save();
    return this.withComputed(a.toObject());
  }

  async deleteGap(tenantId: string, id: string, gapId: string) {
    const a = await this.getRawDoc(tenantId, id);
    const gap = a.gaps.id(gapId);
    if (!gap) throw new NotFoundException('Gap not found');
    gap.deleteOne();
    await a.save();
    return this.withComputed(a.toObject());
  }

  async updateNotes(tenantId: string, id: string, dto: UpdateNotesDto) {
    const a = await this.getRawDoc(tenantId, id);
    a.notes = dto.notes;
    await a.save();
    return this.withComputed(a.toObject());
  }

  // ── Report builder ───────────────────────────────────────────

  private fmt(v: number, unit: string): string {
    return unit === 'x' ? `${v.toFixed(1)}x` : `${Math.round(v)}%`;
  }

  private money(amount: number, currency: string): string {
    return `${currency} ${Math.round(amount).toLocaleString('en-US')}`;
  }

  // Narrative for one section, written from the version's own numbers.
  // Null for sections that only a person can write.
  draftSection(a: any, name: string, ws: any | null): string | null {
    const overall = this.overallScore(a);
    const band = this.readinessBand(overall).label;
    const ctx = a.dealContext ?? {};
    const eff = (dim: ReadinessDimension) => {
      const s = a.scores.find((x: any) => x.dimension === dim);
      return s ? this.effectiveScore(s) : 0;
    };

    if (name === 'Executive summary') {
      const dealLabel =
        DEAL_TYPE_LABEL[(ctx.dealType ?? 'general') as DealType];
      const investor =
        ctx.investorType && ctx.investorType !== 'mixed'
          ? ` aimed at ${INVESTOR_TYPE_LABEL[ctx.investorType as InvestorType]}`
          : '';
      const raise =
        ctx.raiseAmount > 0
          ? `, targeting ${this.money(ctx.raiseAmount, ctx.currency ?? 'USD')}`
          : '';
      const ranked = [...a.scores].sort(
        (x: any, y: any) => this.effectiveScore(y) - this.effectiveScore(x),
      );
      const strong = ranked
        .filter((s: any) => this.effectiveScore(s) >= 80)
        .slice(0, 2);
      const weak = [...ranked]
        .reverse()
        .filter((s: any) => this.effectiveScore(s) < a.threshold)
        .slice(0, 3);
      const openGaps = (a.gaps ?? []).filter((g: any) =>
        this.isGapOpen(g),
      ).length;
      return [
        `${a.company} is assessing its investor readiness for ${dealLabel.toLowerCase()}${investor}${raise}.`,
        `The overall readiness score is ${overall}/100, placing the organisation in the ${band} band.`,
        strong.length
          ? `Strongest areas: ${strong.map((s: any) => `${s.dimension} (${this.effectiveScore(s)})`).join(', ')}.`
          : 'No dimension has yet reached a strong (80+) score.',
        weak.length
          ? `Priority areas below the ${a.threshold} threshold: ${weak.map((s: any) => `${s.dimension} (${this.effectiveScore(s)})`).join(', ')}.`
          : `Every dimension is at or above the ${a.threshold} threshold.`,
        `There ${openGaps === 1 ? 'is' : 'are'} ${openGaps} open gap${openGaps === 1 ? '' : 's'} in the remediation plan.`,
      ].join(' ');
    }

    if (name === 'Company overview and market') {
      const parts = [
        `${a.company} is preparing for ${DEAL_TYPE_LABEL[(ctx.dealType ?? 'general') as DealType].toLowerCase()}.`,
      ];
      if (ctx.raiseAmount > 0)
        parts.push(
          `Target raise: ${this.money(ctx.raiseAmount, ctx.currency ?? 'USD')}.`,
        );
      if (ctx.targetClose)
        parts.push(
          `Target close: ${new Date(ctx.targetClose).toISOString().slice(0, 10)}.`,
        );
      if (ctx.useOfFunds) parts.push(`Use of funds: ${ctx.useOfFunds}`);
      parts.push(
        'Add the company background, market and competitive position here.',
      );
      return parts.join(' ');
    }

    const dim = SECTION_DIMENSION[name];
    if (dim) {
      const inds = (a.indicators ?? []).filter((i: any) => i.dimension === dim);
      if (!inds.length) return null;
      const strong = inds.filter(
        (i: any) =>
          this.indicatorValue(i) !== null && this.indicatorScore(i) >= 80,
      );
      const weak = inds.filter(
        (i: any) =>
          this.indicatorValue(i) !== null && this.indicatorScore(i) < 60,
      );
      const none = inds.filter((i: any) => this.indicatorValue(i) === null);
      const list = (xs: any[]) =>
        xs
          .map(
            (i) =>
              `${i.label.toLowerCase()} (${this.fmt(this.indicatorValue(i)!, i.unit)})`,
          )
          .join(', ');
      const lines = [`${dim} scores ${eff(dim)}/100.`];
      if (strong.length) lines.push(`In good shape: ${list(strong)}.`);
      if (weak.length) lines.push(`Needs attention: ${list(weak)}.`);
      if (none.length)
        lines.push(
          `Not yet assessed: ${none.map((i: any) => i.label.toLowerCase()).join(', ')}.`,
        );
      return lines.join(' ');
    }

    if (name === 'Data room index') {
      const items = (ws?.room ?? []).filter(
        (r: any) => r.status !== 'not_applicable',
      );
      if (!items.length) return 'The data room checklist has not been started.';
      const held = items.filter((r: any) => {
        const st = effectiveRoomStatus(r);
        return st === 'uploaded' || st === 'review';
      });
      const missing = items
        .filter((r: any) => !held.includes(r))
        .slice(0, 6)
        .map((r: any) => r.name);
      return `The data room holds ${held.length} of ${items.length} expected documents (${Math.round((held.length / items.length) * 100)}% complete).${missing.length ? ` Priority gaps include: ${missing.join('; ')}.` : ' Every expected document is in place.'}`;
    }

    if (name === 'Key risks and mitigation') {
      const gaps = (a.gaps ?? []).filter(
        (g: any) => this.isGapOpen(g) || g.status === GapStatus.RISK_ACCEPTED,
      );
      if (!gaps.length)
        return 'No open risks are logged against this assessment.';
      return gaps
        .sort((x: any, y: any) =>
          String(x.priority).localeCompare(String(y.priority)),
        )
        .map(
          (g: any) =>
            `${g.priority} · ${g.dimension}: ${g.description}${g.remediation ? ` Mitigation: ${g.remediation}` : ''}${g.status === GapStatus.RISK_ACCEPTED ? ' (risk accepted)' : ''}`,
        )
        .join('\n');
    }

    if (name === 'Remediation plan') {
      const gaps = (a.gaps ?? []).filter((g: any) => this.isGapOpen(g));
      const tasks = (ws?.tasks ?? []).filter((t: any) => t.status !== 'closed');
      if (!gaps.length && !tasks.length)
        return 'No remediation work is outstanding.';
      const lines: string[] = [];
      for (const g of gaps) {
        lines.push(
          `${g.priority} · ${g.dimension} — ${g.remediation || g.description}${g.owner ? ` (owner: ${g.owner})` : ''} · target ${new Date(g.targetDate).toISOString().slice(0, 10)}`,
        );
      }
      for (const t of tasks) {
        lines.push(
          `${t.priority} · ${t.title}${t.owner ? ` (owner: ${t.owner})` : ''}${t.due ? ` · due ${new Date(t.due).toISOString().slice(0, 10)}` : ''}`,
        );
      }
      return lines.join('\n');
    }

    return null; // Business model and traction — written by hand
  }

  async updateReportMeta(
    tenantId: string,
    id: string,
    dto: UpdateReportMetaDto,
  ) {
    const a = await this.getRawDoc(tenantId, id);
    if (dto.reportStatus !== undefined)
      a.reportStatus = dto.reportStatus as any;
    if (dto.confidentiality !== undefined)
      a.confidentiality = dto.confidentiality;
    if (dto.versionNotes !== undefined) a.versionNotes = dto.versionNotes;
    await a.save();
    return this.withComputed(a.toObject());
  }

  async setReportSection(
    tenantId: string,
    id: string,
    dto: SetReportSectionDto,
  ) {
    return this.updateSection(tenantId, id, {
      name: dto.name,
      state: dto.state,
    });
  }

  async updateSection(tenantId: string, id: string, dto: UpdateSectionDto) {
    const a = await this.getRawDoc(tenantId, id);
    const section = a.reportSections.find((r) => r.name === dto.name);
    if (!section) throw new NotFoundException('Report section not found');
    if (dto.owner !== undefined) section.owner = dto.owner;
    if (dto.content !== undefined) {
      section.content = dto.content;
      section.updatedAt = new Date();
      // Hand-editing a section takes it out of Auto and back under review.
      if (
        dto.state === undefined &&
        (section.state === 'Auto' || section.state === 'Incomplete')
      ) {
        section.state = dto.content.trim() ? 'Review' : 'Incomplete';
      }
    }
    if (dto.state !== undefined) {
      if (dto.state === 'Approved' && !(section.content ?? '').trim()) {
        throw new BadRequestException('An empty section cannot be approved.');
      }
      section.state = dto.state;
    }
    a.markModified('reportSections');
    await a.save();
    return this.withComputed(a.toObject());
  }

  async redraftSection(tenantId: string, id: string, dto: RedraftSectionDto) {
    const a = await this.getRawDoc(tenantId, id);
    const section = a.reportSections.find((r) => r.name === dto.name);
    if (!section) throw new NotFoundException('Report section not found');
    const ws = await this.wsModel
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .lean();
    const text = this.draftSection(a.toObject(), dto.name, ws);
    if (text === null) {
      throw new BadRequestException(
        'This section is written by hand — there is nothing to draft it from.',
      );
    }
    section.content = text;
    section.updatedAt = new Date();
    section.state = REPORT_SECTION_DEFS.find((d) => d.name === dto.name)?.auto
      ? 'Auto'
      : 'Review';
    a.markModified('reportSections');
    await a.save();
    return this.withComputed(a.toObject());
  }

  // ── Exports ──────────────────────────────────────────────────

  async getReportPdf(
    tenantId: string,
    id: string,
    businessName: string,
  ): Promise<Buffer> {
    const raw = await this.getRawDoc(tenantId, id);
    const a: any = raw.toObject();
    const ws = await this.wsModel
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .lean();
    const overall = this.overallScore(a);
    const band = this.readinessBand(overall);
    const ctx = a.dealContext ?? {};
    const today = (d: any) => new Date(d).toISOString().slice(0, 10);

    const def: ReportDefinition = {
      companyName: businessName,
      title: 'Investor Readiness Report',
      subtitle: `${businessName} — v${a.version}${a.title ? ` — ${a.title}` : ''}`,
      summary: [
        { label: 'Overall score', value: `${overall}/100` },
        { label: 'Readiness band', value: band.label },
        {
          label: 'Open gaps',
          value: a.gaps.filter((g: any) => this.isGapOpen(g)).length,
        },
        {
          label: 'Gaps closed',
          value: a.gaps.filter((g: any) => g.status === GapStatus.CLOSED)
            .length,
        },
        { label: 'Projected ready', value: this.projectedReadyDate(a) },
        { label: 'Advisor', value: a.advisor || '—' },
        { label: 'Report status', value: a.reportStatus ?? 'Draft' },
        {
          label: 'Confidentiality',
          value: a.confidentiality ?? 'Strictly confidential',
        },
      ],
      sections: [],
    };

    if (a.dealContext) {
      def.sections.push({
        heading: 'Deal context',
        columns: [
          'Deal type',
          'Investor type',
          'Target raise',
          'Target close',
          'Use of funds',
        ],
        rows: [
          [
            DEAL_TYPE_LABEL[(ctx.dealType ?? 'general') as DealType],
            INVESTOR_TYPE_LABEL[(ctx.investorType ?? 'mixed') as InvestorType],
            ctx.raiseAmount > 0
              ? this.money(ctx.raiseAmount, ctx.currency ?? 'USD')
              : '—',
            ctx.targetClose ? today(ctx.targetClose) : '—',
            ctx.useOfFunds || '—',
          ],
        ],
      });
    }

    def.sections.push({
      heading: 'Dimension scores',
      columns: ['Dimension', 'Weight', 'Source', 'Score', 'Override', 'Reason'],
      rows: a.scores.map((s: any) => [
        s.dimension,
        this.weightOf(a, s.dimension) !== null
          ? `${this.weightOf(a, s.dimension)}%`
          : '—',
        DIMENSION_SOURCE[s.dimension as ReadinessDimension],
        this.effectiveScore(s),
        s.override !== null && s.override !== undefined ? 'Yes' : 'No',
        s.overrideReason ?? '—',
      ]),
    });

    if (a.indicators?.length) {
      def.sections.push({
        heading: 'Indicators',
        columns: [
          'Dimension',
          'Indicator',
          'Value',
          'Floor',
          'Target',
          'Score',
          'Basis',
        ],
        rows: a.indicators.map((i: any) => {
          const v = this.indicatorValue(i);
          return [
            i.dimension,
            i.label,
            v === null ? 'No data' : this.fmt(v, i.unit),
            this.fmt(i.floor, i.unit),
            this.fmt(i.target, i.unit),
            Math.round(this.indicatorScore(i)),
            i.value !== null && i.value !== undefined
              ? 'Entered'
              : i.autoValue !== null && i.autoValue !== undefined
                ? 'Live data'
                : '—',
          ];
        }),
      });
    }

    def.sections.push({
      heading: 'Gap analysis',
      columns: [
        'Priority',
        'Dimension',
        'Gap',
        'Impact',
        'Remediation',
        'Owner',
        'Target',
        'Status',
      ],
      rows: a.gaps.map((g: any) => [
        g.priority,
        g.dimension,
        g.description,
        g.impact,
        g.remediation,
        g.owner,
        today(g.targetDate),
        g.status,
      ]),
    });

    const written = (a.reportSections ?? []).filter((r: any) =>
      (r.content ?? '').trim(),
    );
    if (written.length) {
      def.sections.push({
        heading: 'Report narrative',
        columns: ['Section', 'Status', 'Content'],
        rows: written.map((r: any) => [r.name, r.state, r.content]),
      });
    }

    const room = (ws?.room ?? []).filter(
      (r: any) => r.status !== 'not_applicable',
    );
    if (room.length) {
      def.sections.push({
        heading: 'Data room index',
        columns: ['Category', 'Document', 'Status', 'Updated'],
        rows: room.map((r: any) => [
          r.category,
          r.name,
          effectiveRoomStatus(r),
          r.updatedAt ? today(r.updatedAt) : '—',
        ]),
      });
    }

    if (a.notes) {
      def.sections.push({
        heading: 'Notes',
        columns: ['Notes'],
        rows: [[a.notes]],
      });
    }
    if (a.versionNotes) {
      def.sections.push({
        heading: 'Version notes',
        columns: ['Notes'],
        rows: [[a.versionNotes]],
      });
    }
    return buildReportPdf(def);
  }

  async getReportDocx(
    tenantId: string,
    id: string,
    businessName: string,
  ): Promise<Buffer> {
    const {
      Document,
      Packer,
      Paragraph,
      HeadingLevel,
      TextRun,
      Table,
      TableRow,
      TableCell,
      WidthType,
      ShadingType,
    } = require('docx');
    const raw = await this.getRawDoc(tenantId, id);
    const a: any = raw.toObject();
    const overall = this.overallScore(a);
    const band = this.readinessBand(overall);

    const cell = (text: string, width: number, bold = false, fill?: string) =>
      new TableCell({
        width: { size: width, type: WidthType.DXA },
        shading: fill
          ? { type: ShadingType.CLEAR, fill, color: 'auto' }
          : undefined,
        children: [
          new Paragraph({
            children: [new TextRun({ text: String(text), bold, size: 20 })],
          }),
        ],
      });
    const widths = [4200, 1200, 1200, 2400];
    const rows = [
      new TableRow({
        children: ['Dimension', 'Weight', 'Score', 'Basis'].map((h, i) =>
          cell(h, widths[i], true, 'E8E8F4'),
        ),
      }),
      ...a.scores.map(
        (s: any) =>
          new TableRow({
            children: [
              cell(s.dimension, widths[0]),
              cell(
                this.weightOf(a, s.dimension) !== null
                  ? `${this.weightOf(a, s.dimension)}%`
                  : '—',
                widths[1],
              ),
              cell(String(this.effectiveScore(s)), widths[2]),
              cell(
                s.override !== null && s.override !== undefined
                  ? 'Override'
                  : 'Computed',
                widths[3],
              ),
            ],
          }),
      ),
    ];

    const children: any[] = [
      new Paragraph({
        heading: HeadingLevel.TITLE,
        children: [new TextRun({ text: 'Investor Readiness Report' })],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `${businessName} — v${a.version}${a.title ? ` — ${a.title}` : ''}`,
            size: 26,
          }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `${a.confidentiality ?? 'Strictly confidential'} · ${a.reportStatus ?? 'Draft'}`,
            italics: true,
            size: 20,
          }),
        ],
      }),
      new Paragraph({
        spacing: { before: 200, after: 200 },
        children: [
          new TextRun({
            text: `Overall readiness: ${overall}/100 — ${band.label}`,
            bold: true,
            size: 24,
          }),
        ],
      }),
      new Table({
        width: { size: 9000, type: WidthType.DXA },
        columnWidths: widths,
        rows,
      }),
    ];
    for (const r of a.reportSections ?? []) {
      if (!(r.content ?? '').trim()) continue;
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300 },
          children: [new TextRun({ text: r.name })],
        }),
      );
      for (const line of String(r.content).split('\n')) {
        children.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [new TextRun({ text: line })],
          }),
        );
      }
    }
    if (a.versionNotes) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300 },
          children: [new TextRun({ text: 'Version notes' })],
        }),
        new Paragraph({ children: [new TextRun({ text: a.versionNotes })] }),
      );
    }
    const doc = new Document({
      sections: [
        {
          properties: { page: { size: { width: 11906, height: 16838 } } },
          children,
        },
      ],
    });
    return Packer.toBuffer(doc);
  }
}
