import {
  EventAutomation,
  EventAutomationRun,
  EventAutomationStatus,
  EventInviteStatus,
  EventMode,
  EventStatus,
} from '../schemas';

// ─────────────────────────────────────────────────────────────────
// Event lifecycle — pure functions (no DB, no I/O) shared by
// EventService (what the tenant sees) and EventAutomationService (what
// the cron does), so the two can never disagree about when a reminder
// is due, who counts as an attendee, or which phase an event is in.
//
//   Pre-event  → invitations out, registrations/acknowledgements
//                coming in, reminders counting down
//   During     → the event is on (start → end)
//   Post-event → attendance, results, follow-ups, feedback
// ─────────────────────────────────────────────────────────────────

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

// Events created before time zones existed were all entered in
// Kigali time (the platform's home zone).
export const DEFAULT_TIMEZONE = 'Africa/Kigali';

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - utcMs;
}

// "2026-11-15" + "09:00" in Africa/Kigali → the real UTC instant.
export function zonedToUtc(ymd: string, hm: string, tz: string): Date {
  const zone = isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = (hm || '09:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  const off1 = tzOffsetMs(guess, zone);
  let utc = guess - off1;
  const off2 = tzOffsetMs(utc, zone);
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc);
}

export function eventInstants(e: {
  date: Date | string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
}): { startsAt: Date; endsAt: Date } {
  const ymd = new Date(e.date).toISOString().slice(0, 10);
  const tz = e.timezone || DEFAULT_TIMEZONE;
  const startsAt = zonedToUtc(ymd, e.startTime || '09:00', tz);
  let endsAt = e.endTime ? zonedToUtc(ymd, e.endTime, tz) : startsAt;
  // No end time, or an end that isn't after the start → assume one hour.
  if (endsAt.getTime() <= startsAt.getTime()) {
    endsAt = new Date(startsAt.getTime() + HOUR);
  }
  return { startsAt, endsAt };
}

export type EventPhase = 'Pre-event' | 'During' | 'Post-event' | 'Cancelled';

export function phaseOf(
  e: { status: EventStatus | string },
  startsAt: Date,
  endsAt: Date,
  now = new Date(),
): EventPhase {
  if (e.status === EventStatus.CANCELLED) return 'Cancelled';
  if (e.status === EventStatus.COMPLETED) return 'Post-event';
  if (now.getTime() < startsAt.getTime()) return 'Pre-event';
  if (now.getTime() < endsAt.getTime()) return 'During';
  return 'Post-event';
}

// ── Automation settings ──────────────────────────────────────────

export type ResolvedAutomation = {
  configured: boolean;
  reminderWeek: boolean;
  reminderDay: boolean;
  reminderHour: boolean;
  customReminderHours: number | null;
  thankYouEnabled: boolean;
  thankYouDelayHours: number;
  feedbackEnabled: boolean;
  feedbackDelayHours: number;
  recordingEnabled: boolean;
  recordingDelayHours: number;
  noShowEnabled: boolean;
  noShowDelayHours: number;
  syncContacts: boolean;
  notifyOrganiser: boolean;
};

export const DEFAULT_AUTOMATION: Omit<ResolvedAutomation, 'configured'> = {
  reminderWeek: true,
  reminderDay: true,
  reminderHour: true,
  customReminderHours: null,
  thankYouEnabled: true,
  thankYouDelayHours: 2,
  feedbackEnabled: true,
  feedbackDelayHours: 24,
  recordingEnabled: false,
  recordingDelayHours: 48,
  noShowEnabled: false,
  noShowDelayHours: 24,
  syncContacts: true,
  notifyOrganiser: true,
};

const OFF: Omit<ResolvedAutomation, 'configured'> = {
  reminderWeek: false,
  reminderDay: false,
  reminderHour: false,
  customReminderHours: null,
  thankYouEnabled: false,
  thankYouDelayHours: 2,
  feedbackEnabled: false,
  feedbackDelayHours: 24,
  recordingEnabled: false,
  recordingDelayHours: 48,
  noShowEnabled: false,
  noShowDelayHours: 24,
  syncContacts: false,
  notifyOrganiser: false,
};

