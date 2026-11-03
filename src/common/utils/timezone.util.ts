// One place for how Lexora treats time zones.
//
// Dates are stored as absolute instants (UTC). The problem is only ever at
// the edges: a person types "10:30" meaning their own wall clock, and a
// server turns an instant back into words. A server runs in UTC, so
// `date.toLocaleString()` on it prints 08:30 for a 10:30 Kigali meeting.
// Everything that prints or parses a wall-clock time goes through here.

// The zone the platform treats as "local" when a record carries no zone of
// its own (a meeting or an event states its own). Set APP_TIMEZONE to
// change it; NOTICE_TZ (used by HR notices) is honoured for continuity.
export const DEFAULT_TIMEZONE = 'Africa/Kigali';

export function isValidTimeZone(tz?: string | null): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(tz?: string | null): string {
  if (isValidTimeZone(tz)) return tz;
  for (const fallback of [process.env.APP_TIMEZONE, process.env.NOTICE_TZ]) {
    if (isValidTimeZone(fallback)) return fallback;
  }
  return DEFAULT_TIMEZONE;
}

export const APP_TIMEZONE = resolveTimeZone();

function offsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (
    Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second'),
    ) - utcMs
  );
}

// A string with no zone on it, as a <input type="datetime-local"> produces.
const NAIVE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

export const isNaiveDateTime = (s: unknown): s is string =>
  typeof s === 'string' && NAIVE.test(s.trim());

/**
 * "2026-11-05T10:30" read as wall-clock time in `tz` → the real instant.
 * A string that already carries a zone ("...Z", "+02:00") is taken as the
 * instant it names, whatever `tz` is.
 */
export function parseInZone(input: string | Date, tz?: string | null): Date {
  if (input instanceof Date) return input;
  const m = NAIVE.exec(input.trim());
  if (!m) return new Date(input);
  const zone = resolveTimeZone(tz);
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  const off1 = offsetMs(guess, zone);
  let utc = guess - off1;
  const off2 = offsetMs(utc, zone);
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc);
}

const asDate = (d: Date | string | number) =>
  d instanceof Date ? d : new Date(d);

/** "Thu, 5 Nov 2026, 10:30 (Africa/Kigali)" */
export function formatDateTime(
  d: Date | string | number,
  tz?: string | null,
  withZone = true,
): string {
  const zone = resolveTimeZone(tz);
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(asDate(d));
  return withZone ? `${s} (${zone})` : s;
}

/** "5 Nov 2026" in `tz`. */
export function formatDate(d: Date | string | number, tz?: string | null) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: resolveTimeZone(tz),
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(asDate(d));
}

/** "10:30" in `tz`. */
export function formatTime(d: Date | string | number, tz?: string | null) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: resolveTimeZone(tz),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(asDate(d));
}

/**
 * Make `date.toLocaleString() / toLocaleDateString() / toLocaleTimeString()`
 * print in the platform zone instead of the server's. Anything that passes
 * its own `timeZone` (a meeting's zone, 'UTC' for a calendar date) is left
 * exactly as it is. Call once at start-up.
 */
export function installDefaultTimezone(tz: string = APP_TIMEZONE): void {
  const names = [
    'toLocaleString',
    'toLocaleDateString',
    'toLocaleTimeString',
  ] as const;
  for (const name of names) {
    const original = Date.prototype[name] as (
      this: Date,
      locales?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ) => string;
    if ((original as { __lexoraTz?: boolean }).__lexoraTz) continue;
    const patched = function (
      this: Date,
      locales?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ) {
      return original.call(
        this,
        locales,
        options?.timeZone ? options : { ...options, timeZone: tz },
      );
    };
    (patched as { __lexoraTz?: boolean }).__lexoraTz = true;
    Object.defineProperty(Date.prototype, name, {
      value: patched,
      writable: true,
      configurable: true,
    });
  }
}
