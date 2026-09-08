export interface KycUpdateRequestEmailData {
  to: string;
  firstName: string;
  tenantBusinessName: string;
  message: string;
  requestedSections: string[];
  loginUrl: string;
}

export function kycUpdateRequestTemplate(data: KycUpdateRequestEmailData): {
  subject: string;
  html: string;
} {
  const {
    to,
    firstName,
    tenantBusinessName,
    message,
    requestedSections,
    loginUrl,
  } = data;
  const year = new Date().getFullYear();
  const firmName = process.env.FIRM_NAME || 'Lexora';

  const sectionsList =
    requestedSections.length > 0
      ? `
      <tr>
        <td style="padding:20px 24px 24px;">
          <p style="margin:0 0 10px;font-size:11px;letter-spacing:2px;
                     text-transform:uppercase;color:#888888;
                     font-family:Arial,sans-serif;">
            Areas to Review
          </p>
          <table cellpadding="0" cellspacing="0" width="100%">
            ${requestedSections
              .map(
                (section) => `
              <tr>
                <td style="padding:6px 0;vertical-align:top;width:24px;">
                  <span style="display:inline-block;width:18px;height:18px;
                               background-color:#4B0082;border-radius:50%;
                               text-align:center;line-height:18px;font-size:11px;
                               color:#ffffff;font-family:Arial,sans-serif;">✓</span>
                </td>
                <td style="padding:6px 0 6px 8px;font-size:13px;color:#444444;
                            font-family:Arial,sans-serif;line-height:1.6;">
                  ${section}
                </td>
              </tr>
            `,
              )
              .join('')}
          </table>
        </td>
      </tr>`
      : '';

  return {
    subject: `Periodic KYC Review — ${tenantBusinessName} needs a quick update`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>KYC Update Request — ${tenantBusinessName}</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f2f0ed;font-family:'Georgia',serif;">

        <table width="100%" cellpadding="0" cellspacing="0"
          style="background-color:#f2f0ed;padding:48px 0;">
          <tr>
            <td align="center">
              <table width="640" cellpadding="0" cellspacing="0"
                style="background-color:#ffffff;border:1px solid #ddd8d0;
                       border-radius:6px;overflow:hidden;">

                <!-- Header -->
                <tr>
                  <td style="background-color:#4B0082;padding:36px 48px 32px;">
                    <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;
                               text-transform:uppercase;color:#c9a84c;
                               font-family:Arial,sans-serif;">
                      ${firmName}
                    </p>
                    <h1 style="margin:0;font-size:24px;font-weight:normal;
                                color:#ffffff;font-family:'Georgia',serif;
                                letter-spacing:0.3px;line-height:1.4;">
                      Time for a Quick KYC Review
                      <br/>
                      <span style="font-size:15px;color:#d4b8f0;font-style:italic;">
                        Just a routine check — your account stays active throughout.
                      </span>
                    </h1>
                  </td>
                </tr>

                <!-- Gold bar -->
                <tr>
                  <td style="background-color:#c9a84c;height:3px;
                             font-size:0;line-height:0;">&nbsp;</td>
                </tr>

                <!-- Opening -->
                <tr>
                  <td style="padding:40px 48px 0;">
                    <p style="margin:0 0 18px;font-size:15px;color:#2c2c2c;line-height:1.8;">
                      Dear <strong>${firstName}</strong>,
                    </p>
                    <p style="margin:0 0 18px;font-size:15px;color:#2c2c2c;line-height:1.8;">
                      As part of our ongoing compliance obligations, <strong>${tenantBusinessName}</strong>
                      periodically reviews client information to keep it current. It's been a
                      while since your details were last confirmed, so we'd appreciate a few
                      minutes of your time to review and update anything that's changed.
                    </p>
                  </td>
                </tr>

                <!-- Message from advisor -->
                <tr>
                  <td style="padding:16px 48px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0"
                      style="background-color:#f8f6f1;border-left:4px solid #c9a84c;
                             border-radius:3px;">
                      <tr>
                        <td style="padding:24px 28px;">
                          <p style="margin:0 0 8px;font-size:10px;letter-spacing:2px;
                                     text-transform:uppercase;color:#999999;
                                     font-family:Arial,sans-serif;">
                            Message from your compliance team
                          </p>
                          <p style="margin:0;font-size:14px;color:#2c2c2c;
                                     line-height:1.8;font-family:Arial,sans-serif;">
                            ${message}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Requested sections list (if any) -->
                ${
                  requestedSections.length > 0
                    ? `
                <tr>
                  <td style="padding:24px 48px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0"
                      style="border:1px solid #e0dbd4;border-radius:4px;overflow:hidden;">
                      <tr>
                        <td style="background-color:#4B0082;padding:14px 24px;">
                          <p style="margin:0;font-size:12px;font-weight:bold;
                                     letter-spacing:1.5px;text-transform:uppercase;
                                     color:#ffffff;font-family:Arial,sans-serif;">
                            Please Confirm or Update
                          </p>
                        </td>
                      </tr>
                      ${sectionsList}
                    </table>
                  </td>
                </tr>`
                    : ''
                }

                <!-- Instructions -->
                <tr>
                  <td style="padding:28px 48px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0"
                      style="background-color:#fff8f0;border:1px solid #f0e0cc;
                             border-radius:4px;">
                      <tr>
                        <td style="padding:18px 24px;">
                          <p style="margin:0 0 10px;font-size:12px;font-weight:bold;
                                     letter-spacing:1px;text-transform:uppercase;
                                     color:#c97a2c;font-family:Arial,sans-serif;">
                            &#x2713;&nbsp; What to Do
                          </p>
                          <table cellpadding="0" cellspacing="0">
                            ${[
                              'Log in to your secure client portal using the button below',
                              "Review your pre-filled details — most fields likely haven't changed",
                              "Update anything that's different and upload any new documents",
                              'Submit — your account remains fully active while we review it',
                            ]
                              .map(
                                (step, i) => `
                              <tr>
                                <td style="padding:5px 0;vertical-align:top;
                                           width:24px;font-family:Arial,sans-serif;">
                                  <span style="display:inline-block;width:18px;height:18px;
                                               background-color:#c97a2c;border-radius:50%;
                                               text-align:center;line-height:18px;
                                               font-size:10px;color:#ffffff;font-weight:bold;">
                                    ${i + 1}
                                  </span>
                                </td>
                                <td style="padding:5px 0 5px 10px;font-size:13px;
                                            color:#555555;font-family:Arial,sans-serif;
                                            line-height:1.6;">
                                  ${step}
                                </td>
                              </tr>
                            `,
                              )
                              .join('')}
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- CTA Button -->
                <tr>
                  <td style="padding:28px 48px 0;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background-color:#4B0082;border-radius:4px;">
                          <a href="${loginUrl}"
                            style="display:inline-block;padding:15px 36px;font-size:13px;
                                   font-family:Arial,sans-serif;letter-spacing:2px;
                                   text-transform:uppercase;color:#ffffff;
                                   text-decoration:none;font-weight:bold;">
                            Log In to Review &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:10px 0 0;font-size:11px;color:#aaaaaa;
                               font-family:Arial,sans-serif;">
                      Or copy this link: <a href="${loginUrl}" style="color:#4B0082;">${loginUrl}</a>
                    </p>
                  </td>
                </tr>

                <!-- Sign off -->
                <tr>
                  <td style="padding:36px 48px 40px;">
                    <p style="margin:0 0 6px;font-size:15px;color:#2c2c2c;line-height:1.8;">
                      If you have any questions, please contact your advisor at
                      <strong>${tenantBusinessName}</strong> directly.
                    </p>
                    <p style="margin:24px 0 0;font-size:15px;color:#2c2c2c;line-height:1.9;">
                      Kind regards,<br/>
                      <strong style="color:#4B0082;font-size:16px;">
                        ${tenantBusinessName}
                      </strong><br/>
                      <span style="font-size:12px;color:#999999;font-family:Arial,sans-serif;">
                        via ${firmName} Client Portal
                      </span>
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color:#f2f0ed;border-top:1px solid #e0dbd4;
                             padding:20px 48px;">
                    <p style="margin:0;font-size:11px;color:#aaaaaa;line-height:1.8;
                               font-family:Arial,sans-serif;text-align:center;">
                      This is a confidential system-generated notification sent on behalf
                      of <strong>${tenantBusinessName}</strong>.<br/>
                      Please do not reply directly to this email.<br/>
                      &copy; ${year} ${firmName}. All rights reserved.
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
