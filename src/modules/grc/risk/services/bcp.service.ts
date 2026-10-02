import { Injectable, NotFoundException } from '@nestjs/common';
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
} from '../schemas';
import {
  CreateBcpPlanDto,
  CreateBcpTestDto,
  CompleteBcpTestDto,
  CreateRtoRpoDto,
  RecordRtoRpoActualDto,
  CreateCrisisContactDto,
  CreateBiaProcessDto,
  CreateVendorResilienceDto,
  DeclareBcpIncidentDto,
  CreateBcpReportDto,
  CreateBcpTestFindingDto,
} from '../dtos';
import { HrTeam, HrTeamDocument } from 'src/modules/hr/schemas/hr.schema';
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
    @InjectModel(CrmVendor.name)
    private readonly crmVendorModel: Model<CrmVendorDocument>,
  ) {}

  async createPlan(tenantId: string, dto: CreateBcpPlanDto) {
    return this.planModel.create({
      tenantId: new Types.ObjectId(tenantId),
      ...dto,
      nextReviewDate: dto.nextReviewDate ? new Date(dto.nextReviewDate) : null,
    });
  }
  async getAllPlans(tenantId: string) {
    return this.planModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
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

  async createContact(tenantId: string, dto: CreateCrisisContactDto) {
    return this.contactModel.create({
      tenantId: new Types.ObjectId(tenantId),
      ...dto,
    });
  }
  async getAllContacts(tenantId: string) {
    return this.contactModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ escalationOrder: 1 })
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
