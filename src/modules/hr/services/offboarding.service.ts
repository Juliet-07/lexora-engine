import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { join } from 'path';
import { readFile } from 'fs/promises';
import {
  OffboardingRecord,
  OffboardingRecordDocument,
  OffboardingStatus,
  OffboardingType,
  TerminationCategory,
  AppealOutcomeDecision,
  FairnessItem,
} from '../schemas';
import { Employee, EmployeeDocument } from '../schemas/employee.schema';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import {
  UpdateOffboardingDto,
  UpdateFairnessChecklistDto,
  ServeNoticeDto,
  FileOffboardingAppealDto,
  RecordAppealOutcomeDto,
  WithdrawAppealDto,
  UpdateExitInterviewDto,
} from '../dtos';
import { EmailService } from '../../../common/utils/mailing/email.service';
import { EmployeeService } from './employee.service';
import { LeaveService } from './leave.service';
import { EmployeeLoanService } from './employee-loan.service';
import { PayrollPolicyService } from './payroll-policy.service';
import {
  PayrollCalculationService,
  AllowanceInput,
} from './payroll-calculation.service';
import {
  TerminationNoticePdfService,
  TerminationNoticeDocxService,
  EmploymentCertificatePdfService,
} from './index';
import { LeaveType } from '../schemas/leave-policy.schema';
import { resolveBusinessName } from '../../../common/utils/resolve-business-name.util';

const DEFAULT_CLEARANCE_CHECKLIST: { key: string; label: string }[] = [
  {
    key: 'it_assets',
    label: 'IT equipment returned (laptop, phone, peripherals)',
  },
  {
    key: 'system_access',
    label: 'System access revoked (email, ERP, VPN, cloud)',
  },
  {
    key: 'finance',
    label: 'Finance clearance (expenses, advances, loans settled)',
  },
  {
    key: 'company_property',
    label: 'Company property returned (ID badge, keys, uniform)',
  },
  {
    key: 'rssb_form_3',
    label: 'RSSB Form 3 (cessation of employment) submitted',
  },
  { key: 'paye_reconciliation', label: 'RRA PAYE reconciliation completed' },
  {
    key: 'confidential_materials',
    label: 'Confidential materials returned or destroyed',
  },
  { key: 'client_handover', label: 'Client file handover completed' },
  { key: 'knowledge_transfer', label: 'Knowledge transfer documented' },
];

// Seeded onto the fairness checklist when a termination offboarding is
// created, keyed by the category HR picked. Kept deliberately generic
// (not pre-filled "pass") — HR ticks each one off as it's genuinely
// satisfied, per Article 27-30 of Law No. 66/2018.
const DEFAULT_FAIRNESS_CHECKLIST: Record<
  TerminationCategory,
  { cat: 'substantive' | 'procedural'; item: string; detail: string }[]
