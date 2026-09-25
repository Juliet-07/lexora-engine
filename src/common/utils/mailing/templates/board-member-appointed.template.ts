export interface BoardMemberAppointedEmailData {
  to: string;
  memberName: string;
  role: string;
  businessName: string;
  appointedAt: Date;
  termEnds: Date;
  // Present once board-member appointments create a matching Lexora
  // User account (see board-member.service.ts#create). Optional so
  // this template still renders for any caller that doesn't have
  // portal credentials to send — until the dedicated board portal
  // exists, loginUrl falls back to the tenant app.
  tempPassword?: string;
  loginUrl?: string;
}

export function boardMemberAppointedTemplate(
  data: BoardMemberAppointedEmailData,
): { subject: string; html: string } {
  const year = new Date().getFullYear();
  const subject = `Board Appointment — ${data.businessName}`;

  const credentialsBlock =
    data.tempPassword && data.loginUrl
      ? `
        <tr>
          <td style="padding:0 48px;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background-color:#f8f6f1;border-left:4px solid #c9a84c;border-radius:3px;">
              <tr>
                <td style="padding:24px 28px;">
                  <p style="margin:0 0 16px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#888;font-family:Arial,sans-serif;">
                    Your Lexora Account
                  </p>
                  <table cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="padding:6px 0;font-size:12px;color:#777;font-family:Arial,sans-serif;width:140px;">Email</td>
                      <td style="padding:6px 0;font-size:14px;color:#2c2c2c;font-family:Arial,sans-serif;">${data.to}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:12px;color:#777;font-family:Arial,sans-serif;width:140px;">Temp Password</td>
                      <td style="padding:6px 0;font-size:14px;color:#4B0082;font-family:'Courier New',monospace;font-weight:bold;letter-spacing:1px;">${data.tempPassword}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 48px 0;">
            <p style="margin:0;font-size:12px;color:#c97a2c;font-family:Arial,sans-serif;">
              <strong>Note:</strong> the dedicated board member portal is being finalized — you'll be notified separately once it's ready to sign in to. Keep these credentials secure in the meantime.
            </p>
          </td>
        </tr>`
      : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Board Appointment</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#4B0082;padding:32px 48px 28px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">${data.businessName}</p>
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;font-family:'Georgia',serif;">Board Appointment</h1>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px 32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            Dear <strong>${data.memberName}</strong>,
          </p>
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            You have been appointed as <strong>${data.role}</strong> to the Board of ${data.businessName}.
          </p>
          <p style="margin:0;font-size:14px;color:#555;line-height:1.7;">
            Appointment effective ${data.appointedAt.toLocaleDateString()}, with a term running through ${data.termEnds.toLocaleDateString()}.
          </p>
        </td></tr>
        ${credentialsBlock}
        <tr><td style="padding:24px 48px 32px;border-top:1px solid #eee;">
          <p style="margin:24px 0 0;font-size:11px;color:#999;font-family:Arial,sans-serif;">
            &copy; ${year} ${data.businessName}. This is an automated notice.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
