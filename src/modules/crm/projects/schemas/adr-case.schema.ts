import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdrCaseDocument = AdrCase & Document;

export enum AdrType {
  MEDIATION = 'Mediation',
  ARBITRATION = 'Arbitration',
  CONCILIATION = 'Conciliation',
  EXPERT_DETERMINATION = 'Expert determination',
}

// Real, sequenced workflow matching the product owner's spec exactly
// — each stage has defined real-world sub-tasks (kept as a static
// frontend reference, not stored per-case, since they're fixed
// descriptive labels, not per-case data). "Closed" is deliberately
// not a 7th stage here — it's tracked via `status` below, since a
// case can be closed by settling, by escalating, or by withdrawal,
// and those are different outcomes worth telling apart, not just a
// final stage position.
export enum AdrStage {
  INTAKE = 'Intake',
  NOTICE = 'Notice',
  DISCOVERY = 'Discovery',
  PREPARATION = 'Preparation',
  HEARING = 'Hearing',
  RESOLUTION = 'Resolution',
}
export const ADR_STAGES: AdrStage[] = Object.values(AdrStage);

// Separate from stage — a case's real disposition. Stage says
// "where in the process," status says "how it ended up," and those
// are genuinely different questions (a case can be at Hearing stage
// and still be Active; once it settles, escalates, or is withdrawn,
// status changes but the stage it was at when that happened stays
// on the record).
export enum AdrCaseStatus {
  ACTIVE = 'Active',
  RESOLVED = 'Resolved',
  ESCALATED = 'Escalated to litigation',
  WITHDRAWN = 'Withdrawn',
}

export enum SessionMode {
  PHYSICAL = 'Physical',
  VIRTUAL = 'Virtual',
}
export enum AdrSessionStatus {
  SCHEDULED = 'Scheduled',
  COMPLETED = 'Completed',
  CANCELLED = 'Cancelled',
}

export enum AdrPartyRole {
  CLAIMANT = 'Claimant',
  RESPONDENT = 'Respondent',
  MEDIATOR = 'Mediator',
  ARBITRATOR = 'Arbitrator',
  COUNSEL = 'Counsel',
  EXPERT = 'Expert',
  OTHER = 'Other',
}

export enum DisbursementCategory {
  FILING_FEE = 'Filing fee',
  MEDIATOR_ARBITRATOR_FEE = 'Mediator / arbitrator fee',
  EXPERT = 'Expert',
  VENUE = 'Venue',
  OTHER = 'Other',
}

@Schema({ _id: true })
export class AdrParty {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ enum: AdrPartyRole, required: true }) role: AdrPartyRole;
  @Prop({ default: '' }) organisation: string;
  // Set when the party is a real employee (e.g. counsel/lead) —
  // left null for external parties (the other side, an outside
  // neutral) who aren't platform users at all.
  @Prop({ type: Types.ObjectId, default: null })
  userId: Types.ObjectId | null;
}
export const AdrPartySchema = SchemaFactory.createForClass(AdrParty);

@Schema({ _id: true })
export class AdrSession {
  @Prop({ required: true }) date: Date;
  // Kept optional/free-text rather than strict time types — real
  // ADR institutions confirm sessions as "09:00–17:00" or simply
  // "morning," and forcing a strict format here would reject real
  // scheduling notes that don't fit one.
  @Prop({ default: '' }) startTime: string;
  @Prop({ default: '' }) endTime: string;
  @Prop({ enum: SessionMode, required: true }) mode: SessionMode;
  @Prop({ default: '' }) venue: string;
  @Prop({ enum: AdrSessionStatus, default: AdrSessionStatus.SCHEDULED })
  status: AdrSessionStatus;
  @Prop({ default: '' }) outcome: string;
}
export const AdrSessionSchema = SchemaFactory.createForClass(AdrSession);

@Schema({ _id: true })
export class AdrSettlement {
  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) date: Date;
  @Prop({ default: '' }) terms: string;
}
export const AdrSettlementSchema = SchemaFactory.createForClass(AdrSettlement);

// The real dependency-tracking mechanism the product owner asked
// for — every meaningful transition (stage change, session added,
// settlement recorded, type changed after a failed round) appends a
// real, dated, narrated entry here automatically, so the full
// reasoning behind where a case is and how it got there is always
// on the record, not just the current stage in isolation. Tenants
// can also add their own manual entries for real-world milestones
// that don't map to a system action (e.g. "conflict check cleared").
export enum AdrTimelineSource {
  SYSTEM = 'System',
  MANUAL = 'Manual',
}
@Schema({ _id: true })
export class AdrTimelineEntry {
  @Prop({ required: true, default: () => new Date() }) at: Date;
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) description: string;
  @Prop({ enum: AdrTimelineSource, default: AdrTimelineSource.SYSTEM })
  source: AdrTimelineSource;
}
export const AdrTimelineEntrySchema =
  SchemaFactory.createForClass(AdrTimelineEntry);

