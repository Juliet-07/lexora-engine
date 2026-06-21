import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
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
} from '../schemas';
import { PerformanceScoringService } from '../services';
import {
  UpdateEmployeeReviewSectionDto,
  UpdateManagerReviewSectionDto,
} from '../dtos/performance.dto';

@Injectable()
export class PerformanceReviewService {
  constructor(
    @InjectModel(PerformanceReview.name)
    private readonly reviewModel: Model<PerformanceReviewDocument>,
    @InjectModel(ReviewCycle.name)
    private readonly cycleModel: Model<ReviewCycleDocument>,
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
    return {
      kpiSection: this.scoringService.scoreKpiSection(review.kpis),
      competencySection: this.scoringService.scoreFrameworkSection(
        review.competencies,
      ),
      valuesSection: this.scoringService.scoreFrameworkSection(review.values),
    };
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

    if (dto.kpiScores) this.applyScores(review.kpis, dto.kpiScores, 'employee');
    if (dto.competencyScores)
      this.applyScores(review.competencies, dto.competencyScores, 'employee');
    if (dto.valuesScores)
      this.applyScores(review.values, dto.valuesScores, 'employee');

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
    tenantId: string,
    reviewId: string,
    dto: UpdateManagerReviewSectionDto,
  ): Promise<PerformanceReviewDocument> {
    const review = await this.getReviewById(tenantId, reviewId);

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

    if (dto.kpiScores) this.applyScores(review.kpis, dto.kpiScores, 'manager');
    if (dto.competencyScores)
      this.applyScores(review.competencies, dto.competencyScores, 'manager');
    if (dto.valuesScores)
      this.applyScores(review.values, dto.valuesScores, 'manager');

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
    return review;
  }

  async completeReview(
    tenantId: string,
    reviewId: string,
    signedBy: string,
  ): Promise<PerformanceReviewDocument> {
    const review = await this.getReviewById(tenantId, reviewId);

    if (review.status !== ReviewStatus.MANAGER_IN_PROGRESS) {
      throw new ConflictException(
        review.status === ReviewStatus.COMPLETED
          ? 'This review is already completed.'
          : 'The employee has not yet submitted their self-assessment.',
      );
    }

    review.status = ReviewStatus.COMPLETED;
    review.managerSignedAt = new Date();
    review.managerSignedBy = new Types.ObjectId(signedBy);
    await review.save();

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
}
