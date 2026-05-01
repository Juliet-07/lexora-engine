export interface ClientWelcomeEmailData {
  to: string;
  firstName: string;
  tenantBusinessName: string;
  tempPassword: string;
  loginUrl: string;
}

export function clientWelcomeTemplate(data: ClientWelcomeEmailData): {
  subject: string;
  html: string;
} {
  const { to, firstName, tenantBusinessName, tempPassword, loginUrl } = data;
  const year = new Date().getFullYear();
  const firmName = process.env.SMTP_FROM;

  return {
    subject: `Your Client Portal Access – ${tenantBusinessName}`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Client Portal Access</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Georgia',serif;">

        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 0;">
          <tr>
            <td align="center">
              <table width="620" cellpadding="0" cellspacing="0"
                style="background-color:#ffffff;border:1px solid #d6cfc4;border-radius:4px;overflow:hidden;">

                <!-- Header -->
                <tr>
                  <td style="background-color:#4B0082;padding:32px 40px;">
                    <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;
                               color:#c9a84c;font-family:'Georgia',serif;">
                      LEXORA
                    </p>
                    <h1 style="margin:8px 0 0;font-size:22px;font-weight:normal;color:#ffffff;
                                font-family:'Georgia',serif;letter-spacing:0.5px;">
                      Client Portal Invitation
                    </h1>
                  </td>
                </tr>

                <!-- Gold Divider -->
                <tr>
                  <td style="background-color:#c9a84c;height:3px;font-size:0;line-height:0;">&nbsp;</td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:40px 40px 32px;">
                    <p style="margin:0 0 20px;font-size:15px;color:#333333;line-height:1.7;">
                      Dear ${firstName},
                    </p>
                    <p style="margin:0 0 20px;font-size:15px;color:#333333;line-height:1.7;">
                      <strong>${tenantBusinessName}</strong> has created a client account
                      for you on the Lexora legal practice management platform. You can use
                      this portal to securely submit documents, track your matters, and
                      communicate with your legal team.
                    </p>
                    <p style="margin:0 0 28px;font-size:15px;color:#333333;line-height:1.7;">
                      Your temporary login credentials are below. You will be required to
                      set a new password the first time you sign in.
                    </p>

                    <!-- Credentials Box -->
                    <table width="100%" cellpadding="0" cellspacing="0"
                      style="background-color:#f8f6f1;border-left:4px solid #c9a84c;
                             border-radius:2px;margin-bottom:32px;">
                      <tr>
                        <td style="padding:24px 28px;">
                          <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;
                                     text-transform:uppercase;color:#888888;font-family:Arial,sans-serif;">
                            Your Login Credentials
                          </p>
                          <table cellpadding="0" cellspacing="0" style="margin-top:14px;">
                            <tr>
                              <td style="padding:6px 0;font-size:13px;color:#666666;
                                         font-family:Arial,sans-serif;width:110px;">Email</td>
                              <td style="padding:6px 0;font-size:14px;color:#4B0082;
                                         font-family:'Courier New',monospace;font-weight:bold;">
                                ${to}
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:6px 0;font-size:13px;color:#666666;
                                         font-family:Arial,sans-serif;">Password</td>
                              <td style="padding:6px 0;font-size:14px;color:#4B0082;
                                         font-family:'Courier New',monospace;font-weight:bold;
                                         letter-spacing:1px;">
                                ${tempPassword}
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:6px 0;font-size:13px;color:#666666;
                                         font-family:Arial,sans-serif;">Firm</td>
                              <td style="padding:6px 0;font-size:14px;color:#333333;
                                         font-family:Arial,sans-serif;font-weight:bold;">
                                ${tenantBusinessName}
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- CTA -->
                    <table cellpadding="0" cellspacing="0" style="margin-bottom:36px;">
                      <tr>
                        <td style="background-color:#4B0082;border-radius:3px;">
                          <a href="${loginUrl}"
                            style="display:inline-block;padding:14px 32px;font-size:13px;
                                   font-family:Arial,sans-serif;letter-spacing:1.5px;
                                   text-transform:uppercase;color:#ffffff;text-decoration:none;
                                   font-weight:bold;">
                            Access Your Portal &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- What to expect -->
                    <table width="100%" cellpadding="0" cellspacing="0"
                      style="background-color:#f0ebf8;border-radius:4px;margin-bottom:28px;">
                      <tr>
                        <td style="padding:20px 24px;">
                          <p style="margin:0 0 10px;font-size:12px;font-weight:bold;
                                     text-transform:uppercase;letter-spacing:1px;color:#4B0082;
                                     font-family:Arial,sans-serif;">
                            What you can do in your portal
                          </p>
                          <ul style="margin:0;padding-left:18px;font-size:13px;color:#555555;
                                     line-height:2;font-family:Arial,sans-serif;">
                            <li>Submit and track required documents</li>
                            <li>Monitor the progress of your matters</li>
                            <li>Communicate securely with your legal team</li>
                            <li>Review and sign documents electronically</li>
                          </ul>
                        </td>
                      </tr>
                    </table>

                    <!-- Security Notice -->
                    <table width="100%" cellpadding="0" cellspacing="0"
                      style="border:1px solid #e8e2d9;border-radius:2px;margin-bottom:28px;">
                      <tr>
                        <td style="padding:18px 22px;">
                          <p style="margin:0 0 8px;font-size:12px;font-weight:bold;
                                     text-transform:uppercase;letter-spacing:1px;color:#4B0082;
                                     font-family:Arial,sans-serif;">
                            &#x26A0; Security Notice
                          </p>
                          <p style="margin:0;font-size:13px;color:#555555;line-height:1.7;
                                     font-family:Arial,sans-serif;">
                            These credentials are strictly personal. Do not share them with
                            anyone, including staff at ${tenantBusinessName}. If you did not
                            expect this invitation, please contact
                            <strong>${tenantBusinessName}</strong> immediately.
                          </p>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:0;font-size:15px;color:#333333;line-height:1.7;">
                      If you have any questions, please reach out directly to
                      <strong>${tenantBusinessName}</strong> or contact our support team.
                    </p>
                    <p style="margin:28px 0 0;font-size:15px;color:#333333;line-height:1.8;">
                      Yours sincerely,<br/>
                      <strong style="color:#4B0082;">Lexora Support Team</strong><br/>
                      <span style="font-size:12px;color:#888888;">on behalf of ${tenantBusinessName}</span>
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color:#f8f6f1;border-top:1px solid #e8e2d9;padding:24px 40px;">
                    <p style="margin:0;font-size:11px;color:#999999;line-height:1.7;
                               font-family:Arial,sans-serif;text-align:center;">
                      This is a confidential system-generated notification.<br/>
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