> = {
  [TerminationCategory.MISCONDUCT]: [
    {
      cat: 'substantive',
      item: 'Valid ground identified',
      detail:
        'Serious or gross misconduct (Art. 28) clearly identified and documented.',
    },
    {
      cat: 'substantive',
      item: 'Progressive discipline applied',
      detail:
        'Prior warnings issued where the misconduct is not gross (summary dismissal otherwise).',
    },
    {
      cat: 'substantive',
      item: 'Proportionality assessed',
      detail:
        'Sanction is proportionate to the offence; lesser alternatives considered.',
    },
    {
      cat: 'procedural',
      item: 'Written notice of allegations',
      detail:
        'Served with specific charges and a right to respond within 5 working days.',
    },
    {
      cat: 'procedural',
      item: 'Disciplinary hearing conducted',
      detail:
        'Employee given the opportunity to be heard, with right of representation.',
    },
    {
      cat: 'procedural',
      item: 'Employee response recorded',
      detail: 'Response received and documented, or non-response noted.',
    },
    {
      cat: 'procedural',
      item: 'Outcome letter issued',
      detail: 'Issued with right of appeal stated.',
    },
  ],
  [TerminationCategory.PERFORMANCE]: [
    {
      cat: 'substantive',
      item: 'Valid ground identified',
      detail:
        'Poor performance / incapacity (Art. 29) clearly identified and documented.',
    },
    {
      cat: 'substantive',
      item: 'Progressive discipline applied',
      detail:
        'A performance improvement plan (PIP) with measurable targets and reasonable timeframe was issued.',
    },
    {
      cat: 'substantive',
      item: 'Proportionality assessed',
      detail:
        'Termination is a last resort; redeployment considered and not feasible.',
    },
    {
      cat: 'procedural',
      item: 'Written notice of allegations',
      detail: 'Performance concerns communicated in writing with findings.',
    },
    {
      cat: 'procedural',
      item: 'Disciplinary hearing conducted',
      detail: 'Formal review meeting held.',
    },
    {
      cat: 'procedural',
      item: 'Employee response recorded',
      detail: 'Response received and considered.',
    },
    {
      cat: 'procedural',
      item: 'Outcome letter issued',
      detail: 'Issued with right of appeal stated.',
    },
  ],
  [TerminationCategory.REDUNDANCY]: [
    {
      cat: 'substantive',
      item: 'Valid ground identified',
      detail: 'Operational requirements / redundancy (Art. 30) documented.',
    },
    {
      cat: 'substantive',
      item: 'Progressive discipline applied',
      detail: 'N/A for redundancy — consultation process followed instead.',
    },
    {
      cat: 'substantive',
      item: 'Proportionality assessed',
      detail: 'Objective selection criteria applied (e.g. LIFO, skills-based).',
    },
    {
      cat: 'procedural',
      item: 'Written notice of allegations',
      detail: 'Redundancy notice served with consultation invitation.',
    },
    {
      cat: 'procedural',
      item: 'Disciplinary hearing conducted',
      detail: 'Consultation meeting(s) held.',
    },
    {
      cat: 'procedural',
      item: 'Employee response recorded',
      detail: "Employee's preference on notice/PILON recorded.",
    },
    {
      cat: 'procedural',
      item: 'Outcome letter issued',
      detail: 'Confirmation letter issued; severance per Art. 30 calculated.',
    },
  ],
  [TerminationCategory.PROBATION]: [
    {
      cat: 'substantive',
      item: 'Valid ground identified',
      detail: 'Probation failure (Art. 33) — reasons stated in writing.',
    },
    {
      cat: 'substantive',
      item: 'Progressive discipline applied',
      detail: 'N/A during probation.',
    },
    {
      cat: 'substantive',
      item: 'Proportionality assessed',
      detail: 'N/A during probation.',
    },
    {
      cat: 'procedural',
      item: 'Written notice of allegations',
      detail: 'Reasons for probation failure communicated in writing.',
    },
    {
      cat: 'procedural',
      item: 'Disciplinary hearing conducted',
      detail: 'N/A — 3 days written notice required instead (Art. 33).',
    },
    {
      cat: 'procedural',
      item: 'Employee response recorded',
      detail: 'Any response from the employee noted.',
    },
    {
      cat: 'procedural',
      item: 'Outcome letter issued',
      detail: 'Issued per Art. 33 notice requirement.',
    },
  ],
  [TerminationCategory.MUTUAL]: [
    {
      cat: 'substantive',
      item: 'Valid ground identified',
      detail: 'Both parties agree to end the contract.',
    },
    {
      cat: 'procedural',
      item: 'Written notice of allegations',
      detail:
        'Written settlement agreement specifying terms, final pay and waiver of claims.',
    },
    {
      cat: 'procedural',
      item: 'Outcome letter issued',
      detail: 'Agreement signed by both parties.',
    },
  ],
  [TerminationCategory.FIXED_TERM]: [
    {
      cat: 'substantive',
      item: 'Valid ground identified',
      detail: 'Fixed-term contract has reached its agreed expiry date.',
    },
    {
      cat: 'procedural',
      item: 'Outcome letter issued',
      detail:
        'Non-renewal confirmed in writing (no termination notice required).',
    },
  ],
  [TerminationCategory.RETIREMENT]: [
    {
      cat: 'substantive',
      item: 'Valid ground identified',
      detail: 'Per company policy and national retirement age.',
    },
    {
      cat: 'procedural',
      item: 'Outcome letter issued',
      detail: 'Pension/gratuity and RSSB benefits transition confirmed.',
    },
  ],
  [TerminationCategory.RESIGNATION]: [
    {
      cat: 'procedural',
      item: 'Outcome letter issued',
      detail: 'Resignation acknowledged in writing; notice period confirmed.',
    },
  ],
};

