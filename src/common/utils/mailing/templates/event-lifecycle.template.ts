// CRM Tools event lifecycle emails — everything an invitee receives
// AFTER the invitation: reminders as the event approaches, the
// post-event follow-ups (thank-you, feedback request, recording &
// materials, no-show), and a cancellation notice. Drawn with the same
// Event Invite design as event-invite.template.ts (event-email-layout.ts),
// so an event reads the same from invitation to thank-you. The layout
// escapes every value; paragraphs here are plain text.

import { eventShell, type EventEmailBase } from './event-email-layout';
export type { EventEmailBase } from './event-email-layout';

const safeUrl = (u: unknown) => {
  const v = String(u ?? '').trim();
  return /^https?:\/\//i.test(v) ? v : '';
};

// ── Reminder ─────────────────────────────────────────────────────

export interface EventReminderEmailData extends EventEmailBase {
  // "in 1 week", "tomorrow", "in 1 hour", "in 3 days"…
  leadLabel: string;
  // Has this person already registered / acknowledged?
  responded: boolean;
  requiresRegistration: boolean;
  // Register link (External, not yet registered) or the portal link.
  ctaLink: string;
  meetingLink?: string | null;
  // External + not yet registered but the deadline passed / full →
  // the reminder is simply not sent (decided by the caller).
}

export function eventReminderTemplate(d: EventReminderEmailData) {
  const subject = `Reminder: ${d.title} — ${d.leadLabel}`;
  const intro = d.responded
    ? `This is a reminder that ${d.title} takes place ${d.leadLabel}. We look forward to seeing you.`
    : d.requiresRegistration
      ? `${d.title} takes place ${d.leadLabel} and we haven't received your registration yet. Use your personal link to secure your place.`
      : `${d.title} takes place ${d.leadLabel}. Please open your portal to confirm that you'll be attending.`;
  const buttons: { label: string; url: string; secondary?: boolean }[] = [];
  if (!d.responded) {
    buttons.push({
      label: d.requiresRegistration ? 'Register now' : 'Confirm in your portal',
      url: d.ctaLink,
    });
  } else if (d.meetingLink) {
    buttons.push({ label: 'Join online', url: d.meetingLink });
  }
  return {
    subject,
    html: eventShell(d, {
      label: `Reminder — ${d.leadLabel}`,
      paragraphs: [intro],
      info: true,
      agenda: true,
      calendar: true,
      buttons,
    }),
  };
}

// ── Post-event follow-ups ────────────────────────────────────────

export type EventFollowupKind =
  | 'thankyou'
  | 'feedback'
  | 'recording'
  | 'noshow';

export interface EventFollowupEmailData extends EventEmailBase {
  kind: EventFollowupKind;
  feedbackLink: string;
  recordingUrl?: string;
  materialsUrl?: string;
}

export function eventFollowupTemplate(d: EventFollowupEmailData) {
  const links: { label: string; url: string }[] = [];
  if (safeUrl(d.recordingUrl))
    links.push({ label: 'Watch the recording', url: d.recordingUrl! });
  if (safeUrl(d.materialsUrl))
    links.push({ label: 'Download the materials', url: d.materialsUrl! });

  switch (d.kind) {
    case 'thankyou':
      return {
        subject: `Thank you for joining ${d.title}`,
        html: eventShell(d, {
          label: 'Thank you for attending',
          paragraphs: [
            `Thank you for joining us at ${d.title}. It was a pleasure to have you with us, and we hope you found it valuable.`,
          ],
          footnote: 'We will be in touch with anything further from the event.',
        }),
      };
    case 'feedback':
      return {
        subject: `How was ${d.title}? Share your feedback`,
        html: eventShell(d, {
          label: 'We would value your feedback',
          paragraphs: [
            `Thank you for attending ${d.title}. It takes less than a minute to tell us how it went — your rating helps us make the next one better.`,
          ],
          buttons: [{ label: 'Give feedback', url: d.feedbackLink }],
        }),
      };
    case 'recording':
      return {
        subject: `Recording & materials: ${d.title}`,
        html: eventShell(d, {
          label: 'Recording & materials',
          paragraphs: [
            `Here are the recording and materials from ${d.title}, for you to revisit or share with colleagues.`,
          ],
          buttons: links,
        }),
      };
    case 'noshow':
      return {
        subject: `We missed you at ${d.title}`,
        html: eventShell(d, {
          label: 'We missed you',
          paragraphs: [
            `We noticed you weren't able to join us at ${d.title}. We understand — these things happen.${links.length ? ' You can catch up using the links below.' : ''}`,
          ],
          buttons: links,
          footnote:
            'Do get in touch if you would like to hear about upcoming events.',
        }),
      };
  }
}

// ── Cancellation ─────────────────────────────────────────────────

export function eventCancelledTemplate(
  d: EventEmailBase & { reason?: string },
) {
  return {
    subject: `Cancelled: ${d.title}`,
    html: eventShell(d, {
      label: `${d.type} cancelled`,
      tone: 'alert',
      paragraphs: [
        `We're sorry to let you know that ${d.title} has been cancelled.`,
        ...(d.reason ? [d.reason] : []),
      ],
      info: true,
      footnote: 'We will let you know if it is rescheduled.',
    }),
  };
}

// ── Registration confirmation (open-link sign-ups) ───────────────

export function eventRegistrationConfirmationTemplate(
  d: EventEmailBase & { meetingLink?: string | null },
) {
  return {
    subject: `You're registered: ${d.title}`,
    html: eventShell(d, {
      label: "You're registered",
      paragraphs: [
        `Thank you for registering for ${d.title}. Your place is confirmed — we'll send you a reminder as the date approaches.`,
      ],
      info: true,
      agenda: true,
      calendar: true,
      buttons: d.meetingLink
        ? [{ label: 'Join online', url: d.meetingLink }]
        : [],
      footnote: 'Keep this email — it has everything you need for the day.',
    }),
  };
}
