export interface TenantWelcomeEmailData {
  to: string;
  firstName: string;
  businessName: string;
  tempPassword: string;
  loginUrl: string;
}

export function tenantWelcomeTemplate(data: TenantWelcomeEmailData): {
  subject: string;
  html: string;
} {
  const { to, firstName, businessName, tempPassword, loginUrl } = data;
  const year = new Date().getFullYear();
  const firmName =
    process.env.SMTP_FROM;

  return {
    subject: `Portal Access Granted – ${businessName}`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Welcome to the Platform</title>
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
                       Your Portal Access
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
                      On behalf of our team, we are pleased to confirm that
                      <strong>${businessName}</strong> has been successfully onboarded
                      to our legal practice management platform. Your firm portal is now
                      active and ready for use.
                    </p>
                    <p style="margin:0 0 28px;font-size:15px;color:#333333;line-height:1.7;">
                      Please find your access credentials below. For security purposes,
                      you will be required to create a new password upon your first login.
                    </p>

                    <!-- Credentials Box -->
                    <table width="100%" cellpadding="0" cellspacing="0"
                      style="background-color:#f8f6f1;border-left:4px solid #c9a84c;
                             border-radius:2px;margin-bottom:32px;">
                      <tr>
                        <td style="padding:24px 28px;">
                          <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;
                                     text-transform:uppercase;color:#888888;font-family:Arial,sans-serif;">
                            Login Credentials
                          </p>
                          <table cellpadding="0" cellspacing="0" style="margin-top:14px;">
                            <tr>
                              <td style="padding:6px 0;font-size:13px;color:#666666;
                                         font-family:Arial,sans-serif;width:110px;">Email</td>
                              <td style="padding:6px 0;font-size:14px;color:#1a2744;
                                         font-family:'Courier New',monospace;font-weight:bold;">
                                ${to}
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:6px 0;font-size:13px;color:#666666;
                                         font-family:Arial,sans-serif;">Password</td>
                              <td style="padding:6px 0;font-size:14px;color:#1a2744;
                                         font-family:'Courier New',monospace;font-weight:bold;letter-spacing:1px;">
                                ${tempPassword}
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

                    <!-- Security Notice -->
                    <table width="100%" cellpadding="0" cellspacing="0"
                      style="border:1px solid #e8e2d9;border-radius:2px;margin-bottom:28px;">
                      <tr>
                        <td style="padding:18px 22px;">
                          <p style="margin:0 0 8px;font-size:12px;font-weight:bold;
                                     text-transform:uppercase;letter-spacing:1px;color:#1a2744;
                                     font-family:Arial,sans-serif;">
                            &#x26A0; Security Notice
                          </p>
                          <p style="margin:0;font-size:13px;color:#555555;line-height:1.7;
                                     font-family:Arial,sans-serif;">
                            This message contains confidential access credentials. Please do not
                            forward this email or share your credentials with any third party.
                            If you did not request this account, please contact us immediately.
                          </p>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:0;font-size:15px;color:#333333;line-height:1.7;">
                      Should you require any assistance, our support team is available to help.
                      We look forward to supporting <strong>${businessName}</strong>.
                    </p>
                    <p style="margin:28px 0 0;font-size:15px;color:#333333;line-height:1.8;">
                      Yours sincerely,<br/>
                      <strong style="color:#1a2744;">Lexora Support Team</strong>
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