function computeNoticePeriod(
  startDate: Date,
  endDate: Date,
): { days: number; label: string } {
  const years =
    (endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years < 1) return { days: 15, label: '15 days (under 1 year service)' };
  if (years <= 5) return { days: 30, label: '1 month (1–5 years service)' };
  return { days: 60, label: '2 months (over 5 years service)' };
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

@Injectable()
export class OffboardingService {
  constructor(
    @InjectModel(OffboardingRecord.name)
    private readonly offboardingModel: Model<OffboardingRecordDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => EmployeeService))
    private readonly employeeService: EmployeeService,
    private readonly leaveService: LeaveService,
    private readonly employeeLoanService: EmployeeLoanService,
    private readonly payrollPolicyService: PayrollPolicyService,
    private readonly payrollCalculationService: PayrollCalculationService,
    private readonly noticePdfService: TerminationNoticePdfService,
    private readonly noticeDocxService: TerminationNoticeDocxService,
    private readonly certificatePdfService: EmploymentCertificatePdfService,
  ) {}

  // Called from EmployeeService.terminateEmployee() — NOT exposed as
  // a standalone "create offboarding" endpoint, since offboarding
  // should only ever originate from an actual employee exit. Keeps
  // the two flows from drifting out of sync.
  async createFromTermination(params: {
    tenantId: string;
    employeeId: string;
    employeeName: string;
    jobTitle: string;
    startDate: Date;
    endDate: Date;
    reason: string | null;
    status: 'terminated' | 'resigned';
    category?: string | null;
  }): Promise<OffboardingRecordDocument> {
    const category =
      params.status === 'resigned'
        ? null
        : ((params.category as TerminationCategory) ?? null);

    const notice = computeNoticePeriod(params.startDate, params.endDate);

    const fairnessChecklist: FairnessItem[] = category
      ? DEFAULT_FAIRNESS_CHECKLIST[category].map((f) => ({
          ...f,
          status: 'pending' as const,
        }))
      : [];

    return this.offboardingModel.create({
      tenantId: new Types.ObjectId(params.tenantId),
      employeeId: new Types.ObjectId(params.employeeId),
      employeeName: params.employeeName,
      jobTitle: params.jobTitle,
      type:
        params.status === 'resigned'
          ? OffboardingType.RESIGNATION
          : OffboardingType.TERMINATION,
      category,
      endDate: params.endDate,
      reason: params.reason,
      status: OffboardingStatus.NOT_STARTED,
      noticePeriodDays: notice.days,
      noticePeriodLabel: notice.label,
      fairnessChecklist,
      clearanceChecklist: DEFAULT_CLEARANCE_CHECKLIST.map((c) => ({
        key: c.key,
        label: c.label,
        cleared: false,
        clearedAt: null,
        notes: null,
      })),
    });
  }

  async getAll(
    tenantId: string,
    status?: string,
  ): Promise<OffboardingRecordDocument[]> {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (status) query.status = status;
    return this.offboardingModel
      .find(query)
      .sort({ endDate: -1 })
      .lean() as any;
  }

  async getById(
    tenantId: string,
    recordId: string,
  ): Promise<OffboardingRecordDocument> {
    const record = await this.offboardingModel.findOne({
      _id: recordId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!record) throw new NotFoundException('Offboarding record not found');
    return record;
  }

  private async getEmployeeFor(
    record: OffboardingRecordDocument,
  ): Promise<EmployeeDocument> {
    const employee = await this.employeeModel.findById(record.employeeId);
    if (!employee) {
      throw new NotFoundException(
        'The employee behind this offboarding record could not be found.',
      );
    }
    return employee;
  }

  private recomputeStatus(record: OffboardingRecordDocument): void {
    if (record.status === OffboardingStatus.REVERSED) return;

    const allCleared =
      record.clearanceChecklist.length > 0 &&
      record.clearanceChecklist.every((c) => c.cleared);

    const appealResolved =
      !record.appeal?.filed ||
      [AppealOutcomeDecision.UPHELD, AppealOutcomeDecision.WITHDRAWN].includes(
        record.appeal.status,
      );

    const noticeDone =
      record.type === OffboardingType.RESIGNATION || record.noticeServed;

    const allDone =
      noticeDone &&
      appealResolved &&
      record.exitInterviewDone &&
      allCleared &&
      (!!record.finalPay?.approved ||
        record.type === OffboardingType.RESIGNATION) &&
      !!record.certificateOfServiceSentAt;

    if (allDone) {
      record.status = OffboardingStatus.COMPLETED;
      record.completedAt = record.completedAt ?? new Date();
    } else if (
      record.noticeServed ||
      record.clearanceChecklist.some((c) => c.cleared) ||
      record.exitInterviewDone ||
      record.finalPay
    ) {
      record.status = OffboardingStatus.IN_PROGRESS;
    }
  }

  async update(
    tenantId: string,
    recordId: string,
    dto: UpdateOffboardingDto,
  ): Promise<OffboardingRecordDocument> {
    const record = await this.getById(tenantId, recordId);

    if (dto.exitInterviewDone !== undefined)
      record.exitInterviewDone = dto.exitInterviewDone;
    if (dto.exitInterviewNotes !== undefined)
      record.exitInterviewNotes = dto.exitInterviewNotes;
    if (dto.handoverNotes !== undefined)
      record.handoverNotes = dto.handoverNotes;
    if (dto.handoverAssigneeName !== undefined)
      record.handoverAssigneeName = dto.handoverAssigneeName;
    if (dto.assignedTo !== undefined)
      record.assignedTo = new Types.ObjectId(dto.assignedTo);

    if (dto.clearanceChecklist) {
      const byKey = new Map(record.clearanceChecklist.map((c) => [c.key, c]));
      for (const update of dto.clearanceChecklist) {
        const item = byKey.get(update.key);
        if (item) {
          item.cleared = update.cleared;
          item.clearedAt = update.cleared ? new Date() : null;
          if (update.notes !== undefined) item.notes = update.notes;
        }
      }
    }

    this.recomputeStatus(record);
    await record.save();
    return record;
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 1: PRE-TERMINATION FAIRNESS CHECKLIST
  // ═══════════════════════════════════════════════════════════

  async updateFairnessChecklist(
    tenantId: string,
    recordId: string,
    dto: UpdateFairnessChecklistDto,
  ): Promise<OffboardingRecordDocument> {
    const record = await this.getById(tenantId, recordId);
    for (const update of dto.items) {
      const item = record.fairnessChecklist[update.index];
      if (item) item.status = update.status;
    }
    this.recomputeStatus(record);
    await record.save();
    return record;
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 2: DRAFT & SERVE NOTICE
  // ═══════════════════════════════════════════════════════════

  async getNoticePdf(tenantId: string, recordId: string): Promise<Buffer> {
    const record = await this.getById(tenantId, recordId);
    const employee = await this.getEmployeeFor(record);
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    const tenant = await this.userModel
      .findById(tenantId)
      .select(
        'firstName lastName tenantProfile.businessName tenantProfile.address tenantProfile.logoUrl',
      )
      .lean();
    const profile = (tenant as any)?.tenantProfile;
    const businessAddress =
      [
        profile?.address?.city,
        profile?.address?.state,
        profile?.address?.country,
      ]
        .filter(Boolean)
        .join(', ') || null;

    return this.noticePdfService.buildNoticePdf({
      businessName,
      businessAddress,
      logoDataUrl: profile?.logoUrl || null,
      employeeName: record.employeeName,
      jobTitle: record.jobTitle,
      category: record.category ?? record.type,
      initiatedDate: (record as any).createdAt ?? new Date(),
      lastWorkingDay: record.endDate,
      noticePeriodLabel: record.noticePeriodLabel ?? 'the statutory period',
      signatoryName:
        (tenant as any)?.firstName && (tenant as any)?.lastName
          ? `${(tenant as any).firstName} ${(tenant as any).lastName}`
          : businessName,
      signatoryTitle: 'Managing Partner',
      appealWindowLabel: record.appeal?.window ?? '5 working days',
    });
  }

  async getNoticeDocx(tenantId: string, recordId: string): Promise<Buffer> {
    const record = await this.getById(tenantId, recordId);
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    const tenant = await this.userModel
      .findById(tenantId)
      .select('firstName lastName')
      .lean();

    return this.noticeDocxService.buildNoticeDocx({
      businessName,
      businessAddress: null,
      employeeName: record.employeeName,
      jobTitle: record.jobTitle,
      category: record.category ?? record.type,
      initiatedDate: (record as any).createdAt ?? new Date(),
      lastWorkingDay: record.endDate,
      noticePeriodLabel: record.noticePeriodLabel ?? 'the statutory period',
      signatoryName:
        (tenant as any)?.firstName && (tenant as any)?.lastName
          ? `${(tenant as any).firstName} ${(tenant as any).lastName}`
          : businessName,
      signatoryTitle: 'Managing Partner',
      appealWindowLabel: record.appeal?.window ?? '5 working days',
    });
  }

  async serveNotice(
    tenantId: string,
    recordId: string,
    dto: ServeNoticeDto,
  ): Promise<OffboardingRecordDocument> {
    const record = await this.getById(tenantId, recordId);

    if (
      record.fairnessChecklist.length > 0 &&
      record.fairnessChecklist.some((f) => f.status !== 'pass')
    ) {
      throw new BadRequestException(
        'Complete the pre-termination checklist before serving notice.',
      );
    }

    const servedAt = dto.servedAt ? new Date(dto.servedAt) : new Date();
    record.noticeServed = true;
    record.noticeServedAt = servedAt;
    record.noticeMethod = dto.method;
    record.noticeType = dto.noticeType as any;

    // Appeal window opens the moment notice is served (Art. 29).
    const deadline = new Date(servedAt);
    deadline.setDate(deadline.getDate() + 7); // 5 working days ≈ 7 calendar days
    record.appeal = {
      window: '5 working days',
      deadline,
      filed: false,
      filedAt: null,
      grounds: null,
      letterFile: null,
      hearingDate: null,
      status: AppealOutcomeDecision.PENDING,
      panelMembers: null,
      hearingNotes: null,
      hearingMinutesFile: null,
      withdrawnReason: null,
      withdrawnAt: null,
      withdrawnFile: null,
    } as any;

    this.recomputeStatus(record);
    await record.save();
    return record;
  }

  async uploadNoticeFile(
    tenantId: string,
    recordId: string,
    file: Express.Multer.File,
  ): Promise<OffboardingRecordDocument> {
    const record = await this.getById(tenantId, recordId);
    record.noticeFile = {
      name: file.originalname,
      url: `/uploads/offboarding/notices/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    };
    await record.save();
    return record;
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 3: APPEAL PERIOD (Art. 29)
  // ═══════════════════════════════════════════════════════════

  async fileAppeal(
    tenantId: string,
    recordId: string,
    dto: FileOffboardingAppealDto,
  ): Promise<OffboardingRecordDocument> {
    const record = await this.getById(tenantId, recordId);
    if (!record.noticeServed) {
      throw new BadRequestException(
        'The appeal window only opens once notice of termination has been served.',
      );
    }

    record.appeal = {
      ...(record.appeal as any),
      filed: true,
      filedAt: new Date(dto.filedAt),
      grounds: dto.grounds,
      hearingDate: dto.hearingDate ? new Date(dto.hearingDate) : null,
      status: dto.hearingDate
        ? AppealOutcomeDecision.HEARING_SCHEDULED
        : AppealOutcomeDecision.PENDING,
    } as any;

    record.noticePaused = true;
    record.noticePausedAt = new Date();
    record.noticePausedReason =
      'Appeal filed, notice period suspended pending outcome (Art. 29)';

    await record.save();
    return record;
  }

  async recordAppealOutcome(
    tenantId: string,
    recordId: string,
    dto: RecordAppealOutcomeDto,
  ): Promise<OffboardingRecordDocument> {
    const record = await this.getById(tenantId, recordId);
    if (!record.appeal?.filed) {
      throw new BadRequestException('No appeal has been filed on this record.');
    }

    record.appeal.status = dto.decision as AppealOutcomeDecision;
    if (dto.panelMembers !== undefined)
      record.appeal.panelMembers = dto.panelMembers;
    if (dto.notes !== undefined) record.appeal.hearingNotes = dto.notes;

    if (dto.decision === 'overturned' || dto.decision === 'modified') {
      // The termination is reversed — reinstate the employee and stop
      // the offboarding process here.
      await this.employeeService.reverseTerminationByAppeal(
        tenantId,
        record.employeeId.toString(),
      );
      record.status = OffboardingStatus.REVERSED;
      record.noticePaused = true;
      record.noticePausedReason = `Appeal ${dto.decision} — employee reinstated.`;
    } else if (dto.decision === 'upheld') {
      record.noticePaused = false;
      record.noticePausedReason = null;
      this.recomputeStatus(record);
    }
    // 'adjourned' — leave paused, awaiting a rescheduled hearing.

    await record.save();
    return record;
  }

  async withdrawAppeal(
    tenantId: string,
    recordId: string,
    dto: WithdrawAppealDto,
  ): Promise<OffboardingRecordDocument> {
    const record = await this.getById(tenantId, recordId);
    if (!record.appeal?.filed) {
      throw new BadRequestException('No appeal has been filed on this record.');
    }

    record.appeal.status = AppealOutcomeDecision.WITHDRAWN;
    record.appeal.withdrawnReason = dto.reason;
    record.appeal.withdrawnAt = new Date();
    record.noticePaused = false;
    record.noticePausedReason = null;

    this.recomputeStatus(record);
    await record.save();
    return record;
  }

  async uploadAppealFile(
    tenantId: string,
    recordId: string,
    kind: 'hearing_minutes' | 'withdrawal_letter',
    file: Express.Multer.File,
  ): Promise<OffboardingRecordDocument> {
    const record = await this.getById(tenantId, recordId);
    if (!record.appeal) {
      throw new BadRequestException('No appeal exists on this record yet.');
    }
    const fileRef = {
      name: file.originalname,
      url: `/uploads/offboarding/appeals/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    };
    if (kind === 'hearing_minutes') record.appeal.hearingMinutesFile = fileRef;
    else record.appeal.withdrawnFile = fileRef;
    await record.save();
    return record;
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 4: EXIT INTERVIEW
  // ═══════════════════════════════════════════════════════════

  async updateExitInterview(
    tenantId: string,
    recordId: string,
    dto: UpdateExitInterviewDto,
  ): Promise<OffboardingRecordDocument> {
    const record = await this.getById(tenantId, recordId);

    if (dto.formSent) {
      record.exitFormSent = true;
      record.exitFormSentAt = new Date();
    }
    if (dto.formDeadline !== undefined)
      record.exitFormDeadline = dto.formDeadline
        ? new Date(dto.formDeadline)
        : null;
    if (dto.scheduled) {
      record.exitScheduled = true;
    }
    if (dto.scheduledAt !== undefined)
      record.exitScheduledAt = dto.scheduledAt
        ? new Date(dto.scheduledAt)
        : null;
    if (dto.interviewer !== undefined) record.exitInterviewer = dto.interviewer;
    if (dto.location !== undefined) record.exitLocation = dto.location;
    if (dto.reasonCategory !== undefined)
      record.exitReasonCategory = dto.reasonCategory;
    if (dto.rating !== undefined) record.exitRating = dto.rating;
    if (dto.whatWentWell !== undefined)
      record.exitWhatWentWell = dto.whatWentWell;
    if (dto.whatToImprove !== undefined)
      record.exitWhatToImprove = dto.whatToImprove;
    if (dto.fairnessAssessment !== undefined)
      record.exitFairnessAssessment = dto.fairnessAssessment;
    if (dto.notes !== undefined) record.exitInterviewNotes = dto.notes;
    if (dto.done) record.exitInterviewDone = true;

    this.recomputeStatus(record);
    await record.save();
    return record;
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 6: FINAL PAY COMPUTATION — real numbers, not a mockup.
  // Basic salary and leave balance come from the employee's actual
  // record; statutory deductions (PAYE, RSSB pension, maternity,
  // CBHI) run through the same PayrollCalculationService used for
  // ordinary payroll runs, against the tenant's real PayrollPolicy.
  // ═══════════════════════════════════════════════════════════

  async computeFinalPay(
    tenantId: string,
    recordId: string,
  ): Promise<OffboardingRecordDocument> {
    const record = await this.getById(tenantId, recordId);
    const employee = await this.getEmployeeFor(record);

    const monthlySalary = employee.salary ?? 0;
    const currency = employee.salaryCurrency || 'RWF';
    const endDate = record.endDate;

    // Pro-rata basic salary for the exit month (calendar-day basis).
    const totalDaysInMonth = daysInMonth(endDate);
    const proRataDays = endDate.getDate();
    const proRataAmount = Math.round(
      (monthlySalary / totalDaysInMonth) * proRataDays,
    );

    // Accrued, untaken annual leave — cashed out at a calendar-day rate.
    const { balances } = await this.leaveService.getEmployeeLeaveBalance(
      record.employeeId.toString(),
      tenantId,
    );
    const annual = balances.find((b: any) => b.type === LeaveType.ANNUAL);
    const leaveBalanceDays = Math.max(0, annual?.daysLeft ?? 0);
    const dailyRate = monthlySalary / 30;
    const leaveBalanceAmount = Math.round(dailyRate * leaveBalanceDays);

    // 13th month / bonus, pro-rated by months actually worked this
    // calendar year up to the exit date.
    const yearStart = new Date(endDate.getFullYear(), 0, 1);
    const serviceStartThisYear =
      employee.startDate > yearStart ? employee.startDate : yearStart;
    const monthsThisYear = Math.max(
      0,
      Math.min(
        12,
        (endDate.getFullYear() - serviceStartThisYear.getFullYear()) * 12 +
          (endDate.getMonth() - serviceStartThisYear.getMonth()) +
          1,
      ),
    );
    const thirteenthMonthAmount = Math.round(
      (monthlySalary / 12) * monthsThisYear,
    );

    // Policy + allowances, for the statutory-deduction engine.
    const policy = await this.payrollPolicyService.getPolicyForLocation(
      tenantId,
      employee.locationId?.toString() ?? null,
    );
    if (!policy) {
      throw new BadRequestException(
        'No payroll policy is configured for this employee — set one up in Payroll before computing final pay.',
      );
    }

    const transportType = (policy as any).allowanceTypes?.find(
      (a: any) => a.isTransportAllowance,
    );
    const transportAllowance = transportType
      ? employee.allowances?.find((a) => a.key === transportType.key)
      : undefined;
    const transportAllowanceProrated = transportAllowance
      ? Math.round((transportAllowance.amount / totalDaysInMonth) * proRataDays)
      : 0;

    const allowances: AllowanceInput[] = [
      {
        key: 'leave_payout',
        label: 'Accrued annual leave payout',
        amount: leaveBalanceAmount,
      },
      {
        key: 'thirteenth_month',
        label: 'Pro-rata 13th month / bonus',
        amount: thirteenthMonthAmount,
      },
      ...(transportAllowanceProrated > 0
        ? [
            {
              key: transportType!.key,
              label: `${transportType!.label} (pro-rata)`,
              amount: transportAllowanceProrated,
              isTransportAllowance: true,
            },
          ]
        : []),
    ];

    const outstandingLoans =
      await this.employeeLoanService.getActiveLoanDeductionsForEmployee(
        record.employeeId.toString(),
        tenantId,
        endDate,
      );
    const outstandingAdvances = outstandingLoans.reduce(
      (sum, l) => sum + l.amount,
      0,
    );

    const result = this.payrollCalculationService.calculate({
      basicSalary: proRataAmount,
      allowances,
      policy: policy as any,
      loanDeductions: outstandingLoans.map((l) => ({
        loanId: l.loanId,
        label: l.label,
        amount: l.amount,
      })),
    });

    // Severance — one month's salary per year of service, only for
    // redundancy (Art. 30); untaxed, added on top of the engine's net.
    const yearsOfService =
      (endDate.getTime() - employee.startDate.getTime()) /
      (365.25 * 24 * 3600 * 1000);
    const severanceDue = record.category === TerminationCategory.REDUNDANCY;
    const severanceAmount = severanceDue
      ? Math.round(monthlySalary * Math.floor(yearsOfService))
      : 0;

    record.finalPay = {
      proRataDays,
      proRataAmount,
      leaveBalanceDays,
      leaveBalanceAmount,
      thirteenthMonthAmount,
      transportAllowanceProrated,
      outstandingAdvances,
      severanceDue,
      severanceAmount,
      grossFinalPay: result.grossSalary + severanceAmount,
      deductions: result.deductions.map((d) => ({
        key: d.key,
        label: d.label,
        employeeAmount: d.employeeAmount,
        employerAmount: d.employerAmount,
        visibleToEmployee: d.visibleToEmployee,
      })),
      netFinalPay: result.netSalary + severanceAmount,
      currency,
      computedAt: new Date(),
      approved: false,
      approvedAt: null,
      sentToPayrollAt: null,
    } as any;

    this.recomputeStatus(record);
    await record.save();
    return record;
  }

  async approveFinalPay(
    tenantId: string,
    recordId: string,
  ): Promise<OffboardingRecordDocument> {
    const record = await this.getById(tenantId, recordId);
    if (!record.finalPay) {
      throw new BadRequestException(
        'Compute the final pay breakdown before approving it.',
      );
    }

    record.finalPay.approved = true;
    record.finalPay.approvedAt = new Date();
    record.finalPay.sentToPayrollAt = new Date();

    this.recomputeStatus(record);
    await record.save();
    return record;
  }

  // Once final pay is approved, the employee drops out of the normal
  // payroll run (they're no longer active) — this is the list behind
  // the Payroll page's "Offboarding" tab, so the tenant can still see
  // what's owed and settle it outside the regular run.
  async listPayableFinalPay(tenantId: string) {
    const records = await this.offboardingModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        'finalPay.approved': true,
      })
      .sort({ 'finalPay.paid': 1, 'finalPay.approvedAt': -1 })
      .lean();

    return records.map((r: any) => ({
      _id: r._id,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      jobTitle: r.jobTitle,
      type: r.type,
      category: r.category,
      endDate: r.endDate,
      netFinalPay: r.finalPay.netFinalPay,
      grossFinalPay: r.finalPay.grossFinalPay,
      currency: r.finalPay.currency,
      approvedAt: r.finalPay.approvedAt,
      paid: !!r.finalPay.paid,
      paidAt: r.finalPay.paidAt ?? null,
    }));
  }

  async markFinalPayPaid(
    tenantId: string,
    recordId: string,
  ): Promise<OffboardingRecordDocument> {
    const record = await this.getById(tenantId, recordId);
    if (!record.finalPay?.approved) {
      throw new BadRequestException(
        'Final pay must be approved before it can be marked as paid.',
      );
    }
    if (!record.finalPay.paid) {
      record.finalPay.paid = true;
      record.finalPay.paidAt = new Date();
      await record.save();
    }
    return record;
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 7: CERTIFICATE OF SERVICE
  // ═══════════════════════════════════════════════════════════

  async generateCertificate(
    tenantId: string,
    recordId: string,
  ): Promise<OffboardingRecordDocument> {
    const record = await this.getById(tenantId, recordId);
    const employee = await this.getEmployeeFor(record);
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    const tenant = await this.userModel
      .findById(tenantId)
      .select('firstName lastName tenantProfile.address tenantProfile.logoUrl')
      .lean();
    const profile = (tenant as any)?.tenantProfile;
    const businessAddress =
      [
        profile?.address?.city,
        profile?.address?.state,
        profile?.address?.country,
      ]
        .filter(Boolean)
        .join(', ') || null;

    const pdfBuffer = await this.certificatePdfService.buildCertificatePdf({
      businessName,
      businessAddress,
      logoDataUrl: profile?.logoUrl || null,
      employeeName: record.employeeName,
      jobTitle: record.jobTitle,
      startDate: employee.startDate,
      endDate: record.endDate,
      signatoryName:
        (tenant as any)?.firstName && (tenant as any)?.lastName
          ? `${(tenant as any).firstName} ${(tenant as any).lastName}`
          : businessName,
      signatoryTitle: 'Managing Partner',
    });

    const { mkdirSync, existsSync, writeFileSync } = await import('fs');
    const { v4: uuidv4 } = await import('uuid');
    const dir = join(process.cwd(), 'uploads', 'offboarding', 'certificates');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const filename = `${uuidv4()}.pdf`;
    writeFileSync(join(dir, filename), pdfBuffer);

    record.certificateOfServiceFile = {
      name: `Certificate_of_Service_${record.employeeName.replace(/\s+/g, '_')}.pdf`,
      url: `/uploads/offboarding/certificates/${filename}`,
      mimeType: 'application/pdf',
      size: pdfBuffer.length,
      uploadedAt: new Date(),
    };
    record.certificateGeneratedAt = new Date();
    await record.save();
    return record;
  }

  // The tenant uploads their own Certificate of Service document
  // (a signed letter, a scan, whatever they already use) rather than
  // one being generated here. Available for any offboarding record —
  // resignation or termination — since issuing one is a standard HR
  // courtesy either way, not an admission of fault.
  async uploadCertificateOfService(
    tenantId: string,
    recordId: string,
    file: Express.Multer.File,
  ): Promise<OffboardingRecordDocument> {
    const record = await this.getById(tenantId, recordId);

    record.certificateOfServiceFile = {
      name: file.originalname,
      url: `/uploads/offboarding/certificates/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    };
    await record.save();
    return record;
  }

  // Emails whatever document was most recently uploaded or generated
  // via uploadCertificateOfService / generateCertificate above.
  // Re-sendable; each send refreshes certificateOfServiceSentAt.
  async sendCertificateOfService(
    tenantId: string,
    recordId: string,
  ): Promise<OffboardingRecordDocument> {
    const record = await this.getById(tenantId, recordId);

    if (!record.certificateOfServiceFile) {
      throw new BadRequestException(
        'Upload or generate the certificate of service document before sending it.',
      );
    }

    const employee = await this.employeeModel.findOne({
      _id: record.employeeId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!employee) {
      throw new NotFoundException(
        'The employee record behind this offboarding entry could not be found.',
      );
    }

    const filename = record.certificateOfServiceFile.url.split('/').pop();
    const filePath = join(
      process.cwd(),
      'uploads',
      'offboarding',
      'certificates',
      filename as string,
    );
    const fileBuffer = await readFile(filePath);

    await this.emailService.sendIssuedDocument(
      {
        to: employee.email,
        recipientName: record.employeeName,
        documentName: 'Certificate of Service',
      },
      fileBuffer,
      record.certificateOfServiceFile.name,
    );

    record.certificateOfServiceSentAt = new Date();
    this.recomputeStatus(record);
    await record.save();
    return record;
  }
}
