import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CommsGroupDocument = CommsGroup & Document;
export type CommsContactDocument = CommsContact & Document;
export type CommsTemplateDocument = CommsTemplate & Document;
export type CommsMessageDocument = CommsMessage & Document;
export type CommsSettingsDocument = CommsSettings & Document;

export enum CommsMessageStatus {
  DRAFT = 'draft',
  PENDING = 'pending', // submitted, awaiting an approver
  READY = 'ready', // approved and held on standby (media statement)
  SENT = 'sent',
}

export enum CommsMessageKind {
  INITIAL = 'initial',
  UPDATE = 'update',
}

export enum CommsDelivery {
  EMAILED = 'emailed',
  FAILED = 'failed',
  // The contact is a route (regulator portal, formal letter, a call)
  // rather than an email address. Lexora records the notice as issued
  // but does not itself deliver it through that route.
  MANUAL = 'manual',
}

export enum CommsRecipientKind {
  CONTACT = 'contact',
  CLIENT = 'client',
}

// Where a stakeholder group's recipients come from.
export enum CommsGroupSource {
  CONTACTS = 'contacts', // contacts kept in the register
  CRM_CLIENTS = 'crm_clients', // real client records in CRM
}

export class CommsTrigger {
  // Bring the group in at this incident level and above (null = unused).
  @Prop({ type: Number, default: null }) minLevel: number | null;
  // ...or when the incident is one of these types.
  @Prop({ type: [String], default: [] }) types: string[];
  // ...or when Incident Response has flagged one of these.
  @Prop({ type: [String], default: [] }) flags: string[];
}

// A stakeholder group — who must hear from the firm during an incident,
// by when, how, and the incident conditions that bring it into the plan.
@Schema({ timestamps: true, collection: 'grc_comms_groups' })
export class CommsGroup {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: 'handshake' }) icon: string;
  @Prop({ default: '#3b36db' }) color: string;
  // Position in the notification order (lowest first).
  @Prop({ default: 0 }) order: number;
  // Hours after the incident is declared. Null with reactive = true.
  @Prop({ type: Number, default: null }) slaHours: number | null;
  @Prop({ default: false }) reactive: boolean;
  @Prop({ default: 'Email', trim: true }) channel: string;
  @Prop({ default: '', trim: true }) statutory: string;
  @Prop({ type: Types.ObjectId, ref: 'Employee', default: null })
  ownerEmployeeId: Types.ObjectId | null;
  @Prop({ default: '' }) ownerName: string;
  @Prop({ type: CommsTrigger, default: () => ({}) }) trigger: CommsTrigger;
  // The incident level from which a notice to this group must be
  // approved before it is sent. 1 = always, 4 = Level 4 only,
  // 0 = never needs approval.
  @Prop({ default: 1 }) approvalMinLevel: number;
  @Prop({ enum: CommsGroupSource, default: CommsGroupSource.CONTACTS })
  source: CommsGroupSource;
  // Seeded by Lexora (true) or added by the tenant (false).
  @Prop({ default: false }) custom: boolean;
  // Stable key of the seeded groups so templates can be linked to them.
  @Prop({ default: '' }) key: string;
}
export const CommsGroupSchema = SchemaFactory.createForClass(CommsGroup);

@Schema({ timestamps: true, collection: 'grc_comms_contacts' })
export class CommsContact {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;
  @Prop({
    type: Types.ObjectId,
    ref: 'CommsGroup',
    required: true,
    index: true,
  })
  groupId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: '', trim: true }) role: string;
  // An email address, or a route such as "Submitted through the NCSA
  // portal". Only a valid address is ever emailed.
  @Prop({ default: '', trim: true }) email: string;
  @Prop({ default: '', trim: true }) phone: string;
}
export const CommsContactSchema = SchemaFactory.createForClass(CommsContact);

