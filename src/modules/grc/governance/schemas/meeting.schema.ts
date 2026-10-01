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

// ── Attendance — in person vs by proxy, per PO feedback (2026-09):
// "it is meant to be captured if the attendee is attending the
// meeting in person or by proxy". Apology distinguishes a notified
// absence from a plain unexplained one. ─────────────────────────────
export enum MeetingAttendanceStatus {
  PRESENT = 'Present',
  PROXY = 'Proxy',
  APOLOGY = 'Apology',
  ABSENT = 'Absent',
}

@Schema({ _id: false })
export class AttendanceEntry {
  @Prop({ required: true }) index: number;
  @Prop({ enum: MeetingAttendanceStatus, required: true })
  status: MeetingAttendanceStatus;
  // Only meaningful when status === Proxy — who is holding the proxy.
  @Prop({ default: null }) proxyHolderName: string | null;
  @Prop({ default: null }) note: string | null;
}
export const AttendanceEntrySchema =
  SchemaFactory.createForClass(AttendanceEntry);

// ── Meeting-specific conflict of interest — recorded either by the
// tenant (Company Secretary, from the Attendance register) or by the
// board member themselves from their own portal (source
// distinguishes the two). Feeds straight into the minutes draft's
// `conflicts` field (see MeetingService#getConflictsSummaryText) so
// neither side has to retype what was already declared. ────────────
// Four values (not a declared/resolved lifecycle) — matches the PO's
// reference Conflict-of-Interest dialog exactly. STANDING marks a
// conflict as ongoing rather than specific to this one meeting; when
// recorded with that value MeetingService also pushes a disclosure
// onto the declarer's own BoardMember#conflicts register (see
// MeetingService#linkToStandingRegister), which is what the dialog's
// "…linked to the director's standing conflict register" hint refers
// to. There is no separate "resolved" state: a new declaration on a
// later meeting simply supersedes the earlier one.
export enum MeetingConflictStatus {
  NONE = 'No conflict declared',
  DECLARED_RECUSAL_REQUIRED = 'Conflict declared — recusal required',
  DECLARED_NOTED_NO_RECUSAL = 'Conflict declared — noted, no recusal',
  STANDING = 'Standing declaration — ongoing',
}

export enum MeetingConflictAction {
  RECUSE_DISCUSSION_AND_VOTE = 'Director to recuse from discussion and vote',
  RECUSE_VOTE_ONLY = 'Director to recuse from vote only (may participate in discussion)',
  NOTED_NO_RECUSAL = 'Conflict noted in minutes, no recusal required',
  REFERRED_TO_NOMCO = 'Referred to Nominations Committee for guidance',
}

export enum MeetingConflictSource {
  TENANT = 'tenant',
  BOARD_MEMBER = 'board-member',
}

@Schema({ timestamps: false })
export class MeetingConflictDeclaration {
  @Prop({ required: true }) declaredByName: string;
  @Prop({ required: true, lowercase: true }) declaredByEmail: string;
  @Prop({ type: Types.ObjectId, ref: 'BoardMember', default: null })
  declaredByBoardMemberId: Types.ObjectId | null;
  @Prop({
    enum: MeetingConflictStatus,
    default: MeetingConflictStatus.DECLARED_RECUSAL_REQUIRED,
  })
  status: MeetingConflictStatus;
  // Snapshot of affected agenda item titles — agenda items have no
  // stable id of their own (MeetingAgendaItem is { _id: false }).
  @Prop({ type: [String], default: [] }) agendaItems: string[];
  @Prop({ required: true, trim: true }) natureOfConflict: string;
  @Prop({
    enum: MeetingConflictAction,
    default: MeetingConflictAction.NOTED_NO_RECUSAL,
  })
  actionTaken: MeetingConflictAction;
  @Prop({ required: true }) recordedBy: string;
  @Prop({ required: true, default: () => new Date() }) recordedAt: Date;
  @Prop({ enum: MeetingConflictSource, required: true })
  source: MeetingConflictSource;
}
export const MeetingConflictDeclarationSchema = SchemaFactory.createForClass(
  MeetingConflictDeclaration,
);

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
  // Board Packs page — set once this attendee has marked every one of
  // the meeting's boardPack documents as read (see
  // MeetingService#confirmBoardPackRead), distinct from agendaConfirmed
  // (a separate, meeting-level "acknowledge agenda" action). This
  // record itself may exist before either is true: the first "mark a
  // document read" toggle creates it, same as the first agenda
  // acknowledgement does.
  @Prop({ default: false }) allDocumentsRead: boolean;
  @Prop({ default: null }) allDocumentsReadAt: Date | null;
}
export const MeetingAcknowledgmentSchema = SchemaFactory.createForClass(
  MeetingAcknowledgment,
);

