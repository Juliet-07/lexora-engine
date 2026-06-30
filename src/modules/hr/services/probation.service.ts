import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ProbationRecord,
  ProbationRecordDocument,
  ProbationStageType,
  ProbationStageStatus,
  ProbationRecordStatus,
  ProbationOutcome,
} from '../schemas/probation.schema';
import { Employee, EmployeeDocument } from '../schemas';
import { EmployeeService } from './employee.service';
import { ReviewCycleService } from './review-cycle.service';
import { PerformanceReviewDocument } from '../schemas';
import { OnEvent } from '@nestjs/event-emitter';

const EXTENSION_DAYS = 60;

const DUE_WINDOWS: Record<string, [number, number]> = {
  [ProbationStageType.ONBOARDING]: [0, 0],
  [ProbationStageType.MONTH_1]: [25, 30],
  [ProbationStageType.MONTH_2]: [55, 60],
  [ProbationStageType.MONTH_3]: [80, 85],
  [ProbationStageType.FINAL_DECISION]: [85, 90],
};

const STAGE_ORDER = [
  ProbationStageType.ONBOARDING,
  ProbationStageType.MONTH_1,
  ProbationStageType.MONTH_2,
  ProbationStageType.MONTH_3,
  ProbationStageType.FINAL_DECISION,
];

@Injectable()
export class ProbationService {
  constructor(
    @InjectModel(ProbationRecord.name)
    private readonly probationModel: Model<ProbationRecordDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly employeeService: EmployeeService,
    private readonly reviewCycleService: ReviewCycleService,
  ) {}

  async createProbationRecord(
    tenantId: string,
    employeeId: string,
    probationEndDate: Date,
  ): Promise<ProbationRecordDocument> {
    const existing = await this.probationModel.findOne({
      employeeId: new Types.ObjectId(employeeId),
    });
    if (existing) {
      return existing;
    }

    const stages = STAGE_ORDER.map((type) => ({
      type,
      status: ProbationStageStatus.PENDING,
      completedAt: null,
      completedBy: null,
      objectives: null,
      progressNote: null,
      note: null,
      decision: null,
      linkedReviewId: null,
    }));

    return this.probationModel.create({
      employeeId: new Types.ObjectId(employeeId),
      tenantId: new Types.ObjectId(tenantId),
      status: ProbationRecordStatus.IN_PROGRESS,
      stages,
      originalProbationEndDate: probationEndDate,
    });
  }

  // ===============================================================
  // READ
  // ===============================================================

  async getForEmployee(
    tenantId: string,
    employeeId: string,
  ): Promise<ProbationRecordDocument> {
    const record = await this.probationModel.findOne({
      employeeId: new Types.ObjectId(employeeId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!record)
      throw new NotFoundException(
        'No probation record found for this employee.',
      );
    return record;
  }

  async getAllInProgress(tenantId: string): Promise<ProbationRecordDocument[]> {
    return this.probationModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        status: {
          $in: [
            ProbationRecordStatus.IN_PROGRESS,
            ProbationRecordStatus.EXTENDED,
          ],
        },
      })
      .sort({ createdAt: 1 })
      .lean() as any;
  }

  async getForMyDirectReports(
    managerUserId: string,
  ): Promise<ProbationRecordDocument[]> {
    const manager = await this.employeeModel.findOne({
      userId: new Types.ObjectId(managerUserId),
    });
    if (!manager) return [];

    const reportIds = await this.employeeModel
      .find({ reportsToManagerId: manager._id })
      .distinct('_id');

    if (reportIds.length === 0) return [];

    return this.probationModel
      .find({
        employeeId: { $in: reportIds },
        status: {
          $in: [
            ProbationRecordStatus.IN_PROGRESS,
            ProbationRecordStatus.EXTENDED,
          ],
        },
      })
      .sort({ createdAt: 1 })
      .lean() as any;
  }

  // ===============================================================
  // DUE-WINDOW CALCULATION - pure function, never stored, always
  // computed live from the employee's REAL startDate.
  // ===============================================================