@Schema({ timestamps: true, collection: 'grc_comms_templates' })
export class CommsTemplate {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  // Null = any stakeholder.
  @Prop({ type: Types.ObjectId, ref: 'CommsGroup', default: null })
  groupId: Types.ObjectId | null;
  @Prop({ default: '' }) description: string;
  @Prop({ required: true }) subject: string;
  @Prop({ required: true }) body: string;
  @Prop({ default: false }) custom: boolean;
  // Stable key of a seeded template, so the composer can pick the right
  // default (e.g. the data-breach client notice only for a breach).
  @Prop({ default: '' }) key: string;
  // True once the tenant has changed the seeded wording.
  @Prop({ default: false }) edited: boolean;
}
export const CommsTemplateSchema = SchemaFactory.createForClass(CommsTemplate);

export class CommsActor {
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  userId: Types.ObjectId | null;
  @Prop({ default: '' }) name: string;
}

export class CommsRecipient {
  @Prop({ enum: CommsRecipientKind, required: true })
  kind: CommsRecipientKind;
  // CommsContact id, or the client's User id.
  @Prop({ type: Types.ObjectId, required: true }) refId: Types.ObjectId;
  @Prop({ default: '' }) name: string;
  @Prop({ default: '' }) email: string;
  @Prop({ default: '' }) phone: string;
  @Prop({ default: '' }) role: string;
  // Filled in when the message is sent.
  @Prop({ enum: CommsDelivery, default: null }) delivery: CommsDelivery | null;
  @Prop({ default: '' }) error: string;
  @Prop({ type: Date, default: null }) deliveredAt: Date | null;
}

export class CommsReceipt {
  @Prop({ type: Date, required: true }) at: Date;
  @Prop({ default: '' }) ref: string;
  @Prop({ default: '' }) note: string;
  @Prop({ type: CommsActor, default: () => ({}) }) loggedBy: CommsActor;
}

@Schema({ timestamps: true, collection: 'grc_comms_messages' })
export class CommsMessage {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;
  @Prop({
    type: Types.ObjectId,
    ref: 'BcpIncident',
    required: true,
    index: true,
  })
  incidentId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'CommsGroup', required: true })
  groupId: Types.ObjectId;
  // Snapshots, so the record stays readable if the group is renamed.
  @Prop({ default: '' }) groupName: string;
  @Prop({ default: '' }) channel: string;

  @Prop({ enum: CommsMessageKind, default: CommsMessageKind.INITIAL })
  kind: CommsMessageKind;
  @Prop({ type: Types.ObjectId, ref: 'CommsTemplate', default: null })
  templateId: Types.ObjectId | null;
  @Prop({ required: true }) subject: string;
  @Prop({ required: true }) body: string;
  @Prop({ type: [CommsRecipient], default: [] }) recipients: CommsRecipient[];

  @Prop({ enum: CommsMessageStatus, default: CommsMessageStatus.DRAFT })
  status: CommsMessageStatus;

  @Prop({ type: CommsActor, default: () => ({}) }) createdBy: CommsActor;
  @Prop({ type: CommsActor, default: null }) approvedBy: CommsActor | null;
  @Prop({ type: Date, default: null }) approvedAt: Date | null;
  @Prop({ type: Date, default: null }) submittedAt: Date | null;
  @Prop({ type: Date, default: null }) sentAt: Date | null;
  // Set when an approver returns a submitted notice with comments;
  // cleared on the next save.
  @Prop({ default: '' }) returnedNote: string;
  @Prop({ type: CommsReceipt, default: null }) confirm: CommsReceipt | null;
}
export const CommsMessageSchema = SchemaFactory.createForClass(CommsMessage);
CommsMessageSchema.index({ tenantId: 1, incidentId: 1, groupId: 1 });

// One row per tenant: remembers that the default stakeholder groups and
// templates have been put in place, so deleting them all later does not
// quietly bring them back.
@Schema({ timestamps: true, collection: 'grc_comms_settings' })
export class CommsSettings {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  tenantId: Types.ObjectId;
  @Prop({ default: false }) seeded: boolean;
}
export const CommsSettingsSchema = SchemaFactory.createForClass(CommsSettings);