// A director's note/question on a specific board pack document,
// visible to the tenant ("Company Secretary") and to other attendees —
// a shared thread, not a private one, matching the reference UI.
// Documents are addressed by fileUrl (a uuid-based multer filename,
// unique per upload) rather than a Mongo subdocument _id, since
// BoardPackDocument predates this feature and retrofitting a real _id
// onto already-stored array elements has no reliable backfill path —
// fileUrl is already unique and was already the natural key
// removeBoardPackDoc's own index-based route sidesteps for the same
// reason.
@Schema({ _id: false })
export class BoardPackNote {
  @Prop({ required: true }) fileUrl: string;
  @Prop({ required: true }) authorName: string;
  @Prop({ required: true, lowercase: true }) authorEmail: string;
  @Prop({ required: true, trim: true }) text: string;
  @Prop({ required: true, default: () => new Date() }) createdAt: Date;
}
export const BoardPackNoteSchema = SchemaFactory.createForClass(BoardPackNote);

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

@Schema({ _id: false })
export class MinutesReviewToken {
  @Prop({ required: true }) token: string;
  @Prop({ required: true, lowercase: true }) attendeeEmail: string;
  @Prop({ required: true }) attendeeName: string;
  @Prop({ required: true, default: () => new Date() }) createdAt: Date;
}
export const MinutesReviewTokenSchema =
  SchemaFactory.createForClass(MinutesReviewToken);

@Schema({ _id: false })
export class MinutesReview {
  @Prop({ required: true, lowercase: true }) attendeeEmail: string;
  @Prop({ required: true }) attendeeName: string;
  @Prop({ required: true, enum: ['approved', 'changes-requested'] })
  decision: string;
  @Prop({ default: '' }) comment: string;
  @Prop({ required: true, default: () => new Date() }) submittedAt: Date;
}
export const MinutesReviewSchema = SchemaFactory.createForClass(MinutesReview);

export enum MeetingActionItemStatus {
  OPEN = 'Open',
  DONE = 'Done',
}

// ── Preparation checklist — gates the Dispatch button. Item ids are
// the fixed set in constants/meeting-checklist.constant.ts; this only
// stores which ones are done, by whom, and when. ────────────────────
@Schema({ _id: false })
export class ChecklistItemRecord {
  @Prop({ required: true }) itemId: string;
  @Prop({ required: true, default: () => new Date() }) completedAt: Date;
  @Prop({ required: true }) completedBy: string;
}
export const ChecklistItemRecordSchema =
  SchemaFactory.createForClass(ChecklistItemRecord);

// ── Notice — the pre-meeting communication the tenant drafts and
// dispatches to attendees, replacing the old free-text "notes" field
// as the real pre-meeting flow. A separate step from the board-pack
// Dispatch button below (notice goes out first, further ahead of the
// meeting; the board pack follows once preparation is complete). ────
export enum NoticeRsvpStatus {
  PENDING = 'Pending',
  CONFIRMED = 'Confirmed',
  APOLOGIES = 'Apologies',
}

@Schema({ _id: false })
export class NoticeRsvpToken {
  @Prop({ required: true }) token: string;
  @Prop({ required: true, lowercase: true }) attendeeEmail: string;
  @Prop({ required: true }) attendeeName: string;
  @Prop({ required: true, default: () => new Date() }) createdAt: Date;
  @Prop({ default: null }) lastReminderSentAt: Date | null;
}
export const NoticeRsvpTokenSchema =
  SchemaFactory.createForClass(NoticeRsvpToken);

@Schema({ _id: false })
export class NoticeRecipient {
  @Prop({ required: true }) name: string;
  @Prop({ required: true, lowercase: true, trim: true }) email: string;
  @Prop({ enum: NoticeRsvpStatus, default: NoticeRsvpStatus.PENDING })
  rsvp: NoticeRsvpStatus;
  @Prop({ default: null }) openedAt: Date | null;
  @Prop({ default: null }) lastReminderSentAt: Date | null;
}
export const NoticeRecipientSchema =
  SchemaFactory.createForClass(NoticeRecipient);

