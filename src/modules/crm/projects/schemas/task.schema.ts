import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TaskDocument_ = Task & Document;

export enum TaskStatus {
  BACKLOG = 'Backlog',
  IN_PROGRESS = 'In Progress',
  IN_REVIEW = 'In Review',
  DONE = 'Done',
}
export const TASK_STATUSES: TaskStatus[] = Object.values(TaskStatus);

export enum TaskPriority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical',
}

export enum DependencyType {
  FINISH_TO_START = 'FS',
  START_TO_START = 'SS',
  FINISH_TO_FINISH = 'FF',
  START_TO_FINISH = 'SF',
}

@Schema({ timestamps: true, collection: 'crm_tasks' })
export class Task {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) title: string;

  @Prop({ type: Types.ObjectId, ref: 'Mandate', required: true, index: true })
  mandateId: Types.ObjectId;
  @Prop({ required: true }) mandateName: string;

  // Display name always present (matches the confirmed prototype's
  // free-text fallback when a mandate has no team). assigneeUserId is
  // the real employee reference, set whenever the assignee was picked
  // from the real HR dropdown — this is what "my tasks" filtering for
  // the employee view keys off, so it matters even though nothing in
  // this phase reads it yet.
  @Prop({ required: true }) assignee: string;
  @Prop({ type: Types.ObjectId, default: null })
  assigneeUserId: Types.ObjectId | null;

  @Prop({ enum: TaskStatus, default: TaskStatus.BACKLOG, index: true })
  status: TaskStatus;
  @Prop({ enum: TaskPriority, required: true }) priority: TaskPriority;

  // Gantt bar positioning needs both ends — dueDate alone (the
  // original shape) can only anchor the end. Optional rather than
  // required so existing tasks aren't broken by this addition;
  // service-layer normalization falls back to createdAt when absent.
  @Prop({ default: null }) startDate: Date | null;
  @Prop({ required: true }) dueDate: Date;
  @Prop({ required: true, default: 0 }) estimateHrs: number;
  // No stored loggedHrs — it's the sum of this task's Approved time
  // entries, computed in TaskService, never written to directly.

  // WBS hierarchy and dependencies — self-referencing, both optional.
  @Prop({ type: Types.ObjectId, ref: 'Task', default: null })
  parentTaskId: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, ref: 'Task', default: null })
  dependsOnTaskId: Types.ObjectId | null;
  @Prop({ enum: DependencyType, default: null })
  depType: DependencyType | null;

  // Manually set by the tenant, not computed via a critical-path
  // algorithm — that's a meaningfully bigger undertaking than a WBS
  // view needs right now.
  @Prop({ default: false }) critical: boolean;

  // Free text, matching the prototype — mandates don't have a rigid
  // phase list, just a phase *count* on their template.
  @Prop({ default: 'Delivery' }) phase: string;
  @Prop({ default: null }) recurring: string | null;
}
export const TaskSchema = SchemaFactory.createForClass(Task);
