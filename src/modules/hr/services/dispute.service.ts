import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
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
  DisputeType,
  DisputeOutcomeDecision,
  DISCIPLINARY_SANCTIONS,
  DisciplinaryFindingDecision,
  InvestigationRecommendation,
  AppealDecision,
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
  RecordSanctionDto,
  DisciplinarySuspensionDto,
  DisciplinaryInvestigationDto,
  ServeNoticeOfAllegationsDto,
  RecordHearingMinutesDto,
  RecordDisciplinaryFindingDto,
  ScheduleDisciplinaryAppealHearingDto,
  RecordDisciplinaryAppealOutcomeDto,
} from '../dtos';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { EmployeeService } from './employee.service';
import { DisputeLetterPdfService } from './dispute-letter-pdf.service';
import { User, UserDocument } from 'src/modules/auth/schemas';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Policy,
  PolicyDocument,
} from 'src/modules/grc/compliance/schemas/policy.schema';

@Injectable()
export class DisputeService {
  constructor(
    @InjectModel(DisputeCase.name)
    private readonly disputeModel: Model<DisputeCaseDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Policy.name)
    private readonly policyModel: Model<PolicyDocument>,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
    // See payroll-run.service.ts — EmployeeService sits in a circular
    // import with OffboardingService, which leaves a plain injection
    // of it unresolvable at boot without forwardRef.
    @Inject(forwardRef(() => EmployeeService))
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

  /**
   * Walks up the reporting line from an employee and returns every
   * superior's id (direct manager, their manager, … up to the HoD).
   * Depth-capped so a bad `reportsToManagerId` loop can't spin forever.
   */
  private async getSuperiorIds(employee: EmployeeDocument): Promise<string[]> {
    const chain: string[] = [];
    let nextId: any = employee.reportsToManagerId;
    for (let depth = 0; nextId && depth < 10; depth++) {
      const id = nextId.toString();
      if (chain.includes(id)) break;
      chain.push(id);
      const boss = await this.employeeModel
        .findById(id)
        .select('reportsToManagerId')
        .lean();
      nextId = (boss as any)?.reportsToManagerId;
    }
    return chain;
  }

  /**
   * Everyone who sits below `employee`: direct reports and (for an HoD)
   * the reports of those reports. Used for read-visibility only.
   */
  private async getSubordinateIds(
    employee: EmployeeDocument,
    hops = 2,
  ): Promise<string[]> {
    const all = new Set<string>();
    let frontier: any[] = [employee._id];
    for (let i = 0; i < hops && frontier.length > 0; i++) {
      const next = await this.employeeModel
        .find({ reportsToManagerId: { $in: frontier } })
        .distinct('_id');
      frontier = next.filter((id) => !all.has(id.toString()));
      frontier.forEach((id) => all.add(id.toString()));
    }
    return [...all];
  }

