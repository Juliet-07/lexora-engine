export interface EmployeeTerminatedData {
  to: string;
  firstName: string;
  businessName: string;
  endDate: Date;
  reason: string | null;
}

export function employeeTerminatedTemplate(data: EmployeeTerminatedData): {
  subject: string;
  html: string;
} {
  const year = new Date().getFullYear();
  const subject = `Notice of Termination of Employment`;
  const endDateStr = new Date(data.endDate).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Notice of Termination</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#4B0082;padding:32px 48px 28px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">${data.businessName}</p>
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;font-family:'Georgia',serif;">Notice of Termination</h1>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px 32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            Dear <strong>${data.firstName}</strong>,
          </p>
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            This letter is to formally notify you that your employment with ${data.businessName} has been terminated, effective <strong>${endDateStr}</strong>.
          </p>
          ${
            data.reason
              ? `<p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;"><strong>Reason:</strong> ${data.reason}</p>`
              : ''
          }
          <p style="margin:0;font-size:15px;color:#2c2c2c;line-height:1.8;">
            Please contact HR regarding final settlement and return of company property.
          </p>
        </td></tr>
        <tr><td style="padding:0 48px 32px;border-top:1px solid #eee;">
          <p style="margin:24px 0 0;font-size:11px;color:#999;font-family:Arial,sans-serif;">
            &copy; ${year} ${data.businessName}.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
