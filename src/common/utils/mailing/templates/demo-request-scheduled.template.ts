export interface DemoRequestScheduledEmailData {
  to: string;
  firstName: string;
  subject: string;
  dateLabel: string;
  time: string;
  meetingLink: string;
}

// Sent when the Super Admin picks "Scheduled" and confirms the
// booking with a meeting link (Zoom/Teams/Google Meet) — this is the
// real confirmation, distinct from the immediate thank-you sent at
// submission time.
export function demoRequestScheduledTemplate(
  data: DemoRequestScheduledEmailData,
): { subject: string; html: string } {
  const { firstName, subject, dateLabel, time, meetingLink } = data;
  const year = new Date().getFullYear();
  const firmName = process.env.FIRM_NAME || 'Lexora';

  return {
    subject: `You're confirmed — ${subject} with ${firmName}`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Meeting confirmed — ${firmName}</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f2f0ed;font-family:'Georgia',serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f0ed;padding:48px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0"
                style="background-color:#ffffff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
                <tr>
                  <td style="background-color:#4B0082;padding:32px 44px;">
                    <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">
                      ${firmName}
                    </p>
                    <h1 style="margin:0;font-size:22px;font-weight:normal;color:#ffffff;font-family:'Georgia',serif;">
                      Your meeting is confirmed
                    </h1>
                  </td>
                </tr>
                <tr><td style="background-color:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
                <tr>
                  <td style="padding:36px 44px 0;">
                    <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
                      Hi <strong>${firstName}</strong>,
                    </p>
                    <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
                      Good news — your session on <strong>${subject}</strong> is
                      confirmed. Here are the details:
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 44px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0"
                      style="background-color:#f8f6f1;border-left:4px solid #c9a84c;border-radius:3px;">
                      <tr>
                        <td style="padding:20px 24px;">
                          <p style="margin:0 0 6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#999999;font-family:Arial,sans-serif;">
                            Meeting Details
                          </p>
                          <p style="margin:0 0 4px;font-size:15px;color:#2c2c2c;font-family:Arial,sans-serif;">
                            ${dateLabel} &middot; ${time}
                          </p>
                          <p style="margin:12px 0 0;font-size:14px;color:#555555;font-family:Arial,sans-serif;">
                            <a href="${meetingLink}" style="color:#4B0082;font-weight:bold;">${meetingLink}</a>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 44px 40px;">
                    <p style="margin:0;font-size:15px;color:#2c2c2c;line-height:1.9;">
                      We look forward to speaking with you. If anything changes on your
                      end, just reply to this email and let us know.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#f2f0ed;border-top:1px solid #e0dbd4;padding:18px 44px;">
                    <p style="margin:0;font-size:11px;color:#aaaaaa;text-align:center;font-family:Arial,sans-serif;">
                      &copy; ${year} ${firmName}. Kigali, Rwanda.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  };
}
