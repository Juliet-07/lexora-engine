// CRM Tools event invite — one real template covering both event
// shapes (see event.schema.ts): an External invite's CTA leads to
// the invitee's own personal registration link; an InHouse invite's
// CTA leads to the invitee's own portal (client/board/employee),
// where attendance is acknowledged rather than registered. Nothing
// here claims a calendar invite (.ics) is attached — this is the
// email only.

export interface EventInviteEmailData {
  businessName: string;
  recipientName: string;
  title: string;
  type: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  virtual: boolean;
  meetingLink: string | null;
  requiresRegistration: boolean;
  ctaLink: string;
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export function eventInviteTemplate(data: EventInviteEmailData): {
  subject: string;
  html: string;
} {
  const year = new Date().getFullYear();
  const subject = `You're invited: ${data.title}`;
  const ctaLabel = data.requiresRegistration
    ? 'Register now'
    : 'View in your portal';
  const intro = data.requiresRegistration
    ? `You're invited to <strong>${data.title}</strong>. Follow the link below to register — it's your own personal registration link.`
    : `You're invited to <strong>${data.title}</strong>. Open your portal to view the details and let us know you'll be attending.`;

  const whenWhere = [
    `${fmtDate(data.date)}${data.startTime ? `, ${data.startTime}` : ''}${data.endTime ? ` – ${data.endTime}` : ''}`,
    data.virtual
      ? data.meetingLink
        ? 'Virtual'
        : 'Virtual (link in your portal)'
      : data.location,
  ]
    .filter(Boolean)
    .join(' &nbsp;&middot;&nbsp; ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${data.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f0ed;padding:48px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
          style="background-color:#ffffff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">

          <tr>
            <td style="background-color:#4B0082;padding:32px 48px 28px;">
              <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">
                ${data.businessName}
              </p>
              <h1 style="margin:0;font-size:21px;font-weight:normal;color:#ffffff;font-family:'Georgia',serif;">
                ${data.type} invitation
              </h1>
            </td>
          </tr>
          <tr><td style="background-color:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>

          <tr>
            <td style="padding:36px 48px 8px;">
              <p style="margin:0 0 18px;font-size:15px;color:#2c2c2c;line-height:1.7;">
                Dear <strong>${data.recipientName}</strong>,
              </p>
              <p style="margin:0 0 20px;font-size:15px;color:#2c2c2c;line-height:1.7;">
                ${intro}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 48px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#f8f6f1;border:1px solid #e8e2d9;border-radius:4px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <h2 style="margin:0 0 8px;font-size:17px;font-weight:normal;color:#2c2c2c;font-family:'Georgia',serif;">
                      ${data.title}
                    </h2>
                    <p style="margin:0 0 10px;font-size:13px;color:#555555;font-family:Arial,sans-serif;">
                      ${whenWhere}
                    </p>
                    ${
                      data.description
                        ? `<p style="margin:0;font-size:14px;color:#333333;line-height:1.6;">${data.description}</p>`
                        : ''
                    }
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 48px 36px;text-align:center;">
              <a href="${data.ctaLink}"
                style="display:inline-block;background-color:#4B0082;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:6px;font-size:14px;font-family:Arial,sans-serif;">
                ${ctaLabel}
              </a>
            </td>
          </tr>

          <tr>
            <td style="background-color:#f8f6f1;border-top:1px solid #e8e2d9;padding:24px 48px;">
              <p style="margin:0;font-size:11px;color:#999999;line-height:1.7;font-family:Arial,sans-serif;text-align:center;">
                This is a confidential system-generated invitation.<br/>
                &copy; ${year} ${data.businessName}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
