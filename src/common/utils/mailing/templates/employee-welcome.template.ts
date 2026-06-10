export interface EmployeeWelcomeEmailData {
  to: string;
  firstName: string;
  businessName: string;
  employeeNumber: string;
  jobTitle: string;
  tempPassword: string;
  loginUrl: string;
}

export function employeeWelcomeTemplate(data: EmployeeWelcomeEmailData): {
  subject: string;
  html: string;
} {
  const year = new Date().getFullYear();
  const firmName = process.env.FIRM_NAME || 'Lexora';

  const subject = `Welcome to ${data.businessName} — Your Employee Portal Access`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Welcome</title>
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
                       color:#c9a84c;font-family:Arial,sans-serif;">${firmName}</p>
            <h1 style="margin:0;font-size:22px;font-weight:normal;color:#ffffff;
                        font-family:'Georgia',serif;line-height:1.4;">
              Welcome to the team
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
              Welcome to <strong>${data.businessName}</strong>. Your employee
              account has been created. You can access your employee portal to
              view your profile, apply for leave, check attendance, and more.
            </p>
          </td>
        </tr>

        <!-- Employee + credentials box -->
        <tr>
          <td style="padding:0 48px;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background-color:#f8f6f1;border-left:4px solid #c9a84c;border-radius:3px;">
              <tr>
                <td style="padding:24px 28px;">
                  <p style="margin:0 0 16px;font-size:11px;letter-spacing:2px;
                             text-transform:uppercase;color:#888888;font-family:Arial,sans-serif;">
                    Your Details &amp; Portal Access
                  </p>
                  <table cellpadding="0" cellspacing="0" width="100%">
                    ${[
                      ['Employee No.', data.employeeNumber],
                      ['Job Title', data.jobTitle],
                      ['Email', data.to],
                      ['Temp Password', data.tempPassword],
                    ]
                      .map(
                        ([label, value]) => `
                    <tr>
                      <td style="padding:6px 0;font-size:12px;color:#777777;
                                 font-family:Arial,sans-serif;width:140px;">${label}</td>
                      <td style="padding:6px 0;font-size:14px;
                                 color:${label === 'Temp Password' ? '#4B0082' : '#2c2c2c'};
                                 font-family:${label === 'Temp Password' ? "'Courier New',monospace" : 'Arial,sans-serif'};
                                 font-weight:${label === 'Temp Password' ? 'bold' : 'normal'};
                                 letter-spacing:${label === 'Temp Password' ? '1px' : 'normal'};">
                        ${value}
                      </td>
                    </tr>`,
                      )
                      .join('')}
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
                    <strong>Important:</strong> You will be asked to change your
                    password on first login. Keep your credentials secure.
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
                    Access Employee Portal &rarr;
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
              We're glad to have you,<br/>
              <strong style="color:#4B0082;font-size:16px;">${data.businessName}</strong>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#f2f0ed;border-top:1px solid #e0dbd4;padding:20px 48px;">
            <p style="margin:0;font-size:11px;color:#aaaaaa;line-height:1.8;
                       font-family:Arial,sans-serif;text-align:center;">
              Powered by ${firmName} &copy; ${year}
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
