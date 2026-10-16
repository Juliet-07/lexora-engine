import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DemoRequestDocument = DemoRequest & Document;

// Deliberately only the 4 the Super Admin actually acts on — the
// public website's "New"/"Contacted" distinction from the old mock UI
// added nothing actionable, per the Oct 2026 request to drop them.
// A freshly submitted request starts as SCHEDULED (the slot the
// prospect picked on the public form is "on the calendar" from their
// point of view the moment they submit it) but isn't yet CONFIRMED
// (see `confirmedAt`/`meetingLink` below) until the Super Admin
// reviews it and adds a meeting link — that confirmation step is what
// actually sends the "you're booked" email.
export enum DemoRequestStatus {
  SCHEDULED = 'Scheduled',
  RESCHEDULED = 'Rescheduled',
  CANCELLED = 'Cancelled',
  COMPLETED = 'Completed',
}

@Schema({ timestamps: true, collection: 'demo_requests' })
export class DemoRequest {
  @Prop({ required: true, trim: true }) firstName: string;
  @Prop({ required: true, trim: true }) lastName: string;
  @Prop({ required: true, trim: true, lowercase: true }) email: string;
  @Prop({ default: '' }) company: string;
  @Prop({ default: '' }) industry: string;
  @Prop({ default: '' }) companySize: string;
  @Prop({ required: true, trim: true }) subject: string;
  @Prop({ type: [String], default: [] }) interests: string[];
  @Prop({ default: '' }) goals: string;

  // The slot the prospect picked, against the Super Admin's published
  // weekly availability.
  @Prop({ required: true }) requestedDay: string; // e.g. "Mon"
  @Prop({ required: true }) requestedDate: Date; // the actual calendar date of that weekday
  @Prop({ required: true }) requestedTime: string; // "HH:mm"

  // Collected up front on the public form specifically so a
  // Reschedule never has to go back and ask the prospect for a new
  // time — the Super Admin reschedules straight to this date/time.
  @Prop({ default: null }) alternateDate: Date | null;
  @Prop({ default: null }) alternateTime: string | null;

  @Prop({
    enum: DemoRequestStatus,
    default: DemoRequestStatus.SCHEDULED,
    index: true,
  })
  status: DemoRequestStatus;

  // Distinguishes "prospect picked this slot" (status=Scheduled,
  // confirmedAt=null — no email sent yet) from "Super Admin reviewed
  // it and locked in the meeting" (confirmedAt set, confirmation
  // email sent). Kept as a flag rather than a 5th status value, per
  // the Oct 2026 request for exactly 4 statuses.
  @Prop({ default: null }) confirmedAt: Date | null;
  @Prop({ default: '' }) meetingLink: string;

  // Required by the UI whenever status is set to Cancelled — the
  // email to the prospect states this reason.
  @Prop({ default: '' }) cancellationReason: string;

  @Prop({ default: '' }) notes: string;
}
export const DemoRequestSchema = SchemaFactory.createForClass(DemoRequest);
