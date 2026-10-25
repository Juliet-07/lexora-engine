// CRM Tools event invitation — the one real invitation email, drawn
// with the Event Invite design (see event-email-layout.ts) and filled
// from the event itself. It covers both event shapes (event.schema.ts):
// an External invite's button leads to the invitee's own personal
// registration link; an InHouse invite's button leads to the invitee's
// own portal (client/board/employee), where attendance is acknowledged
// rather than registered. Nothing here claims a calendar file (.ics)
// is attached — "Add to calendar" is a link.

import { eventShell, type EventEmailBase } from './event-email-layout';

export interface EventInviteEmailData extends EventEmailBase {
  description: string;
  // The organiser's own words for the invitation. Falls back to the
  // event description when empty.
  message?: string;
  // Custom button text; defaults to "Register now" / "View in your portal".
  ctaLabel?: string;
  virtual: boolean;
  requiresRegistration: boolean;
  registrationDeadlineLabel?: string;
  ctaLink: string;
}

export function eventInviteTemplate(data: EventInviteEmailData): {
  subject: string;
  html: string;
} {
  const subject = `You're invited: ${data.title}`;
  const intro = data.requiresRegistration
    ? `You're invited to ${data.title}. Use the button below to register — it's your own personal registration link.`
    : `You're invited to ${data.title}. Open your portal to view the details and let us know you'll be attending.`;
  const body = (data.message || data.description || '').trim();

  const paragraphs = [
    intro,
    ...(body ? [body] : []),
    ...(data.virtual
      ? [
          data.requiresRegistration
            ? 'This is an online event — the joining link is sent to you once you have registered.'
            : 'This is an online event — the joining link is in your portal.',
        ]
      : []),
  ];

  return {
    subject,
    html: eventShell(data, {
      label: `${data.type} invitation`,
      paragraphs,
      info: true,
      extraInfo:
        data.requiresRegistration && data.registrationDeadlineLabel
          ? [{ label: 'Register by', value: data.registrationDeadlineLabel }]
          : [],
      agenda: true,
      calendar: true,
      buttons: [
        {
          label:
            data.ctaLabel?.trim() ||
            (data.requiresRegistration
              ? 'Register now'
              : 'View in your portal'),
          url: data.ctaLink,
        },
      ],
    }),
  };
}
