import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── Events — CRM → Tools → Event Management. Replaces the former
// browser-local prototype (localStorage eventsStore) with a real,
// tenant-scoped entity: publishing actually sends real emails via
// EmailService, and attendance is a real signal rather than a
// manually-clicked status.
//
// Three real event shapes, picked at creation and fixed for the
// event's life (no mode switch after invitees exist — see
// EventService.create):
//   - External: the tenant invites real CRM Contacts. Each invite
//     gets its own personal registration link; submitting that form
//     is itself the attendance signal — there's no separate manual
//     "check in" step once a registration comes in.
//   - Both: the two above on one event — each guest follows the path
//     of their own audience type.
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
  // Internal AND external guests on one event: contacts register
  // through their personal link, clients/board/employees acknowledge
  // from their portal.
  BOTH = 'Both',
}

export enum EventStatus {
  DRAFT = 'Draft',
  PUBLISHED = 'Published',
  COMPLETED = 'Completed',
  CANCELLED = 'Cancelled',
}

// Which real collection an invitee comes from. Contact is for
// External/Both events; Client/BoardMember/Employee for InHouse/Both
// — enforced by EventService, not by the schema itself.
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

  // ── Post-event record (added Oct 2026) ─────────────────────────
  // Whether this person actually turned up. null = the organiser
  // hasn't said either way, in which case the original rule still
  // applies — a submitted registration / portal acknowledgement
  // counts as attendance (see EventLifecycle.attendanceOf). An
  // explicit true/false recorded after the event overrides that:
  // true = attended (even without a prior response, e.g. someone who
  // simply arrived), false = responded but did not come (a no-show).
  @Prop({ type: Boolean, default: null }) attended: boolean | null;
  @Prop({ default: null }) attendanceRecordedAt: Date | null;
  // Set once this attendee has been written to the CRM contact's tags
  // and activity timeline (External events only) — makes the sync
  // safe to re-run without duplicating entries.
  @Prop({ default: false }) syncedToContact: boolean;
  // Submitted through the personal feedback link in the follow-up
  // email (public /event-feedback/:token page).
  @Prop({ type: Number, default: null }) feedbackRating: number | null;
  @Prop({ default: '' }) feedbackComment: string;
  @Prop({ default: null }) feedbackAt: Date | null;

  // How this person got on the list: 'Invited' (the tenant added them)
  // or 'OpenLink' (they registered themselves through the event's
  // shareable public link — see Event.openToken).
  @Prop({ default: 'Invited' }) source: string;
}
export const EventInviteSchema = SchemaFactory.createForClass(EventInvite);

// ── Automation (added Oct 2026) ────────────────────────────────
// What the system does on the organiser's behalf around the event.
// Stored flat on purpose (no nested toggles) so partial legacy
// documents resolve cleanly — see EventLifecycle.resolveAutomation.
// An event created BEFORE this existed has no `automation` at all
// and is treated as "everything off", so nothing starts emailing a
// tenant's clients or board about an event they never set up
// automation for.
@Schema({ _id: false })
export class EventAutomation {
  // Pre-event reminders, emailed to invitees who haven't declined.
  @Prop({ default: true }) reminderWeek: boolean;
  @Prop({ default: true }) reminderDay: boolean;
  @Prop({ default: true }) reminderHour: boolean;
  // Extra reminder N hours before the start (1–720); null = none.
  @Prop({ type: Number, default: null }) customReminderHours: number | null;

  // Post-event follow-ups. Delays count from the event's end.
  @Prop({ default: true }) thankYouEnabled: boolean;
  @Prop({ default: 2 }) thankYouDelayHours: number;
  @Prop({ default: true }) feedbackEnabled: boolean;
  @Prop({ default: 24 }) feedbackDelayHours: number;
  @Prop({ default: false }) recordingEnabled: boolean;
  @Prop({ default: 48 }) recordingDelayHours: number;
  @Prop({ default: false }) noShowEnabled: boolean;
  @Prop({ default: 24 }) noShowDelayHours: number;

  // External events only — tag attendees' CRM contact records with
  // the event and log their attendance on the contact's timeline.
  @Prop({ default: true }) syncContacts: boolean;
  // In-app + email notices to the organiser (the tenant): the day
  // before, and a nudge to record attendance once it's over.
  @Prop({ default: true }) notifyOrganiser: boolean;
}
export const EventAutomationSchema =
  SchemaFactory.createForClass(EventAutomation);

export enum EventAutomationStatus {
  SENDING = 'Sending',
  SENT = 'Sent',
  SKIPPED = 'Skipped',
  FAILED = 'Failed',
}

// One entry per automation step that has actually run (or been
// deliberately skipped) — the key doubles as the claim that stops a
// step from ever firing twice.
@Schema({ _id: false })
export class EventAutomationRun {
  @Prop({ required: true }) key: string;
  @Prop({ enum: EventAutomationStatus, required: true })
  status: EventAutomationStatus;
  @Prop({ default: () => new Date() }) ranAt: Date;
  @Prop({ default: 'auto' }) trigger: string; // 'auto' | 'manual'
  @Prop({ default: 0 }) recipients: number;
  @Prop({ default: 0 }) delivered: number;
  @Prop({ default: 0 }) failed: number;
  @Prop({ default: '' }) note: string;
}
export const EventAutomationRunSchema =
  SchemaFactory.createForClass(EventAutomationRun);

