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

  @Prop({ required: true }) dueDate: Date;
  @Prop({ required: true, default: 0 }) estimateHrs: number;
  @Prop({ default: 0 }) loggedHrs: number;

  // Free text, matching the prototype — mandates don't have a rigid
  // phase list, just a phase *count* on their template.
  @Prop({ default: 'Delivery' }) phase: string;
  @Prop({ default: null }) recurring: string | null;
}
export const TaskSchema = SchemaFactory.createForClass(Task);
