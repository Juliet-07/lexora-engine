import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CaseOutcomeDocument = CaseOutcome & Document;

export type OutcomeCaseKind = 'adr' | 'litigation';

/**
 * The four things a tenant records when a case reaches a result:
 *   Settlement          — ADR, an agreed settlement
 *   Award               — ADR, an award / outcome of the process
 *   Consent judgment    — litigation, a settlement made an order of court
 *   Judgment            — litigation, the court's judgment or order
 */
export enum CaseOutcomeKind {
  SETTLEMENT = 'Settlement',
  AWARD = 'Award',
  CONSENT_JUDGMENT = 'Consent judgment',
  JUDGMENT = 'Judgment',
}

export enum CaseOutcomeStatus {
  DRAFT = 'Draft',
  RECORDED = 'Recorded',
}

// URL slugs used by the API for each kind.
export const OUTCOME_SLUGS: Record<string, CaseOutcomeKind> = {
  settlement: CaseOutcomeKind.SETTLEMENT,
  award: CaseOutcomeKind.AWARD,
  'consent-judgment': CaseOutcomeKind.CONSENT_JUDGMENT,
  judgment: CaseOutcomeKind.JUDGMENT,
};

@Schema({ _id: false })
export class CaseOutcomeActor {
  @Prop({ type: Types.ObjectId, default: null }) userId: Types.ObjectId | null;
  @Prop({ default: '' }) name: string;
}
export const CaseOutcomeActorSchema =
  SchemaFactory.createForClass(CaseOutcomeActor);

// One entry per time the record was shared, so the tenant can see
// exactly who got what, how, and when.
@Schema({ _id: true })
export class CaseOutcomeShare {
  @Prop({ default: () => new Date() }) at: Date;
  @Prop({ type: CaseOutcomeActorSchema, default: () => ({}) })
  by: CaseOutcomeActor;
  @Prop({ type: [String], default: [] }) channels: string[];
  @Prop({ type: [String], default: [] }) recipients: string[];
  @Prop({ type: [String], default: [] }) documents: string[];
  @Prop({ default: '' }) delivery: string;
  @Prop({ default: '' }) subject: string;
  @Prop({ default: '' }) text: string;
  @Prop({ default: false }) portalPublished: boolean;
  @Prop({ default: false }) acknowledgementRequested: boolean;
  @Prop({ default: false }) commentsAllowed: boolean;
  @Prop({ default: 0 }) emailsSent: number;
  @Prop({ type: [String], default: [] }) emailsFailed: string[];
}
export const CaseOutcomeShareSchema =
  SchemaFactory.createForClass(CaseOutcomeShare);

// Earlier versions of a record that was recorded again.
@Schema({ _id: false })
export class CaseOutcomeRevision {
  @Prop() version: number;
  @Prop() recordedAt: Date;
  @Prop({ type: CaseOutcomeActorSchema, default: () => ({}) })
  recordedBy: CaseOutcomeActor;
  @Prop({ type: Object, default: {} }) form: Record<string, any>;
}
export const CaseOutcomeRevisionSchema =
  SchemaFactory.createForClass(CaseOutcomeRevision);

/**
 * One row per (case, kind). The form the tenant filled in is kept in
 * `form` exactly as it was normalised on save; everything the rest of
 * the app needs to list or sort on (amount, currency, summary) is
 * derived from it and stored alongside.
 */
@Schema({ timestamps: true, collection: 'crm_case_outcomes' })
export class CaseOutcome {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ enum: ['adr', 'litigation'], required: true }) caseKind: string;
  @Prop({ type: Types.ObjectId, required: true, index: true })
  caseId: Types.ObjectId;

  @Prop({ enum: CaseOutcomeKind, required: true }) kind: CaseOutcomeKind;
  // The more specific type chosen in the form — settlement type,
  // award type, judgment type; equal to `kind` for a consent judgment.
  @Prop({ default: '' }) subtype: string;

  @Prop({ enum: CaseOutcomeStatus, default: CaseOutcomeStatus.DRAFT })
  status: CaseOutcomeStatus;
  @Prop({ default: 1 }) version: number;

  @Prop({ type: Object, default: {} }) form: Record<string, any>;

  @Prop({ default: 0 }) amount: number;
  @Prop({ default: '' }) currency: string;
  @Prop({ default: '' }) summary: string;
  // The date the result itself is dated (agreed / awarded / delivered).
  @Prop({ default: null }) occurredOn: Date | null;
  // Last day to challenge / appeal, when the record has one.
  @Prop({ default: null }) challengeDeadline: Date | null;

  @Prop({ type: Types.ObjectId, default: null })
  documentId: Types.ObjectId | null;
  @Prop({ default: '' }) documentName: string;

  @Prop({ type: CaseOutcomeActorSchema, default: () => ({}) })
  recordedBy: CaseOutcomeActor;
  @Prop({ default: null }) recordedAt: Date | null;

  @Prop({ type: [CaseOutcomeShareSchema], default: [] })
  shared: CaseOutcomeShare[];
  @Prop({ type: [CaseOutcomeRevisionSchema], default: [] })
  revisions: CaseOutcomeRevision[];

  // Reminder keys already sent ("pay:2:3d", "challenge:7d"), so the
  // daily job never repeats itself.
  @Prop({ type: [String], default: [] }) remindersSent: string[];
}
export const CaseOutcomeSchema = SchemaFactory.createForClass(CaseOutcome);
CaseOutcomeSchema.index(
  { tenantId: 1, caseKind: 1, caseId: 1, kind: 1 },
  { unique: true },
);
