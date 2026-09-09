export interface CaseNoticeEmailData {
  to: string;
  firstName: string;
  tenantBusinessName: string;
  caseType: 'ADR' | 'Litigation';
  caseTitle: string;
  caseRef: string;
  mandateName: string;
  loginUrl: string;
}

export function caseNoticeTemplate(data: CaseNoticeEmailData): {
  subject: string;
  html: string;
} {
  const {
    firstName,
    tenantBusinessName,
    caseType,
    caseTitle,
    caseRef,
    mandateName,
    loginUrl,
  } = data;
  const year = new Date().getFullYear();
  const firmName = process.env.FIRM_NAME || 'Lexora';
  const label = caseType === 'ADR' ? 'Dispute Resolution' : 'Litigation';

  return {
    subject: `${label} update on your matter — ${caseRef}`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>${label} Notice — ${tenantBusinessName}</title>
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
                      ${label} Notice
                    </h1>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#c9a84c;height:3px;font-size:0;">&nbsp;</td>
                </tr>

                <tr>
                  <td style="padding:36px 44px 0;">
                    <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
                      Dear <strong>${firstName}</strong>,
                    </p>
                    <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
                      <strong>${tenantBusinessName}</strong> has opened a ${label.toLowerCase()}
                      matter connected to your mandate, <strong>${mandateName}</strong>.
                      Your account remains fully active and you can review the full
                      details, timeline, and any documents from your client portal at
                      any time.
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
                            Matter
                          </p>
                          <p style="margin:0;font-size:15px;color:#2c2c2c;
                                     font-family:Arial,sans-serif;">
                            ${caseTitle} <span style="color:#888888;">(${caseRef})</span>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
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
                </tr>

                <tr>
                  <td style="padding:32px 44px 40px;">
                    <p style="margin:0;font-size:15px;color:#2c2c2c;line-height:1.9;">
                      If you have any questions, please reach out to your advisor at
                      <strong>${tenantBusinessName}</strong> directly.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="background-color:#f2f0ed;border-top:1px solid #e0dbd4;
                             padding:18px 44px;">
                    <p style="margin:0;font-size:11px;color:#aaaaaa;text-align:center;
                               font-family:Arial,sans-serif;">
                      Confidential — sent on behalf of ${tenantBusinessName}.
                      &copy; ${year} ${firmName}.
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
