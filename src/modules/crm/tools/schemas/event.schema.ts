import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── Events — CRM → Tools → Event Management. Replaces the former
// browser-local prototype (localStorage eventsStore) with a real,
// tenant-scoped entity: publishing actually sends real emails via
// EmailService, and attendance is a real signal rather than a
// manually-clicked status.
//
// Two real event shapes, picked at creation and fixed for the
// event's life (no mode switch after invitees exist — see
// EventService.create):
//   - External: the tenant invites real CRM Contacts. Each invite
//     gets its own personal registration link; submitting that form
//     is itself the attendance signal — there's no separate manual
//     "check in" step once a registration comes in.
//   - InHouse: the tenant invites its own real Clients, Board
//     Members and/or Employees — any mix. No registration step:
//     each invitee acknowledges attendance directly from their own
//     portal (client portal / board portal / employee dashboard),
//     and that acknowledgement is the attendance signal.
// ───────────────────────────────────────────────────────────────

export type EventType =
  | 'Webinar'
  | 'Conference'
  | 'Workshop'
  | 'Networking'
  | 'Client briefing';
export const EVENT_TYPES: EventType[] = [
  'Webinar',
  'Conference',
  'Workshop',
  'Networking',
  'Client briefing',
];

export enum EventMode {
  IN_HOUSE = 'InHouse',
  EXTERNAL = 'External',
}

export enum EventStatus {
  DRAFT = 'Draft',
  PUBLISHED = 'Published',
  COMPLETED = 'Completed',
  CANCELLED = 'Cancelled',
}

// Which real collection an invitee comes from. Contact is External-
// only; Client/BoardMember/Employee are InHouse-only — enforced by
// EventService, not by the schema itself.
export enum EventAudienceType {
  CLIENT = 'Client',
  BOARD_MEMBER = 'BoardMember',
  EMPLOYEE = 'Employee',
  CONTACT = 'Contact',
}

export enum EventInviteStatus {
  INVITED = 'Invited',
  // External only — set the moment their personal registration link
  // is submitted. Per the product owner, a submitted registration is
  // itself sufficient attendance tracking — there is no further
  // manual "check in" action on top of it.
  REGISTERED = 'Registered',
  // InHouse only — set when the invitee acknowledges attendance from
  // their own portal.
  ACKNOWLEDGED = 'Acknowledged',
  DECLINED = 'Declined',
}

@Schema({ _id: false })
export class EventInvite {
  @Prop({ required: true }) id: string;
  @Prop({ enum: EventAudienceType, required: true })
  audienceType: EventAudienceType;
  // Real id into whichever collection `audienceType` names (User for
  // Client, BoardMember, Employee, Contact) — no single `ref` since
  // it varies by audience, same convention as
  // CampaignRecipient.sourceType/sourceId in newsletter.schema.ts.
  @Prop({ type: Types.ObjectId, required: true }) sourceId: Types.ObjectId;
  @Prop({ required: true }) name: string;
  @Prop({ required: true, lowercase: true, trim: true }) email: string;
  @Prop({ default: '' }) organisation: string;

  @Prop({ enum: EventInviteStatus, default: EventInviteStatus.INVITED })
  status: EventInviteStatus;

  // Personal link slug — only meaningful for External/Contact
  // invites (the public /event-register/:token page); still assigned
  // for InHouse invites for schema uniformity, but never used since
  // their path is portal acknowledgement, not a public link.
  @Prop({ required: true }) token: string;

  // Real send timestamp — null until the event is actually published
  // (or, for an invite added after publishing, until it is actually
  // emailed). Never backdated or assumed.
  @Prop({ default: null }) sentAt: Date | null;
  @Prop({ default: null }) deliveryError: string | null;
  @Prop({ default: null }) respondedAt: Date | null;

  // External-registration-only detail, collected at registration
  // time on the public form.
  @Prop({ default: '' }) phone: string;
  @Prop({ default: '' }) notes: string;
}
export const EventInviteSchema = SchemaFactory.createForClass(EventInvite);

export type EventDocument = Event & Document;

@Schema({ timestamps: true, collection: 'crm_tools_events' })
export class Event {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) title: string;
  @Prop({ required: true }) type: EventType;
  @Prop({ enum: EventMode, required: true, index: true }) mode: EventMode;
  @Prop({ enum: EventStatus, default: EventStatus.DRAFT, index: true })
  status: EventStatus;

  @Prop({ default: '' }) description: string;
  @Prop({ required: true }) date: Date;
  @Prop({ default: '' }) startTime: string;
  @Prop({ default: '' }) endTime: string;
  @Prop({ default: '' }) location: string;
  @Prop({ default: false }) virtual: boolean;
  @Prop({ default: '' }) meetingLink: string;
  // 0 = unlimited.
  @Prop({ default: 0 }) capacity: number;
  @Prop({ default: '' }) host: string;
  @Prop({ default: '' }) agenda: string;
  // External only — real registration cutoff; meaningless for
  // InHouse events (no registration step), left null there.
  @Prop({ default: null }) registrationDeadline: Date | null;

  @Prop({ type: [EventInviteSchema], default: [] })
  invites: EventInvite[];

  @Prop({ default: null }) publishedAt: Date | null;
}
export const EventSchema = SchemaFactory.createForClass(Event);
