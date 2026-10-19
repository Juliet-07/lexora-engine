import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OffboardingRecordDocument = OffboardingRecord & Document;

export enum OffboardingStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  // Set when an appeal overturns or modifies the original termination
  // decision — the employee is reinstated and the offboarding process
  // stops. Distinct from COMPLETED (which means the exit went ahead).
  REVERSED = 'reversed',
}

export enum OffboardingType {
  RESIGNATION = 'resignation',
  TERMINATION = 'termination',
}

// Mirrors the "Termination category" choices HR picks when initiating
// an offboarding, each with its own fairness-checklist defaults and
// statutory guidance (see DEFAULT_FAIRNESS_CHECKLIST in the service).
export enum TerminationCategory {
  MISCONDUCT = 'misconduct',
  PERFORMANCE = 'performance',
  REDUNDANCY = 'redundancy',
  MUTUAL = 'mutual',
  RESIGNATION = 'resignation',
  FIXED_TERM = 'fixed_term',
  RETIREMENT = 'retirement',
  PROBATION = 'probation',
}

export enum NoticeHandling {
  SERVE = 'serve',
  PAYMENT_IN_LIEU = 'pil',
  GARDEN_LEAVE = 'garden',
  SUMMARY_DISMISSAL = 'summary',
}

export enum AppealOutcomeDecision {
  PENDING = 'pending',
  HEARING_SCHEDULED = 'hearing_scheduled',
  UPHELD = 'upheld',
  OVERTURNED = 'overturned',
  MODIFIED = 'modified',
  ADJOURNED = 'adjourned',
  WITHDRAWN = 'withdrawn',
}

@Schema({ _id: false })
export class ClearanceItem {
  @Prop({ required: true }) key: string;
  @Prop({ required: true }) label: string;
  @Prop({ default: false }) cleared: boolean;
  @Prop({ default: null }) clearedAt: Date | null;
  @Prop({ default: null }) notes: string | null;
}
export const ClearanceItemSchema = SchemaFactory.createForClass(ClearanceItem);

@Schema({ _id: false })
export class OffboardingFileRef {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) url: string;
  @Prop({ required: true }) mimeType: string;
  @Prop({ required: true }) size: number;
  @Prop({ required: true }) uploadedAt: Date;
}
export const OffboardingFileRefSchema =
  SchemaFactory.createForClass(OffboardingFileRef);

// Step 1: Pre-termination fairness checklist (substantive + procedural).
// Seeded from DEFAULT_FAIRNESS_CHECKLIST[category] when the record is
// created, then ticked off by HR as each item is actually satisfied.
@Schema({ _id: false })
export class FairnessItem {
  @Prop({ required: true, enum: ['substantive', 'procedural'] })
  cat: 'substantive' | 'procedural';
  @Prop({ required: true }) item: string;
  @Prop({ required: true }) detail: string;
  @Prop({ required: true, enum: ['pass', 'pending'], default: 'pending' })
  status: 'pass' | 'pending';
}
export const FairnessItemSchema = SchemaFactory.createForClass(FairnessItem);

// Step 3: Appeal period (Art. 29) — only ever present once a notice has
// been served; filing one automatically pauses the notice period.
@Schema({ _id: false })
export class OffboardingAppeal {
  @Prop({ default: '5 working days' }) window: string;
  @Prop({ default: null }) deadline: Date | null;

  @Prop({ default: false }) filed: boolean;
  @Prop({ default: null }) filedAt: Date | null;
  // Who actually filed it — the employee themselves (from their Notices
  // dashboard) or HR on their behalf. Purely informational: the outcome
  // workflow below is identical either way.
  @Prop({ enum: ['employee', 'tenant'], default: null })
  filedBy: 'employee' | 'tenant' | null;
  @Prop({ default: null }) grounds: string | null;
  @Prop({ type: OffboardingFileRefSchema, default: null })
  letterFile: OffboardingFileRef | null;

