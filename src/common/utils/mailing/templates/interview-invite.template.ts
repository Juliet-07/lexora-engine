// ═══════════════════════════════════════════════════════════════
// REPLACE: src/common/utils/mailing/templates/interview-invite.template.ts
//
// Matches employeeWelcomeTemplate's exact visual system: deep
// purple header (#4B0082), gold accent (#c9a84c), Georgia serif
// body, boxed details panel, same footer line. Uses `businessName`
// as the parameter name (not tenantCompanyName) to match the
// existing convention exactly.
// ═══════════════════════════════════════════════════════════════

export interface InterviewInviteEmailData {
  to: string;
  candidateName: string;
  roleAppliedFor: string;
  businessName: string;
}

export function interviewInviteTemplate(data: InterviewInviteEmailData): {
  subject: string;
  html: string;
} {
  const year = new Date().getFullYear();
  const firmName = process.env.FIRM_NAME || 'Lexora';

  const subject = `Interview Invitation — ${data.roleAppliedFor} at ${data.businessName}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Interview Invitation</title>
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
              You're invited to interview
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
              Dear <strong>${data.candidateName}</strong>,
            </p>
            <p style="margin:0 0 18px;font-size:15px;color:#2c2c2c;line-height:1.8;">
              On behalf of <strong>${data.businessName}</strong>, thank you for applying for the
              <strong>${data.roleAppliedFor}</strong> position. We'd like to invite you to the next
              stage of our process — an interview.
            </p>
            <p style="margin:0 0 18px;font-size:15px;color:#2c2c2c;line-height:1.8;">
              The team at <strong>${data.businessName}</strong> will be in touch shortly with
              scheduling details.
            </p>
          </td>
        </tr>

        <!-- Role box -->
        <tr>
          <td style="padding:0 48px;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background-color:#f8f6f1;border-left:4px solid #c9a84c;border-radius:3px;">
              <tr>
                <td style="padding:24px 28px;">
                  <p style="margin:0 0 16px;font-size:11px;letter-spacing:2px;
                             text-transform:uppercase;color:#888888;font-family:Arial,sans-serif;">
                    Position
                  </p>
                  <table cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="padding:6px 0;font-size:12px;color:#777777;
                                 font-family:Arial,sans-serif;width:140px;">Role</td>
                      <td style="padding:6px 0;font-size:14px;color:#2c2c2c;font-family:Arial,sans-serif;">
                        ${data.roleAppliedFor}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:12px;color:#777777;
                                 font-family:Arial,sans-serif;width:140px;">Company</td>
                      <td style="padding:6px 0;font-size:14px;color:#2c2c2c;font-family:Arial,sans-serif;">
                        ${data.businessName}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Sign off -->
        <tr>
          <td style="padding:32px 48px 40px;">
            <p style="margin:0;font-size:15px;color:#2c2c2c;line-height:1.9;">
              We look forward to speaking with you,<br/>
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
