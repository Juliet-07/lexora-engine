export interface DisputeSuspensionEmailData {
  to: string;
  recipientName: string;
  caseNumber: string;
  dashboardUrl: string;
}

export function disputeSuspensionEmailTemplate(
  data: DisputeSuspensionEmailData,
): { subject: string; html: string } {
  const firmName = process.env.FIRM_NAME || 'Lexora';
  const year = new Date().getFullYear();
  const subject = `Suspension Notice — Case ${data.caseNumber}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Suspension Notice</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#4B0082;padding:32px 48px 28px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">${firmName}</p>
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;font-family:'Georgia',serif;">Suspension Notice</h1>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px 0;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            Dear <strong>${data.recipientName}</strong>,
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            Following the review of Case <strong>${data.caseNumber}</strong>, you have been suspended. Your formal suspension letter is attached to this email.
          </p>
          <p style="margin:0 0 32px;">
            <a href="${data.dashboardUrl}" style="display:inline-block;background:#4B0082;color:#fff;text-decoration:none;padding:12px 28px;border-radius:4px;font-size:14px;font-family:Arial,sans-serif;">
              View Case Details
            </a>
          </p>
        </td></tr>
        <tr><td style="padding:0 48px 32px;border-top:1px solid #eee;">
          <p style="margin:24px 0 0;font-size:11px;color:#999;font-family:Arial,sans-serif;">
            &copy; ${year} ${firmName}. This is an automated notice.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
