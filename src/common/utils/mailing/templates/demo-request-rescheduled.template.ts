export interface DemoRequestRescheduledEmailData {
  to: string;
  firstName: string;
  subject: string;
  originalDateLabel: string;
  originalTime: string;
  newDateLabel: string;
  newTime: string;
}

// Sent when the Super Admin picks "Rescheduled". The new date/time is
// always the prospect's own alternate date (collected on the original
// public form), never a time the prospect hasn't already agreed to.
export function demoRequestRescheduledTemplate(
  data: DemoRequestRescheduledEmailData,
): { subject: string; html: string } {
  const {
    firstName,
    subject,
    originalDateLabel,
    originalTime,
    newDateLabel,
    newTime,
  } = data;
  const year = new Date().getFullYear();
  const firmName = process.env.FIRM_NAME || 'Lexora';

  return {
    subject: `Your meeting with ${firmName} has been rescheduled`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Meeting rescheduled — ${firmName}</title>
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
                      Your meeting has been rescheduled
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
                      We need to move your session on <strong>${subject}</strong> to the
                      alternate time you gave us when you made your request.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 44px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0"
                      style="background-color:#f8f6f1;border-left:4px solid #c9a84c;border-radius:3px;">
                      <tr>
                        <td style="padding:20px 24px;">
                          <p style="margin:0 0 10px;font-size:13px;color:#999999;text-decoration:line-through;font-family:Arial,sans-serif;">
                            Was: ${originalDateLabel} &middot; ${originalTime}
                          </p>
                          <p style="margin:0 0 6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#999999;font-family:Arial,sans-serif;">
                            New time
                          </p>
                          <p style="margin:0;font-size:15px;color:#2c2c2c;font-weight:bold;font-family:Arial,sans-serif;">
                            ${newDateLabel} &middot; ${newTime}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 44px 40px;">
                    <p style="margin:0;font-size:15px;color:#2c2c2c;line-height:1.9;">
                      We'll follow up with the meeting link closer to the date. If this
                      new time no longer works, just reply to this email.
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