  computeDueWindow(
    startDate: Date,
    stageType: ProbationStageType,
  ): { dueFrom: Date; dueTo: Date; isOverdue: boolean; isDue: boolean } {
    const [fromDays, toDays] = DUE_WINDOWS[stageType];
    const dueFrom = addDays(startDate, fromDays);
    const dueTo = addDays(startDate, toDays);
    const now = new Date();

    return {
      dueFrom,
      dueTo,
      isDue: now >= dueFrom && now <= dueTo,
      isOverdue: now > dueTo,
    };
  }

  async getEnrichedRecord(tenantId: string, employeeId: string) {
    const [record, employee] = await Promise.all([
      this.getForEmployee(tenantId, employeeId),
      this.employeeModel
        .findById(employeeId)
        .select('startDate firstName lastName')
        .lean(),
    ]);
    if (!employee) throw new NotFoundException('Employee not found.');

    const enrichedStages = record.stages.map((stage) => ({
      ...(stage as any).toObject(),
      ...this.computeDueWindow(
        (employee as any).startDate,
        stage.type as ProbationStageType,
      ),
    }));

    return { record, employee, stages: enrichedStages };
  }

  // ===============================================================
  // SEQUENTIAL GATING
  // ===============================================================

  private assertPriorStagesComplete(
    record: ProbationRecordDocument,
    stageType: ProbationStageType,
  ): void {
    const targetIndex = STAGE_ORDER.indexOf(stageType);
    for (let i = 0; i < targetIndex; i++) {
      const priorType = STAGE_ORDER[i];
      const priorStage = record.stages.find((s) => s.type === priorType);
      if (!priorStage || priorStage.status !== ProbationStageStatus.COMPLETED) {
        throw new BadRequestException(
          `Cannot complete this stage - "${priorType}" must be completed first.`,
        );
      }
    }
  }

  private getStageOrThrow(
    record: ProbationRecordDocument,
    stageType: ProbationStageType,
  ) {
    const stage = record.stages.find((s) => s.type === stageType);
    if (!stage)
      throw new NotFoundException(
        `Stage "${stageType}" not found on this record.`,
      );
    if (stage.status === ProbationStageStatus.COMPLETED) {
      throw new ConflictException(`"${stageType}" has already been completed.`);
    }
    return stage;
  }

  // ===============================================================
  // SHARED MANAGER-RELATIONSHIP GUARD - the SAME check, used by
  // EVERY manager-facing completion method below (Onboarding,
  // Month 1, Month 2, Month 3-start). Returns the verified subject
  // Employee document so callers can read tenantId off it directly,
  // rather than trusting a separately-passed tenantId param that a
  // caller could mismatch.
  // ===============================================================

  private async assertIsCurrentManagerOf(
    managerUserId: string,
    employeeId: string,
  ): Promise<EmployeeDocument> {
    const manager = await this.employeeModel.findOne({
      userId: new Types.ObjectId(managerUserId),
    });
    if (!manager)
      throw new ForbiddenException("Only this employee's manager can do this.");

    const subject = await this.employeeModel.findById(employeeId);
    if (!subject) throw new NotFoundException('Employee not found.');

    const isRealManager =
      subject.reportsToManagerId &&
      subject.reportsToManagerId.toString() ===
        (manager._id as Types.ObjectId).toString();

    if (!isRealManager) {
      throw new ForbiddenException(
        "You are not currently this employee's manager.",
      );
    }
    return subject;
  }

  // ===============================================================
  // ONBOARDING - REQUIRED objectives + success measures.
  // CORRECTED SIGNATURE: (employeeId, managerUserId, dto) - matches
  // completeMonth1()'s already-correct shape. tenantId is no longer
  // a separate trusted parameter; it's read off the VERIFIED
  // subject returned by the manager guard.
  // ===============================================================