// Same real checkbox pattern Mandate's closureChecklist already
// uses — tenant-defined items, since prep requirements genuinely
// vary case to case rather than fitting one fixed list.
@Schema({ _id: true })
export class AdrChecklistItem {
  @Prop({ required: true }) label: string;
  @Prop({ default: false }) done: boolean;
}
export const AdrChecklistItemSchema =
  SchemaFactory.createForClass(AdrChecklistItem);

// Real, tenant-entered disbursement line items — deliberately not
// wired to the Purchases/vendor-bill module, which is procurement-
// shaped (POs, vendor bills) and doesn't fit a dispute's discrete
// costs (mediator fee, filing fee) cleanly. Direct entry here
// matches what the case view actually needs to show.
@Schema({ _id: true })
export class AdrDisbursement {
  @Prop({ required: true }) label: string;
  @Prop({ enum: DisbursementCategory, default: DisbursementCategory.OTHER })
  category: DisbursementCategory;
  @Prop({ required: true }) amount: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ required: true, default: () => new Date() }) date: Date;
}
export const AdrDisbursementSchema =
  SchemaFactory.createForClass(AdrDisbursement);

@Schema({ timestamps: true, collection: 'crm_adr_cases' })
export class AdrCase {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) ref: string;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ enum: AdrType, required: true }) type: AdrType;

  // Real link to the mandate this dispute sits under — a case may
  // be one piece of work within a broader advisory mandate, so
  // hours/costs specific to the dispute are tracked separately (via
  // TimeEntry/expense records' own optional caseId link), not just
  // inferred from the whole mandate.
  @Prop({ type: Types.ObjectId, ref: 'Mandate', default: null })
  mandateId: Types.ObjectId | null;
  @Prop({ default: '' }) mandateName: string;

  @Prop({ type: [AdrPartySchema], default: [] }) parties: AdrParty[];

  // A neutral is nearly always a real employee for arbitration
  // panels retired judges act as, but stays name-only here too — a
  // case may be referred to an outside neutral who isn't on staff.
  @Prop({ type: Types.ObjectId, default: null })
  neutralUserId: Types.ObjectId | null;
  @Prop({ default: '' }) neutral: string;

  @Prop({ enum: AdrStage, default: AdrStage.INTAKE, index: true })
  stage: AdrStage;
  @Prop({ enum: AdrCaseStatus, default: AdrCaseStatus.ACTIVE, index: true })
  status: AdrCaseStatus;

  @Prop({ default: 0 }) claimValue: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ required: true }) filedOn: Date;

  // Case-detail fields matching the product owner's spec — real,
  // tenant-entered context shown on the case detail view.
  @Prop({ default: '' }) category: string;
  @Prop({ default: null }) settlementTargetMin: number | null;
  @Prop({ default: null }) settlementTargetMax: number | null;
  @Prop({ default: '' }) venue: string;
  @Prop({ default: '' }) governingLaw: string;
  @Prop({ default: '' }) adrClause: string;
  // What the contract/agreement specifies happens next if this ADR
  // type fails — a descriptive note (e.g. "Arbitration (KIAC
  // rules)"), not a system-enforced rule, since the real next step
  // is genuinely a case-by-case contractual matter.
  @Prop({ default: '' }) escalationPath: string;

  @Prop({ type: [AdrSessionSchema], default: [] }) sessions: AdrSession[];
  @Prop({ type: AdrSettlementSchema, default: null })
  settlement: AdrSettlement | null;
  @Prop({ default: null }) outcome: string | null;

  @Prop({ type: [AdrTimelineEntrySchema], default: [] })
  timeline: AdrTimelineEntry[];
  @Prop({ type: [AdrChecklistItemSchema], default: [] })
  checklist: AdrChecklistItem[];
  @Prop({ type: [AdrDisbursementSchema], default: [] })
  disbursements: AdrDisbursement[];

  // Set when this case escalates to litigation (Stage 2 of this
  // build) — the forward link a "View litigation" action follows.
  // Present in the schema now so the escalation action added next
  // doesn't need a further migration.
  @Prop({ type: Types.ObjectId, ref: 'LitigationCase', default: null })
  litigationCaseId: Types.ObjectId | null;
}
export const AdrCaseSchema = SchemaFactory.createForClass(AdrCase);
