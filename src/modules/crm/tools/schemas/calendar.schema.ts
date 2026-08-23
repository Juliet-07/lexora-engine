import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── Calendar — real manual events (Personal/Team/Client, or an
// ad-hoc one-off under any layer) get a real record here. The
// Contract, Compliance, and ADR layers are never stored as events —
// they're computed live from ToolContract.expiresOn/obligations,
// ComplianceObligation.nextDueDate, and AdrCase sessions
// respectively, in CalendarAggregationService, so they can never
// drift from the real records they represent. External provider
// sync (Microsoft 365/Google/Apple) has no real OAuth connection
// here — the frontend is expected to show that honestly as
// "not connected" rather than this schema faking a synced state. ──

export enum CalendarLayer {
  PERSONAL = 'Personal',
  TEAM = 'Team',
  CLIENT = 'Client',
  COMPLIANCE = 'Compliance',
  ADR = 'ADR',
  CONTRACT = 'Contract',
}
export enum RecurrenceRule {
  NONE = 'None',
  DAILY = 'Daily',
  WEEKLY = 'Weekly',
  MONTHLY = 'Monthly',
}
export enum VirtualProvider {
  TEAMS = 'Teams',
  ZOOM = 'Zoom',
  GOOGLE_MEET = 'Google Meet',
}

export type CalendarEventDocument = CalendarEvent & Document;

@Schema({ timestamps: true, collection: 'crm_tools_calendar_events' })
export class CalendarEvent {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) title: string;
  // Kept as separate date/time strings (YYYY-MM-DD / HH:MM) rather
  // than a single Date — matches what the calendar grid actually
  // needs and avoids timezone-conversion surprises for a
  // firm-internal scheduling tool.
  @Prop({ required: true }) date: string;
  @Prop({ required: true }) time: string;

  @Prop({ enum: CalendarLayer, required: true, index: true })
  layer: CalendarLayer;
  @Prop({ default: '' }) location: string;

  @Prop({ enum: VirtualProvider, default: null })
  virtualProvider: VirtualProvider | null;
  // Real, user-entered meeting link — never auto-generated. The
  // organiser creates the actual Teams/Zoom/Meet meeting themselves
  // and pastes the real link here.
  @Prop({ default: '' }) virtualLink: string;

  @Prop({ enum: RecurrenceRule, default: RecurrenceRule.NONE })
  recurrence: RecurrenceRule;

  @Prop({ default: '' }) createdBy: string;
}
export const CalendarEventSchema = SchemaFactory.createForClass(CalendarEvent);