  async completeOnboarding(
    employeeId: string,
    managerUserId: string,
    dto: { objectives: string; successMeasures?: string },
  ): Promise<ProbationRecordDocument> {
    if (!dto.objectives?.trim()) {
      throw new BadRequestException(
        'Objectives are required to complete onboarding.',
      );
    }

    const subject = await this.assertIsCurrentManagerOf(
      managerUserId,
      employeeId,
    );
    const record = await this.getForEmployee(
      subject.tenantId.toString(),
      employeeId,
    );
    this.assertPriorStagesComplete(record, ProbationStageType.ONBOARDING);
    const stage = this.getStageOrThrow(record, ProbationStageType.ONBOARDING);

    stage.objectives = {
      objectives: dto.objectives,
      successMeasures: dto.successMeasures ?? null,
    };
    stage.status = ProbationStageStatus.COMPLETED;
    stage.completedAt = new Date();
    stage.completedBy = new Types.ObjectId(managerUserId);

    await record.save();
    return record;
  }

  // ===============================================================
  // MONTH 1 - optional note only, never required. (Already correct
  // — unchanged from your pasted file.)
  // ===============================================================

  async completeMonth1(
    employeeId: string,
    managerUserId: string,
    dto: { note?: string },
  ): Promise<ProbationRecordDocument> {
    const subject = await this.assertIsCurrentManagerOf(
      managerUserId,
      employeeId,
    );
    const record = await this.getForEmployee(
      subject.tenantId.toString(),
      employeeId,
    );
    this.assertPriorStagesComplete(record, ProbationStageType.MONTH_1);
    const stage = this.getStageOrThrow(record, ProbationStageType.MONTH_1);

    stage.note = dto.note ?? null;
    stage.status = ProbationStageStatus.COMPLETED;
    stage.completedAt = new Date();
    stage.completedBy = new Types.ObjectId(managerUserId);

    await record.save();
    return record;
  }

  // ===============================================================
  // MONTH 2 - REQUIRED written progress note.
  // CORRECTED SIGNATURE: (employeeId, managerUserId, dto) - SAME fix
  // as Onboarding above.
  // ===============================================================

  async completeMonth2(
    employeeId: string,
    managerUserId: string,
    dto: { progressNote: string },
  ): Promise<ProbationRecordDocument> {
    if (!dto.progressNote?.trim()) {
      throw new BadRequestException(
        'A written progress note is required to complete Month 2.',
      );
    }

    const subject = await this.assertIsCurrentManagerOf(
      managerUserId,
      employeeId,
    );
    const record = await this.getForEmployee(
      subject.tenantId.toString(),
      employeeId,
    );
    this.assertPriorStagesComplete(record, ProbationStageType.MONTH_2);
    const stage = this.getStageOrThrow(record, ProbationStageType.MONTH_2);

    stage.progressNote = dto.progressNote;
    stage.status = ProbationStageStatus.COMPLETED;
    stage.completedAt = new Date();
    stage.completedBy = new Types.ObjectId(managerUserId);

    await record.save();
    return record;
  }

  // ===============================================================
  // MONTH 3 - generates a single-employee ReviewCycle.
  // CORRECTED SIGNATURE: (employeeId, managerUserId) - SAME fix.
  // ===============================================================

  async startMonth3Evaluation(employeeId: string, managerUserId: string) {
    const subject = await this.assertIsCurrentManagerOf(
      managerUserId,
      employeeId,
    );
    const tenantId = subject.tenantId.toString();
    const record = await this.getForEmployee(tenantId, employeeId);
    this.assertPriorStagesComplete(record, ProbationStageType.MONTH_3);

    const month3 = record.stages.find(
      (s) => s.type === ProbationStageType.MONTH_3,
    );
    if (!month3) throw new NotFoundException('Month 3 stage not found.');
    if (month3.status === ProbationStageStatus.COMPLETED) {
      throw new ConflictException('Month 3 has already been completed.');
    }
    if (month3.linkedReviewId) {
      throw new ConflictException(
        'A Month 3 evaluation has already been started for this employee.',
      );
    }

    const employee = await this.employeeModel
      .findById(employeeId)
      .select('startDate')
      .lean();
    if (!employee) throw new NotFoundException('Employee not found.');

    const cycle = await this.reviewCycleService.createCycle(
      tenantId,
      {
        name: `Probation Month 3 Evaluation`,
        employeeId,
        periodStart: (employee as any).startDate,
        periodEnd: new Date(),
        reviewDate: new Date(),
      } as any,
      true,
    );

    const { reviews } = await this.reviewCycleService.getCycleDetail(
      tenantId,
      cycle._id.toString(),
    );
    if (reviews.length === 0) {
      throw new BadRequestException(
        "No review could be generated - check that a KPI template exists for this employee's job title.",
      );
    }

    month3.linkedReviewId = reviews[0]._id as any;
    await record.save();

    await this.reviewCycleService.openCycle(tenantId, cycle._id.toString());

    return cycle;
  }