  @Prop({ default: null }) hearingDate: Date | null;
  @Prop({ enum: AppealOutcomeDecision, default: AppealOutcomeDecision.PENDING })
  status: AppealOutcomeDecision;
  @Prop({ default: null }) panelMembers: string | null;
  @Prop({ default: null }) hearingNotes: string | null;
  @Prop({ type: OffboardingFileRefSchema, default: null })
  hearingMinutesFile: OffboardingFileRef | null;

  @Prop({ default: null }) withdrawnReason: string | null;
  @Prop({ default: null }) withdrawnAt: Date | null;
  @Prop({ type: OffboardingFileRefSchema, default: null })
  withdrawnFile: OffboardingFileRef | null;
}
export const OffboardingAppealSchema =
  SchemaFactory.createForClass(OffboardingAppeal);

// Step 6: Final pay computation. Populated by
// OffboardingService.computeFinalPay() from the employee's REAL salary,
// leave balance and active loan/advance records, run through the same
// PayrollCalculationService (real PAYE/RSSB/CBHI rates) used for normal
// payroll runs — not a mockup.
@Schema({ _id: false })
export class FinalPayDeductionLine {
  @Prop({ required: true }) key: string;
  @Prop({ required: true }) label: string;
  @Prop({ required: true }) employeeAmount: number;
  @Prop({ required: true }) employerAmount: number;
  @Prop({ default: true }) visibleToEmployee: boolean;
}
export const FinalPayDeductionLineSchema = SchemaFactory.createForClass(
  FinalPayDeductionLine,
);

@Schema({ _id: false })
export class OffboardingFinalPay {
  @Prop({ required: true }) proRataDays: number;
  @Prop({ required: true }) proRataAmount: number;
  @Prop({ required: true }) leaveBalanceDays: number;
  @Prop({ required: true }) leaveBalanceAmount: number;
  // Not every exit includes a 13th month / bonus payout — the tenant
  // chooses whether to include it each time they (re)compute, and this
  // records that choice so the breakdown stays self-explanatory.
  @Prop({ default: true }) includeThirteenthMonth: boolean;
  @Prop({ required: true }) thirteenthMonthAmount: number;
  @Prop({ default: 0 }) transportAllowanceProrated: number;
  @Prop({ default: 0 }) outstandingAdvances: number;
  @Prop({ default: false }) severanceDue: boolean;
  @Prop({ default: 0 }) severanceAmount: number;
  @Prop({ required: true }) grossFinalPay: number;
  @Prop({ type: [FinalPayDeductionLineSchema], default: [] })
  deductions: FinalPayDeductionLine[];
  @Prop({ required: true }) netFinalPay: number;
  @Prop({ required: true }) currency: string;
  @Prop({ required: true }) computedAt: Date;
  @Prop({ default: false }) approved: boolean;
  @Prop({ default: null }) approvedAt: Date | null;
  @Prop({ default: null }) sentToPayrollAt: Date | null;
  // An approved final pay is excluded from the employee's next regular
  // payroll run (they're no longer active), so it has to be settled
  // and tracked separately — this is what the Payroll page's
  // "Offboarding" tab marks once the payout has actually gone out.
  @Prop({ default: false }) paid: boolean;
  @Prop({ default: null }) paidAt: Date | null;
}
export const OffboardingFinalPaySchema =
  SchemaFactory.createForClass(OffboardingFinalPay);

