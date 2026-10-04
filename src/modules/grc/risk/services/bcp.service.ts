import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BcpPlan,
  BcpPlanDocument,
  BcpTest,
  BcpTestDocument,
  BcpTestFinding,
  BcpTestFindingDocument,
  RtoRpo,
  RtoRpoDocument,
  CrisisContact,
  CrisisContactDocument,
  BiaProcess,
  BiaProcessDocument,
  VendorResilience,
  VendorResilienceDocument,
  BcpIncident,
  BcpIncidentDocument,
  BcpIncidentStatus,
  BcpReport,
  BcpReportDocument,
  AttestationStatus,
  AlternateVendorStatus,
  BcpFindingStatus,
  BcpPlanStatus,
} from '../schemas';
import {
  CreateBcpPlanDto,
  SetPlanStatusDto,
  AdvancePlanPhaseDto,
  UpdateBcpPlanDto,
  CreateBcpTestDto,
  CompleteBcpTestDto,
  CreateRtoRpoDto,
  RecordRtoRpoActualDto,
  CreateCrisisContactDto,
  UpdateCrisisContactDto,
  CreateBiaProcessDto,
  UpdateBiaProcessDto,
  CreateVendorResilienceDto,
  DeclareBcpIncidentDto,
  CreateBcpReportDto,
  CreateBcpTestFindingDto,
} from '../dtos';
import { HrTeam, HrTeamDocument } from 'src/modules/hr/schemas/hr.schema';
import {
  Employee,
  EmployeeDocument,
} from 'src/modules/hr/schemas/employee.schema';
import {
  Vendor as CrmVendor,
  VendorDocument as CrmVendorDocument,
} from 'src/modules/crm/crm/schemas/vendor.schema';

@Injectable()
export class BcpService {
  constructor(
    @InjectModel(BcpPlan.name)
    private readonly planModel: Model<BcpPlanDocument>,
    @InjectModel(BcpTest.name)
    private readonly testModel: Model<BcpTestDocument>,
    @InjectModel(BcpTestFinding.name)
    private readonly findingModel: Model<BcpTestFindingDocument>,
    @InjectModel(RtoRpo.name)
    private readonly rtoRpoModel: Model<RtoRpoDocument>,
    @InjectModel(CrisisContact.name)
    private readonly contactModel: Model<CrisisContactDocument>,
    @InjectModel(BiaProcess.name)
    private readonly processModel: Model<BiaProcessDocument>,
    @InjectModel(VendorResilience.name)
    private readonly vendorResilienceModel: Model<VendorResilienceDocument>,
    @InjectModel(BcpIncident.name)
    private readonly incidentModel: Model<BcpIncidentDocument>,
    @InjectModel(BcpReport.name)
    private readonly reportModel: Model<BcpReportDocument>,
    @InjectModel(HrTeam.name)
    private readonly teamModel: Model<HrTeamDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(CrmVendor.name)
    private readonly crmVendorModel: Model<CrmVendorDocument>,
  ) {}

