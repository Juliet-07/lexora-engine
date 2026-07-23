import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GovernanceMeetingDocument = GovernanceMeeting & Document;

export enum MeetingAudienceType {
  BOARD = 'Board',
  COMMITTEE = 'Committee',
  EXECUTIVE = 'Executive',
  AD_HOC = 'Ad-hoc',
}

export enum MeetingMode {
  PHYSICAL = 'Physical',
  ONLINE = 'Online',
}

export enum MeetingPlatform {
  ZOOM = 'Zoom',
  GOOGLE_MEET = 'Google Meet',
  MS_TEAMS = 'Microsoft Teams',
}

export enum MeetingStatus {
  DRAFT = 'Draft',
  SENT = 'Sent',
  HELD = 'Held',
  POSTPONED = 'Postponed',
}

export const ACK_TOKEN_EXPIRY_DAYS = 7;
export const ACK_REMINDER_INTERVAL_HOURS = 48;

@Schema({ _id: false })
export class AckToken {
  @Prop({ required: true }) token: string;
  @Prop({ required: true, lowercase: true }) attendeeEmail: string;
  @Prop({ required: true }) attendeeName: string;
  @Prop({ required: true, default: () => new Date() }) createdAt: Date;
  @Prop({ default: null }) lastReminderSentAt: Date | null;
}
export const AckTokenSchema = SchemaFactory.createForClass(AckToken);

@Schema({ _id: false })
export class DocumentAck {
  @Prop({ required: true }) name: string;
  @Prop({ default: null }) fileUrl: string | null;
  @Prop({ required: true, default: () => new Date() }) ackedAt: Date;
  @Prop({ required: true }) method: string;
}
export const DocumentAckSchema = SchemaFactory.createForClass(DocumentAck);

@Schema({ _id: false })
export class MeetingAcknowledgment {
  @Prop({ required: true }) attendeeName: string;
  @Prop({ required: true, lowercase: true }) attendeeEmail: string;
  @Prop({ required: true }) agendaConfirmed: boolean;
  @Prop({ type: [DocumentAckSchema], default: [] }) documents: DocumentAck[];
  @Prop({ required: true, default: () => new Date() }) confirmedAt: Date;
  @Prop({ required: true }) signature: string;
}
export const MeetingAcknowledgmentSchema = SchemaFactory.createForClass(
  MeetingAcknowledgment,
);

@Schema({ _id: false })
export class MeetingAttendee {
  @Prop({ required: true }) name: string;
  @Prop({ required: true, lowercase: true, trim: true }) email: string;
  @Prop({ default: '' }) role: string;
  @Prop({ default: null }) attendanceAllPresent: boolean | null;
  @Prop({ type: [Number], default: [] }) attendancePresentIndices: number[];
  @Prop({ default: null }) attendanceRecordedAt: Date | null;
}
export const MeetingAttendeeSchema =
  SchemaFactory.createForClass(MeetingAttendee);

@Schema({ _id: false })
export class MeetingAgendaItem {
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) presenter: string;
  @Prop({ default: 10 }) durationMinutes: number;
}
export const MeetingAgendaItemSchema =
  SchemaFactory.createForClass(MeetingAgendaItem);

@Schema({ _id: false })
export class BoardPackDocument {
  @Prop({ required: true }) name: string;
  @Prop({ default: null }) fileUrl: string | null;
  @Prop({ default: null }) mimeType: string | null;
  @Prop({ default: 0 }) size: number;
  @Prop({ required: true, default: () => new Date() }) uploadedAt: Date;
}

export const BoardPackDocumentSchema =
  SchemaFactory.createForClass(BoardPackDocument);

@Schema({ timestamps: true, collection: 'grc_governance_meetings' })
export class GovernanceMeeting {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ enum: MeetingAudienceType, required: true })
  type: MeetingAudienceType;

  @Prop({ required: true })
  date: Date;

  @Prop({ enum: MeetingMode, required: true })
  mode: MeetingMode;

  @Prop({ default: null })
  venue: string | null;

  @Prop({ default: null })
  meetingLink: string | null;

  @Prop({ enum: MeetingPlatform, default: null })
  platform: MeetingPlatform | null;

  // Computed server-side from mode/venue/platform/meetingLink at
  // creation — a display convenience, never trusted from the client.
  @Prop({ required: true })
  location: string;

  // Plain text, prefilled client-side from live Board/Committee data
  // at creation time — a snapshot, freely editable afterward, not a
  // live reference (matches the frontend's own design).
  @Prop({ required: true })
  chair: string;

  @Prop({ type: Types.ObjectId, ref: 'Committee', default: null })
  committeeId: Types.ObjectId | null;

  @Prop({ default: '' })
  notes: string;

  @Prop({ enum: MeetingStatus, default: MeetingStatus.DRAFT })
  status: MeetingStatus;

  @Prop({ type: [MeetingAttendeeSchema], default: [] })
  attendees: MeetingAttendee[];

  @Prop({ type: [MeetingAgendaItemSchema], default: [] })
  agenda: MeetingAgendaItem[];

  @Prop({ type: [BoardPackDocumentSchema], default: [] })
  boardPack: BoardPackDocument[];

  @Prop({ default: null })
  sentAt: Date | null;

  @Prop({ default: null })
  minutes: string | null;

  @Prop({ default: null })
  minutesSentAt: Date | null;

  @Prop({ default: null })
  attendanceAllPresent: boolean | null;

  @Prop({ type: [Number], default: [] })
  attendancePresentIndices: number[];

  @Prop({ default: null })
  attendanceRecordedAt: Date | null;

  @Prop({ type: [{ index: Number, note: String }], default: [] })
  attendanceAbsenceNotes: { index: number; note: string }[];

  @Prop({ type: [AckTokenSchema], default: [] }) ackTokens: AckToken[];
  @Prop({ type: [MeetingAcknowledgmentSchema], default: [] })
  acknowledgments: MeetingAcknowledgment[];

  @Prop({ default: null })
  postponementReason: string | null;

  @Prop({ default: null })
  postponedAt: Date | null;
}
export const GovernanceMeetingSchema =
  SchemaFactory.createForClass(GovernanceMeeting);
