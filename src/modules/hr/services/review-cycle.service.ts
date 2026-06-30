import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ReviewCycle,
  ReviewCycleDocument,
  ReviewCycleStatus,
  PerformanceReview,
  PerformanceReviewDocument,
  ReviewStatus,
  Employee,
  EmployeeDocument,
  DEFAULT_COMPLIANCE_CHECKLIST,
} from '../schemas';
import {
  KpiTemplateService,
  FrameworkService,
  PerformanceScoringService,
} from '../services';
import { CreateReviewCycleDto } from '../dtos';

@Injectable()
export class ReviewCycleService {
  constructor(
    @InjectModel(ReviewCycle.name)
    private readonly cycleModel: Model<ReviewCycleDocument>,
    @InjectModel(PerformanceReview.name)
    private readonly reviewModel: Model<PerformanceReviewDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly kpiTemplateService: KpiTemplateService,
    private readonly frameworkService: FrameworkService,
    private readonly scoringService: PerformanceScoringService,
  ) {}

  async createCycle(
    tenantId: string,
    dto: CreateReviewCycleDto,
    allowProbationEmployee = false,
  ): Promise<ReviewCycleDocument> {
    const tId = new Types.ObjectId(tenantId);

    const excludedStatuses = allowProbationEmployee
      ? ['terminated', 'resigned']
      : ['terminated', 'resigned', 'probation'];

    const employeeQuery: any = {
      tenantId: tId,
      employmentStatus: { $nin: excludedStatuses },
    };
    if (dto.employeeId) {
      employeeQuery._id = new Types.ObjectId(dto.employeeId);
    } else {
      if (dto.locationId)
        employeeQuery.locationId = new Types.ObjectId(dto.locationId);
      if (dto.teamId) employeeQuery.teamId = new Types.ObjectId(dto.teamId);
    }

    const employees = await this.employeeModel
      .find(employeeQuery)
      .populate('reportsToManagerId', 'firstName lastName')
      .lean();

    if (employees.length === 0) {
      throw new BadRequestException(
        dto.employeeId
          ? 'Employee not found or not eligible for review (check employment status).'
          : 'No active employees found for this scope.',
      );
    }

    const cycle = await this.cycleModel.create({
      tenantId: tId,
      name: dto.name,
      periodStart: new Date(dto.periodStart),
      periodEnd: new Date(dto.periodEnd),
      reviewDate: new Date(dto.reviewDate),
      locationId: dto.locationId ? new Types.ObjectId(dto.locationId) : null,
      teamId: dto.teamId ? new Types.ObjectId(dto.teamId) : null,
      status: ReviewCycleStatus.DRAFT,
    });

    await this.generateReviewsForCycle(cycle, employees as any, tenantId);
    return this.refreshCycleCounts(cycle._id.toString());
  }

  async openCycle(
    tenantId: string,
    cycleId: string,
  ): Promise<ReviewCycleDocument> {
    const cycle = await this.getCycleOrThrow(tenantId, cycleId);
    if (cycle.status !== ReviewCycleStatus.DRAFT) {
      throw new ConflictException('Only draft cycles can be opened.');
    }
    cycle.status = ReviewCycleStatus.OPEN;
    await cycle.save();
    return cycle;
  }

  async closeCycle(
    tenantId: string,
    cycleId: string,
  ): Promise<ReviewCycleDocument> {
    const cycle = await this.getCycleOrThrow(tenantId, cycleId);
    cycle.status = ReviewCycleStatus.CLOSED;
    await cycle.save();
    return cycle;
  }

  async getAllCycles(tenantId: string): Promise<ReviewCycleDocument[]> {
    return this.cycleModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .populate('locationId', 'name country')
      .populate('teamId', 'name')
      .sort({ periodStart: -1 })
      .lean() as any;
  }

