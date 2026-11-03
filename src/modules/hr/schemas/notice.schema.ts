import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ═══════════════════════════════════════════════════════════════
// HR Notices & Communications
//
// A Notice is something HR issues to staff — a policy update, a
// statutory change, a security alert, an event invitation. Staff read
// it in the employee portal and, when the notice asks for it,
// acknowledge it. The system keeps the evidence: who was sent it, who
// opened it, who acknowledged it, how (click / typed signature /
// comprehension check) and when.
//
// Storage is split on purpose:
//   hr_notices            — the notice itself (content + settings)
//   hr_notice_recipients  — one row per employee per notice (delivery,
//                           open and acknowledgement evidence). Kept
//                           out of the notice document so a notice sent
//                           to hundreds of staff never hits the 16MB
//                           document limit and per-employee queries
//                           ("what is pending for me?") stay indexed.
//   hr_notice_activity    — append-only audit trail
//   hr_notice_groups      — saved audiences
//   hr_notice_templates   — tenant-authored templates (built-ins are
//                           code constants, see notice.constants.ts)
//   hr_notice_settings    — one document per tenant
// ═══════════════════════════════════════════════════════════════

export enum NoticeStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENT = 'sent',
  ARCHIVED = 'archived',
}

export enum NoticePriority {
  NORMAL = 'normal',
  IMPORTANT = 'important',
  CRITICAL = 'critical',
}

export enum NoticeChannel {
  INAPP = 'inapp',
  EMAIL = 'email',
}

export enum NoticeAckMethod {
  CLICK = 'click',
  SIGNATURE = 'signature',
  QUIZ = 'quiz',
}

export enum NoticeReminderCadence {
  NONE = 'none',
  DAILY = 'daily',
  EVERY_2_DAYS = 'every2',
  WEEKLY = 'weekly',
}

export enum NoticeAudienceType {
  ALL = 'all',
  DEPARTMENTS = 'departments', // values: HrTeam ids
  LOCATIONS = 'locations', // values: HrLocation ids
  TYPES = 'types', // values: EmploymentType values
  INDIVIDUALS = 'individuals', // values: Employee ids
  GROUP = 'group', // values: [NoticeGroup id]
  NEW_JOINERS = 'newjoiners', // employees who started in the last 90 days
}

export const NOTICE_CATEGORIES = [
  'Policy',
  'Compliance',
  'Payroll',
  'Statutory',
  'Performance',
  'Training',
  'General',
  'Health and Safety',
  'IT and Security',
  'Announcement',
  'Office and Facilities',
  'Events',
] as const;

@Schema({ _id: false })
export class NoticeAudience {
  @Prop({ enum: NoticeAudienceType, default: NoticeAudienceType.ALL })
  type: NoticeAudienceType;

  @Prop({ type: [String], default: [] })
  values: string[];
}
export const NoticeAudienceSchema =
  SchemaFactory.createForClass(NoticeAudience);

@Schema({ _id: false })
export class NoticeQuiz {
  @Prop({ default: '' }) q: string;
  @Prop({ type: [String], default: [] }) options: string[];
  // Index into `options`. Never sent to employees.
  @Prop({ default: 0 }) answer: number;
}
export const NoticeQuizSchema = SchemaFactory.createForClass(NoticeQuiz);

@Schema({ _id: false })
export class NoticeAttachment {
  @Prop({ required: true }) name: string;
  @Prop({ default: '' }) size: string;
  @Prop({ default: null }) url: string | null;
}
export const NoticeAttachmentSchema =
  SchemaFactory.createForClass(NoticeAttachment);

@Schema({ _id: false })
export class NoticeVersion {
  @Prop({ required: true }) v: number;
  @Prop({ default: () => new Date() }) at: Date;
  @Prop({ default: '' }) byName: string;
  @Prop({ default: '' }) note: string;
  // Reference of the notice this version lived under (set when a
  // reissue creates a new notice and the history is carried over).
  @Prop({ default: null }) ref: string | null;
}
export const NoticeVersionSchema = SchemaFactory.createForClass(NoticeVersion);

