// The one layout every CRM Tools event email is drawn with —
// invitation, reminder, registration confirmation, the post-event
// follow-ups and the cancellation notice. It is the newsletter
// "Event Invite" design (see renderEventMessage in
// utils/newsletter/newsletter-template.ts): date badge + title banner,
// the key facts in a row, agenda, call-to-action buttons, "add to
// calendar", then the tenant's social links and unsubscribe line.
//
// Previously the invitation here and the newsletter's Event Invite
// were two unrelated designs. Now there is one, and the details in it
// come from the event itself.

import {
  renderEventMessage,
  type NewsletterBrand,
} from 'src/common/utils/newsletter/newsletter-template';
import type { FooterExtras } from './footer-extras';

export interface EventEmailBase {
  businessName: string;
  recipientName: string;
  title: string;
  type: string;
  // Already formatted in the event's own time zone, e.g.
  // "Sunday 15 November 2026, 09:00 – 17:00 (Africa/Kigali)".
  whenLabel: string;
  where: string; // venue, or "Virtual"

  // ── Presentation extras (all optional) ──────────────────────────
  dateLabel?: string; // "Sunday 15 November 2026"
  timeLabel?: string; // "09:00 – 17:00 (Africa/Kigali)"
  host?: string;
  badge?: { day: string; month: string };
  agenda?: { time: string; label: string }[];
  calendarUrl?: string;
  // Optional hero image the organiser attached to the invitation.
  imageUrl?: string;
  // Social links / address / unsubscribe link for the footer.
  footer?: FooterExtras | null;
}

export interface EventShellOptions {
  // Small label under the title in the banner: "Invitation",
  // "Reminder — in 3 days", "Cancelled"…
  label: string;
  // Plain text. Line breaks are kept; nothing is interpreted as HTML.
  paragraphs: string[];
  buttons?: { label: string; url: string; secondary?: boolean }[];
  // Date / time / where / host row.
  info?: boolean;
  // Extra row, e.g. { label: 'Register by', value: '10 Nov 2026' }.
  extraInfo?: { label: string; value: string }[];
  agenda?: boolean;
  calendar?: boolean;
  tone?: 'default' | 'alert';
  footnote?: string;
  previewText?: string;
}

export function eventShell(base: EventEmailBase, o: EventShellOptions): string {
  const brand: NewsletterBrand = {
    headerText: base.businessName,
    footerLines: [
      base.businessName,
      'This is a confidential system-generated message.',
    ],
    socialLinks: base.footer?.socialLinks,
    address: base.footer?.address,
    unsubscribeUrl: base.footer?.unsubscribeUrl ?? null,
  };

  const infoRows = o.info
    ? [
        base.dateLabel
          ? { label: 'Date', value: base.dateLabel }
          : { label: 'When', value: base.whenLabel },
        ...(base.timeLabel ? [{ label: 'Time', value: base.timeLabel }] : []),
        ...(base.where ? [{ label: 'Where', value: base.where }] : []),
        ...(base.host ? [{ label: 'Host', value: base.host }] : []),
        ...(o.extraInfo ?? []),
      ]
    : [];

  return renderEventMessage({
    brand,
    previewText: o.previewText ?? `${base.type} · ${base.whenLabel}`,
    mode: 'email',
    banner: {
      day: base.badge?.day,
      month: base.badge?.month,
      heading: base.title,
      sub: [o.label, base.where].filter(Boolean).join(' · '),
      tone: o.tone,
    },
    imageUrl: base.imageUrl,
    greeting: `Dear ${base.recipientName || 'guest'},`,
    paragraphs: o.paragraphs,
    infoRows,
    agenda: o.agenda ? base.agenda : [],
    buttons: o.buttons,
    calendarUrl: o.calendar ? base.calendarUrl : undefined,
    footnote: o.footnote,
  });
}