// What actually happened, recorded by the organiser after the event.
// Attendance headcount, feedback score and survey responses are NOT
// stored here — they're derived from the invites (attended flags and
// submitted feedback), so they can never disagree with the guest list.
@Schema({ _id: false })
export class EventOutcome {
  // People who attended but were never on the guest list (walk-ins,
  // colleagues who joined the call, …).
  @Prop({ default: 0 }) walkIns: number;
  @Prop({ default: '' }) avgSessionDuration: string;
  @Prop({ default: 0 }) leadsGenerated: number;
  @Prop({ default: 0 }) followUpCallsBooked: number;
  @Prop({ default: 0 }) newContacts: number;
  @Prop({ default: '' }) recordingUrl: string;
  @Prop({ default: '' }) materialsUrl: string;
  @Prop({ default: '' }) notes: string;
  @Prop({ default: null }) recordedAt: Date | null;
  // Stamped when the organiser saves attendance (marks people
  // present/absent) — distinct from saving the rest of the results.
  @Prop({ default: null }) attendanceRecordedAt: Date | null;
}
export const EventOutcomeSchema = SchemaFactory.createForClass(EventOutcome);

// The running record of everything that has happened to the event.
@Schema({ _id: false })
export class EventActivity {
  @Prop({ default: () => new Date() }) at: Date;
  // created | updated | published | invited | invite_removed |
  // registered | acknowledged | reminder | followup | attendance |
  // feedback | results | completed | cancelled | note
  @Prop({ required: true }) kind: string;
  @Prop({ required: true }) message: string;
}
export const EventActivitySchema = SchemaFactory.createForClass(EventActivity);

// One row of an event's agenda: an optional time and what happens.
@Schema({ _id: false })
export class EventAgendaItem {
  @Prop({ default: '' }) time: string;
  @Prop({ required: true }) label: string;
}
export const EventAgendaItemSchema =
  SchemaFactory.createForClass(EventAgendaItem);

// A file the organiser attaches to the event — typically the slides,
// a PDF handout or the report shared after it. Invited clients, board
// members and employees see these in their own portal.
@Schema({ _id: false })
export class EventFile {
  @Prop({ required: true }) id: string;
  @Prop({ required: true }) name: string;
  @Prop({ default: '' }) description: string;
  @Prop({ required: true }) url: string;
  @Prop({ default: '' }) mimeType: string;
  @Prop({ default: 0 }) size: number;
  @Prop({ default: () => new Date() }) uploadedAt: Date;
}
export const EventFileSchema = SchemaFactory.createForClass(EventFile);

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
  // Legacy free-text agenda. Kept in sync as "time  item" lines from
  // `agendaItems` so anything still reading text keeps working;
  // `agendaItems` is the source of truth (an event saved before it
  // existed has it parsed from this text on read — see agendaOf()).
  @Prop({ default: '' }) agenda: string;
  @Prop({ type: [EventFileSchema], default: [] }) documents: EventFile[];

  @Prop({ type: [EventAgendaItemSchema], default: [] })
  agendaItems: EventAgendaItem[];

  // ── Invitation email (merged with the newsletter Event Invite) ──
  // The invitation email is built from this event — date, venue,
  // agenda, registration link — and these three are the only extras
  // the organiser writes: their own message, a hero image, and the
  // button text. All optional.
  @Prop({ default: '' }) inviteMessage: string;
  @Prop({ default: '' }) inviteImageUrl: string;
  @Prop({ default: '' }) inviteCtaLabel: string;
  // External only — real registration cutoff; meaningless for
  // InHouse events (no registration step), left null there.
  @Prop({ default: null }) registrationDeadline: Date | null;

  @Prop({ type: [EventInviteSchema], default: [] })
  invites: EventInvite[];

  @Prop({ default: null }) publishedAt: Date | null;

  // ── Open registration link (External events) ───────────────────
  // One shareable public link for the whole event, so the tenant can
  // send it to people who are not in their CRM contacts — anyone who
  // opens it can register, and lands on the invitee list (source
  // 'OpenLink'). Not stored until generated (sparse unique index);
  // `openRegistration` lets the tenant switch the link off without
  // losing it, and the token can be rotated to kill a leaked link.
  @Prop({ type: String, index: { unique: true, sparse: true } })
  openToken?: string;
  @Prop({ default: false }) openRegistration: boolean;

  // ── Lifecycle (added Oct 2026) ─────────────────────────────────
  // IANA zone the start/end times are in. Needed so "1 hour before"
  // really is one hour before, whatever zone the server runs in —
  // same approach as governance meetings. Events from before this
  // existed were all entered in Kigali time.
  @Prop({ default: 'Africa/Kigali' }) timezone: string;

  // Undefined on legacy events (= automation off); always set on
  // events created from now on.
  @Prop({ type: EventAutomationSchema, default: undefined })
  automation?: EventAutomation;
  @Prop({ type: [EventAutomationRunSchema], default: [] })
  automationLog: EventAutomationRun[];

  @Prop({ type: EventOutcomeSchema, default: () => ({}) })
  outcome: EventOutcome;

  @Prop({ type: [EventActivitySchema], default: [] })
  activity: EventActivity[];

  @Prop({ default: null }) completedAt: Date | null;
  // True when the system closed the event itself (24h after it
  // ended) rather than the organiser clicking "Mark completed".
  @Prop({ default: false }) autoCompleted: boolean;
}
export const EventSchema = SchemaFactory.createForClass(Event);
