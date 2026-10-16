export interface DemoRequestCancelledEmailData {
  to: string;
  firstName: string;
  subject: string;
  dateLabel: string;
  time: string;
  reason: string;
}

export function demoRequestCancelledTemplate(
  data: DemoRequestCancelledEmailData,
): { subject: string; html: string } {
  const { firstName, subject, dateLabel, time, reason } = data;
  const year = new Date().getFullYear();
  const firmName = process.env.FIRM_NAME || 'Lexora';

  return {
    subject: `Your meeting with ${firmName} has been cancelled`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Meeting cancelled — ${firmName}</title>
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
                      Your meeting has been cancelled
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
                      Your session on <strong>${subject}</strong>, originally set for
                      <strong>${dateLabel} &middot; ${time}</strong>, has been cancelled.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 44px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0"
                      style="background-color:#f8f6f1;border-left:4px solid #c0392b;border-radius:3px;">
                      <tr>
                        <td style="padding:20px 24px;">
                          <p style="margin:0 0 6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#999999;font-family:Arial,sans-serif;">
                            Reason
                          </p>
                          <p style="margin:0;font-size:14px;color:#2c2c2c;line-height:1.7;font-family:Arial,sans-serif;">
                            ${reason}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 44px 40px;">
                    <p style="margin:0;font-size:15px;color:#2c2c2c;line-height:1.9;">
                      If you'd still like to speak with us, feel free to submit a new
                      request on our website whenever it suits you.
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
