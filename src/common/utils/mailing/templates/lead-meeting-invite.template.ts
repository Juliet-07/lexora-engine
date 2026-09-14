export interface LeadMeetingInviteEmailData {
  to: string;
  recipientName: string;
  tenantBusinessName: string;
  meetingTitle: string;
  date: string;
  time?: string;
  mode: string;
  location?: string;
  agenda?: string;
}

export function leadMeetingInviteTemplate(data: LeadMeetingInviteEmailData): {
  subject: string;
  html: string;
} {
  const {
    recipientName,
    tenantBusinessName,
    meetingTitle,
    date,
    time,
    mode,
    location,
    agenda,
  } = data;
  const year = new Date().getFullYear();
  const firmName = process.env.FIRM_NAME || 'Lexora';
  const dateLabel = new Date(date).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return {
    subject: `Meeting Invitation — ${meetingTitle}`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Meeting Invitation — ${tenantBusinessName}</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f2f0ed;font-family:'Georgia',serif;">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="background-color:#f2f0ed;padding:48px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0"
                style="background-color:#ffffff;border:1px solid #ddd8d0;
                       border-radius:6px;overflow:hidden;">

                <tr>
                  <td style="background-color:#4B0082;padding:32px 44px;">
                    <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;
                               text-transform:uppercase;color:#c9a84c;
                               font-family:Arial,sans-serif;">
                      ${firmName}
                    </p>
                    <h1 style="margin:0;font-size:22px;font-weight:normal;
                                color:#ffffff;font-family:'Georgia',serif;">
                      Meeting Invitation
                    </h1>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#c9a84c;height:3px;font-size:0;">&nbsp;</td>
                </tr>

                <tr>
                  <td style="padding:36px 44px 0;">
                    <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
                      Dear <strong>${recipientName}</strong>,
                    </p>
                    <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
                      <strong>${tenantBusinessName}</strong> would like to invite you
                      to a meeting: <strong>${meetingTitle}</strong>.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:8px 44px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0"
                      style="background-color:#f8f6f1;border-left:4px solid #c9a84c;
                             border-radius:3px;">
                      <tr>
                        <td style="padding:20px 24px;">
                          <p style="margin:0 0 6px;font-size:10px;letter-spacing:2px;
                                     text-transform:uppercase;color:#999999;
                                     font-family:Arial,sans-serif;">
                            Meeting Details
                          </p>
                          <p style="margin:0 0 4px;font-size:15px;color:#2c2c2c;
                                     font-family:Arial,sans-serif;">
                            ${dateLabel}${time ? ` · ${time}` : ''}
                          </p>
                          <p style="margin:0 0 4px;font-size:14px;color:#555555;
                                     font-family:Arial,sans-serif;">
                            Mode: ${mode}
                          </p>
                          ${
                            location
                              ? `<p style="margin:0 0 4px;font-size:14px;color:#555555;
                                     font-family:Arial,sans-serif;">
                            ${mode === 'virtual' ? 'Link' : 'Venue'}: ${location}
                          </p>`
                              : ''
                          }
                          ${
                            agenda
                              ? `<p style="margin:12px 0 0;font-size:14px;color:#555555;
                                     font-family:Arial,sans-serif;line-height:1.6;">
                            <strong>Agenda:</strong> ${agenda}
                          </p>`
                              : ''
                          }
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:32px 44px 40px;">
                    <p style="margin:0;font-size:15px;color:#2c2c2c;line-height:1.9;">
                      If this time doesn't work for you, or you have any questions,
                      please contact <strong>${tenantBusinessName}</strong> directly.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="background-color:#f2f0ed;border-top:1px solid #e0dbd4;
                             padding:18px 44px;">
                    <p style="margin:0;font-size:11px;color:#aaaaaa;text-align:center;
                               font-family:Arial,sans-serif;">
                      Sent on behalf of ${tenantBusinessName}. &copy; ${year} ${firmName}.
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
