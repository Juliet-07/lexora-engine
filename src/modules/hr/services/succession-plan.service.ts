import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SuccessionPlan,
  SuccessionPlanDocument,
  Employee,
  EmployeeDocument,
  OffboardingRecord,
  OffboardingRecordDocument,
  OffboardingStatus,
  BenchReadiness,
  DevelopmentMilestoneStatus,
} from '../schemas';
import {
  CreateSuccessionPlanDto,
  UpdateSuccessionPlanDto,
  AddSuccessorDto,
  RecordSuccessorAssessmentDto,
  CreateDevelopmentPlanDto,
  AddMilestoneDto,
  SetNextReviewDto,
  SetEmergencyCoverDto,
} from '../dtos';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PerformanceReviewService } from './performance-review.service';

const READINESS_RANK: Record<string, number> = {
  [BenchReadiness.READY_NOW]: 0,
  [BenchReadiness.READY_1_2_YEARS]: 1,
  [BenchReadiness.READY_3_PLUS_YEARS]: 2,
  [BenchReadiness.GAP]: 3,
};

@Injectable()
export class SuccessionPlanService {
  constructor(
    @InjectModel(SuccessionPlan.name)
    private readonly planModel: Model<SuccessionPlanDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(OffboardingRecord.name)
    private readonly offboardingModel: Model<OffboardingRecordDocument>,
    private readonly performanceReviewService: PerformanceReviewService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Tells SuccessionAlertService the tenant's plans changed so it can
  // re-evaluate alerts and calendar entries. An event rather than a
  // direct call: the alert service itself reads risk alerts from this
  // service, so injecting it here would be a circular dependency.
  private notifyChanged(tenantId: string): void {
    this.eventEmitter.emit('hr.succession.changed', { tenantId });
  }

  // ═══════════════════════════════════════════════════════════
  // CORE CRUD
  // ═══════════════════════════════════════════════════════════

  async getAll(tenantId: string): Promise<SuccessionPlanDocument[]> {
    const plans = await this.planModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
    return this.annotateExiting(tenantId, plans as any);
  }

  async getById(
    tenantId: string,
    planId: string,
  ): Promise<SuccessionPlanDocument> {
    const plan = await this.planModel.findOne({
      _id: planId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!plan) throw new NotFoundException('Succession plan not found');
    return plan;
  }

  // Marks a role's current holder as "exiting" when they have an
  // active (not yet completed/reversed) offboarding record — mirrors
  // the prototype's "Kwame Mensah (Exiting)" tag, driven by the real
  // offboarding module rather than a manually-set flag.
  private async annotateExiting(
    tenantId: string,
    plans: (SuccessionPlanDocument & { _id: any })[],
  ): Promise<any[]> {
    if (plans.length === 0) return plans;
    const holderIds = [...new Set(plans.map((p) => p.incumbentId.toString()))];
    const exiting = await this.offboardingModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        employeeId: { $in: holderIds.map((id) => new Types.ObjectId(id)) },
        status: {
          $in: [OffboardingStatus.NOT_STARTED, OffboardingStatus.IN_PROGRESS],
        },
      })
      .select('employeeId')
      .lean();
    const exitingSet = new Set(exiting.map((e) => e.employeeId.toString()));
    return plans.map((p) => ({
      ...p,
      holderExiting: exitingSet.has(p.incumbentId.toString()),
    }));
  }

