import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── Time entries ──────────────────────────────────────────────

export type TimeEntryDocument = TimeEntry & Document;

export enum TimesheetStatus {
  DRAFT = 'Draft',
  SUBMITTED = 'Submitted',
  LEAD_APPROVED = 'Lead Approved',
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
}
export const TIMESHEET_STATUSES: TimesheetStatus[] =
  Object.values(TimesheetStatus);

@Schema({ timestamps: true, collection: 'crm_time_entries' })
export class TimeEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // Real Employee reference — same convention as Task.assigneeUserId,
  // so "my timesheet" can filter on it the same way "my tasks" does.
  @Prop({ type: Types.ObjectId, required: true, index: true })
  memberUserId: Types.ObjectId;
  @Prop({ required: true }) member: string;

  // mandateName/taskTitle are supplied by the caller rather than
  // resolved server-side (mirrors Mandate.clientName's pattern) —
  // deliberately, to keep TimeEntryService a leaf service with no
  // dependency on MandateService/TaskService. Task and Mandate go
  // the other way, depending on TimeEntryService for their computed
  // loggedHrs/wip, and that direction would become circular if this
  // one also depended on them.
  @Prop({ type: Types.ObjectId, ref: 'Mandate', required: true, index: true })
  mandateId: Types.ObjectId;
  @Prop({ required: true }) mandateName: string;

  @Prop({ type: Types.ObjectId, ref: 'Task', default: null, index: true })
  taskId: Types.ObjectId | null;
  @Prop({ default: 'Ad-hoc work' }) taskTitle: string;

  @Prop({ default: '' }) narrative: string;
  @Prop({ required: true }) date: Date;
  @Prop({ required: true }) hours: number;
  @Prop({ default: true }) billable: boolean;

  // Snapshotted from the rate card at creation time — a rate change
  // later shouldn't rewrite the value of already-logged history.
  @Prop({ default: 0 }) rate: number;
  @Prop({ default: 'USD' }) currency: string;

  @Prop({ enum: TimesheetStatus, default: TimesheetStatus.DRAFT, index: true })
  status: TimesheetStatus;
  @Prop({ default: null }) rejectReason: string | null;
}
export const TimeEntrySchema = SchemaFactory.createForClass(TimeEntry);

// ── Rate cards ────────────────────────────────────────────────

export type RateCardDocument = RateCard & Document;

@Schema({ timestamps: true, collection: 'crm_rate_cards' })
export class RateCard {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  employeeUserId: Types.ObjectId;
  @Prop({ required: true }) member: string;
  @Prop({ default: '' }) role: string;

  @Prop({ required: true, default: 0 }) standardRate: number;
  @Prop({ default: 'USD' }) currency: string;
}
export const RateCardSchema = SchemaFactory.createForClass(RateCard);
RateCardSchema.index({ tenantId: 1, employeeUserId: 1 }, { unique: true });