  async createPlan(tenantId: string, dto: CreateBcpPlanDto) {
    // Built explicitly (not `...dto`) so a plan can never be created
    // with anything but the system-default Draft status, regardless of
    // what the DTO carries — status is system-managed from here (PO
    // feedback, Oct 2026).
    return this.planModel.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      version: dto.version ?? 1,
      content: dto.content,
      scope: dto.scope ?? '',
      owner: dto.owner ?? '',
      phase: dto.phase ?? 0,
      reviewCycle: dto.reviewCycle ?? null,
      nextReviewDate: dto.nextReviewDate ? new Date(dto.nextReviewDate) : null,
    });
  }
  async getAllPlans(tenantId: string) {
    return this.planModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  // One legal step at a time, driven by an explicit action button in
  // the plan detail drawer (Send for review / Approve / Back to draft
  // / Reopen for review) — not a freeform status field, so an
  // out-of-sequence jump (Draft straight to Approved) is rejected
  // even if something sends it.
  private static readonly PLAN_STATUS_TRANSITIONS: Record<
    BcpPlanStatus,
    BcpPlanStatus[]
  > = {
    [BcpPlanStatus.DRAFT]: [BcpPlanStatus.UNDER_REVIEW],
    [BcpPlanStatus.UNDER_REVIEW]: [BcpPlanStatus.APPROVED, BcpPlanStatus.DRAFT],
    [BcpPlanStatus.APPROVED]: [BcpPlanStatus.UNDER_REVIEW],
  };

  async setPlanStatus(tenantId: string, id: string, dto: SetPlanStatusDto) {
    const plan = await this.planModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!plan) throw new NotFoundException('Plan not found');
    const allowed = BcpService.PLAN_STATUS_TRANSITIONS[plan.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `A plan in "${plan.status}" can't move directly to "${dto.status}".`,
      );
    }
    plan.status = dto.status;
    await plan.save();
    return plan;
  }

  async advancePlanPhase(
    tenantId: string,
    id: string,
    dto: AdvancePlanPhaseDto,
  ) {
    const plan = await this.planModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!plan) throw new NotFoundException('Plan not found');
    const maxPhase = 6; // LIFECYCLE.length - 1 on the frontend
    const next =
      dto.direction === 'next'
        ? Math.min(plan.phase + 1, maxPhase)
        : Math.max(plan.phase - 1, 0);
    if (next === plan.phase) {
      throw new BadRequestException(
        dto.direction === 'next'
          ? 'Already at the final lifecycle stage.'
          : 'Already at the first lifecycle stage.',
      );
    }
    plan.phase = next;
    await plan.save();
    return plan;
  }

  async updatePlan(tenantId: string, id: string, dto: UpdateBcpPlanDto) {
    const update: Record<string, unknown> = {};
    if (dto.title !== undefined) update.title = dto.title;
    if (dto.content !== undefined) update.content = dto.content;
    if (dto.scope !== undefined) update.scope = dto.scope;
    if (dto.reviewCycle !== undefined) update.reviewCycle = dto.reviewCycle;
    const plan = await this.planModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      update,
      { new: true },
    );
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async deletePlan(tenantId: string, id: string) {
    const plan = await this.planModel.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async createTest(tenantId: string, dto: CreateBcpTestDto) {
    const scheduled = !dto.outcome && !!dto.scheduledFor;
    return this.testModel.create({
      tenantId: new Types.ObjectId(tenantId),
      planId: dto.planId ? new Types.ObjectId(dto.planId) : null,
      scenario: dto.scenario,
      testType: dto.testType,
      scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
      testedAt: scheduled ? null : new Date(),
      outcome: scheduled ? null : (dto.outcome ?? null),
      score: dto.score ?? null,
      notes: dto.notes ?? '',
    });
  }
  async completeTest(tenantId: string, id: string, dto: CompleteBcpTestDto) {
    return this.testModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      {
        outcome: dto.outcome,
        score: dto.score ?? null,
        notes: dto.notes ?? '',
        testedAt: new Date(),
      },
      { new: true },
    );
  }
  async getAllTests(tenantId: string) {
    return this.testModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async addFinding(tenantId: string, dto: CreateBcpTestFindingDto) {
    return this.findingModel.create({
      tenantId: new Types.ObjectId(tenantId),
      testId: new Types.ObjectId(dto.testId),
      severity: dto.severity,
      title: dto.title,
      owner: dto.owner ?? '',
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
    });
  }
  async resolveFinding(tenantId: string, id: string) {
    return this.findingModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      { status: BcpFindingStatus.RESOLVED },
      { new: true },
    );
  }
  async getAllFindings(tenantId: string) {
    return this.findingModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async createRtoRpo(tenantId: string, dto: CreateRtoRpoDto) {
    return this.rtoRpoModel.create({
      tenantId: new Types.ObjectId(tenantId),
      ...dto,
    });
  }
  async recordRtoRpoActual(
    tenantId: string,
    id: string,
    dto: RecordRtoRpoActualDto,
  ) {
    return this.rtoRpoModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      {
        ...(dto.rtoActualHours !== undefined && {
          rtoActualHours: dto.rtoActualHours,
        }),
        ...(dto.rpoActualHours !== undefined && {
          rpoActualHours: dto.rpoActualHours,
        }),
      },
      { new: true },
    );
  }
  async getAllRtoRpo(tenantId: string) {
    return this.rtoRpoModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  private async resolveEmployeeName(
    tenantId: string,
    employeeId: string | undefined,
  ): Promise<{ id: Types.ObjectId | null; name: string }> {
    if (!employeeId) return { id: null, name: '' };
    const emp = await this.employeeModel
      .findOne({ _id: employeeId, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!emp) return { id: null, name: '' };
    return {
      id: new Types.ObjectId(employeeId),
      name: `${emp.firstName} ${emp.lastName}`,
    };
  }

  async createContact(tenantId: string, dto: CreateCrisisContactDto) {
    const primary = await this.resolveEmployeeName(
      tenantId,
      dto.primaryEmployeeId,
    );
    const backup = await this.resolveEmployeeName(
      tenantId,
      dto.backupEmployeeId,
    );
    return this.contactModel.create({
      tenantId: new Types.ObjectId(tenantId),
      role: dto.role,
      primaryEmployeeId: primary.id,
      primaryName: primary.name,
      backupEmployeeId: backup.id,
      backupName: backup.name,
    });
  }
  async updateContact(
    tenantId: string,
    id: string,
    dto: UpdateCrisisContactDto,
  ) {
    const update: Record<string, unknown> = {};
    if (dto.role !== undefined) update.role = dto.role;
    if (dto.primaryEmployeeId !== undefined) {
      const primary = await this.resolveEmployeeName(
        tenantId,
        dto.primaryEmployeeId || undefined,
      );
      update.primaryEmployeeId = primary.id;
      update.primaryName = primary.name;
    }
    if (dto.backupEmployeeId !== undefined) {
      const backup = await this.resolveEmployeeName(
        tenantId,
        dto.backupEmployeeId || undefined,
      );
      update.backupEmployeeId = backup.id;
      update.backupName = backup.name;
    }
    return this.contactModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      update,
      { new: true },
    );
  }
  async deleteContact(tenantId: string, id: string) {
    return this.contactModel.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
  }
  async getAllContacts(tenantId: string) {
    return this.contactModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: 1 })
      .lean();
  }

  async createProcess(tenantId: string, dto: CreateBiaProcessDto) {
    let dept = dto.dept ?? '';
    if (dto.departmentId) {
      const team = await this.teamModel
        .findOne({
          _id: dto.departmentId,
          tenantId: new Types.ObjectId(tenantId),
        })
        .lean();
      if (team) dept = team.name;
    }
    return this.processModel.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      departmentId: dto.departmentId
        ? new Types.ObjectId(dto.departmentId)
        : null,
      dept,
      owner: dto.owner ?? '',
      criticality: dto.criticality,
      mtd: dto.mtd ?? '',
      impactPerDay: dto.impactPerDay ?? 0,
      nonFinancialImpact: dto.nonFinancialImpact ?? '',
      dependencies: dto.dependencies ?? [],
      linkedPlanId: dto.linkedPlanId
        ? new Types.ObjectId(dto.linkedPlanId)
        : null,
    });
  }
  async getAllProcesses(tenantId: string) {
    return this.processModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  // Lets the tenant retroactively link a continuity plan onto a
  // process that was created before that plan existed (or edit any
  // other field) — PO feedback, Oct 2026. Same resolved-dept-snapshot
  // handling as createProcess; an empty string for
  // departmentId/linkedPlanId clears that link, undefined leaves it
  // unchanged, matching UpdateCrisisContactDto's convention.
  async updateProcess(tenantId: string, id: string, dto: UpdateBiaProcessDto) {
    const update: Record<string, unknown> = {};
    if (dto.name !== undefined) update.name = dto.name;
    if (dto.departmentId !== undefined) {
      if (dto.departmentId) {
        const team = await this.teamModel
          .findOne({
            _id: dto.departmentId,
            tenantId: new Types.ObjectId(tenantId),
          })
          .lean();
        update.departmentId = new Types.ObjectId(dto.departmentId);
        update.dept = team ? team.name : (dto.dept ?? '');
      } else {
        update.departmentId = null;
        update.dept = dto.dept ?? '';
      }
    } else if (dto.dept !== undefined) {
      update.dept = dto.dept;
    }
    if (dto.owner !== undefined) update.owner = dto.owner;
    if (dto.criticality !== undefined) update.criticality = dto.criticality;
    if (dto.mtd !== undefined) update.mtd = dto.mtd;
    if (dto.impactPerDay !== undefined) update.impactPerDay = dto.impactPerDay;
    if (dto.nonFinancialImpact !== undefined)
      update.nonFinancialImpact = dto.nonFinancialImpact;
    if (dto.dependencies !== undefined) update.dependencies = dto.dependencies;
    if (dto.linkedPlanId !== undefined) {
      update.linkedPlanId = dto.linkedPlanId
        ? new Types.ObjectId(dto.linkedPlanId)
        : null;
    }
    const process = await this.processModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      update,
      { new: true },
    );
    if (!process) throw new NotFoundException('Process not found');
    return process;
  }

  async deleteProcess(tenantId: string, id: string) {
    const process = await this.processModel.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!process) throw new NotFoundException('Process not found');
    return process;
  }

  async createVendorResilience(
    tenantId: string,
    dto: CreateVendorResilienceDto,
  ) {
    const vendor = await this.crmVendorModel
      .findOne({
        _id: dto.crmVendorId,
        tenantId: new Types.ObjectId(tenantId),
      })
      .lean();
    if (!vendor) throw new NotFoundException('CRM vendor not found');
    return this.vendorResilienceModel.create({
      tenantId: new Types.ObjectId(tenantId),
      crmVendorId: new Types.ObjectId(dto.crmVendorId),
      name: vendor.tradingName || vendor.legalName,
      criticality: dto.criticality,
      sla: dto.sla ?? '',
      attestation: dto.attestation ?? AttestationStatus.NOT_YET_REQUESTED,
      alternate: dto.alternate ?? AlternateVendorStatus.NONE_SPOF,
      dependentProcessIds: (dto.dependentProcessIds ?? []).map(
        (id) => new Types.ObjectId(id),
      ),
      escalationContact: dto.escalationContact ?? '',
      lastReviewDate: new Date(),
      nextReviewDate: dto.nextReviewDate ? new Date(dto.nextReviewDate) : null,
    });
  }
  async markVendorResilienceAttested(tenantId: string, id: string) {
    return this.vendorResilienceModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      { attestation: AttestationStatus.RECEIVED, lastReviewDate: new Date() },
      { new: true },
    );
  }
  async getAllVendorResilience(tenantId: string) {
    return this.vendorResilienceModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async declareIncident(tenantId: string, dto: DeclareBcpIncidentDto) {
    const count = await this.incidentModel.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
    });
    const code = `INC-${String(count + 1).padStart(3, '0')}`;
    return this.incidentModel.create({
      tenantId: new Types.ObjectId(tenantId),
      code,
      description: dto.description,
      severity: dto.severity,
      declaredAt: new Date(),
    });
  }
  async resolveIncident(tenantId: string, id: string) {
    return this.incidentModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      { status: BcpIncidentStatus.RESOLVED, resolvedAt: new Date() },
      { new: true },
    );
  }
  async getAllIncidents(tenantId: string) {
    return this.incidentModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ declaredAt: -1 })
      .lean();
  }

  async createReport(tenantId: string, dto: CreateBcpReportDto) {
    return this.reportModel.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      type: dto.type,
      period: dto.period ?? 'Current',
      recipients: dto.recipients ?? 'Internal',
      sections: dto.sections ?? [],
      schedule: dto.schedule ?? 'Generate once - now',
      format: dto.format ?? 'PDF',
      generatedAt: new Date(),
    });
  }
  async getAllReports(tenantId: string) {
    return this.reportModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ generatedAt: -1 })
      .lean();
  }
}