  async create(
    tenantId: string,
    dto: CreateSuccessionPlanDto,
  ): Promise<SuccessionPlanDocument> {
    const incumbent = await this.employeeModel.findOne({
      _id: dto.incumbentId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!incumbent)
      throw new BadRequestException('Incumbent employee not found.');

    const created = await this.planModel.create({
      tenantId: new Types.ObjectId(tenantId),
      criticalRole: dto.criticalRole,
      department: dto.department ?? null,
      incumbentId: incumbent._id,
      incumbentName: `${incumbent.firstName} ${incumbent.lastName}`,
      businessImpact: dto.businessImpact ?? null,
      riskOfLoss: dto.riskOfLoss ?? 'medium',
      overallReadiness: dto.overallReadiness ?? 'gap',
      notes: dto.notes ?? null,
      successors: [],
    });
    this.notifyChanged(tenantId);
    return created;
  }

  async update(
    tenantId: string,
    planId: string,
    dto: UpdateSuccessionPlanDto,
  ): Promise<SuccessionPlanDocument> {
    const plan = await this.getById(tenantId, planId);
    if (dto.criticalRole !== undefined) plan.criticalRole = dto.criticalRole;
    if (dto.department !== undefined) plan.department = dto.department;
    if (dto.businessImpact !== undefined)
      plan.businessImpact = dto.businessImpact;
    if (dto.riskOfLoss !== undefined) plan.riskOfLoss = dto.riskOfLoss as any;
    if (dto.overallReadiness !== undefined)
      plan.overallReadiness = dto.overallReadiness as any;
    if (dto.notes !== undefined) plan.notes = dto.notes;
    await plan.save();
    this.notifyChanged(tenantId);
    return plan;
  }

  async delete(tenantId: string, planId: string): Promise<void> {
    const deleted = await this.planModel.findOneAndDelete({
      _id: planId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Succession plan not found');
    // The plan is gone, so its calendar entries must go with it.
    this.eventEmitter.emit('hr.succession.deleted', {
      tenantId,
      planId: String(deleted._id),
    });
    this.notifyChanged(tenantId);
  }

  // ═══════════════════════════════════════════════════════════
  // SUCCESSORS
  // ═══════════════════════════════════════════════════════════

  async addSuccessor(
    tenantId: string,
    planId: string,
    dto: AddSuccessorDto,
  ): Promise<SuccessionPlanDocument> {
    const plan = await this.getById(tenantId, planId);

    const employee = await this.employeeModel.findOne({
      _id: dto.employeeId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!employee) throw new BadRequestException('Employee not found.');

    if (
      plan.successors.some((s) => s.employeeId.toString() === dto.employeeId)
    ) {
      throw new BadRequestException(
        'This employee is already listed as a successor on this plan.',
      );
    }

    plan.successors.push({
      employeeId: employee._id as any,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      readiness: (dto.readiness as any) ?? 'gap',
      readinessPct: dto.readinessPct ?? 0,
      potential: (dto.potential as any) ?? 'medium',
      strengths: dto.strengths ?? null,
      gaps: dto.gaps ?? null,
      assessment: null,
      devPlan: null,
      notes: dto.notes ?? null,
    } as any);

    await plan.save();
    this.notifyChanged(tenantId);
    return plan;
  }

  async removeSuccessor(
    tenantId: string,
    planId: string,
    employeeId: string,
  ): Promise<SuccessionPlanDocument> {
    const plan = await this.getById(tenantId, planId);
    plan.successors = plan.successors.filter(
      (s) => s.employeeId.toString() !== employeeId,
    );
    await plan.save();
    this.notifyChanged(tenantId);
    return plan;
  }

  private findSuccessor(plan: SuccessionPlanDocument, employeeId: string) {
    const successor = plan.successors.find(
      (s) => s.employeeId.toString() === employeeId,
    );
    if (!successor) {
      throw new NotFoundException(
        'This employee is not listed as a successor on this plan.',
      );
    }
    return successor;
  }

  // ═══════════════════════════════════════════════════════════
  // READINESS ASSESSMENT
  // ═══════════════════════════════════════════════════════════

  async recordAssessment(
    tenantId: string,
    planId: string,
    employeeId: string,
    dto: RecordSuccessorAssessmentDto,
    assessedBy: string | null,
  ): Promise<SuccessionPlanDocument> {
    const plan = await this.getById(tenantId, planId);
    const successor = this.findSuccessor(plan, employeeId);

    successor.assessment = {
      technicalKnowledge: dto.technicalKnowledge ?? null,
      leadershipAbility: dto.leadershipAbility ?? null,
      strategicThinking: dto.strategicThinking ?? null,
      stakeholderManagement: dto.stakeholderManagement ?? null,
      industryKnowledge: dto.industryKnowledge ?? null,
      culturalFit: dto.culturalFit ?? null,
      comments: dto.comments ?? null,
      assessedAt: new Date(),
      assessedBy,
    } as any;

    await plan.save();
    this.notifyChanged(tenantId);
    return plan;
  }

  // ═══════════════════════════════════════════════════════════
  // DEVELOPMENT PLANS
  // ═══════════════════════════════════════════════════════════

  async createDevelopmentPlan(
    tenantId: string,
    planId: string,
    employeeId: string,
    dto: CreateDevelopmentPlanDto,
  ): Promise<SuccessionPlanDocument> {
    const plan = await this.getById(tenantId, planId);
    const successor = this.findSuccessor(plan, employeeId);

    if (successor.devPlan) {
      throw new BadRequestException(
        'This successor already has a development plan.',
      );
    }

    const startDate = new Date(dto.startDate);
    const targetDate = new Date(startDate);
    targetDate.setMonth(targetDate.getMonth() + dto.timelineMonths);

    successor.devPlan = {
      targetRole: dto.targetRole,
      timelineMonths: dto.timelineMonths,
      startDate,
      targetDate,
      objectives: dto.objectives ?? null,
      milestones: (dto.milestones ?? []).map((m) => ({
        item: m.item,
        dueDate: new Date(m.dueDate),
        status: DevelopmentMilestoneStatus.PENDING,
      })),
      nextReviewDate: null,
    } as any;

    this.recomputeReadinessPct(successor as any);
    await plan.save();
    this.notifyChanged(tenantId);
    return plan;
  }

  async addMilestone(
    tenantId: string,
    planId: string,
    employeeId: string,
    dto: AddMilestoneDto,
  ): Promise<SuccessionPlanDocument> {
    const plan = await this.getById(tenantId, planId);
    const successor = this.findSuccessor(plan, employeeId);
    if (!successor.devPlan) {
      throw new BadRequestException(
        'This successor has no development plan yet.',
      );
    }
    successor.devPlan.milestones.push({
      item: dto.item,
      dueDate: new Date(dto.dueDate),
      status: DevelopmentMilestoneStatus.PENDING,
    } as any);
    this.recomputeReadinessPct(successor as any);
    await plan.save();
    this.notifyChanged(tenantId);
    return plan;
  }

  async updateMilestoneStatus(
    tenantId: string,
    planId: string,
    employeeId: string,
    milestoneId: string,
    status: string,
  ): Promise<SuccessionPlanDocument> {
    const plan = await this.getById(tenantId, planId);
    const successor = this.findSuccessor(plan, employeeId);
    if (!successor.devPlan) {
      throw new BadRequestException(
        'This successor has no development plan yet.',
      );
    }
    const milestone = (successor.devPlan.milestones as any).id(milestoneId);
    if (!milestone) throw new NotFoundException('Milestone not found');
    milestone.status = status;
    this.recomputeReadinessPct(successor as any);
    await plan.save();
    this.notifyChanged(tenantId);
    return plan;
  }

  // Keeps the successor's headline readiness % in sync with how much
  // of their development plan is actually done, the same way the
  // prototype's role-list progress bar always matches the dev plan's
  // own percentage — computed server-side so the two can never drift
  // apart the way two independently-edited fields eventually would.
  private recomputeReadinessPct(successor: {
    devPlan: {
      milestones: { status: DevelopmentMilestoneStatus }[];
    } | null;
    readinessPct: number;
  }): void {
    if (!successor.devPlan || successor.devPlan.milestones.length === 0) {
      return;
    }
    const done = successor.devPlan.milestones.filter(
      (m) => m.status === DevelopmentMilestoneStatus.DONE,
    ).length;
    successor.readinessPct = Math.round(
      (done / successor.devPlan.milestones.length) * 100,
    );
  }

  async setDevPlanNextReview(
    tenantId: string,
    planId: string,
    employeeId: string,
    dto: SetNextReviewDto,
  ): Promise<SuccessionPlanDocument> {
    const plan = await this.getById(tenantId, planId);
    const successor = this.findSuccessor(plan, employeeId);
    if (!successor.devPlan) {
      throw new BadRequestException(
        'This successor has no development plan yet.',
      );
    }
    successor.devPlan.nextReviewDate = new Date(dto.nextReviewDate);
    await plan.save();
    this.notifyChanged(tenantId);
    return plan;
  }

  // ═══════════════════════════════════════════════════════════
  // EMERGENCY COVER & REVIEW SCHEDULING
  // ═══════════════════════════════════════════════════════════

  async setEmergencyCover(
    tenantId: string,
    planId: string,
    dto: SetEmergencyCoverDto,
  ): Promise<SuccessionPlanDocument> {
    const plan = await this.getById(tenantId, planId);
    if (dto.interimCoverId !== undefined) {
      if (dto.interimCoverId) {
        const employee = await this.employeeModel.findOne({
          _id: dto.interimCoverId,
          tenantId: new Types.ObjectId(tenantId),
        });
        if (!employee) throw new BadRequestException('Employee not found.');
        plan.interimCoverId = employee._id as any;
        plan.interimCoverName = `${employee.firstName} ${employee.lastName}`;
      } else {
        plan.interimCoverId = null;
        plan.interimCoverName = null;
      }
    }
    if (dto.externalBackupNotes !== undefined) {
      plan.externalBackupNotes = dto.externalBackupNotes;
    }
    await plan.save();
    this.notifyChanged(tenantId);
    return plan;
  }

  async setNextReview(
    tenantId: string,
    planId: string,
    dto: SetNextReviewDto,
  ): Promise<SuccessionPlanDocument> {
    const plan = await this.getById(tenantId, planId);
    plan.nextReviewDate = new Date(dto.nextReviewDate);
    await plan.save();
    this.notifyChanged(tenantId);
    return plan;
  }

  // ═══════════════════════════════════════════════════════════
  // RISK ALERTS, BENCH STRENGTH, 9-BOX — all computed live from the
  // plans themselves (plus the real offboarding status of each role
  // holder), never a separately-maintained mirror of the same facts.
  // ═══════════════════════════════════════════════════════════

  async getRiskAlerts(tenantId: string) {
    const plans = await this.getAll(tenantId);
    const alerts: {
      severity: 'high' | 'medium';
      type: string;
      employeeId?: string;
      planId: string;
      role: string;
      title: string;
      detail: string;
    }[] = [];

    for (const p of plans as any[]) {
      if (p.successors.length === 0) {
        alerts.push({
          severity: 'high',
          type: 'no_successor',
          planId: p._id.toString(),
          role: p.criticalRole,
          title: `${p.criticalRole}: no successor identified`,
          detail: `${p.incumbentName} has no identified successor. Consider internal talent or external recruitment.`,
        });
      } else {
        const hasReadyNow = p.successors.some(
          (s: any) => s.readiness === BenchReadiness.READY_NOW,
        );
        if (!hasReadyNow) {
          const best = [...p.successors].sort(
            (a: any, b: any) =>
              READINESS_RANK[a.readiness] - READINESS_RANK[b.readiness],
          )[0];
          alerts.push({
            severity: p.successors.length === 1 ? 'high' : 'medium',
            type: 'single_point_of_failure',
            planId: p._id.toString(),
            role: p.criticalRole,
            title: `${p.criticalRole}: ${p.successors.length === 1 ? 'single point of failure' : 'no successor ready now'}`,
            detail: `${p.successors.length} successor(s) identified. Nearest readiness: ${READINESS_LABEL[best.readiness]}.`,
          });
        }
      }

      for (const s of p.successors as any[]) {
        if (s.devPlan && s.readinessPct < 30) {
          alerts.push({
            severity: 'high',
            type: 'successor_behind',
            employeeId: s.employeeId.toString(),
            planId: p._id.toString(),
            role: p.criticalRole,
            title: `${p.criticalRole}: successor behind schedule`,
            detail: `${s.employeeName} at ${s.readinessPct}% of their development plan toward ${s.devPlan.targetRole}.`,
          });
        }
      }

      if (p.holderExiting) {
        const readySuccessor = p.successors.find(
          (s: any) => s.readiness === BenchReadiness.READY_NOW,
        );
        alerts.push({
          severity: readySuccessor ? 'medium' : 'high',
          type: 'holder_exiting',
          planId: p._id.toString(),
          role: p.criticalRole,
          title: `${p.criticalRole}: role holder exiting`,
          detail: readySuccessor
            ? `${p.incumbentName} is in offboarding. ${readySuccessor.employeeName} is identified as a ready-now successor. Ensure knowledge transfer is completed.`
            : `${p.incumbentName} is in offboarding with no ready-now successor identified.`,
        });
      }
    }

    return alerts.sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1,
    );
  }

  async getBenchStrength(tenantId: string) {
    const plans = await this.getAll(tenantId);
    const rows = (plans as any[]).map((p) => {
      const nearest =
        p.successors.length === 0
          ? null
          : [...p.successors].sort(
              (a: any, b: any) =>
                READINESS_RANK[a.readiness] - READINESS_RANK[b.readiness],
            )[0].readiness;
      return {
        planId: p._id.toString(),
        role: p.criticalRole,
        benchDepth: p.successors.length,
        nearestReady: nearest,
        riskOfLoss: p.riskOfLoss,
      };
    });

    return {
      readyNowCount: rows.filter(
        (r) => r.nearestReady === BenchReadiness.READY_NOW,
      ).length,
      oneToTwoYearsCount: rows.filter(
        (r) => r.nearestReady === BenchReadiness.READY_1_2_YEARS,
      ).length,
      noSuccessorCount: rows.filter((r) => r.benchDepth === 0).length,
      rows,
    };
  }

  // Performance axis comes from each employee's most recent completed
  // performance review (real scored KPI data, via the same scoring
  // engine performance reviews already use) rather than a manually-set
  // rating — so the two axes aren't both just opinions typed into this
  // one screen.
  async getNineBox(tenantId: string) {
    const plans = await this.getAll(tenantId);
    const byEmployee = new Map<
      string,
      { employeeId: string; employeeName: string; potential: string }
    >();
    for (const p of plans as any[]) {
      for (const s of p.successors as any[]) {
        const key = s.employeeId.toString();
        const existing = byEmployee.get(key);
        const potentialRank: Record<string, number> = {
          high: 2,
          medium: 1,
          low: 0,
        };
        if (
          !existing ||
          potentialRank[s.potential] > potentialRank[existing.potential]
        ) {
          byEmployee.set(key, {
            employeeId: key,
            employeeName: s.employeeName,
            potential: s.potential,
          });
        }
      }
    }

    const people = await Promise.all(
      [...byEmployee.values()].map(async (person) => {
        let performance: 'high' | 'moderate' | 'low' = 'moderate';
        try {
          const history =
            await this.performanceReviewService.getReviewHistoryForEmployee(
              tenantId,
              person.employeeId,
            );
          const latestScore =
            history[0]?.scores?.kpiSection?.totalWeightedScore;
          if (latestScore != null) {
            performance =
              latestScore >= 80
                ? 'high'
                : latestScore >= 60
                  ? 'moderate'
                  : 'low';
          }
        } catch {
          // no review history — default to moderate rather than fail
        }
        return { ...person, performance };
      }),
    );

    return people;
  }
}

const READINESS_LABEL: Record<string, string> = {
  [BenchReadiness.READY_NOW]: 'Ready now',
  [BenchReadiness.READY_1_2_YEARS]: '1-2 years',
  [BenchReadiness.READY_3_PLUS_YEARS]: '3+ years',
  [BenchReadiness.GAP]: 'Gap',
};