  // ===============================================================
  // THE HOOK - called BY PerformanceReviewService.completeReview().
  // Prepares a RECOMMENDATION only - never executes anything.
  // ===============================================================

  async recordMonth3Recommendation(
    review: PerformanceReviewDocument,
    ratingBand: string,
    managerUserId: string,
    managerReasoning: string,
  ): Promise<void> {
    const record = await this.probationModel.findOne({
      employeeId: review.employeeId,
      'stages.linkedReviewId': review._id,
    });
    if (!record) return;

    const month3 = record.stages.find(
      (s) =>
        s.type === ProbationStageType.MONTH_3 &&
        s.linkedReviewId?.toString() ===
          (review._id as Types.ObjectId).toString(),
    );
    if (!month3 || month3.status === ProbationStageStatus.COMPLETED) return;

    const normalizedBand = ratingBand.toLowerCase();
    const suggestedOutcome: ProbationOutcome =
      normalizedBand === 'unsatisfactory'
        ? ProbationOutcome.TERMINATE
        : normalizedBand === 'needs improvement'
          ? ProbationOutcome.EXTEND
          : ProbationOutcome.CONFIRM;

    month3.recommendation = {
      suggestedOutcome,
      basedOnRatingBand: ratingBand,
      managerReasoning,
      reviewId: review._id as Types.ObjectId,
      preparedBy: new Types.ObjectId(managerUserId),
      preparedAt: new Date(),
    } as any;

    month3.status = ProbationStageStatus.COMPLETED;
    month3.completedAt = new Date();
    month3.completedBy = new Types.ObjectId(managerUserId);

    await record.save();
  }

  // ===============================================================
  // FINAL DECISION - HR-only, the ONLY place confirm/extend/
  // terminate truly execute.
  // ===============================================================

  async recordFinalDecision(
    tenantId: string,
    employeeId: string,
    hrUserId: string,
    dto: {
      outcome: ProbationOutcome;
      agreedWithRecommendation: boolean;
      extensionReason?: string;
      revisedObjectives?: string;
    },
  ): Promise<ProbationRecordDocument> {
    const record = await this.getForEmployee(tenantId, employeeId);

    const month3 = record.stages.find(
      (s) => s.type === ProbationStageType.MONTH_3,
    );
    if (
      !month3 ||
      month3.status !== ProbationStageStatus.COMPLETED ||
      !month3.recommendation
    ) {
      throw new BadRequestException(
        'Month 3 evaluation and recommendation must be completed before a final decision can be recorded.',
      );
    }

    const finalDecision = this.getStageOrThrow(
      record,
      ProbationStageType.FINAL_DECISION,
    );

    if (dto.outcome === ProbationOutcome.EXTEND) {
      if (!dto.extensionReason?.trim() || !dto.revisedObjectives?.trim()) {
        throw new BadRequestException(
          'An extension requires both a reason and revised objectives.',
        );
      }
    }

    finalDecision.status = ProbationStageStatus.COMPLETED;
    finalDecision.completedAt = new Date();
    finalDecision.completedBy = new Types.ObjectId(hrUserId);
    finalDecision.decision = {
      outcome: dto.outcome,
      agreedWithRecommendation: dto.agreedWithRecommendation,
      extendedEndDate:
        dto.outcome === ProbationOutcome.EXTEND
          ? addDays(new Date(), EXTENSION_DAYS)
          : null,
      extensionReason:
        dto.outcome === ProbationOutcome.EXTEND ? dto.extensionReason : null,
      revisedObjectives:
        dto.outcome === ProbationOutcome.EXTEND ? dto.revisedObjectives : null,
      terminationTriggered: dto.outcome === ProbationOutcome.TERMINATE,
      decidedBy: new Types.ObjectId(hrUserId),
      decidedAt: new Date(),
    } as any;

    record.status =
      dto.outcome === ProbationOutcome.CONFIRM
        ? ProbationRecordStatus.CONFIRMED
        : dto.outcome === ProbationOutcome.EXTEND
          ? ProbationRecordStatus.EXTENDED
          : ProbationRecordStatus.TERMINATED;

    await record.save();

    if (dto.outcome === ProbationOutcome.CONFIRM) {
      await this.employeeModel.findByIdAndUpdate(employeeId, {
        employmentStatus: 'active',
      });
    }

    if (dto.outcome === ProbationOutcome.TERMINATE) {
      await this.employeeService.terminateEmployee(tenantId, employeeId, {
        status: 'terminated',
        endDate: new Date().toISOString(),
        reason:
          'Did not pass probation (HR final decision, Month 3 evaluation).',
      } as any);
    }

    return record;
  }