  async getCycleDetail(tenantId: string, cycleId: string) {
    const cycle = await this.getCycleOrThrow(tenantId, cycleId);
    const reviews = await this.reviewModel
      .find({ reviewCycleId: cycle._id })
      .sort({ employeeName: 1 })
      .lean();

    const enrichedReviews = reviews.map((review) => ({
      ...review,
      scores:
        review.status === ReviewStatus.COMPLETED
          ? {
              kpiSection: this.scoringService.scoreKpiSection(review.kpis),
              competencySection: this.scoringService.scoreFrameworkSection(
                review.competencies,
              ),
              valuesSection: this.scoringService.scoreFrameworkSection(
                review.values,
              ),
            }
          : null,
    }));

    return { cycle, reviews: enrichedReviews };
  }

  async discardDraftCycle(tenantId: string, cycleId: string): Promise<void> {
    const cycle = await this.getCycleOrThrow(tenantId, cycleId);
    if (cycle.status !== ReviewCycleStatus.DRAFT) {
      throw new ConflictException('Only draft cycles can be discarded.');
    }
    await this.reviewModel.deleteMany({ reviewCycleId: cycle._id });
    await this.cycleModel.deleteOne({ _id: cycle._id });
  }

  private async getCycleOrThrow(
    tenantId: string,
    cycleId: string,
  ): Promise<ReviewCycleDocument> {
    const cycle = await this.cycleModel.findOne({
      _id: cycleId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!cycle) throw new NotFoundException('Review cycle not found');
    return cycle;
  }

  async retrySkippedEmployees(
    tenantId: string,
    cycleId: string,
  ): Promise<{
    cycle: ReviewCycleDocument;
    recovered: number;
    stillSkipped: number;
  }> {
    const cycle = await this.getCycleOrThrow(tenantId, cycleId);

    if (cycle.skippedEmployees.length === 0) {
      return { cycle, recovered: 0, stillSkipped: 0 };
    }

    // CLOSED cycles are excluded — confirmed: cycles are meant to be
    // finished business once closed, matching how closeCycle()
    // already treats status as a real lifecycle boundary elsewhere.
    // DRAFT and OPEN are both allowed per the confirmed answer.
    if (cycle.status === ReviewCycleStatus.CLOSED) {
      throw new ConflictException(
        'This cycle is closed. Reopen it, or create a new cycle for these employees.',
      );
    }

    const employeeIds = cycle.skippedEmployees.map((s) => s.employeeId);
    const employees = await this.employeeModel
      .find({ _id: { $in: employeeIds } })
      .lean();

    const competencyFramework =
      await this.frameworkService.getOrCreateCompetencies(tenantId);
    const valuesFramework =
      await this.frameworkService.getOrCreateValues(tenantId);

    const stillSkipped: {
      employeeId: Types.ObjectId;
      employeeName: string;
      reason: string;
    }[] = [];
    let recovered = 0;

    for (const employee of employees) {
      try {
        // SAME private method createCycle() already calls — no
        // duplicated KPI-lookup or review-building logic.
        await this.generateReviewForEmployee(
          cycle,
          employee as any,
          tenantId,
          competencyFramework,
          valuesFramework,
        );
        recovered++;
      } catch (err: any) {
        stillSkipped.push({
          employeeId: employee._id as Types.ObjectId,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          reason: err?.message ?? 'Unknown error while generating review.',
        });
      }
    }

    // REPLACE the skipped list entirely with whatever's STILL
    // failing — anyone who succeeded this time is simply gone from
    // it, no separate "recovered" log kept on the cycle itself
    // (the recovered COUNT is returned to the caller for a one-time
    // toast message; it's not persisted as cycle state, since once
    // someone has a real review, their presence IN that reviews
    // list IS the record of their recovery — no need for a second,
    // redundant record of the same fact).
    cycle.skippedEmployees = stillSkipped;
    cycle.employeeCount += recovered;
    await cycle.save();

    return { cycle, recovered, stillSkipped: stillSkipped.length };
  }

  async deleteCycle(tenantId: string, cycleId: string): Promise<void> {
    const cycle = await this.getCycleOrThrow(tenantId, cycleId);

    await this.reviewModel.deleteMany({ reviewCycleId: cycle._id });
    await this.cycleModel.deleteOne({ _id: cycle._id });
  }

  private async generateReviewsForCycle(
    cycle: ReviewCycleDocument,
    employees: EmployeeDocument[],
    tenantId: string,
  ): Promise<void> {
    const competencyFramework =
      await this.frameworkService.getOrCreateCompetencies(tenantId);
    const valuesFramework =
      await this.frameworkService.getOrCreateValues(tenantId);

    const skipped: {
      employeeId: Types.ObjectId;
      employeeName: string;
      reason: string;
    }[] = [];

    for (const employee of employees) {
      try {
        await this.generateReviewForEmployee(
          cycle,
          employee,
          tenantId,
          competencyFramework,
          valuesFramework,
        );
      } catch (err: any) {
        skipped.push({
          employeeId: employee._id as Types.ObjectId,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          reason: err?.message ?? 'Unknown error while generating review.',
        });
      }
    }

    if (skipped.length > 0) {
      await this.cycleModel.findByIdAndUpdate(cycle._id, {
        $set: { skippedEmployees: skipped },
      });
    }
  }

  private async generateReviewForEmployee(
    cycle: ReviewCycleDocument,
    employee: EmployeeDocument,
    tenantId: string,
    competencyFramework: any,
    valuesFramework: any,
  ): Promise<void> {
    const kpiTemplate = await this.kpiTemplateService.getTemplateForJobTitle(
      tenantId,
      employee.jobTitle,
    );
    if (!kpiTemplate || kpiTemplate.kpis.length === 0) {
      throw new BadRequestException(
        `No KPI template configured for job title "${employee.jobTitle}". Set one up before including this employee.`,
      );
    }

    const teamLead =
      employee.teamId && typeof employee.teamId === 'object'
        ? (employee.teamId as any).lead
        : null;

    const reportsToManager =
      employee.reportsToManagerId &&
      typeof employee.reportsToManagerId === 'object' &&
      'firstName' in employee.reportsToManagerId
        ? (employee.reportsToManagerId as any)
        : null;
    const managerName = reportsToManager
      ? `${reportsToManager.firstName} ${reportsToManager.lastName}`
      : null;

    await this.reviewModel.create({
      reviewCycleId: cycle._id,
      employeeId: employee._id,
      tenantId: cycle.tenantId,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      jobTitle: employee.jobTitle,
      department: null,
      managerName: managerName ?? teamLead ?? null,
      status: ReviewStatus.EMPLOYEE_IN_PROGRESS,
      complianceChecks: DEFAULT_COMPLIANCE_CHECKLIST.map((c) => ({
        key: c.key,
        label: c.label,
        answer: null,
        date: null,
        notes: null,
      })),
      kpis: kpiTemplate.kpis.map((k: any) => ({
        key: k.key,
        title: k.title,
        performanceStandard: k.performanceStandard,
        weight: k.weight,
        employeeScore: null,
        managerScore: null,
      })),
      competencies: competencyFramework.items.map((i: any) => ({
        key: i.key,
        title: i.title,
        description: i.description,
        employeeScore: null,
        employeeComment: null,
        managerScore: null,
        managerObservation: null,
      })),
      values: valuesFramework.items.map((i: any) => ({
        key: i.key,
        title: i.title,
        description: i.description,
        employeeScore: null,
        employeeComment: null,
        managerScore: null,
        managerObservation: null,
      })),
    });
  }

  private async refreshCycleCounts(
    cycleId: string,
  ): Promise<ReviewCycleDocument> {
    const reviews = await this.reviewModel.find({
      reviewCycleId: new Types.ObjectId(cycleId),
    });
    const completedCount = reviews.filter(
      (r) => r.status === ReviewStatus.COMPLETED,
    ).length;
    const updated = await this.cycleModel.findByIdAndUpdate(
      cycleId,
      { $set: { employeeCount: reviews.length, completedCount } },
      { new: true },
    );
    return updated!;
  }
}
