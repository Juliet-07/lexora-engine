export interface MeetingPostponedEmailData {
  to: string;
  attendeeName: string;
  meetingTitle: string;
  originalDate: Date;
  reason: string;
  businessName: string;
}

export function meetingPostponedTemplate(data: MeetingPostponedEmailData): {
  subject: string;
  html: string;
} {
  const year = new Date().getFullYear();
  const subject = `Postponed: ${data.meetingTitle}`;
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Meeting Postponed</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#b45309;padding:32px 48px 28px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#fde68a;font-family:Arial,sans-serif;">${data.businessName}</p>
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;font-family:'Georgia',serif;">Meeting Postponed</h1>
        </td></tr>
        <tr><td style="background:#f59e0b;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px 32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">Dear <strong>${data.attendeeName}</strong>,</p>
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            The following meeting, originally scheduled for <strong>${data.originalDate.toLocaleString()}</strong>, has been postponed:
          </p>
          <p style="margin:0 0 16px;font-size:17px;color:#2c2c2c;font-weight:bold;">${data.meetingTitle}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#2c2c2c;font-weight:bold;">Reason</p>
          <p style="margin:0;font-size:14px;color:#555;line-height:1.7;">${data.reason}</p>
        </td></tr>
        <tr><td style="padding:0 48px 32px;border-top:1px solid #eee;">
          <p style="margin:24px 0 0;font-size:11px;color:#999;font-family:Arial,sans-serif;">&copy; ${year} ${data.businessName}. This is an automated notice.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, html };
}