  async isLinkedToProbation(reviewId: string): Promise<boolean> {
    const count = await this.probationModel.countDocuments({
      'stages.linkedReviewId': new Types.ObjectId(reviewId),
    });
    return count > 0;
  }

  async getAllInProgressEnriched(tenantId: string) {
    const records = await this.probationModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        status: {
          $in: [
            ProbationRecordStatus.IN_PROGRESS,
            ProbationRecordStatus.EXTENDED,
          ],
        },
      })
      .sort({ createdAt: 1 })
      .lean();

    if (records.length === 0) return [];

    const employeeIds = records.map((r) => r.employeeId);
    const employees = await this.employeeModel
      .find({ _id: { $in: employeeIds } })
      .select('firstName lastName jobTitle teamId startDate reportsToManagerId')
      .populate('teamId', 'name')
      .populate('reportsToManagerId', 'firstName lastName')
      .lean();
    const employeeById = new Map(employees.map((e) => [e._id.toString(), e]));

    return records.map((record) => {
      const employee = employeeById.get(record.employeeId.toString());
      const stagesWithWindows = employee
        ? record.stages.map((stage) => ({
            ...stage,
            ...this.computeDueWindow(
              employee.startDate,
              stage.type as ProbationStageType,
            ),
          }))
        : record.stages;

      return {
        record: { ...record, stages: stagesWithWindows },
        employee: employee
          ? {
              _id: employee._id,
              firstName: employee.firstName,
              lastName: employee.lastName,
              jobTitle: employee.jobTitle,
              team: (employee.teamId as any)?.name ?? null,
              manager: employee.reportsToManagerId
                ? `${(employee.reportsToManagerId as any).firstName} ${(employee.reportsToManagerId as any).lastName}`
                : null,
            }
          : null,
      };
    });
  }

  async getMyProbation(userId: string) {
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) return null;

    const record = await this.probationModel.findOne({
      employeeId: employee._id,
    });
    if (!record) return null; // no probation record - NOT an error,
    // matches fetchMyProbation()'s original try/catch-to-null
    // pattern - an active (non-probation) employee calling this
    // should just get null, not a thrown exception.

    const stagesWithWindows = record.stages.map((stage) => ({
      ...(stage as any).toObject(),
      ...this.computeDueWindow(
        employee.startDate,
        stage.type as ProbationStageType,
      ),
    }));

    return { record, stages: stagesWithWindows };
  }

  async getForMyReport(managerUserId: string, employeeId: string) {
    const subject = await this.assertIsCurrentManagerOf(
      managerUserId,
      employeeId,
    );
    return this.getEnrichedRecord(subject.tenantId.toString(), employeeId);
  }

  @OnEvent('employee.probation.started')
  async handleProbationStarted(payload: {
    tenantId: string;
    employeeId: string;
    probationEndDate: Date;
  }) {
    await this.createProbationRecord(
      payload.tenantId,
      payload.employeeId,
      payload.probationEndDate,
    );
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