@Schema({ timestamps: false })
export class NoticeQuestion {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true })
  employeeId: Types.ObjectId;

  @Prop({ required: true }) text: string;
  @Prop({ default: () => new Date() }) at: Date;

  @Prop({ default: null }) reply: string | null;
  @Prop({ default: null }) replyAt: Date | null;
  @Prop({ default: null }) replyByName: string | null;
  // The reply was also appended to the notice body for everyone.
  @Prop({ default: false }) shared: boolean;
}
export const NoticeQuestionSchema =
  SchemaFactory.createForClass(NoticeQuestion);

@Schema({ timestamps: true, collection: 'hr_notices' })
export class Notice {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // Human reference, NTC-0001… — unique per tenant.
  @Prop({ required: true }) ref: string;

  @Prop({ required: true, trim: true }) title: string;
  @Prop({ default: 'General' }) category: string;
  @Prop({ enum: NoticePriority, default: NoticePriority.NORMAL })
  priority: NoticePriority;
  @Prop({ default: '' }) summary: string;
  // Rich-text HTML. May contain {{first_name}}, filled per employee.
  @Prop({ default: '' }) body: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  authorUserId: Types.ObjectId | null;
  @Prop({ default: '' }) authorName: string;

  @Prop({ enum: NoticeStatus, default: NoticeStatus.DRAFT, index: true })
  status: NoticeStatus;

  @Prop({ type: [String], default: [NoticeChannel.INAPP] })
  channels: NoticeChannel[];

  @Prop({ default: false }) requireAck: boolean;
  @Prop({ enum: NoticeAckMethod, default: NoticeAckMethod.CLICK })
  ackMethod: NoticeAckMethod;
  @Prop({ type: NoticeQuizSchema, default: null }) quiz: NoticeQuiz | null;
  @Prop({ default: null }) deadline: Date | null;
  @Prop({ enum: NoticeReminderCadence, default: NoticeReminderCadence.NONE })
  reminders: NoticeReminderCadence;
  @Prop({ default: false }) escalate: boolean;
  @Prop({ default: 3 }) escalateAfter: number;

  @Prop({
    type: NoticeAudienceSchema,
    default: () => ({ type: 'all', values: [] }),
  })
  audience: NoticeAudience;

  @Prop({ type: [NoticeAttachmentSchema], default: [] })
  attachments: NoticeAttachment[];

  @Prop({ default: false }) pinned: boolean;
  @Prop({ default: null }) expiresAt: Date | null;

  @Prop({ default: null }) sentAt: Date | null;
  @Prop({ default: null, index: true }) scheduledFor: Date | null;
  @Prop({ default: null }) archivedAt: Date | null;

  // Number of employees the notice was delivered to (frozen at send).
  @Prop({ default: 0 }) recipientCount: number;

  // The sent notice this one replaces, when it is a reissue.
  @Prop({ default: null }) revisionOf: string | null;
  @Prop({ default: null }) templateId: string | null;

  @Prop({ type: [NoticeVersionSchema], default: [] })
  versions: NoticeVersion[];

  @Prop({ type: [NoticeQuestionSchema], default: [] })
  questions: NoticeQuestion[];

  createdAt: Date;
  updatedAt: Date;
}
export const NoticeSchema = SchemaFactory.createForClass(Notice);
NoticeSchema.index({ tenantId: 1, ref: 1 }, { unique: true });
NoticeSchema.index({ tenantId: 1, status: 1, sentAt: -1 });
export type NoticeDocument = Notice & Document;

// ── Per-employee delivery + acknowledgement evidence ─────────────
@Schema({ timestamps: true, collection: 'hr_notice_recipients' })
export class NoticeRecipient {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Notice', required: true })
  noticeId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true })
  employeeId: Types.ObjectId;

  @Prop({ default: () => new Date() }) deliveredAt: Date;
  // When the employee first opened it. Only recorded while the tenant's
  // "record read receipts" setting is on — HR's read-rate depends on it.
  @Prop({ default: null }) openedAt: Date | null;
  // Always recorded: drives the employee's own unread marker, which
  // must work whether or not HR keeps read receipts.
  @Prop({ default: null }) seenAt: Date | null;
  // How the employee first opened it.
  @Prop({ enum: NoticeChannel, default: NoticeChannel.INAPP })
  channel: NoticeChannel;

  @Prop({ default: null }) ackAt: Date | null;
  @Prop({ enum: NoticeAckMethod, default: null })
  ackMethod: NoticeAckMethod | null;
  // The typed name, when the method is a signature.
  @Prop({ default: null }) signature: string | null;
  @Prop({ default: null }) device: string | null;
  @Prop({ default: null }) ipAddress: string | null;
  // Notice version the employee acknowledged.
  @Prop({ default: 1 }) ackVersion: number;

  // Recorded by HR on the employee's behalf (paper copy, meeting…).
  @Prop({ default: false }) offline: boolean;
  @Prop({ default: null }) offlineMethod: string | null;
  @Prop({ default: null }) offlineNote: string | null;
  @Prop({ default: null }) offlineByName: string | null;

  @Prop({ default: 0 }) reminders: number;
  @Prop({ default: null }) lastReminderAt: Date | null;
  @Prop({ default: null }) escalatedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}
