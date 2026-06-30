import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PerformanceReview,
  PerformanceReviewDocument,
  ReviewStatus,
  ReviewCycle,
  ReviewCycleDocument,
  ReviewCycleStatus,
  PerformanceImprovementPlan,
  PerformanceImprovementPlanDocument,
  PipStatus,
  EmployeeDocument,
  Employee,
} from '../schemas';
import { PerformanceScoringService, ProbationService } from '../services';
import {
  UpdateEmployeeReviewSectionDto,
  UpdateManagerReviewSectionDto,
} from '../dtos/performance.dto';

type ScoredReviewSummary = PerformanceReview & {
  _id: Types.ObjectId;
  scores: {
    kpiSection: ReturnType<PerformanceScoringService['scoreKpiSection']>;
    competencySection: ReturnType<
      PerformanceScoringService['scoreFrameworkSection']
    >;
    valuesSection: ReturnType<
      PerformanceScoringService['scoreFrameworkSection']
    >;
  };
};

@Injectable()
export class PerformanceReviewService {
  constructor(
    @InjectModel(PerformanceReview.name)
    private readonly reviewModel: Model<PerformanceReviewDocument>,
    @InjectModel(ReviewCycle.name)
    private readonly cycleModel: Model<ReviewCycleDocument>,
    @InjectModel(PerformanceImprovementPlan.name)
    private readonly pipModel: Model<PerformanceImprovementPlanDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @Inject(forwardRef(() => ProbationService))
    private readonly probationService: ProbationService,
    private readonly scoringService: PerformanceScoringService,
  ) {}

