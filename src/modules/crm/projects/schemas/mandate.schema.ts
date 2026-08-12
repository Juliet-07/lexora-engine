import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MandateDocument_ = Mandate & Document;

export enum MandateStage {
  CREATE = 'Create',
  SETUP = 'Setup',
  DELIVER = 'Deliver',
  REVIEW = 'Review',
  BILL = 'Bill',
  CLOSE = 'Close',
}
export const MANDATE_STAGES: MandateStage[] = Object.values(MandateStage);

export enum MandateType {
  AUDIT = 'Audit',
  ADVISORY = 'Advisory',
  TRANSACTION = 'Transaction',
  COMPLIANCE = 'Compliance',
  ONBOARDING = 'Onboarding',
  LITIGATION = 'Litigation',
}

export enum Rag {
  GREEN = 'Green',
  AMBER = 'Amber',
  RED = 'Red',
}

export enum FeeStructure {
  FIXED = 'Fixed fee',
  TIME_MATERIALS = 'Time & materials',
  RETAINER = 'Retainer',
  CAPPED = 'Capped fee',
}

export enum ConflictCheckStatus {
  PENDING = 'Pending',
  CLEARED = 'Cleared',
}

// What triggers advancing past each stage, and who owns it — mirrors
// the confirmed prototype's MANDATE_STAGE_META exactly, kept here
// rather than hardcoded in the frontend so the backend can enforce
// the same conflict-check gate the UI shows.
export const MANDATE_STAGE_META: Record<
  MandateStage,
  { owner: string; trigger: string }
> = {
  [MandateStage.CREATE]: {
    owner: 'Partner',
    trigger: 'Mandate created, template applied, conflict check queued.',
  },
  [MandateStage.SETUP]: {
    owner: 'Manager',
    trigger: 'Conflict check cleared — engagement letter and team setup.',
  },
  [MandateStage.DELIVER]: {
    owner: 'Team',
    trigger: 'Delivery work in progress — tasks, WBS and time logging.',
  },
  [MandateStage.REVIEW]: {
    owner: 'Manager',
    trigger: 'Quality review of deliverables before billing.',
  },
  [MandateStage.BILL]: {
    owner: 'Finance',
    trigger: 'Invoice raised against WIP and billed to the client.',
  },
  [MandateStage.CLOSE]: {
    owner: 'Partner',
    trigger: 'Closure checklist complete — documents archived.',
  },
};

// A small, fixed starting checklist — genuinely editable per mandate
// once created (see UpdateClosureItemDto), not a rigid global list.
export const DEFAULT_CLOSURE_CHECKLIST = [
  'Final deliverables sent to client',
  'All time and disbursements billed',
  'Outstanding WIP cleared or written off',
  'Engagement file completed and archived',
  'Client satisfaction survey sent',
];

export enum MilestoneStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

// One canonical shape for a milestone the employee and client mocks
// disagreed on: the client's data.ts used a 3-state status
// (completed/in_progress/pending), the employee's MyProjects.tsx
// used a boolean done flag. The 3-state version carries strictly
// more information, so it's the real one — the employee view can
// derive `done` as `status === "completed"` when it's wired up.
@Schema({ timestamps: true })
export class Milestone {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ enum: MilestoneStatus, default: MilestoneStatus.PENDING })
  status: MilestoneStatus;
  @Prop({ required: true }) date: Date;
}
export const MilestoneSchema = SchemaFactory.createForClass(Milestone);

@Schema({ _id: false })
export class ClosureChecklistItem {
  @Prop({ required: true }) label: string;
  @Prop({ default: false }) done: boolean;
}
export const ClosureChecklistItemSchema =
  SchemaFactory.createForClass(ClosureChecklistItem);

@Schema({ timestamps: true, collection: 'crm_mandates' })
export class Mandate {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // Human-facing reference, e.g. M-2026-014 — assigned once at
  // creation, sequential per tenant per year.
  @Prop({ required: true }) ref: string;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: '' }) description: string;

  // Real KYC client — matches ClientSelect on the create form exactly.
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientUserId: Types.ObjectId;
  @Prop({ required: true }) clientName: string;

  @Prop({ enum: MandateType, required: true }) type: MandateType;
  @Prop({ enum: MandateStage, default: MandateStage.CREATE, index: true })
  stage: MandateStage;
  @Prop({ enum: Rag, default: Rag.GREEN }) rag: Rag;

  @Prop({ default: '' }) manager: string;

  // Real HR team id when one's assigned — Tasks' assignee picker and
  // the employee "my mandates" view both key off this.
  @Prop({ type: Types.ObjectId, ref: 'HrTeam', default: null })
  teamId: Types.ObjectId | null;
  @Prop({ default: '' }) teamName: string;
  @Prop({ type: [String], default: [] }) team: string[];

  @Prop({ required: true }) startDate: Date;
  @Prop({ required: true }) targetDate: Date;

  @Prop({ required: true, default: 0 }) budget: number;
  @Prop({ default: 0 }) actualCost: number;
  @Prop({ default: 0 }) billed: number;
  // No stored wip — it's the sum of this mandate's Approved,
  // billable time entries, computed in MandateService.

  @Prop({ enum: FeeStructure, required: true }) feeStructure: FeeStructure;
  @Prop({ default: 0, min: 0, max: 100 }) progress: number;
  @Prop({ enum: ConflictCheckStatus, default: ConflictCheckStatus.PENDING })
  conflictCheck: ConflictCheckStatus;
  @Prop({ default: 'USD' }) currency: string;

  @Prop({ type: [ClosureChecklistItemSchema], default: [] })
  closureChecklist: Types.DocumentArray<ClosureChecklistItem>;

  // Tenant-managed, read-only to the employee and client views once
  // those are wired up.
  @Prop({ type: [MilestoneSchema], default: [] })
  milestones: Types.DocumentArray<Milestone>;

  // Folders created ahead of any document landing in them — matches
  // the confirmed prototype's addFolder() side-list. Combined with
  // DEFAULT_FOLDERS and whatever folders MandateDocument records
  // already reference, at read time in the service.
  @Prop({ type: [String], default: [] }) customFolders: string[];
}
export const MandateSchema = SchemaFactory.createForClass(Mandate);
