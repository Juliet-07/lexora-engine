export interface EmployeeRecordAddedData {
  to: string;
  recipientName: string;
  recordType: string;
  description: string;
  dashboardUrl: string;
}

const TYPE_LABELS: Record<string, string> = {
  note: 'Note',
  first_warning: 'First Warning',
  second_warning: 'Second Warning',
  final_warning: 'Final Warning',
};

export function employeeRecordAddedTemplate(data: EmployeeRecordAddedData): {
  subject: string;
  html: string;
} {
  const firmName = process.env.FIRM_NAME || 'Lexora';
  const year = new Date().getFullYear();
  const label = TYPE_LABELS[data.recordType] ?? 'Record';
  const subject = `A ${label} Has Been Added to Your Record`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>${label} Added</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#4B0082;padding:32px 48px 28px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">${firmName}</p>
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;font-family:'Georgia',serif;">${label} Added</h1>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px 0;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            Dear <strong>${data.recipientName}</strong>,
          </p>
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            HR has added the following ${label.toLowerCase()} to your employee record:
          </p>
          <blockquote style="margin:0 0 20px;padding:16px 20px;background:#f7f5f2;border-left:3px solid #c9a84c;font-size:14px;color:#2c2c2c;line-height:1.7;">
            ${data.description}
          </blockquote>
          <p style="margin:0 0 32px;">
            <a href="${data.dashboardUrl}" style="display:inline-block;background:#4B0082;color:#fff;text-decoration:none;padding:12px 28px;border-radius:4px;font-size:14px;font-family:Arial,sans-serif;">
              View Dashboard
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
