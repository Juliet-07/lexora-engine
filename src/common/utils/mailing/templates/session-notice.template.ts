export interface SessionNoticeEmailData {
  to: string;
  recipientName: string;
  tenantBusinessName: string;
  caseTitle: string;
  caseRef: string;
  sessionDate: string;
  startTime?: string;
  endTime?: string;
  mode: string;
  venue?: string;
  loginUrl?: string;
}

export function sessionNoticeTemplate(data: SessionNoticeEmailData): {
  subject: string;
  html: string;
} {
  const {
    recipientName,
    tenantBusinessName,
    caseTitle,
    caseRef,
    sessionDate,
    startTime,
    endTime,
    mode,
    venue,
    loginUrl,
  } = data;
  const year = new Date().getFullYear();
  const firmName = process.env.FIRM_NAME || 'Lexora';
  const dateLabel = new Date(sessionDate).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeLabel = startTime
    ? `${startTime}${endTime ? ` – ${endTime}` : ''}`
    : '';

  return {
    subject: `Session Scheduled — ${caseRef}`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Session Scheduled — ${tenantBusinessName}</title>
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
                      Session Scheduled
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
                      <strong>${tenantBusinessName}</strong> has scheduled a session
                      on the matter <strong>${caseTitle}</strong> (${caseRef}).
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
                            Session Details
                          </p>
                          <p style="margin:0 0 4px;font-size:15px;color:#2c2c2c;
                                     font-family:Arial,sans-serif;">
                            ${dateLabel}${timeLabel ? ` · ${timeLabel}` : ''}
                          </p>
                          <p style="margin:0 0 4px;font-size:14px;color:#555555;
                                     font-family:Arial,sans-serif;">
                            Mode: ${mode}
                          </p>
                          ${
                            venue
                              ? `<p style="margin:0;font-size:14px;color:#555555;
                                     font-family:Arial,sans-serif;">
                            Venue: ${venue}
                          </p>`
                              : ''
                          }
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                ${
                  loginUrl
                    ? `<tr>
                  <td style="padding:28px 44px 0;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background-color:#4B0082;border-radius:4px;">
                          <a href="${loginUrl}"
                            style="display:inline-block;padding:14px 32px;font-size:13px;
                                   font-family:Arial,sans-serif;letter-spacing:1.5px;
                                   text-transform:uppercase;color:#ffffff;
                                   text-decoration:none;font-weight:bold;">
                            View in Client Portal &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`
                    : ''
                }

                <tr>
                  <td style="padding:32px 44px 40px;">
                    <p style="margin:0;font-size:15px;color:#2c2c2c;line-height:1.9;">
                      If you have any questions regarding this session, please contact
                      <strong>${tenantBusinessName}</strong> directly.
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