  /**
   * Decides who adjudicates a new case.
   *
   *  - Complainant is a manager or HoD, or has nobody above them → HR.
   *  - Complaint names the complainant's own manager → HR.
   *  - Complaint names ANYONE further up the complainant's reporting
   *    line (e.g. the HoD above their manager) → HR. A manager can't
   *    sit in judgment over their own boss.
   *  - Complaint names a Head of Department (any department) → HR.
   *    Same reason: no line manager outranks an HoD.
   *  - Otherwise the complainant's manager resolves it.
   */
  private async determineResolverLevel(
    complainant: EmployeeDocument,
    respondentIds: string[],
  ): Promise<'manager' | 'tenant'> {
    if (
      complainant.hierarchyRole === 'head_of_department' ||
      complainant.hierarchyRole === 'manager'
    ) {
      return 'tenant';
    }
    if (!complainant.reportsToManagerId) {
      return 'tenant';
    }
    if (respondentIds.length === 0) return 'manager';

    const superiors = await this.getSuperiorIds(complainant);
    if (respondentIds.some((id) => superiors.includes(id.toString()))) {
      return 'tenant';
    }

    const namedHod = await this.employeeModel.exists({
      _id: { $in: respondentIds.map((id) => new Types.ObjectId(id)) },
      hierarchyRole: 'head_of_department',
    });
    return namedHod ? 'tenant' : 'manager';
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
    // Reporting lines can change after a case is opened. If the assigned
    // manager is now named on the case, they must not adjudicate it.
    const managerIdStr = (manager._id as Types.ObjectId).toString();
    if (
      (dispute.respondentIds ?? []).some((r) => r.toString() === managerIdStr)
    ) {
      throw new ForbiddenException(
        'You are named on this case, so it must be handled by HR.',
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

  // Employee, manager and HoD views of a disciplinary case: HR's working
  // papers (investigation notes, hearing minutes) and a finding that has
  // not yet been communicated stay on the tenant side. The employee sees
  // the notice, the hearing, the finding once a sanction is recorded, the
  // sanction and the appeal.
  private async enrichForEmployeeView(disputes: any[]) {
    const enriched = await this.enrichWithComplainant(disputes);
    return enriched.map((d: any) => {
      if (d.type !== DisputeType.DISCIPLINARY) return d;
      const decided = !!d.outcome;
      const process = d.disciplinary ? { ...d.disciplinary } : null;
      if (process) {
        delete process.investigation;
        delete process.hearingRecord;
        if (!decided) delete process.finding;
      }
      const stageHistory = (d.stageHistory ?? [])
        .filter((h: any) => h.stage !== DisputeStage.FINDING || decided)
        .map((h: any) =>
          h.stage === DisputeStage.INVESTIGATE ||
          h.stage === DisputeStage.FINDING
            ? { ...h, notes: null }
            : h,
        );
      return { ...d, disciplinary: process, stageHistory };
    });
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

    // Disciplinary: one formal outcome notification (finding, sanction,
    // right to appeal). No auto-termination — an appeal suspends a
    // dismissal, so HR starts offboarding explicitly afterwards.
    if (dispute.type === DisputeType.DISCIPLINARY) {
      await this.sendDisciplinaryOutcomeNotice(dispute);
      return;
    }

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
    const isDisciplinary = dto.type === DisputeType.DISCIPLINARY;

    // A disciplinary case is about exactly one employee, and cites a
    // policy from the GRC library (snapshotted so the case still reads
    // correctly if the policy is later renamed).
    let policyTitle: string | null = null;
    if (isDisciplinary) {
      if (respondentIds.length !== 1) {
        throw new BadRequestException(
          'A disciplinary case must be about exactly one employee.',
        );
      }
      const policy = await this.policyModel
        .findOne({
          _id: new Types.ObjectId(dto.policyId),
          tenantId: new Types.ObjectId(tenantId),
        })
        .select('title')
        .lean();
      if (!policy) {
        throw new BadRequestException(
          'The policy breached was not found in your policy library.',
        );
      }
      policyTitle = policy.title;
    }

    if (isDisciplinary) {
      // Disciplinary is an employer-run procedure: it always sits with
      // HR, whoever logged it.
      resolverLevel = 'tenant';
    } else if (complainantEmployeeId) {
      const complainant = await this.employeeModel.findById(
        complainantEmployeeId,
      );
      if (!complainant) {
        throw new NotFoundException('Employee profile not found.');
      }
      resolverLevel = await this.determineResolverLevel(
        complainant,
        respondentIds,
      );
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
      natureOfGrievanceOther:
        dto.natureOfGrievance === 'others'
          ? (dto.natureOfGrievanceOther?.trim() ?? null)
          : null,
      adverseEffect: dto.adverseEffect ?? null,
      informalResolutionSteps: dto.informalResolutionSteps ?? null,
      desiredOutcome: dto.desiredOutcome ?? null,
      causeOfIncident: dto.causeOfIncident ?? null,
      injurySeverity: dto.injurySeverity ?? null,
      natureOfInjury: dto.natureOfInjury ?? null,
      medicalTreatmentProvided: dto.medicalTreatmentProvided ?? null,
      incidentOccurredAt: dto.incidentOccurredAt
        ? new Date(dto.incidentOccurredAt)
        : null,
      immediateActionTaken: dto.immediateActionTaken ?? null,
      reportedBy: dto.reportedBy ?? null,
      urgency: dto.urgency ?? null,
      policyId: isDisciplinary ? new Types.ObjectId(dto.policyId) : null,
      policyTitle,
      particularClause: dto.particularClause ?? null,
      dateOfAllegedMisconduct: dto.dateOfAllegedMisconduct
        ? new Date(dto.dateOfAllegedMisconduct)
        : null,
      disciplinary: null,
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
    const managerId = (manager._id as Types.ObjectId).toString();
    const isHod = manager.hierarchyRole === 'head_of_department';

    const dispute = await this.disputeModel
      .findOne({
        _id: new Types.ObjectId(caseId),
        tenantId: new Types.ObjectId(tenantId),
      })
      .lean();
    if (!dispute) throw new NotFoundException('Dispute case not found.');

    const complainantId = dispute.complainantId?.toString();
    const respondentIds = (dispute.respondentIds ?? []).map((r: any) =>
      r.toString(),
    );

    // A party to the case reads it from "My disputes", not from the
    // team/department view. This route is for people looking in from above.
    if (complainantId === managerId || respondentIds.includes(managerId)) {
      throw new ForbiddenException(
        'You are a party to this case — open it from My Disputes instead.',
      );
    }

    // Read access follows the "involves someone below me" rule as the
    // team-cases list — deliberately NOT restricted to
    // resolverLevel === 'manager', so a manager can still view (but not
    // act on) a case after it's been escalated. An HoD sees their whole
    // department (two levels down), a manager sees direct reports.
    const visibleIds = new Set(
      await this.getSubordinateIds(manager, isHod ? 2 : 1),
    );
    const involvesSubordinate =
      (complainantId && visibleIds.has(complainantId)) ||
      respondentIds.some((r: string) => visibleIds.has(r));
    if (!involvesSubordinate) {
      throw new ForbiddenException('You do not have access to this case.');
    }

    // A case against someone senior to the viewer (typically the HoD
    // above a manager) stays between the parties and HR.
    if (!isHod && respondentIds.length > 0) {
      const seniors = await this.employeeModel.exists({
        _id: { $in: respondentIds.map((r: string) => new Types.ObjectId(r)) },
        hierarchyRole: 'head_of_department',
      });
      const mySuperiors = await this.getSuperiorIds(manager);
      if (
        seniors ||
        respondentIds.some((r: string) => mySuperiors.includes(r))
      ) {
        throw new ForbiddenException('You do not have access to this case.');
      }
    }

    const [enriched] = await this.enrichForEmployeeView([dispute]);
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

    if (dispute.type === DisputeType.DISCIPLINARY) {
      throw new BadRequestException(
        'Disciplinary cases have their own investigation step.',
      );
    }

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

    const isDisciplinary = dispute.type === DisputeType.DISCIPLINARY;

    if (isDisciplinary) {
      const notice = (dispute as any).disciplinary?.notice;
      if (dispute.stage !== DisputeStage.NOTICE_OF_ALLEGATIONS || !notice) {
        throw new BadRequestException(
          'The notice of allegations must be served before a hearing invitation can be issued.',
        );
      }
      const hoursNotice =
        (new Date(dto.scheduledAt).getTime() - Date.now()) / 3_600_000;
      if (hoursNotice < 48) {
        throw new BadRequestException(
          'The employee must be given at least 48 hours notice of the hearing.',
        );
      }
    } else if (dispute.stage !== DisputeStage.INVESTIGATE) {
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

    if (isDisciplinary) {
      this.sendDisciplinaryHearingInvitation(saved).catch(() => {});
    } else {
      this.notifyPartiesOfHearing(saved).catch(() => {});
    }

    return saved;
  }

  async recordOutcome(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: RecordOutcomeDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);

    const isDisciplinary = dispute.type === DisputeType.DISCIPLINARY;

    const canRecordOutcome = isDisciplinary
      ? dispute.stage === DisputeStage.FINDING
      : dispute.stage === DisputeStage.HEARING ||
        (dispute.type === 'incident' &&
          dispute.stage === DisputeStage.INVESTIGATE);

    if (!canRecordOutcome) {
      throw new BadRequestException(
        isDisciplinary
          ? 'A finding must be recorded before the sanction can be set.'
          : dispute.type === 'incident'
            ? 'Investigation must be completed before an outcome can be recorded.'
            : 'A hearing must be scheduled before an outcome can be recorded.',
      );
    }

    // Sanctions belong to disciplinary cases only; every other type keeps
    // the outcome options it always had.
    if (isDisciplinary) {
      if (!DISCIPLINARY_SANCTIONS.includes(dto.decision)) {
        throw new BadRequestException(
          'That decision is not a disciplinary sanction.',
        );
      }
      const finding = (dispute as any).disciplinary?.finding;
      if (
        finding?.decision === DisciplinaryFindingDecision.NOT_GUILTY &&
        dto.decision !== DisputeOutcomeDecision.NO_ACTION
      ) {
        throw new BadRequestException(
          'The employee was found not guilty, so no sanction can be imposed.',
        );
      }
    } else if (
      [
        DisputeOutcomeDecision.VERBAL_WARNING,
        DisputeOutcomeDecision.WRITTEN_WARNING,
        DisputeOutcomeDecision.DEMOTION,
        DisputeOutcomeDecision.SUSPENSION_WITHOUT_PAY,
        DisputeOutcomeDecision.DISMISSAL_WITH_NOTICE,
        DisputeOutcomeDecision.SUMMARY_DISMISSAL,
      ].includes(dto.decision as DisputeOutcomeDecision)
    ) {
      throw new BadRequestException(
        'That sanction is only available on disciplinary cases.',
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
      warningExpiryDate: null,
      duration: isDisciplinary
        ? this.sanctionDuration(dto.decision, (dto as any).duration)
        : null,
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

    if (dispute.type === DisputeType.DISCIPLINARY) {
      throw new BadRequestException(
        'Disciplinary appeals are heard first — schedule the appeal hearing, then record the appeal outcome.',
      );
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
      DisputeStage.NOTICE_OF_ALLEGATIONS,
      DisputeStage.HEARING,
      DisputeStage.FINDING,
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

    const [enriched] = await this.enrichForEmployeeView([dispute]);
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

    return this.enrichForEmployeeView(disputes);
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

    return this.enrichForEmployeeView(disputes);
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

    if (
      dispute.type === DisputeType.DISCIPLINARY &&
      (dispute.outcome as any)?.decision === DisputeOutcomeDecision.NO_ACTION
    ) {
      throw new BadRequestException(
        'No sanction was imposed, so there is nothing to appeal.',
      );
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
    const saved = await dispute.save();

    if (saved.type === DisputeType.DISCIPLINARY) {
      // HR needs to know straight away: the next steps (appeal hearing,
      // appeal outcome) are theirs.
      this.eventEmitter.emit('hr.dispute.appeal_filed', {
        tenantId,
        caseNumber: saved.caseNumber,
        employeeName: `${employee.firstName} ${employee.lastName}`,
      });
    }
    return saved;
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
    return this.enrichForEmployeeView(disputes);
  }

  async getCasesForHod(tenantId: string, hodUserId: string) {
    const hod = await this.employeeModel.findOne({
      userId: new Types.ObjectId(hodUserId),
    });
    if (!hod || hod.hierarchyRole !== 'head_of_department') return [];

    // Two-hop: managers under HoD, then everyone under those managers
    const allDepartmentIds = await this.getSubordinateIds(hod, 2);
    if (allDepartmentIds.length === 0) return [];

    // Cases the HoD is personally a party to (filed by them, or against
    // them) are NOT part of this oversight list — they belong in the
    // HoD's own "filed by me / filed against me" tabs, and a HoD must not
    // get a supervisory window onto a complaint about themselves.
    const disputes = await this.disputeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        complainantId: { $ne: hod._id },
        respondentIds: { $ne: hod._id },
        $or: [
          { complainantId: { $in: allDepartmentIds } },
          { respondentIds: { $in: allDepartmentIds } },
        ],
      })
      .sort({ filedAt: -1 })
      .lean();

    return this.enrichForEmployeeView(disputes);
  }

  // ═══════════════════════════════════════════════════════════════
  // DISCIPLINARY PROCEDURE (HR / tenant side)
  //
  // 1 Case logged · 2 Precautionary suspension · 3 Investigation ·
  // 4 Notice of allegations · 5 Employee response · 6 Hearing
  // invitation · 7 Hearing · 8 Finding & mitigation · 9 Sanction &
  // outcome notification · 10 Appeal (filed by the employee; HR
  // schedules the appeal hearing and records its outcome).
  //
  // Steps 1, 5, 6, 9 and the employee's appeal reuse the shared
  // openCase / respondToDispute / scheduleHearing / recordOutcome /
  // fileAppeal paths (branching on type); the rest live here. Nothing
  // below is reachable for grievance, incident or report cases.
  // ═══════════════════════════════════════════════════════════════

  private async getDisciplinaryCase(
    tenantId: string,
    caseId: string,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getCase(tenantId, caseId);
    if (dispute.type !== DisputeType.DISCIPLINARY) {
      throw new BadRequestException('This is not a disciplinary case.');
    }
    this.assertResolverIsTenant(dispute);
    if (
      [DisputeStatus.CLOSED, DisputeStatus.ESCALATED_EXTERNAL].includes(
        dispute.status as DisputeStatus,
      )
    ) {
      throw new BadRequestException('This case is closed.');
    }
    return dispute;
  }

  private disciplinaryState(dispute: DisputeCaseDocument): any {
    if (!(dispute as any).disciplinary) (dispute as any).disciplinary = {};
    return (dispute as any).disciplinary;
  }

  private sanctionLabel(decision: string): string {
    const labels: Record<string, string> = {
      no_action: 'No action',
      verbal_warning: 'Verbal warning',
      written_warning: 'Written warning',
      first_warning: 'First warning',
      second_warning: 'Second warning',
      final_warning: 'Final written warning',
      demotion: 'Demotion',
      suspension: 'Suspension without pay',
      suspension_without_pay: 'Suspension without pay',
      dismissal_with_notice: 'Dismissal with notice',
      summary_dismissal: 'Summary dismissal (gross misconduct)',
      termination: 'Termination',
    };
    return labels[decision] ?? decision;
  }

  // The tenant states how long a sanction lasts — the system never works
  // it out. A duration makes no sense for "no action" or a dismissal, so
  // it is dropped there; an unpaid suspension must say how long it is for.
  private sanctionDuration(
    decision: string,
    duration?: { value: number; unit: string } | null,
  ): { value: number; unit: string } | null {
    const hasNoDuration = [
      DisputeOutcomeDecision.NO_ACTION,
      DisputeOutcomeDecision.DISMISSAL_WITH_NOTICE,
      DisputeOutcomeDecision.SUMMARY_DISMISSAL,
    ].includes(decision as DisputeOutcomeDecision);
    if (hasNoDuration) return null;

    if (!duration?.value || !duration?.unit) {
      if (decision === DisputeOutcomeDecision.SUSPENSION_WITHOUT_PAY) {
        throw new BadRequestException(
          'State how long the suspension without pay lasts.',
        );
      }
      return null;
    }
    return { value: duration.value, unit: duration.unit };
  }

  private formatDuration(
    d?: { value: number; unit: string } | null,
  ): string | null {
    if (!d?.value || !d?.unit) return null;
    const unit = d.value === 1 ? d.unit.replace(/s$/, '') : d.unit;
    return `${d.value} ${unit}`;
  }

  private addWorkingDays(from: Date, days: number): Date {
    const d = new Date(from);
    let added = 0;
    while (added < days) {
      d.setDate(d.getDate() + 1);
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) added++;
    }
    return d;
  }

  private formatDateTime(d: Date | string): string {
    return new Date(d).toLocaleString('en-GB', {
      dateStyle: 'long',
      timeStyle: 'short',
    });
  }

  private formatDate(d: Date | string): string {
    return new Date(d).toLocaleDateString('en-GB', { dateStyle: 'long' });
  }

  // Sends one formal letter to every respondent on the case (a
  // disciplinary case has exactly one). Email trouble never blocks the
  // procedural step it announces.
  private async sendLetterToRespondents(
    dispute: DisputeCaseDocument,
    letter: {
      subject: string;
      heading: string;
      paragraphs: string[];
      details?: { label: string; value: string }[];
      listTitle?: string;
      listItems?: string[];
    },
  ): Promise<boolean> {
    const respondents = await this.employeeModel
      .find({ _id: { $in: dispute.respondentIds ?? [] } })
      .select('firstName lastName email')
      .lean();

    let sent = false;
    await Promise.all(
      respondents
        .filter((r) => !!r.email)
        .map(async (r) => {
          await this.emailService
            .sendDisciplinaryLetter({
              to: r.email as string,
              recipientName: `${r.firstName} ${r.lastName}`,
              caseNumber: dispute.caseNumber,
              dashboardUrl: `${process.env.TENANT_APP_URL}/my/disputes`,
              ...letter,
            })
            .then(() => {
              sent = true;
            })
            .catch(() => {});
        }),
    );
    return sent;
  }

  private caseDetails(dispute: DisputeCaseDocument) {
    return [
      { label: 'Policy', value: dispute.policyTitle ?? '—' },
      { label: 'Clause(s)', value: dispute.particularClause ?? '—' },
    ];
  }

  // ── Step 2 — precautionary suspension ───────────────────────────
  async recordDisciplinarySuspension(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: DisciplinarySuspensionDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getDisciplinaryCase(tenantId, caseId);
    if (
      ![
        DisputeStage.CASE_REPORTED,
        DisputeStage.INVESTIGATE,
        DisputeStage.NOTICE_OF_ALLEGATIONS,
      ].includes(dispute.stage as DisputeStage)
    ) {
      throw new BadRequestException(
        'A precautionary suspension can only be decided before the hearing.',
      );
    }
    const state = this.disciplinaryState(dispute);
    if (state.suspension?.decision === 'issued') {
      throw new BadRequestException(
        'A precautionary suspension has already been issued on this case.',
      );
    }

    const issued = dto.decision === 'issued';
    state.suspension = {
      decision: dto.decision,
      effectiveDate:
        issued && dto.effectiveDate ? new Date(dto.effectiveDate) : null,
      reason: issued ? (dto.reason ?? null) : null,
      conditions: issued ? (dto.conditions ?? []) : [],
      decidedAt: new Date(),
      decidedBy: new Types.ObjectId(hrUserId),
      letterSentAt: null,
    };
    dispute.markModified('disciplinary');
    let saved = await dispute.save();

    if (issued) {
      const sent = await this.sendLetterToRespondents(saved, {
        subject: `Precautionary suspension — Case ${saved.caseNumber}`,
        heading: 'Precautionary suspension',
        paragraphs: [
          `Following the allegations brought to our attention, you are suspended from duty with effect from ${this.formatDate(state.suspension.effectiveDate ?? new Date())}, pending the outcome of an investigation.`,
          `Reason: ${dto.reason}`,
          'This suspension is precautionary and is NOT a disciplinary sanction. You will continue to receive your full salary and benefits. If you wish to make representations against the suspension, please do so in writing within 48 hours.',
        ],
        listTitle: 'Conditions during the suspension',
        listItems: dto.conditions?.length
          ? dto.conditions
          : ['Full pay continues'],
      });
      if (sent) {
        (saved as any).disciplinary.suspension.letterSentAt = new Date();
        saved.markModified('disciplinary');
        saved = await saved.save();
      }
    }
    return saved;
  }

  // ── Step 3 — investigation ──────────────────────────────────────
  async recordDisciplinaryInvestigation(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: DisciplinaryInvestigationDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getDisciplinaryCase(tenantId, caseId);
    if (dispute.stage !== DisputeStage.CASE_REPORTED) {
      throw new BadRequestException(
        'The investigation can only be opened on a case that has just been logged.',
      );
    }
    const state = this.disciplinaryState(dispute);
    if (!state.suspension) {
      throw new BadRequestException(
        'Decide on a precautionary suspension (issue it, or skip it) before the investigation.',
      );
    }

    state.investigation = {
      officer: dto.officer,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      findings: dto.findings,
      recommendation: dto.recommendation,
      submittedAt: new Date(),
      submittedBy: new Types.ObjectId(hrUserId),
    };
    this.pushStageHistory(
      dispute,
      DisputeStage.INVESTIGATE,
      dto.findings,
      hrUserId,
    );
    dispute.stage = DisputeStage.INVESTIGATE;
    dispute.status = DisputeStatus.UNDER_INVESTIGATION;
    dispute.markModified('disciplinary');
    dispute.markModified('stageHistory');
    return dispute.save();
  }

  // ── Step 4 — notice of allegations (drafted and served in one go) ─
  async serveNoticeOfAllegations(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: ServeNoticeOfAllegationsDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getDisciplinaryCase(tenantId, caseId);
    const state = this.disciplinaryState(dispute);
    if (dispute.stage !== DisputeStage.INVESTIGATE || !state.investigation) {
      throw new BadRequestException(
        'The investigation must be completed before a notice of allegations is served.',
      );
    }
    if (
      state.investigation.recommendation !==
      InvestigationRecommendation.PROCEED_TO_HEARING
    ) {
      throw new BadRequestException(
        'The investigation did not recommend proceeding to a hearing. Close the case, or record a new investigation outcome.',
      );
    }

    const servedAt = new Date();
    const responseDueBy = this.addWorkingDays(
      servedAt,
      dto.responseDeadlineDays,
    );
    state.notice = {
      charges: dto.charges,
      clauseBreached: dto.clauseBreached,
      maxSanction: dto.maxSanction,
      responseDeadlineDays: dto.responseDeadlineDays,
      responseDueBy,
      servedAt,
      servedBy: new Types.ObjectId(hrUserId),
    };
    this.pushStageHistory(
      dispute,
      DisputeStage.NOTICE_OF_ALLEGATIONS,
      dto.charges,
      hrUserId,
    );
    dispute.stage = DisputeStage.NOTICE_OF_ALLEGATIONS;
    dispute.status = DisputeStatus.UNDER_INVESTIGATION;
    dispute.markModified('disciplinary');
    dispute.markModified('stageHistory');
    const saved = await dispute.save();

    const dismissalPossible = [
      DisputeOutcomeDecision.DISMISSAL_WITH_NOTICE,
      DisputeOutcomeDecision.SUMMARY_DISMISSAL,
    ].includes(dto.maxSanction as DisputeOutcomeDecision);

    this.sendLetterToRespondents(saved, {
      subject: `Notice of allegations — Case ${saved.caseNumber}`,
      heading: 'Notice of allegations',
      paragraphs: [
        'We write to formally notify you that the following allegation(s) have been made against you.',
        dismissalPossible
          ? 'You are advised that dismissal is a possible outcome of these proceedings, should the allegations be proven.'
          : `The maximum sanction that can follow these proceedings is: ${this.sanctionLabel(dto.maxSanction)}.`,
        `Please respond in writing through your dashboard by ${this.formatDate(responseDueBy)} (${dto.responseDeadlineDays} working days). A hearing will be scheduled to decide the matter and you will receive a separate invitation.`,
      ],
      details: [
        { label: 'Allegation(s)', value: dto.charges },
        { label: 'Rule / clause breached', value: dto.clauseBreached },
        ...this.caseDetails(saved),
        {
          label: 'Maximum sanction',
          value: this.sanctionLabel(dto.maxSanction),
        },
      ],
      listTitle: 'Your rights',
      listItems: [
        'Respond to these allegations in writing within the response deadline',
        'Be represented at any hearing by a fellow employee or trade union representative',
        'Call witnesses and present evidence in your defence',
        'Cross-examine any witnesses called against you',
        'Receive copies of all evidence before any hearing',
      ],
    }).catch(() => {});

    return saved;
  }

  // Step 6 (hearing invitation) is ScheduleHearingDto through the
  // shared scheduleHearing(); this is the formal letter it sends.
  private async sendDisciplinaryHearingInvitation(
    dispute: DisputeCaseDocument,
  ): Promise<void> {
    const hearing = (dispute as any).hearing;
    const notice = (dispute as any).disciplinary?.notice;
    if (!hearing) return;

    await this.sendLetterToRespondents(dispute, {
      subject: `Disciplinary hearing invitation — Case ${dispute.caseNumber}`,
      heading: 'Invitation to a disciplinary hearing',
      paragraphs: [
        `You are invited to attend a disciplinary hearing on ${this.formatDateTime(hearing.scheduledAt)}.`,
        'An impartial chairperson will preside. The employer will present its case, you will have the opportunity to respond, and witnesses may be called and cross-examined. The hearing may proceed in your absence if you do not attend without good cause.',
      ],
      details: [
        {
          label: 'Format',
          value:
            hearing.mode === 'online'
              ? `Online (${String(hearing.meetingPlatform ?? '').replace('_', ' ')})`
              : 'In person',
        },
        hearing.mode === 'online'
          ? { label: 'Meeting link', value: hearing.meetingLink ?? '—' }
          : { label: 'Venue', value: hearing.venue ?? '—' },
        ...(notice
          ? [{ label: 'Allegation(s)', value: notice.charges as string }]
          : []),
        ...this.caseDetails(dispute),
        ...(hearing.notes ? [{ label: 'Notes', value: hearing.notes }] : []),
      ],
      listTitle: 'Your rights',
      listItems: [
        'Be represented by a fellow employee or trade union representative',
        'Call witnesses and present evidence in your defence',
        'Cross-examine any witnesses called against you',
      ],
    });
  }

  // ── Step 7 — hearing minutes ────────────────────────────────────
  async recordHearingMinutes(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: RecordHearingMinutesDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getDisciplinaryCase(tenantId, caseId);
    if (dispute.stage !== DisputeStage.HEARING) {
      throw new BadRequestException(
        'Minutes can only be recorded once a hearing has been scheduled.',
      );
    }
    this.disciplinaryState(dispute).hearingRecord = {
      minutes: dto.minutes,
      checklist: dto.checklist ?? [],
      recordedAt: new Date(),
      recordedBy: new Types.ObjectId(hrUserId),
    };
    dispute.markModified('disciplinary');
    return dispute.save();
  }

  // ── Step 8 — finding & mitigation ───────────────────────────────
  async recordDisciplinaryFinding(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: RecordDisciplinaryFindingDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getDisciplinaryCase(tenantId, caseId);
    const state = this.disciplinaryState(dispute);
    if (dispute.stage !== DisputeStage.HEARING || !state.hearingRecord) {
      throw new BadRequestException(
        'Record the hearing minutes before the finding.',
      );
    }
    state.finding = {
      decision: dto.decision,
      reasons: dto.reasons,
      mitigatingFactors: dto.mitigatingFactors ?? null,
      aggravatingFactors: dto.aggravatingFactors ?? null,
      recordedAt: new Date(),
      recordedBy: new Types.ObjectId(hrUserId),
    };
    this.pushStageHistory(
      dispute,
      DisputeStage.FINDING,
      `${dto.decision.replace('_', ' ')} — ${dto.reasons}`,
      hrUserId,
    );
    dispute.stage = DisputeStage.FINDING;
    dispute.markModified('disciplinary');
    dispute.markModified('stageHistory');
    return dispute.save();
  }

  // Step 9's letter — finding, sanction, right to appeal.
  private async sendDisciplinaryOutcomeNotice(
    dispute: DisputeCaseDocument,
  ): Promise<void> {
    const outcome = (dispute as any).outcome;
    const finding = (dispute as any).disciplinary?.finding;
    if (!outcome) return;

    const appealable = outcome.decision !== DisputeOutcomeDecision.NO_ACTION;
    const appealBy = this.addWorkingDays(new Date(), 5);

    const sent = await this.sendLetterToRespondents(dispute, {
      subject: `Outcome of disciplinary hearing — Case ${dispute.caseNumber}`,
      heading: 'Outcome of your disciplinary hearing',
      paragraphs: [
        'Further to the hearing held in your matter, we write to inform you of the outcome.',
        appealable
          ? `You have the right to appeal this decision. Your appeal must be made in writing through your dashboard, stating your grounds, by ${this.formatDate(appealBy)} (5 working days). It will be heard by a different and more senior person than the original chairperson.${
              [
                DisputeOutcomeDecision.DISMISSAL_WITH_NOTICE,
                DisputeOutcomeDecision.SUMMARY_DISMISSAL,
              ].includes(outcome.decision)
                ? ' If you appeal, the dismissal is suspended until the appeal outcome is determined, unless there are compelling reasons otherwise.'
                : ''
            }`
          : 'No sanction has been imposed.',
      ],
      details: [
        ...this.caseDetails(dispute),
        ...(finding
          ? [
              {
                label: 'Finding',
                value: `${String(finding.decision).replace('_', ' ')} — ${finding.reasons}`,
              },
            ]
          : []),
        {
          label: 'Sanction',
          value: this.sanctionLabel(outcome.decision),
        },
        ...(outcome.notes
          ? [{ label: 'Reasons for sanction', value: outcome.notes }]
          : []),
        ...(this.formatDuration(outcome.duration)
          ? [
              {
                label: 'Duration',
                value: this.formatDuration(outcome.duration) as string,
              },
            ]
          : outcome.warningExpiryDate
            ? [
                {
                  label: 'Warning valid until',
                  value: this.formatDate(outcome.warningExpiryDate),
                },
              ]
            : []),
      ],
    });

    if (sent) {
      outcome.emailSentAt = new Date();
      dispute.markModified('outcome');
      await dispute.save();
    }
  }

  // ── Step 10 — appeal hearing & appeal outcome (HR side) ─────────
  async scheduleDisciplinaryAppealHearing(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: ScheduleDisciplinaryAppealHearingDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getDisciplinaryCase(tenantId, caseId);
    const appeal = dispute.appeal as any;
    if (dispute.stage !== DisputeStage.APPEAL || !appeal || appeal.resolvedAt) {
      throw new BadRequestException(
        'There is no open appeal on this case. The employee must file one first.',
      );
    }

    appeal.hearing = {
      scheduledAt: new Date(dto.scheduledAt),
      mode: dto.mode,
      venue: dto.mode === 'physical' ? (dto.venue ?? null) : null,
      meetingPlatform:
        dto.mode === 'online' ? (dto.meetingPlatform ?? null) : null,
      meetingLink: dto.mode === 'online' ? (dto.meetingLink ?? null) : null,
      chairperson: dto.chairperson,
      scheduledBy: new Types.ObjectId(hrUserId),
      notes: dto.notes ?? null,
    };
    dispute.markModified('appeal');
    const saved = await dispute.save();

    const h = appeal.hearing;
    this.sendLetterToRespondents(saved, {
      subject: `Appeal hearing — Case ${saved.caseNumber}`,
      heading: 'Your appeal hearing',
      paragraphs: [
        `Your appeal will be heard on ${this.formatDateTime(h.scheduledAt)} by ${h.chairperson}, who was not part of the original hearing.`,
      ],
      details: [
        {
          label: 'Format',
          value:
            h.mode === 'online'
              ? `Online (${String(h.meetingPlatform ?? '').replace('_', ' ')})`
              : 'In person',
        },
        h.mode === 'online'
          ? { label: 'Meeting link', value: h.meetingLink ?? '—' }
          : { label: 'Venue', value: h.venue ?? '—' },
        { label: 'Your grounds', value: appeal.grounds },
        ...(h.notes ? [{ label: 'Notes', value: h.notes }] : []),
      ],
    }).catch(() => {});

    return saved;
  }

  async recordDisciplinaryAppealOutcome(
    tenantId: string,
    caseId: string,
    hrUserId: string,
    dto: RecordDisciplinaryAppealOutcomeDto,
  ): Promise<DisputeCaseDocument> {
    const dispute = await this.getDisciplinaryCase(tenantId, caseId);
    const appeal = dispute.appeal as any;
    if (dispute.stage !== DisputeStage.APPEAL || !appeal || appeal.resolvedAt) {
      throw new BadRequestException('There is no open appeal on this case.');
    }
    if (!appeal.hearing) {
      throw new BadRequestException(
        'Schedule the appeal hearing before recording its outcome.',
      );
    }
    if (
      dto.decision === AppealDecision.PARTIALLY_UPHELD &&
      (!dto.newSanction || !DISCIPLINARY_SANCTIONS.includes(dto.newSanction))
    ) {
      throw new BadRequestException(
        'Choose the reduced sanction for a partially upheld appeal.',
      );
    }

    appeal.reviewedBy = new Types.ObjectId(hrUserId);
    appeal.decision = dto.decision;
    appeal.resolvedAt = new Date();
    appeal.notes = dto.reasons;
    appeal.newSanction =
      dto.decision === AppealDecision.PARTIALLY_UPHELD
        ? (dto.newSanction ?? null)
        : null;
    appeal.newSanctionDuration =
      dto.decision === AppealDecision.PARTIALLY_UPHELD && dto.newSanction
        ? this.sanctionDuration(dto.newSanction, dto.newSanctionDuration)
        : null;

    this.pushStageHistory(dispute, DisputeStage.APPEAL, dto.reasons, hrUserId);
    // The appeal outcome is final within the internal process. The case
    // stays "outcome recorded" so HR can still record it on file, start
    // offboarding, escalate externally or close it.
    dispute.status = DisputeStatus.OUTCOME_RECORDED;
    dispute.markModified('appeal');
    dispute.markModified('stageHistory');
    const saved = await dispute.save();

    const decisionText: Record<string, string> = {
      dismissed: 'Your appeal was dismissed — the original sanction is upheld.',
      partially_upheld: `Your appeal was partially upheld — the sanction is reduced to: ${this.sanctionLabel(appeal.newSanction ?? '')}${this.formatDuration(appeal.newSanctionDuration) ? ` (${this.formatDuration(appeal.newSanctionDuration)})` : ''}.`,
      upheld:
        'Your appeal was upheld — the finding and sanction are overturned.',
    };
    this.sendLetterToRespondents(saved, {
      subject: `Appeal outcome — Case ${saved.caseNumber}`,
      heading: 'Outcome of your appeal',
      paragraphs: [
        decisionText[dto.decision],
        `Reasons: ${dto.reasons}`,
        'This outcome is final within the internal process. If you remain dissatisfied you may take the matter to the labour authority or labour court.',
      ],
    }).catch(() => {});

    return saved;
  }

  // ── Tenant-facing wrappers for the steps above are the methods
  // themselves: getDisciplinaryCase() already requires the case to be
  // with HR, and a disciplinary case always is.
}
