export interface PartyCommunicationEmailData {
  to: string;
  partyName: string;
  tenantBusinessName: string;
  caseRef: string;
  subject: string;
  body: string;
}

export function partyCommunicationTemplate(data: PartyCommunicationEmailData): {
  subject: string;
  html: string;
} {
  const { partyName, tenantBusinessName, caseRef, subject, body } = data;
  const year = new Date().getFullYear();
  const firmName = process.env.FIRM_NAME || 'Lexora';
  // Real content, user-composed by the tenant — paragraph breaks
  // preserved, nothing else assumed about its structure.
  const bodyHtml = body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;color:#2c2c2c;line-height:1.8;">${p.replace(/\n/g, '<br/>')}</p>`,
    )
    .join('');

  return {
    subject: `${subject} — ${caseRef}`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>${subject} — ${tenantBusinessName}</title>
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
                      ${subject}
                    </h1>
                    <p style="margin:8px 0 0;font-size:12px;color:#d4b8f0;
                               font-family:Arial,sans-serif;">
                      Re: ${caseRef}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#c9a84c;height:3px;font-size:0;">&nbsp;</td>
                </tr>

                <tr>
                  <td style="padding:36px 44px 0;">
                    <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
                      Dear <strong>${partyName}</strong>,
                    </p>
                    ${bodyHtml}
                  </td>
                </tr>

                <tr>
                  <td style="padding:16px 44px 40px;">
                    <p style="margin:0;font-size:15px;color:#2c2c2c;line-height:1.9;">
                      Kind regards,<br/>
                      <strong>${tenantBusinessName}</strong>
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