@Schema({ _id: false })
export class MeetingNotice {
  @Prop({ default: '' }) body: string;
  @Prop({ default: 14 }) minimumDays: number;
  @Prop({ default: null }) rsvpDeadline: Date | null;
  @Prop({ default: null }) dispatchedAt: Date | null;
  @Prop({ default: null }) dispatchedBy: string | null;
  @Prop({ type: [NoticeRecipientSchema], default: [] })
  recipients: NoticeRecipient[];
  @Prop({ type: [NoticeRsvpTokenSchema], default: [] })
  rsvpTokens: NoticeRsvpToken[];
}
export const MeetingNoticeSchema = SchemaFactory.createForClass(MeetingNotice);

// ── Structured minutes drafting — supersedes free-typing the final
// `minutes` HTML directly; sections are generated from the agenda,
// edited here, then rendered to HTML client-side and saved via the
// existing updateMinutes()/sendMinutes() flow. ──────────────────────
export enum MinuteSectionKind {
  PROCEDURAL = 'Procedural',
  NOTING = 'Noting',
  DISCUSSION = 'Discussion',
  RESOLUTION = 'Resolution',
}

export enum MinutesDraftStatus {
  DRAFT = 'Draft',
  SENT_FOR_CHAIR_REVIEW = 'Sent for Chair review',
  CHAIR_APPROVED = 'Chair approved',
  TABLED_FOR_BOARD_ADOPTION = 'Tabled for Board adoption',
  ADOPTED_AND_SIGNED = 'Adopted and signed',
}

export enum MinuteResolutionOutcome {
  PASSED = 'Passed',
  NOT_PASSED = 'Not passed',
  DEFERRED = 'Deferred',
  WITHDRAWN = 'Withdrawn',
}

@Schema({ _id: false })
export class MinuteResolution {
  @Prop({ default: '' }) ref: string;
  @Prop({ default: '' }) proposedBy: string;
  @Prop({ default: '' }) secondedBy: string;
  @Prop({ default: 0 }) for: number;
  @Prop({ default: 0 }) against: number;
  @Prop({ default: 0 }) abstained: number;
  @Prop({
    enum: MinuteResolutionOutcome,
    default: MinuteResolutionOutcome.PASSED,
  })
  outcome: MinuteResolutionOutcome;
}
export const MinuteResolutionSchema =
  SchemaFactory.createForClass(MinuteResolution);

@Schema()
export class MinuteSection {
  @Prop({ required: true }) title: string;
  @Prop({ enum: MinuteSectionKind, default: MinuteSectionKind.NOTING })
  kind: MinuteSectionKind;
  @Prop({ default: '' }) presenter: string;
  @Prop({ default: '' }) time: string;
  @Prop({ default: '' }) body: string;
  @Prop({ type: MinuteResolutionSchema, default: null })
  resolution: MinuteResolution | null;
}
export const MinuteSectionSchema = SchemaFactory.createForClass(MinuteSection);

@Schema({ _id: false })
export class MinutesDraftAction {
  @Prop({ required: true }) action: string;
  @Prop({ default: '' }) owner: string;
  @Prop({ default: '' }) due: string;
}
export const MinutesDraftActionSchema =
  SchemaFactory.createForClass(MinutesDraftAction);

@Schema({ _id: false })
export class MinutesDraft {
  @Prop({ default: '' }) chair: string;
  @Prop({ default: '' }) minuteTaker: string;
  @Prop({ default: '' }) quorumText: string;
  @Prop({ default: '' }) conflicts: string;
  @Prop({ type: [MinuteSectionSchema], default: [] }) sections: MinuteSection[];
  @Prop({ type: [MinutesDraftActionSchema], default: [] })
  actions: MinutesDraftAction[];
  @Prop({ enum: MinutesDraftStatus, default: MinutesDraftStatus.DRAFT })
  status: MinutesDraftStatus;
  @Prop({ default: null }) updatedAt: Date | null;
  @Prop({ default: null }) updatedBy: string | null;
}
export const MinutesDraftSchema = SchemaFactory.createForClass(MinutesDraft);

