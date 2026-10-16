export interface DemoRequestThankYouEmailData {
  to: string;
  firstName: string;
  subject: string;
  requestedDateLabel: string;
  requestedTime: string;
}

// Sent the moment a prospect submits the public contact/booking form
// — before any Super Admin review — so the interaction feels
// immediate even though the real confirmation comes later once the
// Super Admin schedules the meeting.
export function demoRequestThankYouTemplate(
  data: DemoRequestThankYouEmailData,
): { subject: string; html: string } {
  const { firstName, subject, requestedDateLabel, requestedTime } = data;
  const year = new Date().getFullYear();
  const firmName = process.env.FIRM_NAME || 'Lexora';

  return {
    subject: `Thanks for reaching out, ${firstName} — we've got your request`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Thanks for contacting ${firmName}</title>
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
                      We've received your request
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
                      Thank you for reaching out to <strong>${firmName}</strong> about
                      <strong>${subject}</strong>. We're glad you're here, and we'll be
                      in touch shortly to confirm your session.
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
                            You requested
                          </p>
                          <p style="margin:0;font-size:15px;color:#2c2c2c;font-family:Arial,sans-serif;">
                            ${requestedDateLabel} &middot; ${requestedTime}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 44px 40px;">
                    <p style="margin:0;font-size:15px;color:#2c2c2c;line-height:1.9;">
                      You'll receive an update of confirmation from our team with your
                      meeting details once it's been reviewed — usually within 24 hours.
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
