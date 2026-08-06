import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ReadinessAssessment,
  ReadinessAssessmentDocument,
  ReadinessDimension,
  READINESS_DIMENSIONS,
  DIMENSION_COMPUTE_MODE,
  DIMENSION_SOURCE,
  GapStatus,
  REPORT_SECTIONS,
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

  // Blend of three rates across active employees: contract signed,
  // onboarding completed, at least one completed performance review.
  // "Active" excludes only Terminated/Resigned — on-leave, suspended
  // and probationary staff still count, since they're still real
  // headcount a diligence would review.
  private async scoreHr(tenantId: string): Promise<number> {
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
    if (activeEmployees.length === 0) return 0;
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

    const onboardedRate =
      activeEmployees.filter((e) => e.onboardingCompleted).length /
      activeEmployees.length;
    const contractRate = signedEmployeeIds.length / activeEmployees.length;
    const reviewRate = reviewedEmployeeIds.length / activeEmployees.length;

    return Math.round(
      Math.min(100, ((onboardedRate + contractRate + reviewRate) / 3) * 100),
    );
  }

  private async computeAutoScore(
    tenantId: string,
    dim: ReadinessDimension,
  ): Promise<number> {
    switch (dim) {
      case ReadinessDimension.GOVERNANCE:
        return this.scoreGovernance(tenantId);
      case ReadinessDimension.LEGAL_COMPLIANCE:
        return this.scoreObligations(tenantId);
      case ReadinessDimension.TAX_COMPLIANCE:
        return this.scoreObligations(tenantId, Regulator.RRA);
      case ReadinessDimension.HR_MANAGEMENT:
        return this.scoreHr(tenantId);
      default:
        return 0;
    }
  }

  // ── Pure derived helpers — mirrors the confirmed prototype's
  // effectiveScore/overallScore/readinessBand/projectedReadyDate
  // exactly, as the single source of truth both this service and
  // the PDF report compute from. ──────────────────────────────────

  effectiveScore(d: any): number {
    return d.override ?? d.autoScore;
  }

  overallScore(a: any): number {
    if (!a.scores.length) return 0;
    return Math.round(
      a.scores.reduce((s: number, d: any) => s + this.effectiveScore(d), 0) /
        a.scores.length,
    );
  }

  readinessBand(score: number) {
    if (score >= 80)
      return {
        label: 'Investment Ready',
        tone: 'text-emerald-600 border-emerald-500/40',
      };
    if (score >= 60)
      return {
        label: 'Conditionally Ready',
        tone: 'text-amber-600 border-amber-500/40',
      };
    return { label: 'Not Ready', tone: 'text-rose-600 border-rose-500/40' };
  }

  projectedReadyDate(a: any): string {
    const total = a.gaps.length;
    const closed = a.gaps.filter(
      (g: any) => g.status === GapStatus.CLOSED,
    ).length;
    const open = total - closed;
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
    return {
      ...a,
      overallScore: this.overallScore(a),
      band: this.readinessBand(this.overallScore(a)),
      projectedReadyDate: this.projectedReadyDate(a),
      gapsClosed: a.gaps.filter((g: any) => g.status === GapStatus.CLOSED)
        .length,
      gapsOpen: a.gaps.filter((g: any) => g.status !== GapStatus.CLOSED).length,
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

  // Builds a fresh score set for a new version: auto dimensions
  // computed for real right now; manual dimensions start at a
  // neutral 50 baseline (or carry the prior version's override
  // forward, if one exists) rather than a fabricated number.
  private async buildScores(tenantId: string, carryForward?: any[]) {
    const scores: any[] = [];
    for (const dim of READINESS_DIMENSIONS) {
      const mode = DIMENSION_COMPUTE_MODE[dim];
      if (mode === 'auto') {
        scores.push({
          dimension: dim,
          computeMode: 'auto',
          autoScore: await this.computeAutoScore(tenantId, dim),
          override: null,
          overrideReason: null,
        });
      } else {
        const prior = carryForward?.find((s) => s.dimension === dim);
        scores.push({
          dimension: dim,
          computeMode: 'manual',
          autoScore: 0,
          override: prior?.override ?? 50,
          overrideReason:
            prior?.overrideReason ??
            'Manual baseline — no connected data source yet for this dimension.',
        });
      }
    }
    return scores;
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
    const base = prior[0];
    const scores = await this.buildScores(tenantId, base?.scores);
    const assessment = await this.model.create({
      tenantId: tId,
      company: businessName,
      version: (base?.version ?? 0) + 1,
      advisor: dto.advisor ?? base?.advisor ?? '',
      threshold: base?.threshold ?? 70,
      scores,
      // Open gaps carry forward to the new version — closed ones
      // don't, matching the confirmed prototype's remediation model.
      gaps: base
        ? base.gaps
            .filter((g: any) => g.status !== GapStatus.CLOSED)
            .map((g: any) => ({
              dimension: g.dimension,
              priority: g.priority,
              description: g.description,
              impact: g.impact,
              remediation: g.remediation,
              owner: g.owner,
              targetDate: g.targetDate,
              status: g.status,
              closedAt: null,
            }))
        : [],
      reportSections: REPORT_SECTIONS.map((n) => ({
        name: n,
        state: 'Incomplete',
      })),
    });
    return this.withComputed(assessment.toObject());
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

  // Refreshes auto-scored dimensions against live module data
  // without creating a new version — for checking updated numbers
  // mid-cycle rather than only at the next formal version.
  async recomputeAutoScores(tenantId: string, id: string) {
    const a = await this.getRawDoc(tenantId, id);
    for (const dim of a.scores) {
      if (dim.computeMode === 'auto') {
        dim.autoScore = await this.computeAutoScore(tenantId, dim.dimension);
      }
    }
    a.markModified('scores');
    await a.save();
    return this.withComputed(a.toObject());
  }

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
      closedAt: null,
    } as any);
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

  async setReportSection(
    tenantId: string,
    id: string,
    dto: SetReportSectionDto,
  ) {
    const a = await this.getRawDoc(tenantId, id);
    const section = a.reportSections.find((r) => r.name === dto.name);
    if (!section) throw new NotFoundException('Report section not found');
    section.state = dto.state;
    a.markModified('reportSections');
    await a.save();
    return this.withComputed(a.toObject());
  }

  async updateNotes(tenantId: string, id: string, dto: UpdateNotesDto) {
    const a = await this.getRawDoc(tenantId, id);
    a.notes = dto.notes;
    await a.save();
    return this.withComputed(a.toObject());
  }

  // ── PDF report — same house style as Valuation, via the shared
  // report-builder utility. ───────────────────────────────────────

  async getReportPdf(
    tenantId: string,
    id: string,
    businessName: string,
  ): Promise<Buffer> {
    const raw = await this.getRawDoc(tenantId, id);
    const a = raw.toObject();
    const overall = this.overallScore(a);
    const band = this.readinessBand(overall);

    const def: ReportDefinition = {
      title: 'Investor Readiness Report',
      subtitle: `${businessName} — v${a.version}`,
      summary: [
        { label: 'Overall score', value: `${overall}/100` },
        { label: 'Readiness band', value: band.label },
        {
          label: 'Open gaps',
          value: a.gaps.filter((g: any) => g.status !== GapStatus.CLOSED)
            .length,
        },
        {
          label: 'Gaps closed',
          value: a.gaps.filter((g: any) => g.status === GapStatus.CLOSED)
            .length,
        },
        { label: 'Projected ready', value: this.projectedReadyDate(a) },
        { label: 'Advisor', value: a.advisor || '—' },
      ],
      sections: [
        {
          heading: 'Dimension scores',
          columns: ['Dimension', 'Source', 'Score', 'Override', 'Reason'],
          rows: a.scores.map((s: any) => [
            s.dimension,
            DIMENSION_SOURCE[s.dimension as ReadinessDimension],
            this.effectiveScore(s),
            s.override !== null ? 'Yes' : 'No',
            s.overrideReason ?? '—',
          ]),
        },
        {
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
            new Date(g.targetDate).toISOString().slice(0, 10),
            g.status,
          ]),
        },
      ],
    };
    if (a.notes) {
      def.sections.push({
        heading: 'Notes',
        columns: ['Notes'],
        rows: [[a.notes]],
      });
    }
    return buildReportPdf(def);
  }
}
