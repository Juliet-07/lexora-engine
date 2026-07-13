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
  EmploymentStatus,
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
  RespondToDisputeDto,
} from '../dtos';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { EmployeeService } from './employee.service';
import { DisputeLetterPdfService } from './dispute-letter-pdf.service';
import { User, UserDocument } from 'src/modules/auth/schemas';

@Injectable()
export class DisputeService {
  constructor(
    @InjectModel(DisputeCase.name)
    private readonly disputeModel: Model<DisputeCaseDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
    private readonly employeeService: EmployeeService,
    private readonly letterPdfService: DisputeLetterPdfService,
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

  private determineResolverLevel(
    complainant: EmployeeDocument,
    respondentIds: string[],
  ): 'manager' | 'tenant' {
    if (
      complainant.hierarchyRole === 'head_of_department' ||
      complainant.hierarchyRole === 'manager'
    ) {
      return 'tenant';
    }
    if (!complainant.reportsToManagerId) {
      return 'tenant';
    }
    const managerId = complainant.reportsToManagerId.toString();
    const isAgainstOwnManager = respondentIds.includes(managerId);
    return isAgainstOwnManager ? 'tenant' : 'manager';
  }

  private async assertIsAssignedManagerForCase(
    managerUserId: string,
    dispute: DisputeCaseDocument,
  ): Promise<void> {
    if (dispute.resolverLevel !== 'manager') {
      throw new ForbiddenException(
        'This case is not assigned to a manager — it belongs with HR/tenant.',
      );
    }
    const manager = await this.employeeModel.findOne({
      userId: new Types.ObjectId(managerUserId),
    });
    if (!manager) {
      throw new ForbiddenException(
        'Only the assigned manager can act on this case.',
      );
    }
    const complainant = await this.employeeModel.findById(
      dispute.complainantId,
    );
    const isAssignedManager =
      complainant?.reportsToManagerId &&
      complainant.reportsToManagerId.toString() ===
        (manager._id as Types.ObjectId).toString();
    if (!isAssignedManager) {
      throw new ForbiddenException(
        'You are not the assigned manager for this case.',
      );
    }
  }

  private assertResolverIsTenant(dispute: DisputeCaseDocument): void {
    if (dispute.resolverLevel !== 'tenant') {
      throw new ForbiddenException(
        "This case is currently with the employee's manager. It must be escalated to HR before you can act on it.",
      );
    }
  }

  private async enrichWithComplainant(disputes: any[]) {
    if (disputes.length === 0) return [];

    const complainantIds = [
      ...new Set(
        disputes.map((d) => d.complainantId?.toString()).filter(Boolean),
      ),
    ];

    const respondentIdSet = new Set<string>();
    disputes.forEach((d) =>
      (d.respondentIds ?? []).forEach((r: any) =>
        respondentIdSet.add(r.toString()),
      ),
    );
    const allSubjectIds = [...new Set([...complainantIds, ...respondentIdSet])];

    const employees = await this.employeeModel
      .find({ _id: { $in: allSubjectIds } })
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
      respondents: (d.respondentIds ?? [])
        .map((r: any) => empMap.get(r.toString()))
        .filter(Boolean),
      respondentResponses: (d.respondentResponses ?? []).map((rr: any) => ({
        text: rr.text,
        respondedAt: rr.respondedAt,
        respondent: empMap.get(rr.respondentId?.toString()) ?? null,
      })),
    }));
  }

  private async notifyRespondentsOfNewCase(
    dispute: DisputeCaseDocument,
    respondentIds: string[],
  ): Promise<void> {
    if (respondentIds.length === 0) return;

    const respondents = await this.employeeModel
      .find({ _id: { $in: respondentIds } })
      .select('firstName lastName email')
      .lean();

    await Promise.all(
      respondents
        .filter((r) => !!r.email)
        .map((r) =>
          this.emailService
            .sendDisputeFiledAgainstYou({
              to: r.email as string,
              recipientName: `${r.firstName} ${r.lastName}`,
              caseNumber: dispute.caseNumber,
              caseType: dispute.type,
              filedAt: dispute.filedAt,
              dashboardUrl: `${process.env.TENANT_APP_URL}/my/disputes`,
            })
            .catch(() => {
              // Don't let one bad address break notifications to others.
            }),
        ),
    );
  }

  private async notifyComplainantOfAcknowledgement(
    dispute: DisputeCaseDocument,
    acknowledgmentText: string,
  ): Promise<void> {
    const complainant = await this.employeeModel
      .findById(dispute.complainantId)
      .select('firstName lastName email')
      .lean();
    if (!complainant?.email) return;

    await this.emailService.sendDisputeAcknowledged({
      to: complainant.email,
      recipientName: `${complainant.firstName} ${complainant.lastName}`,
      caseNumber: dispute.caseNumber,
      caseType: dispute.type,
      acknowledgmentText,
      dashboardUrl: `${process.env.TENANT_APP_URL}/my/disputes`,
    });
  }

  private async notifyPartiesOfHearing(
    dispute: DisputeCaseDocument,
  ): Promise<void> {
    const hearing = (dispute as any).hearing;
    if (!hearing) return;

    const partyIds = [
      dispute.complainantId?.toString(),
      ...(dispute.respondentIds ?? []).map((r) => r.toString()),
    ].filter(Boolean);

    const parties = await this.employeeModel
      .find({ _id: { $in: partyIds } })
      .select('firstName lastName email')
      .lean();

    await Promise.all(
      parties
        .filter((p) => !!p.email)
        .map((p) =>
          this.emailService
            .sendDisputeHearingScheduled({
              to: p.email as string,
              recipientName: `${p.firstName} ${p.lastName}`,
              caseNumber: dispute.caseNumber,
              caseType: dispute.type,
              scheduledAt: hearing.scheduledAt,
              mode: hearing.mode,
              venue: hearing.venue,
              meetingPlatform: hearing.meetingPlatform,
              meetingLink: hearing.meetingLink,
              notes: hearing.notes,
              dashboardUrl: `${process.env.TENANT_APP_URL}/my/disputes`,
            })
            .catch(() => {}),
        ),
    );
  }

  private async actOnOutcome(
    tenantId: string,
    dispute: DisputeCaseDocument,
  ): Promise<void> {
    const outcome = (dispute as any).outcome;
    if (!outcome) return;

    const respondents = await this.employeeModel
      .find({ _id: { $in: dispute.respondentIds ?? [] } })
      .select('firstName lastName email jobTitle')
      .lean();

    const warningLabels: Record<string, string> = {
      first_warning: 'First Warning',
      second_warning: 'Second Warning',
      final_warning: 'Final Warning',
    };

    if (warningLabels[outcome.decision]) {
      await Promise.all(
        respondents
          .filter((r) => !!r.email)
          .map((r) =>
            this.emailService
              .sendDisputeWarningIssued({
                to: r.email as string,
                recipientName: `${r.firstName} ${r.lastName}`,
                caseNumber: dispute.caseNumber,
                warningLevel: warningLabels[outcome.decision],
                notes: outcome.notes,
                dashboardUrl: `${process.env.TENANT_APP_URL}/my/disputes`,
              })
              .catch(() => {}),
          ),
      );
      (dispute as any).outcome.emailSentAt = new Date();
      dispute.markModified('outcome');
      await dispute.save();
      return;
    }

    if (outcome.decision === 'suspension') {
      const businessName = process.env.FIRM_NAME || 'Your Organization';
      await Promise.all(
        respondents
          .filter((r) => !!r.email)
          .map(async (r) => {
            const letterPdf =
              await this.letterPdfService.buildSuspensionLetterPdf({
                employeeName: `${r.firstName} ${r.lastName}`,
                jobTitle: r.jobTitle,
                caseNumber: dispute.caseNumber,
                businessName,
                notes: outcome.notes,
                issuedDate: new Date(),
              });
            await this.emailService
              .sendDisputeSuspensionLetter(
                {
                  to: r.email as string,
                  recipientName: `${r.firstName} ${r.lastName}`,
                  caseNumber: dispute.caseNumber,
                  dashboardUrl: `${process.env.TENANT_APP_URL}/my/disputes`,
                },
                letterPdf,
              )
              .catch(() => {});
          }),
      );
      (dispute as any).outcome.emailSentAt = new Date();
      dispute.markModified('outcome');
      await dispute.save();
      return;
    }

    if (outcome.decision === 'termination') {
      const errors: string[] = [];
      for (const r of respondents) {
        try {
          await this.employeeService.terminateEmployee(
            tenantId,
            (r as any)._id.toString(),
            {
              status: EmploymentStatus.TERMINATED,
              endDate: new Date().toISOString(),
              reason: `Disciplinary termination — Case ${dispute.caseNumber}`,
            } as any,
          );
        } catch (e: any) {
          errors.push(
            `${r.firstName} ${r.lastName}: ${e?.message ?? 'termination failed'}`,
          );
        }
      }
      if (errors.length > 0) {
        (dispute as any).outcome.terminationTriggerError = errors.join('; ');
      } else {
        (dispute as any).outcome.emailSentAt = new Date();
      }
      dispute.markModified('outcome');
      await dispute.save();
    }
  }

  private async notifyPartiesOfResponse(
    dispute: DisputeCaseDocument,
    respondent: EmployeeDocument,
    responseText: string,
  ): Promise<void> {
    const complainant = await this.employeeModel
      .findById(dispute.complainantId)
      .select('firstName lastName email reportsToManagerId')
      .lean();

    const recipients: { email: string; name: string }[] = [];

    if (complainant?.email) {
      recipients.push({
        email: complainant.email,
        name: `${complainant.firstName} ${complainant.lastName}`,
      });
    }

    if (
      dispute.resolverLevel === 'manager' &&
      (complainant as any)?.reportsToManagerId
    ) {
      const manager = await this.employeeModel
        .findById((complainant as any).reportsToManagerId)
        .select('firstName lastName email')
        .lean();
      if (manager?.email) {
        recipients.push({
          email: manager.email,
          name: `${manager.firstName} ${manager.lastName}`,
        });
      }
    } else if (dispute.resolverLevel === 'tenant') {
      const tenant = await this.userModel
        .findById(dispute.tenantId)
        .select('email firstName tenantProfile')
        .lean();
      const tenantEmail = (tenant as any)?.email;
      if (tenantEmail) {
        recipients.push({
          email: tenantEmail,
          name:
            (tenant as any)?.tenantProfile?.businessName ||
            (tenant as any)?.firstName ||
            'HR',
        });
      }
    }

    // De-dupe in case the same address ends up in twice.
    const seen = new Set<string>();
    const uniqueRecipients = recipients.filter((r) => {
      if (seen.has(r.email)) return false;
      seen.add(r.email);
      return true;
    });

    await Promise.all(
      uniqueRecipients.map((r) =>
        this.emailService
          .sendDisputeRespondentReply({
            to: r.email,
            recipientName: r.name,
            caseNumber: dispute.caseNumber,
            respondentName: `${respondent.firstName} ${respondent.lastName}`,
            responseText,
            dashboardUrl: `${process.env.TENANT_APP_URL}/my/disputes`,
          })
          .catch(() => {}),
      ),
    );
  }

  private async notifyRespondentsOfHrInitiatedCase(
    dispute: DisputeCaseDocument,
    respondentIds: string[],
  ): Promise<void> {
    if (respondentIds.length === 0) return;

    const respondents = await this.employeeModel
      .find({ _id: { $in: respondentIds } })
      .select('firstName lastName email')
      .lean();

    await Promise.all(
      respondents
        .filter((r) => !!r.email)
        .map((r) =>
          this.emailService
            .sendDisputeFiledAgainstYou({
              to: r.email as string,
              recipientName: `${r.firstName} ${r.lastName}`,
              caseNumber: dispute.caseNumber,
              caseType: dispute.type,
              filedAt: dispute.filedAt,
              dashboardUrl: `${process.env.TENANT_APP_URL}/my/disputes`,
            })
            .catch(() => {}),
        ),
    );
  }

  // ── HR / Tenant actions ─────────────────────────────────────────

  async openCase(
    tenantId: string,
    filedByUserId: string,
    complainantEmployeeId: string | null,
    dto: OpenDisputeCaseDto,
  ): Promise<DisputeCaseDocument> {
    const respondentIds = dto.respondentIds ?? [];
    let resolverLevel: 'manager' | 'tenant';

    if (complainantEmployeeId) {
      const complainant = await this.employeeModel.findById(
        complainantEmployeeId,
      );
      if (!complainant) {
        throw new NotFoundException('Employee profile not found.');
      }
      resolverLevel = this.determineResolverLevel(complainant, respondentIds);
    } else {
      resolverLevel = 'tenant';
    }

    const dispute = new this.disputeModel({
      tenantId: new Types.ObjectId(tenantId),
      type: dto.type,
      track: DisputeTrack.INTERNAL,
      status: DisputeStatus.OPEN,
      stage: DisputeStage.CASE_REPORTED,
      filedAt: dto.filedAt ? new Date(dto.filedAt) : new Date(),
      filedBy: new Types.ObjectId(filedByUserId),
      complainantId: complainantEmployeeId
        ? new Types.ObjectId(complainantEmployeeId)
        : null,
      respondentIds: respondentIds.map((id) => new Types.ObjectId(id)),
      resolverLevel,
      description: dto.description,
      witnesses: dto.witnesses ?? [],
      natureOfGrievance: dto.natureOfGrievance ?? null,
      adverseEffect: dto.adverseEffect ?? null,
      informalResolutionSteps: dto.informalResolutionSteps ?? null,
      desiredOutcome: dto.desiredOutcome ?? null,
      causeOfIncident: dto.causeOfIncident ?? null,
      injurySeverity: dto.injurySeverity ?? null,
      natureOfInjury: dto.natureOfInjury ?? null,
      medicalTreatmentProvided: dto.medicalTreatmentProvided ?? null,
      supportingDocs: (dto.attachments ?? []).map((a) => ({
        name: a.name,
        url: a.url,
        uploadedAt: new Date(),
        uploadedBy: new Types.ObjectId(filedByUserId),
      })),
      confidentialParties: [new Types.ObjectId(filedByUserId)],
      stageHistory: [
        { stage: DisputeStage.CASE_REPORTED, enteredAt: new Date() },
      ],
    });
    const saved = await dispute.save();

    if (complainantEmployeeId) {
      this.notifyRespondentsOfNewCase(saved, respondentIds).catch(() => {});
    } else {
      this.notifyRespondentsOfHrInitiatedCase(saved, respondentIds).catch(
        () => {},
      );
    }

    return saved;
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

  async getCaseById(tenantId: string, caseId: string) {
    const dispute = await this.disputeModel
      .findOne({
        _id: new Types.ObjectId(caseId),
        tenantId: new Types.ObjectId(tenantId),
      })
      .lean();
    if (!dispute) throw new NotFoundException('Dispute case not found.');

    const [enriched] = await this.enrichWithComplainant([dispute]);
    return enriched;
  }

  async getCasesForEmployee(tenantId: string, employeeId: string) {
    const disputes = await this.disputeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        $or: [
          { complainantId: new Types.ObjectId(employeeId) },
          { respondentIds: new Types.ObjectId(employeeId) },
        ],
      })
      .sort({ filedAt: -1 })
      .lean();

    return this.enrichWithComplainant(disputes);
  }

  async getCaseByIdForManager(
    tenantId: string,
    managerUserId: string,
    caseId: string,
  ) {
    const manager = await this.employeeModel.findOne({
      userId: new Types.ObjectId(managerUserId),
    });
    if (!manager) {
      throw new ForbiddenException('Employee profile not found.');
    }

    const directReportIds = (
      await this.employeeModel
        .find({ reportsToManagerId: manager._id })
        .distinct('_id')
    ).map((id) => id.toString());

    const dispute = await this.disputeModel
      .findOne({
        _id: new Types.ObjectId(caseId),
        tenantId: new Types.ObjectId(tenantId),
      })
      .lean();
    if (!dispute) throw new NotFoundException('Dispute case not found.');

    // Read access follows the same "involves one of my direct
    // reports" rule as the team-cases list — deliberately NOT
    // restricted to resolverLevel === 'manager', so a manager can
    // still view (but not act on) a case after it's been escalated.
    const isVisible =
      directReportIds.includes(dispute.complainantId?.toString()) ||
      (dispute.respondentIds ?? []).some((r: any) =>
        directReportIds.includes(r.toString()),
      );

    if (!isVisible) {
      throw new ForbiddenException('You do not have access to this case.');
    }

    const [enriched] = await this.enrichWithComplainant([dispute]);
    return enriched;
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
    const saved = await dispute.save();

    this.notifyComplainantOfAcknowledgement(
      saved,
      dto.acknowledgmentText,
    ).catch(() => {});

    return saved;
  }

  async investigate(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: InvestigateDisputeDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);

    const canSkipAcknowledge = !dispute.complainantId;
    const validStage = canSkipAcknowledge
      ? [DisputeStage.CASE_REPORTED, DisputeStage.ACKNOWLEDGE].includes(
          dispute.stage as DisputeStage,
        )
      : dispute.stage === DisputeStage.ACKNOWLEDGE;

    if (!validStage) {
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
    dispute.status = DisputeStatus.UNDER_INVESTIGATION;
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

    if (dispute.type === 'incident') {
      throw new BadRequestException(
        'Incidents do not go through a hearing — record the outcome directly after investigation.',
      );
    }

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
      mode: dto.mode,
      venue: dto.mode === 'physical' ? dto.venue : null,
      meetingPlatform: dto.mode === 'online' ? dto.meetingPlatform : null,
      meetingLink: dto.mode === 'online' ? dto.meetingLink : null,
      scheduledBy: new Types.ObjectId(hrUserId),
      notes: dto.notes ?? null,
    };
    dispute.markModified('stageHistory');
    dispute.markModified('hearing');
    const saved = await dispute.save();

    this.notifyPartiesOfHearing(saved).catch(() => {});

    return saved;
  }

  async recordOutcome(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: RecordOutcomeDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);

    const canRecordOutcome =
      dispute.stage === DisputeStage.HEARING ||
      (dispute.type === 'incident' &&
        dispute.stage === DisputeStage.INVESTIGATE);

    if (!canRecordOutcome) {
      throw new BadRequestException(
        dispute.type === 'incident'
          ? 'Investigation must be completed before an outcome can be recorded.'
          : 'A hearing must be scheduled before an outcome can be recorded.',
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
      emailSentAt: null,
      terminationTriggerError: null,
    };
    dispute.markModified('stageHistory');
    dispute.markModified('outcome');
    const saved = await dispute.save();

    await this.actOnOutcome(tenantId, saved).catch(() => {});

    return saved;
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
      ![DisputeStatus.OUTCOME_RECORDED].includes(
        dispute.status as DisputeStatus,
      )
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

    const stagesBeforeOutcome = [
      DisputeStage.CASE_REPORTED,
      DisputeStage.ACKNOWLEDGE,
      DisputeStage.INVESTIGATE,
      DisputeStage.HEARING,
    ];
    const targetStage = stagesBeforeOutcome.includes(
      dispute.stage as DisputeStage,
    )
      ? DisputeStage.OUTCOME
      : dispute.stage;

    this.pushStageHistory(dispute, targetStage, dto.notes, hrUserId);
    dispute.stage = targetStage;
    dispute.status = DisputeStatus.CLOSED;
    dispute.markModified('stageHistory');

    return dispute.save();
  }

  async attachDocument(
    tenantId: string,
    caseId: string,
    uploadedByUserId: string,
    file: Express.Multer.File,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);

    (dispute.supportingDocs as any[]).push({
      name: file.originalname,
      url: `/uploads/disputes/documents/${file.filename}`,
      uploadedAt: new Date(),
      uploadedBy: new Types.ObjectId(uploadedByUserId),
    });

    dispute.markModified('supportingDocs');
    return dispute.save();
  }

  // ── Tenant actions (blocked while a manager still owns the case) ──

  async acknowledgeAsTenant(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: AcknowledgeDisputeDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);
    this.assertResolverIsTenant(dispute);
    return this.acknowledge(tenantId, caseId, hrUserId, dto);
  }

  async investigateAsTenant(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: InvestigateDisputeDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);
    this.assertResolverIsTenant(dispute);
    return this.investigate(tenantId, caseId, hrUserId, dto);
  }

  async scheduleHearingAsTenant(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: ScheduleHearingDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);
    this.assertResolverIsTenant(dispute);
    return this.scheduleHearing(tenantId, caseId, hrUserId, dto);
  }

  async recordOutcomeAsTenant(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: RecordOutcomeDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);
    this.assertResolverIsTenant(dispute);
    return this.recordOutcome(tenantId, caseId, hrUserId, dto);
  }

  async closeCaseAsTenant(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: CloseDisputeDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);
    this.assertResolverIsTenant(dispute);
    return this.closeCase(tenantId, caseId, hrUserId, dto);
  }

  async escalateExternalAsTenant(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: EscalateExternalDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);
    this.assertResolverIsTenant(dispute);
    return this.escalateExternal(tenantId, caseId, hrUserId, dto);
  }

  async resolveAppealAsTenant(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: ResolveAppealDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);
    this.assertResolverIsTenant(dispute);
    return this.resolveAppeal(tenantId, caseId, hrUserId, dto);
  }

  // ── Manager actions ──────────────────────────────────────────────

  async escalateToTenant(
    tenantId: string,
    caseId: string,
    managerUserId: string,
    notes?: string,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);
    await this.assertIsAssignedManagerForCase(managerUserId, dispute);

    this.pushStageHistory(
      dispute,
      dispute.stage,
      notes ??
        'Escalated to HR — the manager was unable to resolve this at their level.',
      managerUserId,
    );

    dispute.resolverLevel = 'tenant';
    dispute.markModified('stageHistory');
    return dispute.save();
  }

  async acknowledgeAsManager(
    tenantId: string,
    caseId: string,
    managerUserId: string,
    dto: AcknowledgeDisputeDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);
    await this.assertIsAssignedManagerForCase(managerUserId, dispute);
    return this.acknowledge(tenantId, caseId, managerUserId, dto);
  }

  async investigateAsManager(
    tenantId: string,
    caseId: string,
    managerUserId: string,
    dto: InvestigateDisputeDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);
    await this.assertIsAssignedManagerForCase(managerUserId, dispute);
    return this.investigate(tenantId, caseId, managerUserId, dto);
  }

  async scheduleHearingAsManager(
    tenantId: string,
    caseId: string,
    managerUserId: string,
    dto: ScheduleHearingDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);
    await this.assertIsAssignedManagerForCase(managerUserId, dispute);
    return this.scheduleHearing(tenantId, caseId, managerUserId, dto);
  }

  async recordOutcomeAsManager(
    tenantId: string,
    caseId: string,
    managerUserId: string,
    dto: RecordOutcomeDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);
    await this.assertIsAssignedManagerForCase(managerUserId, dispute);
    return this.recordOutcome(tenantId, caseId, managerUserId, dto);
  }

  async closeCaseAsManager(
    tenantId: string,
    caseId: string,
    managerUserId: string,
    dto: CloseDisputeDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);
    await this.assertIsAssignedManagerForCase(managerUserId, dispute);
    return this.closeCase(tenantId, caseId, managerUserId, dto);
  }

  async getCaseByIdForEmployee(
    tenantId: string,
    userId: string,
    caseId: string,
  ) {
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) {
      throw new ForbiddenException('Employee profile not found.');
    }

    const dispute = await this.disputeModel
      .findOne({
        _id: new Types.ObjectId(caseId),
        tenantId: new Types.ObjectId(tenantId),
      })
      .lean();
    if (!dispute) throw new NotFoundException('Dispute case not found.');

    const employeeId = (employee._id as Types.ObjectId).toString();
    const isComplainant = dispute.complainantId?.toString() === employeeId;
    const isRespondent = (dispute.respondentIds ?? []).some(
      (r: any) => r.toString() === employeeId,
    );

    let isManagerOfSubject = false;
    if (!isComplainant && !isRespondent) {
      const directReportIds = (
        await this.employeeModel
          .find({ reportsToManagerId: employee._id })
          .distinct('_id')
      ).map((id) => id.toString());
      isManagerOfSubject =
        directReportIds.includes(dispute.complainantId?.toString()) ||
        (dispute.respondentIds ?? []).some((r: any) =>
          directReportIds.includes(r.toString()),
        );
    }

    if (!isComplainant && !isRespondent && !isManagerOfSubject) {
      throw new ForbiddenException('You do not have access to this case.');
    }

    const [enriched] = await this.enrichWithComplainant([dispute]);
    return enriched;
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

    const disputes = await this.disputeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        complainantId: employee._id,
      })
      .sort({ filedAt: -1 })
      .lean();

    return this.enrichWithComplainant(disputes);
  }

  async getCasesAgainstMe(tenantId: string, userId: string) {
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) return [];

    const disputes = await this.disputeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        respondentIds: employee._id,
      })
      .sort({ filedAt: -1 })
      .lean();

    return this.enrichWithComplainant(disputes);
  }

  async respondToDispute(
    tenantId: string,
    caseId: string,
    userId: string,
    dto: RespondToDisputeDto,
  ): Promise<DisputeCaseDocument> {
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) throw new NotFoundException('Employee profile not found');

    const dispute = await this.getCase(tenantId, caseId);

    const isRespondent = (dispute.respondentIds ?? []).some(
      (r) => r.toString() === (employee._id as Types.ObjectId).toString(),
    );
    if (!isRespondent) {
      throw new ForbiddenException(
        'Only a respondent named on this case can respond to it.',
      );
    }

    if (dispute.status === DisputeStatus.CLOSED) {
      throw new BadRequestException(
        'This case is closed — a response can no longer be added.',
      );
    }

    (dispute.respondentResponses as any[]).push({
      respondentId: employee._id,
      text: dto.response,
      respondedAt: new Date(),
    });
    dispute.markModified('respondentResponses');
    const saved = await dispute.save();

    this.notifyPartiesOfResponse(saved, employee, dto.response).catch(() => {});

    return saved;
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

    // Verify the employee is a named respondent on this case
    const isRespondent = (dispute.respondentIds ?? []).some(
      (r) => r.toString() === (employee._id as Types.ObjectId).toString(),
    );
    if (!isRespondent) {
      throw new ForbiddenException(
        'Only the respondent named in this case can appeal its outcome.',
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
    dispute.resolverLevel = 'tenant';
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
        resolverLevel: 'manager',
        $or: [
          { complainantId: { $in: directReportIds } },
          { respondentIds: { $in: directReportIds } },
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
          { respondentIds: { $in: allDepartmentIds } },
        ],
      })
      .sort({ filedAt: -1 })
      .lean();

    return this.enrichWithComplainant(disputes);
  }
}
