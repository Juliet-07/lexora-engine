// CRM Tools event lifecycle emails — everything an invitee receives
// AFTER the invitation: reminders as the event approaches, the
// post-event follow-ups (thank-you, feedback request, recording &
// materials, no-show), and a cancellation notice. Same house style
// (deep purple header, gold divider, cream footer) as
// event-invite.template.ts. Every interpolated value is escaped.

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const safeUrl = (u: unknown) => {
  const v = String(u ?? '').trim();
  return /^https?:\/\//i.test(v) ? v : '';
};

export interface EventEmailBase {
  businessName: string;
  recipientName: string;
  title: string;
  type: string;
  // Already formatted in the event's own time zone, e.g.
  // "Sunday 15 November 2026, 09:00 – 17:00 (Africa/Kigali)".
  whenLabel: string;
  where: string; // venue, or "Virtual"
}

interface Shell {
  businessName: string;
  heading: string;
  recipientName: string;
  paragraphs: string[]; // already-safe HTML
  card?: { title: string; lines: string[] };
  buttons?: { label: string; url: string }[];
  footnote?: string;
}

function shell(d: Shell): string {
  const year = new Date().getFullYear();
  const buttons = (d.buttons ?? [])
    .filter((b) => safeUrl(b.url))
    .map(
      (b) => `
              <a href="${esc(safeUrl(b.url))}"
                style="display:inline-block;background-color:#4B0082;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:6px;font-size:14px;font-family:Arial,sans-serif;margin:4px 6px;">
                ${esc(b.label)}
              </a>`,
    )
    .join('');
  const card = d.card
    ? `<tr>
            <td style="padding:0 48px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#f8f6f1;border:1px solid #e8e2d9;border-radius:4px;">
                <tr><td style="padding:20px 24px;">
                  <h2 style="margin:0 0 8px;font-size:17px;font-weight:normal;color:#2c2c2c;font-family:'Georgia',serif;">${esc(d.card.title)}</h2>
                  ${d.card.lines
                    .filter(Boolean)
                    .map(
                      (l) =>
                        `<p style="margin:0 0 6px;font-size:13px;color:#555555;font-family:Arial,sans-serif;line-height:1.6;">${l}</p>`,
                    )
                    .join('')}
                </td></tr>
              </table>
            </td>
          </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${esc(d.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background-color:#ffffff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr>
          <td style="background-color:#4B0082;padding:32px 48px 28px;">
            <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">${esc(d.businessName)}</p>
            <h1 style="margin:0;font-size:21px;font-weight:normal;color:#ffffff;font-family:'Georgia',serif;">${esc(d.heading)}</h1>
          </td>
        </tr>
        <tr><td style="background-color:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding:36px 48px 8px;">
            <p style="margin:0 0 18px;font-size:15px;color:#2c2c2c;line-height:1.7;">Dear <strong>${esc(d.recipientName)}</strong>,</p>
            ${d.paragraphs
              .map(
                (p) =>
                  `<p style="margin:0 0 18px;font-size:15px;color:#2c2c2c;line-height:1.7;">${p}</p>`,
              )
              .join('')}
          </td>
        </tr>
        ${card}
        ${buttons ? `<tr><td style="padding:0 48px 36px;text-align:center;">${buttons}</td></tr>` : ''}
        ${d.footnote ? `<tr><td style="padding:0 48px 28px;"><p style="margin:0;font-size:13px;color:#777;line-height:1.6;font-family:Arial,sans-serif;">${esc(d.footnote)}</p></td></tr>` : ''}
        <tr>
          <td style="background-color:#f8f6f1;border-top:1px solid #e8e2d9;padding:24px 48px;">
            <p style="margin:0;font-size:11px;color:#999999;line-height:1.7;font-family:Arial,sans-serif;text-align:center;">
              This is a confidential system-generated message.<br/>
              &copy; ${year} ${esc(d.businessName)}. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const eventCard = (d: EventEmailBase, description?: string) => ({
  title: d.title,
  lines: [esc(d.whenLabel), esc(d.where), description ? esc(description) : ''],
});

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
    ? `This is a reminder that <strong>${esc(d.title)}</strong> takes place <strong>${esc(d.leadLabel)}</strong>. We look forward to seeing you.`
    : d.requiresRegistration
      ? `<strong>${esc(d.title)}</strong> takes place <strong>${esc(d.leadLabel)}</strong> and we haven't received your registration yet. Use your personal link to secure your place.`
      : `<strong>${esc(d.title)}</strong> takes place <strong>${esc(d.leadLabel)}</strong>. Please open your portal to confirm that you'll be attending.`;
  const buttons: { label: string; url: string }[] = [];
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
    html: shell({
      businessName: d.businessName,
      heading: `Reminder — ${d.type}`,
      recipientName: d.recipientName,
      paragraphs: [intro],
      card: eventCard(d),
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
        html: shell({
          businessName: d.businessName,
          heading: 'Thank you for attending',
          recipientName: d.recipientName,
          paragraphs: [
            `Thank you for joining us at <strong>${esc(d.title)}</strong>. It was a pleasure to have you with us, and we hope you found it valuable.`,
          ],
          card: eventCard(d),
          footnote: 'We will be in touch with anything further from the event.',
        }),
      };
    case 'feedback':
      return {
        subject: `How was ${d.title}? Share your feedback`,
        html: shell({
          businessName: d.businessName,
          heading: 'We would value your feedback',
          recipientName: d.recipientName,
          paragraphs: [
            `Thank you for attending <strong>${esc(d.title)}</strong>. It takes less than a minute to tell us how it went — your rating helps us make the next one better.`,
          ],
          card: eventCard(d),
          buttons: [{ label: 'Give feedback', url: d.feedbackLink }],
        }),
      };
    case 'recording':
      return {
        subject: `Recording & materials: ${d.title}`,
        html: shell({
          businessName: d.businessName,
          heading: 'Recording & materials',
          recipientName: d.recipientName,
          paragraphs: [
            `Here are the recording and materials from <strong>${esc(d.title)}</strong>, for you to revisit or share with colleagues.`,
          ],
          card: eventCard(d),
          buttons: links,
        }),
      };
    case 'noshow':
      return {
        subject: `We missed you at ${d.title}`,
        html: shell({
          businessName: d.businessName,
          heading: 'We missed you',
          recipientName: d.recipientName,
          paragraphs: [
            `We noticed you weren't able to join us at <strong>${esc(d.title)}</strong>. We understand — these things happen.${links.length ? ' You can catch up using the links below.' : ''}`,
          ],
          card: eventCard(d),
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
    html: shell({
      businessName: d.businessName,
      heading: `${d.type} cancelled`,
      recipientName: d.recipientName,
      paragraphs: [
        `We're sorry to let you know that <strong>${esc(d.title)}</strong> has been cancelled.`,
        ...(d.reason ? [esc(d.reason)] : []),
      ],
      card: eventCard(d),
      footnote: 'We will let you know if it is rescheduled.',
    }),
  };
}