// A real action item arising from a meeting — replaces the tenant
// frontend's previous hardcoded/local-only "action items" concept.
// The assignee is a snapshot of one of the meeting's own attendees
// (name/email), not a manual free-text entry, and is best-effort
// linked to a real BoardMember (assigneeBoardMemberId, nullable —
// an Employee or guest attendee has no BoardMember record) so a
// director's own "My action items" view on the board portal can
// filter to items assigned to them specifically.
@Schema()
export class MeetingActionItem {
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ default: '' }) description: string;
  @Prop({ required: true }) assigneeName: string;
  @Prop({ default: '', lowercase: true, trim: true }) assigneeEmail: string;
  @Prop({ type: Types.ObjectId, ref: 'BoardMember', default: null })
  assigneeBoardMemberId: Types.ObjectId | null;
  @Prop({ default: null }) dueDate: Date | null;
  @Prop({
    enum: MeetingActionItemStatus,
    default: MeetingActionItemStatus.OPEN,
  })
  status: MeetingActionItemStatus;
  @Prop({ default: null }) completedAt: Date | null;
  @Prop({ required: true, default: () => new Date() }) createdAt: Date;
}
export const MeetingActionItemSchema =
  SchemaFactory.createForClass(MeetingActionItem);

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

  // IANA timezone the tenant selected when scheduling this meeting
  // (e.g. "Africa/Kigali") — display-only metadata alongside `date`
  // (still stored as an absolute instant), so notices/emails and the
  // meeting workspace can show "10:00 WAT" rather than leaving the
  // timezone to guesswork. 'UTC' backfills meetings created before
  // this field existed.
  @Prop({ required: true, default: 'UTC' })
  timezone: string;

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

  // Real per-attendee attendance status (Present / Proxy / Apology /
  // Absent) — supersedes the boolean allPresent/presentIndices pair
  // above as the source of truth for new recordings; those legacy
  // fields are still derived and kept in sync alongside this one so
  // older reads (minutes PDF, board-portal myAttendance) keep working
  // without a migration.
  @Prop({ type: [AttendanceEntrySchema], default: [] })
  attendanceEntries: AttendanceEntry[];

  // Per-meeting conflict-of-interest declarations — recorded by the
  // tenant from the Attendance register, or self-declared by a board
  // member from their own portal (see `source`).
  @Prop({ type: [MeetingConflictDeclarationSchema], default: [] })
  conflictDeclarations: MeetingConflictDeclaration[];

  @Prop({ type: [AckTokenSchema], default: [] }) ackTokens: AckToken[];
  @Prop({ type: [MeetingAcknowledgmentSchema], default: [] })
  acknowledgments: MeetingAcknowledgment[];

  @Prop({ default: null })
  postponementReason: string | null;

  @Prop({ default: null })
  postponedAt: Date | null;

  // Audit trail of every postponement — each entry snapshots the date
  // being moved away from and the new date it was moved to (null when
  // no replacement date was given yet). `date` itself is updated to
  // the new date immediately, which is what makes the change show up
  // on the board calendar/My Meetings without any separate calendar
  // record.
  @Prop({
    type: [{ fromDate: Date, toDate: Date, reason: String, postponedAt: Date }],
    default: [],
  })
  postponementHistory: {
    fromDate: Date;
    toDate: Date | null;
    reason: string;
    postponedAt: Date;
  }[];

  @Prop({ default: null }) minutesPdfUrl: string | null;
  @Prop({ type: [MinutesReviewTokenSchema], default: [] })
  minutesReviewTokens: MinutesReviewToken[];
  @Prop({ type: [MinutesReviewSchema], default: [] })
  minutesReviews: MinutesReview[];

  @Prop({ type: [MeetingActionItemSchema], default: [] })
  actionItems: MeetingActionItem[];

  @Prop({ type: [ChecklistItemRecordSchema], default: [] })
  checklist: ChecklistItemRecord[];

  @Prop({ type: MeetingNoticeSchema, default: () => ({}) })
  notice: MeetingNotice;

  @Prop({ type: MinutesDraftSchema, default: null })
  minutesDraft: MinutesDraft | null;

  @Prop({ type: [BoardPackNoteSchema], default: [] })
  boardPackNotes: BoardPackNote[];
}
export const GovernanceMeetingSchema =
  SchemaFactory.createForClass(GovernanceMeeting);
