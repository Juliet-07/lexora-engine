import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// The two places an approval chain applies. One workflow per tenant per key.
export const APPROVAL_MODULES = ['crm_contracts', 'grc_deals'] as const;
export type ApprovalModuleKey = (typeof APPROVAL_MODULES)[number];

export const STEP_KINDS = ['Reviewer', 'Approver'] as const;
export type StepKind = (typeof STEP_KINDS)[number];

// ── What the tenant owner configures ──────────────────────────────────
@Schema({ _id: true })
export class WorkflowStep {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ enum: STEP_KINDS, default: 'Reviewer' }) kind: StepKind;
  // Any one of these people can decide the step.
  @Prop({ type: [Types.ObjectId], default: [] }) userIds: Types.ObjectId[];
}
export const WorkflowStepSchema = SchemaFactory.createForClass(WorkflowStep);

export type ApprovalWorkflowDocument = ApprovalWorkflow & Document;

@Schema({ timestamps: true, collection: 'approval_workflows' })
export class ApprovalWorkflow {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;
  @Prop({ enum: APPROVAL_MODULES, required: true }) module: ApprovalModuleKey;
  // Employees allowed to draft and submit. The owner always can.
  @Prop({ type: [Types.ObjectId], default: [] }) drafterIds: Types.ObjectId[];
  // Reviewer / approver steps in order. The tenant owner is always the
  // last step and is not stored here.
  @Prop({ type: [WorkflowStepSchema], default: [] }) steps: WorkflowStep[];
  @Prop({ type: Types.ObjectId, default: null })
  updatedById: Types.ObjectId | null;
  @Prop({ default: '' }) updatedByName: string;
}
export const ApprovalWorkflowSchema =
  SchemaFactory.createForClass(ApprovalWorkflow);
ApprovalWorkflowSchema.index({ tenantId: 1, module: 1 }, { unique: true });

// ── The chain copied onto one contract when it is submitted ───────────
export const RUN_STEP_STATUSES = [
  'Waiting',
  'In review',
  'Approved',
  'Sent back',
  'Skipped',
] as const;
export type RunStepStatus = (typeof RUN_STEP_STATUSES)[number];

export const RUN_STATUSES = [
  'Not submitted',
  'In approval',
  'Approved',
  'Sent back',
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

@Schema({ _id: true })
export class ApprovalRunStep {
  @Prop({ required: true }) name: string;
  @Prop({ enum: [...STEP_KINDS, 'Owner'], default: 'Reviewer' })
  kind: StepKind | 'Owner';
  // Who may decide this step (empty for the owner step: the owner decides).
  @Prop({ type: [Types.ObjectId], default: [] }) userIds: Types.ObjectId[];
  @Prop({ type: [String], default: [] }) userNames: string[];
  @Prop({ enum: RUN_STEP_STATUSES, default: 'Waiting' })
  status: RunStepStatus;
  @Prop({ type: Types.ObjectId, default: null })
  decidedById: Types.ObjectId | null;
  @Prop({ default: '' }) decidedByName: string;
  @Prop({ type: Date, default: null }) decidedAt: Date | null;
  @Prop({ default: '' }) note: string;
}
export const ApprovalRunStepSchema =
  SchemaFactory.createForClass(ApprovalRunStep);

@Schema({ _id: false })
export class ApprovalRunEvent {
  @Prop({ default: () => new Date() }) at: Date;
  @Prop({ default: '' }) byName: string;
  @Prop({ default: '' }) action: string;
  @Prop({ default: '' }) detail: string;
}
export const ApprovalRunEventSchema =
  SchemaFactory.createForClass(ApprovalRunEvent);

@Schema({ _id: false })
export class ApprovalRun {
  @Prop({ enum: RUN_STATUSES, default: 'Not submitted' }) status: RunStatus;
  @Prop({ type: [ApprovalRunStepSchema], default: [] })
  steps: ApprovalRunStep[];
  @Prop({ type: Date, default: null }) submittedAt: Date | null;
  @Prop({ type: Types.ObjectId, default: null })
  submittedById: Types.ObjectId | null;
  @Prop({ default: '' }) submittedByName: string;
  @Prop({ default: '' }) sentBackReason: string;
  // How many times it has been submitted.
  @Prop({ default: 0 }) round: number;
  @Prop({ type: [ApprovalRunEventSchema], default: [] })
  history: ApprovalRunEvent[];
}
export const ApprovalRunSchema = SchemaFactory.createForClass(ApprovalRun);
