import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LeadDocument = Lead & Document;

export enum LeadStage {
  LEAD = 'lead',
  PROSPECT = 'prospect',
}

export enum LeadStatus {
  OPEN = 'open',
  CONVERTED = 'converted',
  LOST = 'lost',
}

export enum LeadSource {
  EVENT = 'event',
  REFERRAL = 'referral',
  WEB = 'web',
  COLD_OUTREACH = 'cold_outreach',
  PARTNER = 'partner',
  OTHER = 'other',
}

export enum LeadTemperature {
  HOT = 'hot',
  WARM = 'warm',
  COLD = 'cold',
}

export enum LeadQualification {
  UNQUALIFIED = 'unqualified',
  MQL = 'mql',
  SQL = 'sql',
}

export enum LeadMeetingMode {
  VIRTUAL = 'virtual',
  PHYSICAL = 'physical',
}

export enum LeadMeetingStatus {
  SCHEDULED = 'scheduled',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Schema({ _id: true })
export class LeadMeeting {
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) date: string;
  @Prop({ default: '' }) time: string;
  @Prop({ enum: LeadMeetingMode, default: LeadMeetingMode.VIRTUAL })
  mode: LeadMeetingMode;
  @Prop({ default: '' }) location: string;
  @Prop({ default: '' }) attendees: string;
  @Prop({ default: '' }) agenda: string;
  @Prop({ default: '' }) outcome: string;
  @Prop({ enum: LeadMeetingStatus, default: LeadMeetingStatus.SCHEDULED })
  status: LeadMeetingStatus;
}
export const LeadMeetingSchema = SchemaFactory.createForClass(LeadMeeting);

@Schema({ _id: true })
export class LeadDocumentEntry {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) fileUrl: string;
  @Prop({ default: 0 }) size: number;
  @Prop({ default: '' }) mimeType: string;
  @Prop({ default: '' }) message: string;
  @Prop({ required: true }) sentTo: string;
  @Prop({ required: true, default: () => new Date() }) sentAt: Date;
  @Prop({ default: '' }) sentBy: string;
}
export const LeadDocumentEntrySchema =
  SchemaFactory.createForClass(LeadDocumentEntry);

@Schema({ timestamps: true, collection: 'crm_leads' })
export class Lead {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ default: null, trim: true })
  contactName: string | null;

  @Prop({ default: null, trim: true })
  companyName: string | null;

  @Prop({ default: null })
  contactEmail: string | null;

  @Prop({ default: null })
  contactPhone: string | null;

  @Prop({ default: null })
  industry: string | null;

  @Prop({ enum: LeadSource, default: LeadSource.OTHER })
  source: LeadSource;

  @Prop({ default: null })
  sourceNote: string | null;

  @Prop({ enum: LeadStage, default: LeadStage.LEAD, index: true })
  stage: LeadStage;

  @Prop({ enum: LeadStatus, default: LeadStatus.OPEN, index: true })
  status: LeadStatus;

  @Prop({ default: null })
  notes: string | null;

  @Prop({ enum: LeadTemperature, default: LeadTemperature.WARM })
  temperature: LeadTemperature;

  @Prop({ enum: LeadQualification, default: LeadQualification.UNQUALIFIED })
  qualification: LeadQualification;

  @Prop({ type: [LeadMeetingSchema], default: [] })
  meetings: LeadMeeting[];

  @Prop({ type: [LeadDocumentEntrySchema], default: [] })
  documents: LeadDocumentEntry[];

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedToUserId: Types.ObjectId | null;

  // Milestone timestamps, not just current stage/status — a lead
  // that reached "prospect" and later converted must still count
  // toward Lead→Prospect conversion, which a snapshot of "current
  // stage" alone can't tell you once it's moved past that stage.
  @Prop({ default: null })
  reachedProspectAt: Date | null;

  @Prop({ default: null })
  convertedAt: Date | null;

  @Prop({ default: null })
  lostAt: Date | null;

  @Prop({ default: null })
  lostReason: string | null;

  // The real client account this lead became — a User document
  // (userType: CLIENT), not a separate "Client" model. Client
  // accounts in this platform ARE User documents.
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  convertedClientId: Types.ObjectId | null;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);
