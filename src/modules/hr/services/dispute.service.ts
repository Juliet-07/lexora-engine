import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DisputeCase,
  DisputeCaseDocument,
  DisputeStatus,
  DisputeStage,
  DisputeTrack,
  Employee,
  EmployeeDocument,
} from '../schemas';
import {
  OpenDisputeCaseDto,
  AcknowledgeDisputeDto,
  InvestigateDisputeDto,
  ScheduleHearingDto,
  RecordOutcomeDto,
  FileAppealDto,
  EscalateExternalDto,
  ResolveAppealDto,
  CloseDisputeDto,
  AttachFormDto,
  AttachDocumentDto,
} from '../dtos';

@Injectable()
export class DisputeService {
  constructor(
    @InjectModel(DisputeCase.name)
    private readonly disputeModel: Model<DisputeCaseDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  // ── Private helpers ─────────────────────────────────────────────

  private async getCase(
    tenantId: string,
    caseId: string,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.disputeModel.findOne({
      _id: new Types.ObjectId(caseId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!dispute) throw new NotFoundException('Dispute case not found.');
    return dispute;
  }

  private pushStageHistory(
    dispute: DisputeCaseDocument,
    stage: string,
    notes?: string,
    completedBy?: string,
  ) {
    // Complete the current stage entry if exists
    const current = dispute.stageHistory[dispute.stageHistory.length - 1];
    if (current && !current.completedAt) {
      current.completedAt = new Date();
      if (completedBy) current.completedBy = new Types.ObjectId(completedBy);
    }
    // Open the new stage
    (dispute.stageHistory as any[]).push({
      stage,
      enteredAt: new Date(),
      notes,
    });
  }

  private async enrichWithComplainant(disputes: any[]) {
    if (disputes.length === 0) return [];

    const complainantIds = [
      ...new Set(
        disputes.map((d) => d.complainantId?.toString()).filter(Boolean),
      ),
    ];

    const employees = await this.employeeModel
      .find({ _id: { $in: complainantIds } })
      .select(
        'firstName lastName jobTitle hierarchyRole teamId reportsToManagerId',
      )
      .lean();

    const managerIds = [
      ...new Set(
        employees
          .map((e) => (e as any).reportsToManagerId?.toString())
          .filter(Boolean),
      ),
    ];

    const managers =
      managerIds.length > 0
        ? await this.employeeModel
            .find({ _id: { $in: managerIds } })
            .select('firstName lastName')
            .lean()
        : [];

    const managerMap = new Map(
      managers.map((m) => [(m._id as any).toString(), m]),
    );

    const empMap = new Map(
      employees.map((e) => {
        const manager = managerMap.get(
          (e as any).reportsToManagerId?.toString(),
        );
        return [
          (e._id as any).toString(),
          {
            _id: (e._id as any).toString(),
            firstName: e.firstName,
            lastName: e.lastName,
            jobTitle: e.jobTitle,
            hierarchyRole: e.hierarchyRole,
            department: (e as any).teamId?.name ?? null,
            managerName: manager
              ? `${manager.firstName} ${manager.lastName}`
              : null,
          },
        ];
      }),
    );

    return disputes.map((d) => ({
      ...d,
      complainant: empMap.get(d.complainantId?.toString()) ?? null,
    }));
  }

  // ── HR / Tenant actions ─────────────────────────────────────────

  async openCase(
    tenantId: string,
    filedByUserId: string,
    complainantEmployeeId: string,
    dto: OpenDisputeCaseDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = new this.disputeModel({
      tenantId: new Types.ObjectId(tenantId),
      type: dto.type,
      track: DisputeTrack.INTERNAL,
      status: DisputeStatus.OPEN,
      stage: DisputeStage.CASE_REPORTED,
      filedAt: dto.filedAt ? new Date(dto.filedAt) : new Date(),
      filedBy: new Types.ObjectId(filedByUserId),
      complainantId: new Types.ObjectId(complainantEmployeeId),
      respondentId: dto.respondentId
        ? new Types.ObjectId(dto.respondentId)
        : null,
      description: dto.description,
      witnesses: dto.witnesses ?? [],
      confidentialParties: [new Types.ObjectId(filedByUserId)],
      stageHistory: [
        { stage: DisputeStage.CASE_REPORTED, enteredAt: new Date() },
      ],
    });
    return dispute.save();
  }

  async getAllCases(
    tenantId: string,
    filters: {
      status?: string;
      type?: string;
      stage?: string;
      track?: string;
    } = {},
  ) {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (filters.status) query.status = filters.status;
    if (filters.type) query.type = filters.type;
    if (filters.stage) query.stage = filters.stage;
    if (filters.track) query.track = filters.track;

    const disputes = await this.disputeModel
      .find(query)
      .sort({ filedAt: -1 })
      .lean();

    return this.enrichWithComplainant(disputes);
  }

  async getCaseById(
    tenantId: string,
    caseId: string,
  ): Promise<DisputeCaseDocument> {
    return this.getCase(tenantId, caseId);
  }

  async acknowledge(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: AcknowledgeDisputeDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);

    if (dispute.stage !== DisputeStage.CASE_REPORTED) {
      throw new BadRequestException(
        'Case must be at the "case_reported" stage to acknowledge.',
      );
    }

    this.pushStageHistory(
      dispute,
      DisputeStage.ACKNOWLEDGE,
      dto.acknowledgmentText,
      hrUserId,
    );

    dispute.stage = DisputeStage.ACKNOWLEDGE;
    dispute.status = DisputeStatus.UNDER_INVESTIGATION;
    dispute.markModified('stageHistory');
    return dispute.save();
  }

  async investigate(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: InvestigateDisputeDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);

    if (dispute.stage !== DisputeStage.ACKNOWLEDGE) {
      throw new BadRequestException(
        'Case must be acknowledged before investigation can begin.',
      );
    }

    this.pushStageHistory(
      dispute,
      DisputeStage.INVESTIGATE,
      dto.findings,
      hrUserId,
    );

    dispute.stage = DisputeStage.INVESTIGATE;
    dispute.markModified('stageHistory');
    return dispute.save();
  }

  async scheduleHearing(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: ScheduleHearingDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);

    if (dispute.stage !== DisputeStage.INVESTIGATE) {
      throw new BadRequestException(
        'Investigation must be completed before a hearing can be scheduled.',
      );
    }

    this.pushStageHistory(dispute, DisputeStage.HEARING, dto.notes, hrUserId);

    dispute.stage = DisputeStage.HEARING;
    dispute.status = DisputeStatus.HEARING_SCHEDULED;
    (dispute as any).hearing = {
      scheduledAt: new Date(dto.scheduledAt),
      venue: dto.venue,
      scheduledBy: new Types.ObjectId(hrUserId),
      notes: dto.notes ?? null,
    };
    dispute.markModified('stageHistory');
    dispute.markModified('hearing');
    return dispute.save();
  }