  async getReviewById(
    tenantId: string,
    reviewId: string,
  ): Promise<PerformanceReviewDocument> {
    const review = await this.reviewModel.findOne({
      _id: reviewId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!review) throw new NotFoundException('Performance review not found');
    return review;
  }

  async getReviewForEmployee(
    reviewId: string,
    employeeId: string,
  ): Promise<PerformanceReviewDocument> {
    const review = await this.reviewModel.findOne({
      _id: reviewId,
      employeeId: new Types.ObjectId(employeeId),
    });
    if (!review) throw new NotFoundException('Performance review not found');
    return review;
  }

  async getMyReviews(employeeId: string): Promise<PerformanceReviewDocument[]> {
    return this.reviewModel
      .find({ employeeId: new Types.ObjectId(employeeId) })
      .sort({ createdAt: -1 })
      .lean() as any;
  }

  getScoredView(review: PerformanceReviewDocument) {
    const kpiSection = this.scoringService.scoreKpiSection(review.kpis);
    const competencySection = this.scoringService.scoreFrameworkSection(
      review.competencies,
    );
    const valuesSection = this.scoringService.scoreFrameworkSection(
      review.values,
    );

    if (review.status !== ReviewStatus.COMPLETED) {
      // Definitions (title, weight, performanceStandard, description)
      // and EACH SIDE'S OWN raw score stay visible — an employee
      // needs to see their own input, and a manager mid-review needs
      // to see theirs. What's hidden is the COMBINED/AGGREGATE view —
      // the thing that represents a "final" judgement before the
      // process is actually finished.
      return {
        kpiSection: this.hideAggregates(kpiSection),
        competencySection: this.hideFrameworkAggregates(competencySection),
        valuesSection: this.hideFrameworkAggregates(valuesSection),
      };
    }

    return { kpiSection, competencySection, valuesSection };
  }

  async updateEmployeeSection(
    reviewId: string,
    employeeId: string,
    dto: UpdateEmployeeReviewSectionDto,
  ): Promise<PerformanceReviewDocument> {
    const review = await this.getReviewForEmployee(reviewId, employeeId);

    const cycle = await this.cycleModel.findById(review.reviewCycleId);
    if (cycle && cycle.status === ReviewCycleStatus.DRAFT) {
      throw new ForbiddenException(
        'This review cycle has not been opened yet. Check back once HR opens it.',
      );
    }

    if (review.status !== ReviewStatus.EMPLOYEE_IN_PROGRESS) {
      throw new ForbiddenException(
        review.status === ReviewStatus.COMPLETED
          ? 'This review is completed and can no longer be edited.'
          : 'Your self-assessment has already been submitted and is locked. Contact HR if changes are needed.',
      );
    }

    if (dto.kpiScores) {
      this.applyScores(review.kpis, dto.kpiScores, 'employee');
      review.markModified('kpis');
    }
    if (dto.competencyScores) {
      this.applyScores(review.competencies, dto.competencyScores, 'employee');
      review.markModified('competencies');
    }
    if (dto.valuesScores) {
      this.applyScores(review.values, dto.valuesScores, 'employee');
      review.markModified('values');
    }

    if (dto.achievements !== undefined) review.achievements = dto.achievements;
    if (dto.challenges !== undefined) review.challenges = dto.challenges;
    if (dto.shortTermCareerGoals !== undefined)
      review.shortTermCareerGoals = dto.shortTermCareerGoals;
    if (dto.longTermCareerGoals !== undefined)
      review.longTermCareerGoals = dto.longTermCareerGoals;
    if (dto.employeeFeedbackComments !== undefined) {
      review.employeeFeedbackComments = dto.employeeFeedbackComments;
    }

    if (dto.previousGoalsReview) {
      review.previousGoalsReview = dto.previousGoalsReview.map((g) => ({
        description: g.description,
        status: (g.status as any) ?? null,
        employeeComment: g.employeeComment ?? null,
        managerComment:
          review.previousGoalsReview.find(
            (existing) => existing.description === g.description,
          )?.managerComment ?? null,
      }));
    }

    if (dto.trainingNeedAreas) {
      const existingByArea = new Map(
        review.trainingNeeds.map((t) => [t.area, t]),
      );
      review.trainingNeeds = dto.trainingNeedAreas.map((area) => ({
        area,
        priority: existingByArea.get(area)?.priority ?? 'medium',
        managerRecommendation:
          existingByArea.get(area)?.managerRecommendation ?? null,
      }));
    }

    await review.save();
    return review;
  }

  async submitEmployeeSection(
    reviewId: string,
    employeeId: string,
  ): Promise<PerformanceReviewDocument> {
    const review = await this.getReviewForEmployee(reviewId, employeeId);

    const cycle = await this.cycleModel.findById(review.reviewCycleId);
    if (cycle && cycle.status === ReviewCycleStatus.DRAFT) {
      throw new ForbiddenException(
        'This review cycle has not been opened yet. Check back once HR opens it.',
      );
    }

    if (review.status !== ReviewStatus.EMPLOYEE_IN_PROGRESS) {
      throw new ConflictException('This review has already been submitted.');
    }

    review.status = ReviewStatus.MANAGER_IN_PROGRESS;
    review.employeeSubmittedAt = new Date();
    await review.save();
    return review;
  }

  async updateManagerSection(
    callerUserId: string,
    reviewId: string,
    dto: UpdateManagerReviewSectionDto,
  ): Promise<PerformanceReviewDocument> {
    const review = await this.reviewModel.findById(reviewId);

    if (!review) throw new NotFoundException('Performance review not found');

    await this.assertIsCurrentReviewerOf(callerUserId, review);

    if (review.status === ReviewStatus.EMPLOYEE_IN_PROGRESS) {
      throw new ForbiddenException(
        'The employee has not yet submitted their self-assessment. This review is not ready for manager input.',
      );
    }
    if (review.status === ReviewStatus.COMPLETED) {
      throw new ForbiddenException(
        'This review is completed and can no longer be edited.',
      );
    }

    if (dto.kpiScores) {
      this.applyScores(review.kpis, dto.kpiScores, 'manager');
      review.markModified('kpis');
    }
    if (dto.competencyScores) {
      this.applyScores(review.competencies, dto.competencyScores, 'manager');
      review.markModified('competencies');
    }
    if (dto.valuesScores) {
      this.applyScores(review.values, dto.valuesScores, 'manager');
      review.markModified('values');
    }

    if (dto.complianceChecks) {
      const existingByKey = new Map(
        review.complianceChecks.map((c) => [c.key, c]),
      );
      for (const check of dto.complianceChecks) {
        const existing = existingByKey.get(check.key);
        if (existing) {
          if (check.answer !== undefined) existing.answer = check.answer as any;
          if (check.date !== undefined) existing.date = new Date(check.date);
          if (check.notes !== undefined) existing.notes = check.notes;
        }
      }
    }

    if (dto.previousGoalsManagerComments) {
      const commentByDescription = new Map(
        dto.previousGoalsManagerComments.map((g) => [
          g.description,
          g.managerComment,
        ]),
      );
      review.previousGoalsReview = review.previousGoalsReview.map((g) => ({
        ...g,
        managerComment:
          commentByDescription.get(g.description) ?? g.managerComment,
      }));
    }

    if (dto.nextPeriodGoals) {
      review.nextPeriodGoals = dto.nextPeriodGoals.map((g) => ({
        description: g.description,
        priority: (g.priority as any) ?? 'medium',
        timeline: g.timeline ?? null,
        managerComments: g.managerComments ?? null,
      }));
    }

    if (dto.trainingNeeds) {
      const existingByArea = new Map(
        review.trainingNeeds.map((t) => [t.area, t]),
      );
      review.trainingNeeds = dto.trainingNeeds.map((t) => ({
        area: t.area,
        priority:
          (t.priority as any) ??
          existingByArea.get(t.area)?.priority ??
          'medium',
        managerRecommendation:
          t.managerRecommendation ??
          existingByArea.get(t.area)?.managerRecommendation ??
          null,
      }));
    }

    if (dto.managerSummaryLastPeriod !== undefined)
      review.managerSummaryLastPeriod = dto.managerSummaryLastPeriod;
    if (dto.managerAssessmentThisPeriod !== undefined) {
      review.managerAssessmentThisPeriod = dto.managerAssessmentThisPeriod;
    }
    if (dto.managerDevelopmentAreas !== undefined)
      review.managerDevelopmentAreas = dto.managerDevelopmentAreas;
    if (dto.managerConclusions !== undefined)
      review.managerConclusions = dto.managerConclusions;

    await review.save();
    const reloaded = await this.reviewModel.findById(review._id).lean();
    console.log(
      '[updateManagerSection] DEBUG persisted kpis:',
      JSON.stringify(reloaded.kpis.map((k) => k.managerScore)),
    );
    return review;
  }

  // ===============================================================
  // completeReview() - CORRECTED:
  // - param renamed callerUserId throughout (no more managerUserId
  //   typo/undefined-variable bug)
  // - probationRecommendationReasoning is a REAL 3rd parameter now
  // - guards: if this review IS linked to a probation Month 3
  //   stage, reasoning becomes REQUIRED before the review can even
  //   complete - not a silent gap anymore
  // - recordMonth3Recommendation() called with all 4 real args
  // ===============================================================

  async completeReview(
    callerUserId: string,
    reviewId: string,
    probationRecommendationReasoning?: string,
  ): Promise<PerformanceReviewDocument> {
    const review = await this.reviewModel.findById(reviewId);

    if (!review) throw new NotFoundException('Performance review not found');

    await this.assertIsCurrentReviewerOf(callerUserId, review);

    if (review.status !== ReviewStatus.MANAGER_IN_PROGRESS) {
      throw new ConflictException(
        review.status === ReviewStatus.COMPLETED
          ? 'This review is already completed.'
          : 'The employee has not yet submitted their self-assessment.',
      );
    }

    const isProbationReview = await this.probationService.isLinkedToProbation(
      (review._id as Types.ObjectId).toString(),
    );
    if (isProbationReview && !probationRecommendationReasoning?.trim()) {
      throw new BadRequestException(
        'A recommendation with reasoning is required to complete a probation Month 3 evaluation.',
      );
    }

    review.status = ReviewStatus.COMPLETED;
    review.managerSignedAt = new Date();
    review.managerSignedBy = new Types.ObjectId(callerUserId);
    await review.save();

    const kpiSection = this.scoringService.scoreKpiSection(review.kpis);
    const triggeringBand = kpiSection.ratingBand.toLowerCase();
    const PIP_TRIGGER_BANDS = ['unsatisfactory', 'needs improvement'];

    if (PIP_TRIGGER_BANDS.includes(triggeringBand)) {
      await this.pipModel.create({
        employeeId: review.employeeId,
        tenantId: review.tenantId,
        triggeringReviewId: review._id,
        triggeringRatingBand: triggeringBand,
        status: PipStatus.ACTIVE,
        startDate: new Date(),
        reviewDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      });
    }

    if (isProbationReview) {
      await this.probationService.recordMonth3Recommendation(
        review,
        kpiSection.ratingBand,
        callerUserId,
        probationRecommendationReasoning ?? '',
      );
    }

    const cycle = await this.cycleModel.findByIdAndUpdate(
      review.reviewCycleId,
      { $inc: { completedCount: 1 } },
      { new: true },
    );

    if (cycle && cycle.completedCount >= cycle.employeeCount) {
      cycle.status = ReviewCycleStatus.COMPLETED as any;
      await cycle.save();
    }

    return review;
  }

  async getPendingReviewsForManager(
    callerUserId: string,
  ): Promise<PerformanceReviewDocument[]> {
    const caller = await this.employeeModel.findOne({
      userId: new Types.ObjectId(callerUserId),
    });

    if (!caller) {
      return [];
    }

    const subjectIds = await this.employeeModel
      .find({ reportsToManagerId: caller._id })
      .distinct('_id');

    if (subjectIds.length === 0) return [];

    return this.reviewModel
      .find({
        employeeId: { $in: subjectIds },
        status: ReviewStatus.MANAGER_IN_PROGRESS,
      })
      .sort({ employeeSubmittedAt: 1 })
      .lean() as any;
  }

  async getReviewedHistoryForManager(
    callerUserId: string,
  ): Promise<ScoredReviewSummary[]> {
    const caller = await this.employeeModel.findOne({
      userId: new Types.ObjectId(callerUserId),
    });
    if (!caller) return [];

    const subjectIds = await this.employeeModel
      .find({ reportsToManagerId: caller._id })
      .distinct('_id');

    if (subjectIds.length === 0) return [];

    const reviews = await this.reviewModel
      .find({
        employeeId: { $in: subjectIds },
        status: ReviewStatus.COMPLETED,
        managerSignedBy: caller.userId, // confirmed: ONLY reviews
        // THIS specific manager personally signed off — not just
        // anyone who happens to manage this employee NOW. If
        // reportsToManagerId changed after completion, the review
        // stays attributed to whoever ACTUALLY signed it, matching
        // managerSignedBy's own real meaning elsewhere in the schema.
      })
      .sort({ managerSignedAt: -1 })
      .lean();

    return reviews.map((review) => ({
      ...review,
      scores: {
        kpiSection: this.scoringService.scoreKpiSection(review.kpis),
        competencySection: this.scoringService.scoreFrameworkSection(
          review.competencies,
        ),
        valuesSection: this.scoringService.scoreFrameworkSection(review.values),
      },
    })) as ScoredReviewSummary[];
  }

  async getDepartmentReviewHistory(
    hodUserId: string,
  ): Promise<ScoredReviewSummary[]> {
    const hod = await this.employeeModel.findOne({
      userId: new Types.ObjectId(hodUserId),
    });
    if (!hod || hod.hierarchyRole !== 'head_of_department') return [];

    const managerIds = await this.employeeModel
      .find({ reportsToManagerId: hod._id })
      .distinct('_id');

    if (managerIds.length === 0) return [];

    const allReportIds = await this.employeeModel
      .find({ reportsToManagerId: { $in: managerIds } })
      .distinct('_id');

    const allDepartmentEmployeeIds = [...managerIds, ...allReportIds];

    const reviews = await this.reviewModel
      .find({
        employeeId: { $in: allDepartmentEmployeeIds },
        status: ReviewStatus.COMPLETED,
      })
      .sort({ managerSignedAt: -1 })
      .lean();

    return reviews.map((review) => ({
      ...review,
      scores: {
        kpiSection: this.scoringService.scoreKpiSection(review.kpis),
        competencySection: this.scoringService.scoreFrameworkSection(
          review.competencies,
        ),
        valuesSection: this.scoringService.scoreFrameworkSection(review.values),
      },
    })) as ScoredReviewSummary[];
  }

  async getPendingHodReviews(
    tenantUserId: string,
  ): Promise<PerformanceReviewDocument[]> {
    const hodIds = await this.employeeModel
      .find({
        reportsToTenantId: new Types.ObjectId(tenantUserId),
        hierarchyRole: 'head_of_department',
      })
      .distinct('_id');

    if (hodIds.length === 0) return [];

    // Confirmed: both employee_in_progress (HoD still
    // self-assessing) AND manager_in_progress (awaiting the
    // tenant) are returned — the panel itself distinguishes which
    // rows are CLICKABLE (only manager_in_progress) from which are
    // shown read-only for context (employee_in_progress). Filtering
    // server-side to ONLY manager_in_progress would lose that
    // context the panel intentionally shows.
    return this.reviewModel
      .find({
        employeeId: { $in: hodIds },
        status: {
          $in: [
            ReviewStatus.EMPLOYEE_IN_PROGRESS,
            ReviewStatus.MANAGER_IN_PROGRESS,
          ],
        },
      })
      .sort({ employeeSubmittedAt: 1 })
      .lean() as any;
  }

  async getReviewForReviewer(
    callerUserId: string,
    reviewId: string,
  ): Promise<PerformanceReviewDocument> {
    const review = await this.reviewModel.findById(reviewId);
    if (!review) throw new NotFoundException('Performance review not found');

    await this.assertIsCurrentReviewerOf(callerUserId, review);

    return review;
  }

  async getReviewHistoryForEmployee(
    tenantId: string,
    employeeId: string,
  ): Promise<ScoredReviewSummary[]> {
    const reviews = await this.reviewModel
      .find({
        employeeId: new Types.ObjectId(employeeId),
        tenantId: new Types.ObjectId(tenantId),
        status: ReviewStatus.COMPLETED,
      })
      .sort({ managerSignedAt: -1 })
      .lean();

    return reviews.map((review) => ({
      ...review,
      scores: {
        kpiSection: this.scoringService.scoreKpiSection(review.kpis),
        competencySection: this.scoringService.scoreFrameworkSection(
          review.competencies,
        ),
        valuesSection: this.scoringService.scoreFrameworkSection(review.values),
      },
    })) as ScoredReviewSummary[];
  }

  private applyScores(
    lines: {
      key: string;
      employeeScore?: any;
      managerScore?: any;
      employeeComment?: any;
      managerObservation?: any;
    }[],
    scores: { key: string; score?: number; comment?: string }[],
    side: 'employee' | 'manager',
  ): void {
    const byKey = new Map(lines.map((l) => [l.key, l]));
    for (const s of scores) {
      const line = byKey.get(s.key);
      if (!line) continue;
      if (side === 'employee') {
        if (s.score !== undefined) line.employeeScore = s.score;
        if (s.comment !== undefined && 'employeeComment' in line)
          line.employeeComment = s.comment;
      } else {
        if (s.score !== undefined) line.managerScore = s.score;
        if (s.comment !== undefined && 'managerObservation' in line)
          line.managerObservation = s.comment;
      }
    }
  }

  private async assertIsCurrentReviewerOf(
    callerUserId: string,
    review: PerformanceReviewDocument,
  ): Promise<void> {
    const subject = await this.employeeModel.findById(review.employeeId);
    if (!subject) {
      throw new NotFoundException('The employee on this review was not found.');
    }

    if (subject.hierarchyRole === 'head_of_department') {
      const isTheirTenant =
        subject.reportsToTenantId &&
        subject.reportsToTenantId.toString() === callerUserId;

      if (!isTheirTenant) {
        throw new ForbiddenException(
          "Only this Head of Department's tenant can review them.",
        );
      }
      return;
    }

    const caller = await this.employeeModel.findOne({
      userId: new Types.ObjectId(callerUserId),
    });
    if (!caller) {
      throw new ForbiddenException(
        "Only this employee's reviewer can do this.",
      );
    }

    const isRealReviewer =
      subject.reportsToManagerId &&
      subject.reportsToManagerId.toString() ===
        (caller._id as Types.ObjectId).toString();

    if (!isRealReviewer) {
      throw new ForbiddenException(
        "You are not currently this employee's manager.",
      );
    }
  }

  private hideAggregates(
    section: ReturnType<PerformanceScoringService['scoreKpiSection']>,
  ) {
    return {
      ...section,
      lines: section.lines.map((line) => ({
        ...line,
        combinedAverage: null,
        weightedScore: null,
      })),
      employeeAverage: null,
      managerAverage: null,
      totalWeightedScore: null,
      ratingBand: '—',
    };
  }

  private hideFrameworkAggregates(
    section: ReturnType<PerformanceScoringService['scoreFrameworkSection']>,
  ) {
    return {
      ...section,
      lines: section.lines.map((line) => ({ ...line, combinedAverage: null })),
      overallScore: null,
      ratingBand: '—',
    };
  }
}
