import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Regulator } from './obligation.schema';

export type RegulatoryChangeDocument = RegulatoryChange & Document;

export enum ChangeUrgency {
  ACTION_REQUIRED = 'Action Required',
  REVIEW = 'Review',
  INFORMATIONAL = 'Informational',
  NOTED = 'Noted',
}
export enum AssessmentStatus {
  UNASSIGNED = 'Unassigned',
  IN_PROGRESS = 'In Progress',
  COMPLETE = 'Complete',
}
export enum LoopStatus {
  PENDING = 'Pending',
  IN_PROGRESS = 'In Progress',
  DONE = 'Done',
  NOT_APPLICABLE = 'Not Applicable',
}

@Schema({ _id: false })
export class LoopAction {
  @Prop({ enum: LoopStatus, default: LoopStatus.PENDING }) status: LoopStatus;
  @Prop({ default: '' }) note: string;
  @Prop({ default: null }) completedAt: Date | null;
}
export const LoopActionSchema = SchemaFactory.createForClass(LoopAction);

@Schema({ timestamps: true, collection: 'compliance_regulatory_changes' })
export class RegulatoryChange {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) title: string;
  @Prop({ enum: Regulator, required: true }) regulator: Regulator;
  @Prop({ required: true }) publishedAt: Date;
  @Prop({ default: '' }) summary: string;
  @Prop({ default: '' }) fullTextRef: string;
  @Prop({ enum: ChangeUrgency, required: true }) urgency: ChangeUrgency;
  @Prop({ type: [String], default: [] }) practiceAreas: string[];

  @Prop({ type: [Types.ObjectId], ref: 'ComplianceObligation', default: [] })
  affectedObligationIds: Types.ObjectId[];
  // No UI populates this yet — preserved for future use, matching
  // the original design exactly.
  @Prop({ type: [String], default: [] }) affectedPolicyTitles: string[];

  @Prop({ default: '' }) assessmentOwner: string;
  @Prop({ default: null }) assessmentDeadline: Date | null;
  @Prop({ default: '' }) assessmentNotes: string;
  @Prop({ enum: AssessmentStatus, default: AssessmentStatus.UNASSIGNED })
  assessmentStatus: AssessmentStatus;

  // Fixed four-part closed loop — always exactly these keys, matching
  // the original design's LOOP_KEYS exactly.
  @Prop({ type: LoopActionSchema, default: () => ({}) })
  obligationAction: LoopAction;
  @Prop({ type: LoopActionSchema, default: () => ({}) })
  policyAction: LoopAction;
  @Prop({ type: LoopActionSchema, default: () => ({}) })
  clauseAction: LoopAction;
  @Prop({ type: LoopActionSchema, default: () => ({}) })
  advisoryAction: LoopAction;
}
export const RegulatoryChangeSchema =
  SchemaFactory.createForClass(RegulatoryChange);