@Schema({ timestamps: true, collection: 'hr_offboarding_records' })
export class OffboardingRecord {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true, index: true })
  employeeId: Types.ObjectId;

  @Prop({ required: true }) employeeName: string;
  @Prop({ required: true }) jobTitle: string;

  @Prop({ enum: OffboardingType, required: true })
  type: OffboardingType;

  // Only meaningful for TERMINATION records — drives the fairness
  // checklist defaults, statutory guidance text, and (for redundancy)
  // severance eligibility in final pay.
  @Prop({ enum: TerminationCategory, default: null })
  category: TerminationCategory | null;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ default: null })
  reason: string | null;

  @Prop({ enum: OffboardingStatus, default: OffboardingStatus.NOT_STARTED })
  status: OffboardingStatus;

  // ── Step 1: Pre-termination fairness checklist ──
  @Prop({ type: [FairnessItemSchema], default: [] })
  fairnessChecklist: FairnessItem[];

  // ── Step 2: Draft & serve notice ──
  @Prop({ default: null }) noticePeriodDays: number | null;
  @Prop({ default: null }) noticePeriodLabel: string | null;
  @Prop({ enum: NoticeHandling, default: null })
  noticeType: NoticeHandling | null;
  @Prop({ default: false }) noticeServed: boolean;
  @Prop({ default: null }) noticeServedAt: Date | null;
  @Prop({ default: null }) noticeMethod: string | null;
  // The tenant's own typed notice (rich-text HTML), composed in-app and
  // emailed directly — replaces the old system-generated PDF/DOCX as
  // the primary path. Also what the employee sees on their Notices
  // dashboard. For a RESIGNATION record, this instead holds the
  // employee's own self-submitted resignation letter.
  @Prop({ default: null }) noticeContent: string | null;
  @Prop({ default: null }) noticeAcknowledgedAt: Date | null;
  @Prop({ type: OffboardingFileRefSchema, default: null })
  noticeFile: OffboardingFileRef | null;
  @Prop({ default: false }) noticePaused: boolean;
  @Prop({ default: null }) noticePausedAt: Date | null;
  @Prop({ default: null }) noticePausedReason: string | null;

  // ── Step 3: Appeal period (Art. 29) ──
  @Prop({ type: OffboardingAppealSchema, default: null })
  appeal: OffboardingAppeal | null;

  // ── Step 4: Exit interview ──
  @Prop({ default: false }) exitInterviewDone: boolean;
  @Prop({ default: null }) exitInterviewNotes: string | null;
  @Prop({ default: false }) exitFormSent: boolean;
  @Prop({ default: null }) exitFormSentAt: Date | null;
  @Prop({ default: null }) exitFormDeadline: Date | null;
  @Prop({ default: false }) exitScheduled: boolean;
  @Prop({ default: null }) exitScheduledAt: Date | null;
  @Prop({ default: null }) exitInterviewer: string | null;
  @Prop({ default: null }) exitLocation: string | null;
  @Prop({ default: null }) exitReasonCategory: string | null;
  @Prop({ default: null }) exitRating: number | null;
  @Prop({ default: null }) exitWhatWentWell: string | null;
  @Prop({ default: null }) exitWhatToImprove: string | null;
  @Prop({ default: null }) exitFairnessAssessment: string | null;

  // ── Step 5: Clearance & handover ──
  @Prop({ type: [ClearanceItemSchema], default: [] })
  clearanceChecklist: ClearanceItem[];

  @Prop({ default: null })
  handoverNotes: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedTo: Types.ObjectId | null;

  // Free-text name of who's receiving the handover — kept alongside
  // assignedTo (a User ref) since the receiving colleague is very
  // often not a system user (e.g. a junior staff member with no
  // login), matching how the prototype captures this as plain text.
  @Prop({ default: null })
  handoverAssigneeName: string | null;

  // ── Step 6: Final pay computation ──
  @Prop({ type: OffboardingFinalPaySchema, default: null })
  finalPay: OffboardingFinalPay | null;

  // ── Step 7: Certificate of service ──
  @Prop({ default: null })
  completedAt: Date | null;

  @Prop({ default: null })
  certificateOfServiceSentAt: Date | null;

  @Prop({ default: null })
  certificateGeneratedAt: Date | null;

  // The tenant uploads their own Certificate of Service document, or
  // generates a draft (via certificate/generate) which lands in this
  // same field so upload/send/re-send all work identically either way.
  @Prop({ type: OffboardingFileRefSchema, default: null })
  certificateOfServiceFile: OffboardingFileRef | null;

  // The tenant's own typed certificate (rich-text HTML) — an
  // alternative to the upload/generate-PDF path above, emailed
  // directly as the primary route now.
  @Prop({ default: null }) certificateContent: string | null;
}

export const OffboardingRecordSchema =
  SchemaFactory.createForClass(OffboardingRecord);