// A legacy event (no stored automation) resolves to everything off.
export function resolveAutomation(
  raw: Partial<EventAutomation> | null | undefined,
): ResolvedAutomation {
  if (!raw) return { configured: false, ...OFF };
  return { configured: true, ...DEFAULT_AUTOMATION, ...stripUndefined(raw) };
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as T;
}

// ── Attendance ───────────────────────────────────────────────────

type InviteLike = {
  status: EventInviteStatus | string;
  attended?: boolean | null;
  feedbackRating?: number | null;
};

export const hasResponded = (status: string) =>
  status === EventInviteStatus.REGISTERED ||
  status === EventInviteStatus.ACKNOWLEDGED;

// The one rule for "did this person attend":
//   - the organiser said so explicitly (true/false) → that wins;
//   - otherwise → a registration / portal acknowledgement counts
//     (the product owner's original rule), so the numbers are sensible
//     from the moment the event ends, before anyone records anything.
export function attendanceOf(i: InviteLike): boolean {
  if (i.attended === true) return true;
  if (i.attended === false) return false;
  return hasResponded(String(i.status));
}

export const isNoShow = (i: InviteLike) =>
  i.attended === false && hasResponded(String(i.status));

export function computeStats(e: {
  invites: (InviteLike & { sentAt?: Date | null; deliveryError?: any })[];
  capacity?: number;
  outcome?: { walkIns?: number } | null;
}) {
  const invites = e.invites ?? [];
  const invited = invites.length;
  const sent = invites.filter((i) => !!i.sentAt).length;
  const failed = invites.filter((i) => !i.sentAt && !!i.deliveryError).length;
  const responded = invites.filter((i) =>
    hasResponded(String(i.status)),
  ).length;
  const declined = invites.filter(
    (i) => i.status === EventInviteStatus.DECLINED,
  ).length;
  const attendedInvites = invites.filter(attendanceOf).length;
  const noShows = invites.filter(isNoShow).length;
  const walkIns = Math.max(0, Number(e.outcome?.walkIns ?? 0));
  // Rate is measured against everyone who was expected: people who
  // responded, plus anyone explicitly marked as having attended.
  const expected = invites.filter(
    (i) => hasResponded(String(i.status)) || i.attended === true,
  ).length;
  const ratings = invites
    .map((i) => i.feedbackRating)
    .filter((r): r is number => typeof r === 'number');
  return {
    invited,
    sent,
    failed,
    responded,
    declined,
    attendedInvites,
    walkIns,
    totalAttendance: attendedInvites + walkIns,
    noShows,
    attendanceRate:
      expected > 0 ? Math.round((attendedInvites / expected) * 100) : null,
    feedbackResponses: ratings.length,
    feedbackScore: ratings.length
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) /
        10
      : null,
    spotsLeft:
      (e.capacity ?? 0) > 0
        ? Math.max(0, (e.capacity as number) - responded)
        : null,
  };
}

// ── The automation schedule ──────────────────────────────────────

export type StepGroup = 'pre' | 'post' | 'organiser';

export type StepDef = {
  key: string;
  label: string;
  group: StepGroup;
  // Who it goes to, in plain words (shown in the schedule).
  audience: string;
  dueAt: Date;
  // After dueAt + graceMs the moment has passed and the step is
  // skipped rather than sent late (a "1 hour before" reminder two
  // hours after the start would be nonsense).
  graceMs: number;
  enabled: boolean;
  // Manual "send now" allowed from the UI.
  manual: boolean;
};

const DAY_GRACE = 6 * HOUR;