  async recordOutcome(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: RecordOutcomeDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);

    if (dispute.stage !== DisputeStage.HEARING) {
      throw new BadRequestException(
        'A hearing must be scheduled before an outcome can be recorded.',
      );
    }

    this.pushStageHistory(dispute, DisputeStage.OUTCOME, dto.notes, hrUserId);

    dispute.stage = DisputeStage.OUTCOME;
    dispute.status = DisputeStatus.OUTCOME_RECORDED;
    (dispute as any).outcome = {
      decision: dto.decision,
      recordedAt: new Date(),
      recordedBy: new Types.ObjectId(hrUserId),
      notes: dto.notes ?? null,
      attachmentUrl: dto.attachmentUrl ?? null,
    };
    dispute.markModified('stageHistory');
    dispute.markModified('outcome');
    return dispute.save();
  }

  async resolveAppeal(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: ResolveAppealDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);

    if (dispute.stage !== DisputeStage.APPEAL || !dispute.appeal) {
      throw new BadRequestException('No appeal has been filed on this case.');
    }

    (dispute.appeal as any).reviewedBy = new Types.ObjectId(hrUserId);
    (dispute.appeal as any).decision = dto.decision;
    (dispute.appeal as any).resolvedAt = new Date();
    (dispute.appeal as any).notes = dto.notes ?? null;

    this.pushStageHistory(dispute, DisputeStage.APPEAL, dto.notes, hrUserId);

    dispute.status = DisputeStatus.CLOSED;
    dispute.markModified('appeal');
    dispute.markModified('stageHistory');
    return dispute.save();
  }

  async escalateExternal(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: EscalateExternalDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);

    // External escalation only valid after internal process has run
    if (
      ![
        DisputeStatus.OUTCOME_RECORDED,
        DisputeStatus.APPEALED,
        DisputeStatus.CLOSED,
      ].includes(dispute.status as DisputeStatus)
    ) {
      throw new BadRequestException(
        'Internal resolution must be completed before external escalation.',
      );
    }

    const stageMap: Record<string, DisputeStage> = {
      labour_local: DisputeStage.LABOUR_LOCAL,
      labour_national: DisputeStage.LABOUR_NATIONAL,
      court: DisputeStage.COURT,
    };

    this.pushStageHistory(dispute, stageMap[dto.body], dto.notes, hrUserId);

    dispute.track = DisputeTrack.EXTERNAL;
    dispute.stage = stageMap[dto.body];
    dispute.status = DisputeStatus.ESCALATED_EXTERNAL;
    (dispute as any).externalEscalation = {
      referredAt: new Date(),
      referredBy: new Types.ObjectId(hrUserId),
      body: dto.body,
      caseRef: dto.caseRef ?? null,
      notes: dto.notes ?? null,
      resolvedAt: null,
      resolution: null,
    };
    dispute.markModified('stageHistory');
    dispute.markModified('externalEscalation');
    return dispute.save();
  }

  async closeCase(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: CloseDisputeDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);

    this.pushStageHistory(dispute, dispute.stage, dto.notes, hrUserId);
    dispute.status = DisputeStatus.CLOSED;
    dispute.markModified('stageHistory');
    return dispute.save();
  }

  async attachForm(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: AttachFormDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);

    (dispute.forms as any[]).push({
      formType: dto.formType,
      fields: dto.fields ?? {},
      attachmentUrl: dto.attachmentUrl ?? null,
      createdAt: new Date(),
      createdBy: new Types.ObjectId(hrUserId),
    });

    dispute.markModified('forms');
    return dispute.save();
  }

  async attachDocument(
    tenantId: string,
    caseId: string,
    uploadedByUserId: string,
    dto: AttachDocumentDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);

    (dispute.supportingDocs as any[]).push({
      name: dto.name,
      url: dto.url,
      uploadedAt: new Date(),
      uploadedBy: new Types.ObjectId(uploadedByUserId),
    });

    dispute.markModified('supportingDocs');
    return dispute.save();
  }

  // ── Employee actions ────────────────────────────────────────────

  async openCaseAsEmployee(
    tenantId: string,
    userId: string,
    dto: OpenDisputeCaseDto,
  ): Promise<DisputeCaseDocument> {
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) throw new NotFoundException('Employee profile not found');

    return this.openCase(
      tenantId,
      userId,
      (employee._id as Types.ObjectId).toString(),
      dto,
    );
  }

  async getMyCases(tenantId: string, userId: string) {
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) return [];

    return this.disputeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        complainantId: employee._id,
      })
      .sort({ filedAt: -1 })
      .lean();
  }

  async fileAppeal(
    tenantId: string,
    caseId: string,
    userId: string,
    dto: FileAppealDto,
  ): Promise<DisputeCaseDocument> {
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) throw new NotFoundException('Employee profile not found');

    const dispute = await this.getCase(tenantId, caseId);

    // Verify the employee is the complainant on this case
    if (
      dispute.complainantId.toString() !==
      (employee._id as Types.ObjectId).toString()
    ) {
      throw new ForbiddenException(
        'You can only appeal your own dispute cases.',
      );
    }

    if (dispute.stage !== DisputeStage.OUTCOME) {
      throw new BadRequestException(
        'An outcome must be recorded before an appeal can be filed.',
      );
    }

    if (dispute.appeal) {
      throw new BadRequestException(
        'An appeal has already been filed on this case.',
      );
    }

    // Enforce 5-working-day appeal window
    const outcome = dispute.outcome as any;
    if (outcome?.recordedAt) {
      const daysSinceOutcome =
        (Date.now() - new Date(outcome.recordedAt).getTime()) /
        (1000 * 60 * 60 * 24);
      if (daysSinceOutcome > 7) {
        // 7 calendar days as a proxy for 5 working days
        throw new BadRequestException(
          'The appeal window (5 working days) has passed.',
        );
      }
    }

    this.pushStageHistory(dispute, DisputeStage.APPEAL, dto.grounds);

    dispute.stage = DisputeStage.APPEAL;
    dispute.status = DisputeStatus.APPEALED;
    (dispute as any).appeal = {
      filedAt: new Date(),
      filedBy: employee._id,
      grounds: dto.grounds,
      reviewedBy: null,
      decision: null,
      resolvedAt: null,
      notes: null,
    };
    dispute.markModified('stageHistory');
    dispute.markModified('appeal');
    return dispute.save();
  }

  async getCasesForManager(tenantId: string, managerUserId: string) {
    // Resolve manager's Employee record
    const manager = await this.employeeModel.findOne({
      userId: new Types.ObjectId(managerUserId),
    });
    if (!manager) return [];

    // Get direct report IDs
    const directReportIds = await this.employeeModel
      .find({ reportsToManagerId: manager._id })
      .distinct('_id');

    if (directReportIds.length === 0) return [];

    // Cases where any direct report is complainant OR respondent
    const disputes = await this.disputeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        $or: [
          { complainantId: { $in: directReportIds } },
          { respondentId: { $in: directReportIds } },
        ],
      })
      .sort({ filedAt: -1 })
      .lean();
    return this.enrichWithComplainant(disputes);
  }

  async getCasesForHod(tenantId: string, hodUserId: string) {
    const hod = await this.employeeModel.findOne({
      userId: new Types.ObjectId(hodUserId),
    });
    if (!hod || hod.hierarchyRole !== 'head_of_department') return [];

    // Two-hop: managers under HoD, then everyone under those managers
    const managerIds = await this.employeeModel
      .find({ reportsToManagerId: hod._id })
      .distinct('_id');

    if (managerIds.length === 0) return [];

    const allReportIds = await this.employeeModel
      .find({ reportsToManagerId: { $in: managerIds } })
      .distinct('_id');

    const allDepartmentIds = [...managerIds, ...allReportIds];

    const disputes = await this.disputeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        $or: [
          { complainantId: { $in: allDepartmentIds } },
          { respondentId: { $in: allDepartmentIds } },
        ],
      })
      .sort({ filedAt: -1 })
      .lean();

    return this.enrichWithComplainant(disputes);
  }
}