export const NoticeRecipientSchema =
  SchemaFactory.createForClass(NoticeRecipient);
NoticeRecipientSchema.index({ noticeId: 1, employeeId: 1 }, { unique: true });
NoticeRecipientSchema.index({ tenantId: 1, employeeId: 1 });
export type NoticeRecipientDocument = NoticeRecipient & Document;

// ── Append-only audit trail ──────────────────────────────────────
@Schema({ timestamps: false, collection: 'hr_notice_activity' })
export class NoticeActivity {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Notice', required: true, index: true })
  noticeId: Types.ObjectId;

  // created | sent | scheduled | edited | archived | restored |
  // reminder | escalated | offline | question | reply
  @Prop({ required: true }) act: string;
  @Prop({ default: '' }) text: string;
  // Display name of whoever did it — 'Lexora' for the scheduler.
  @Prop({ default: 'Lexora' }) actorName: string;
  @Prop({ default: false }) system: boolean;
  @Prop({ default: () => new Date(), index: true }) at: Date;
}
export const NoticeActivitySchema =
  SchemaFactory.createForClass(NoticeActivity);
export type NoticeActivityDocument = NoticeActivity & Document;

// ── Saved audience ───────────────────────────────────────────────
@Schema({ timestamps: true, collection: 'hr_notice_groups' })
export class NoticeGroup {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: '' }) description: string;
  @Prop({ type: NoticeAudienceSchema, required: true })
  audience: NoticeAudience;
}
export const NoticeGroupSchema = SchemaFactory.createForClass(NoticeGroup);
export type NoticeGroupDocument = NoticeGroup & Document;

// ── Tenant-authored template ─────────────────────────────────────
@Schema({ timestamps: true, collection: 'hr_notice_templates' })
export class NoticeTemplate {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: 'General' }) category: string;
  @Prop({ enum: NoticePriority, default: NoticePriority.NORMAL })
  priority: NoticePriority;
  @Prop({ default: '' }) description: string;
  @Prop({ default: false }) requireAck: boolean;
  @Prop({ enum: NoticeAckMethod, default: NoticeAckMethod.CLICK })
  ackMethod: NoticeAckMethod;
  @Prop({ default: '' }) body: string;
  @Prop({ default: 0 }) uses: number;
}
export const NoticeTemplateSchema =
  SchemaFactory.createForClass(NoticeTemplate);
export type NoticeTemplateDocument = NoticeTemplate & Document;

// ── Per-tenant defaults ──────────────────────────────────────────
@Schema({ timestamps: true, collection: 'hr_notice_settings' })
export class NoticeSettings {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  tenantId: Types.ObjectId;

  @Prop({ default: '' }) senderName: string;
  @Prop({ default: true }) emailChannel: boolean;
  @Prop({
    enum: NoticeReminderCadence,
    default: NoticeReminderCadence.EVERY_2_DAYS,
  })
  reminders: NoticeReminderCadence;
  @Prop({ default: 3 }) escalateAfter: number;
  @Prop({ default: '19:00' }) quietFrom: string;
  @Prop({ default: '07:00' }) quietTo: string;
  @Prop({ default: true }) reAck: boolean;
  @Prop({ default: 7 }) retention: number;
  @Prop({ default: '' }) footer: string;
  @Prop({ default: true }) questions: boolean;
  @Prop({ default: true }) readReceipts: boolean;
}
export const NoticeSettingsSchema =
  SchemaFactory.createForClass(NoticeSettings);
export type NoticeSettingsDocument = NoticeSettings & Document;