export function buildSteps(
  e: {
    mode: EventMode | string;
    automation?: Partial<EventAutomation> | null;
    publishedAt?: Date | null;
  },
  startsAt: Date,
  endsAt: Date,
  completedAt?: Date | null,
): StepDef[] {
  const a = resolveAutomation(e.automation);
  const s = startsAt.getTime();
  // Post-event delays count from when the event actually ended — the
  // organiser closing it early moves that forward.
  const base =
    completedAt && completedAt.getTime() < endsAt.getTime()
      ? completedAt.getTime()
      : endsAt.getTime();
  const external = e.mode === EventMode.EXTERNAL;
  const steps: StepDef[] = [
    {
      key: 'reminder:week',
      label: 'Reminder — 1 week before',
      group: 'pre',
      audience: 'Invitees',
      dueAt: new Date(s - 7 * DAY),
      graceMs: DAY,
      enabled: a.reminderWeek,
      manual: true,
    },
    {
      key: 'reminder:day',
      label: 'Reminder — 1 day before',
      group: 'pre',
      audience: 'Invitees',
      dueAt: new Date(s - DAY),
      graceMs: DAY_GRACE,
      enabled: a.reminderDay,
      manual: true,
    },
    {
      key: 'reminder:hour',
      label: 'Reminder — 1 hour before',
      group: 'pre',
      audience: 'Invitees',
      dueAt: new Date(s - HOUR),
      graceMs: 30 * 60_000,
      enabled: a.reminderHour,
      manual: true,
    },
  ];
  if (a.customReminderHours && a.customReminderHours > 0) {
    const off = a.customReminderHours * HOUR;
    steps.push({
      key: 'reminder:custom',
      label: `Reminder — ${formatLead(a.customReminderHours)} before`,
      group: 'pre',
      audience: 'Invitees',
      dueAt: new Date(s - off),
      graceMs: Math.max(30 * 60_000, Math.min(12 * HOUR, off / 4)),
      enabled: true,
      manual: true,
    });
  }
  steps.push(
    {
      key: 'organiser:day',
      label: 'Heads-up to you — 1 day before',
      group: 'organiser',
      audience: 'You (in-app + email)',
      dueAt: new Date(s - DAY),
      graceMs: 12 * HOUR,
      enabled: a.notifyOrganiser,
      manual: false,
    },
    {
      key: 'post:thankyou',
      label: 'Thank-you email',
      group: 'post',
      audience: 'Attendees',
      dueAt: new Date(base + a.thankYouDelayHours * HOUR),
      graceMs: 7 * DAY,
      enabled: a.thankYouEnabled,
      manual: true,
    },
    {
      key: 'post:feedback',
      label: 'Feedback request',
      group: 'post',
      audience: 'Attendees',
      dueAt: new Date(base + a.feedbackDelayHours * HOUR),
      graceMs: 7 * DAY,
      enabled: a.feedbackEnabled,
      manual: true,
    },
    {
      key: 'post:recording',
      label: 'Recording & materials',
      group: 'post',
      audience: 'Everyone who responded',
      dueAt: new Date(base + a.recordingDelayHours * HOUR),
      graceMs: 7 * DAY,
      enabled: a.recordingEnabled,
      manual: true,
    },
    {
      key: 'post:noshow',
      label: 'No-show follow-up',
      group: 'post',
      audience: 'Registered but absent',
      dueAt: new Date(base + a.noShowDelayHours * HOUR),
      graceMs: 7 * DAY,
      enabled: a.noShowEnabled,
      manual: true,
    },
  );
  if (external) {
    steps.push({
      key: 'post:crmsync',
      label: 'Update CRM contacts (tag + timeline)',
      group: 'post',
      audience: 'Attendees',
      dueAt: new Date(base),
      graceMs: Number.MAX_SAFE_INTEGER,
      enabled: a.syncContacts,
      manual: true,
    });
  }
  steps.push({
    key: 'organiser:record',
    label: 'Reminder to you — record attendance & results',
    group: 'organiser',
    audience: 'You (in-app + email)',
    dueAt: new Date(base + HOUR),
    graceMs: 3 * DAY,
    enabled: a.notifyOrganiser,
    manual: false,
  });
  return steps;
}

