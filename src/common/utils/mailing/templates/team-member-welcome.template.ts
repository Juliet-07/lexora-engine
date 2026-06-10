export interface TeamMemberWelcomeEmailData {
  to: string;
  firstName: string;
  businessName: string;
  role: string;
  tempPassword: string;
  loginUrl: string;
}

const roleLabels: Record<string, string> = {
  tenant_admin: 'Administrator',
  tenant_manager: 'Manager',
  tenant_compliance: 'Compliance Officer',
  tenant_finance: 'Finance Officer',
  tenant_support: 'Support',
};

export function teamMemberWelcomeTemplate(data: TeamMemberWelcomeEmailData): {
  subject: string;
  html: string;
} {
  const year = new Date().getFullYear();
  const firmName = process.env.FIRM_NAME || 'Lexora';
  const roleLabel = roleLabels[data.role] ?? data.role;

  const subject = `You've been added to ${data.businessName} on ${firmName}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Welcome to the team</title>
</head>
<body style="margin:0;padding:0;background-color:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background-color:#ffffff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background-color:#4B0082;padding:32px 48px 28px;">
            <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;
                       color:#c9a84c;font-family:Arial,sans-serif;">
              ${firmName}
            </p>
            <h1 style="margin:0;font-size:22px;font-weight:normal;color:#ffffff;
                        font-family:'Georgia',serif;line-height:1.4;">
              You've been added to the team
            </h1>
            <p style="margin:6px 0 0;font-size:13px;color:#d4b8f0;font-family:Arial,sans-serif;">
              ${data.businessName}
            </p>
          </td>
        </tr>
        <tr><td style="background-color:#c9a84c;height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 48px 0;">
            <p style="margin:0 0 18px;font-size:15px;color:#2c2c2c;line-height:1.8;">
              Dear <strong>${data.firstName}</strong>,
            </p>
            <p style="margin:0 0 18px;font-size:15px;color:#2c2c2c;line-height:1.8;">
              You have been added to <strong>${data.businessName}</strong> as a
              <strong>${roleLabel}</strong> on the ${firmName} platform.
              Here are your login credentials to get started.
            </p>
          </td>
        </tr>

        <!-- Credentials box -->
        <tr>
          <td style="padding:0 48px;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background-color:#f8f6f1;border-left:4px solid #c9a84c;border-radius:3px;">
              <tr>
                <td style="padding:24px 28px;">
                  <p style="margin:0 0 16px;font-size:11px;letter-spacing:2px;text-transform:uppercase;
                             color:#888888;font-family:Arial,sans-serif;">
                    Your Login Credentials
                  </p>
                  <table cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="padding:6px 0;font-size:12px;color:#777777;
                                 font-family:Arial,sans-serif;width:130px;">Email</td>
                      <td style="padding:6px 0;font-size:14px;color:#2c2c2c;
                                 font-family:Arial,sans-serif;">${data.to}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:12px;color:#777777;
                                 font-family:Arial,sans-serif;">Temporary Password</td>
                      <td style="padding:6px 0;font-size:14px;color:#4B0082;
                                 font-family:'Courier New',monospace;font-weight:bold;
                                 letter-spacing:1px;">${data.tempPassword}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:12px;color:#777777;
                                 font-family:Arial,sans-serif;">Role</td>
                      <td style="padding:6px 0;font-size:14px;color:#2c2c2c;
                                 font-family:Arial,sans-serif;">${roleLabel}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Warning -->
        <tr>
          <td style="padding:16px 48px 0;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background-color:#fff8f0;border:1px solid #f0e0cc;border-radius:3px;">
              <tr>
                <td style="padding:14px 20px;">
                  <p style="margin:0;font-size:12px;color:#c97a2c;font-family:Arial,sans-serif;">
                    <strong>Important:</strong> You will be prompted to change your password
                    on first login. Please keep your credentials secure and do not share them.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:28px 48px 0;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background-color:#4B0082;border-radius:4px;">
                  <a href="${data.loginUrl}"
                    style="display:inline-block;padding:15px 36px;font-size:13px;
                           font-family:Arial,sans-serif;letter-spacing:2px;
                           text-transform:uppercase;color:#ffffff;
                           text-decoration:none;font-weight:bold;">
                    Log In Now &rarr;
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Sign off -->
        <tr>
          <td style="padding:32px 48px 40px;">
            <p style="margin:0;font-size:15px;color:#2c2c2c;line-height:1.9;">
              Welcome aboard,<br/>
              <strong style="color:#4B0082;font-size:16px;">${data.businessName}</strong><br/>
              <span style="font-size:12px;color:#999999;font-family:Arial,sans-serif;">
                via ${firmName}
              </span>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#f2f0ed;border-top:1px solid #e0dbd4;padding:20px 48px;">
            <p style="margin:0;font-size:11px;color:#aaaaaa;line-height:1.8;
                       font-family:Arial,sans-serif;text-align:center;">
              This email was sent because you were added as a team member.<br/>
              If this was a mistake, please contact ${data.businessName} immediately.<br/>
              &copy; ${year} ${firmName}. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