function formatLead(hours: number): string {
  if (hours % 24 === 0) {
    const d = hours / 24;
    return d === 1 ? '1 day' : `${d} days`;
  }
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

export type ScheduleStatus =
  | 'Off'
  | 'Pending'
  | 'Sending'
  | 'Sent'
  | 'Skipped'
  | 'Failed';

export function scheduleFor(
  steps: StepDef[],
  log: EventAutomationRun[] | undefined,
  eventStatus: string,
  now = new Date(),
) {
  const byKey = new Map((log ?? []).map((r) => [r.key, r]));
  return steps.map((st) => {
    const run = byKey.get(st.key);
    let status: ScheduleStatus;
    let note = run?.note ?? '';
    if (run) {
      status = run.status as ScheduleStatus;
    } else if (!st.enabled) {
      status = 'Off';
    } else if (eventStatus === EventStatus.CANCELLED) {
      status = 'Skipped';
      note = 'Event cancelled';
    } else if (
      st.group !== 'post' &&
      st.group !== 'organiser' &&
      eventStatus === EventStatus.DRAFT
    ) {
      status = 'Pending';
      note = 'Starts once the event is published';
    } else {
      status = 'Pending';
    }
    return {
      key: st.key,
      label: st.label,
      group: st.group,
      audience: st.audience,
      dueAt: st.dueAt,
      status,
      note,
      manual: st.manual,
      recipients: run?.recipients ?? 0,
      delivered: run?.delivered ?? 0,
      failed: run?.failed ?? 0,
      ranAt: run?.ranAt ?? null,
      overdue:
        status === 'Pending' &&
        eventStatus === EventStatus.PUBLISHED &&
        now.getTime() > st.dueAt.getTime(),
    };
  });
}

// ── Pipeline (the six-stage strip from the prototype) ────────────

export type PipelineState = 'done' | 'active' | 'pending' | 'skipped';

export function buildPipeline(args: {
  status: EventStatus | string;
  mode: EventMode | string;
  phase: EventPhase;
  stats: ReturnType<typeof computeStats>;
  schedule: ReturnType<typeof scheduleFor>;
  attendanceRecorded: boolean;
  resultsRecorded: boolean;
}) {
  const { status, mode, phase, stats, schedule } = args;
  const published =
    status === EventStatus.PUBLISHED || status === EventStatus.COMPLETED;
  const pre = schedule.filter((s) => s.group === 'pre' && s.status !== 'Off');
  const preDone = pre.filter(
    (s) => s.status === 'Sent' || s.status === 'Skipped',
  );
  const post = schedule.filter((s) => s.group === 'post' && s.status !== 'Off');
  const postDone = post.filter(
    (s) => s.status === 'Sent' || s.status === 'Skipped',
  );

  const registration: { state: PipelineState; detail: string } = !published
    ? { state: 'pending', detail: 'Opens on publish' }
    : phase === 'Pre-event'
      ? { state: 'active', detail: `${stats.responded} so far` }
      : {
          state: 'done',
          detail: `${stats.responded} ${mode === EventMode.EXTERNAL ? 'registered' : 'acknowledged'}`,
        };

  const invitations: { state: PipelineState; detail: string } =
    stats.invited === 0
      ? { state: 'pending', detail: 'No invitees yet' }
      : stats.sent === stats.invited
        ? { state: 'done', detail: `${stats.sent}/${stats.invited} sent` }
        : published
          ? { state: 'active', detail: `${stats.sent}/${stats.invited} sent` }
          : { state: 'pending', detail: `${stats.invited} queued` };

  const reminders: { state: PipelineState; detail: string } =
    pre.length === 0
      ? { state: 'skipped', detail: 'None scheduled' }
      : preDone.length === pre.length
        ? {
            state: 'done',
            detail: `${preDone.filter((s) => s.status === 'Sent').length}/${pre.length} sent`,
          }
        : published
          ? { state: 'active', detail: `${preDone.length}/${pre.length} done` }
          : { state: 'pending', detail: `${pre.length} scheduled` };

  const eventDay: { state: PipelineState; detail: string } =
    phase === 'Post-event'
      ? { state: 'done', detail: 'Finished' }
      : phase === 'During'
        ? { state: 'active', detail: 'Live now' }
        : { state: 'pending', detail: '' };

  const followUpAllDone =
    args.attendanceRecorded &&
    (post.length === 0 || postDone.length === post.length);
  const followUp: { state: PipelineState; detail: string } =
    phase !== 'Post-event'
      ? { state: 'pending', detail: '' }
      : followUpAllDone
        ? { state: 'done', detail: 'Complete' }
        : {
            state: 'active',
            detail: args.attendanceRecorded
              ? `${postDone.length}/${post.length} follow-ups`
              : 'Record attendance',
          };

  return [
    {
      key: 'details',
      label: 'Details',
      state: 'done' as PipelineState,
      detail: '',
    },
    {
      key: 'registration',
      label: mode === EventMode.EXTERNAL ? 'Registration' : 'Acknowledgement',
      ...registration,
    },
    { key: 'invitations', label: 'Invitations', ...invitations },
    { key: 'reminders', label: 'Reminders', ...reminders },
    { key: 'eventday', label: 'Event day', ...eventDay },
    { key: 'followup', label: 'Follow-up', ...followUp },
  ];
}
