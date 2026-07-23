export interface MeetingAckReminderEmailData {
  to: string;
  attendeeName: string;
  meetingTitle: string;
  ackLink: string;
  businessName: string;
}

export function meetingAckReminderTemplate(data: MeetingAckReminderEmailData): {
  subject: string;
  html: string;
} {
  const year = new Date().getFullYear();
  const subject = `Reminder: Acknowledge board pack — ${data.meetingTitle}`;
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Acknowledgement Reminder</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#4B0082;padding:32px 48px 28px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">${data.businessName}</p>
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;font-family:'Georgia',serif;">Acknowledgement Reminder</h1>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px 32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">Dear <strong>${data.attendeeName}</strong>,</p>
          <p style="margin:0 0 20px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            We haven't yet received your acknowledgement of the board pack for <strong>${data.meetingTitle}</strong>. This link will expire 7 days after it was first sent.
          </p>
          <div style="text-align:center;">
            <a href="${data.ackLink}" style="display:inline-block;background:#4B0082;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;">Acknowledge Receipt</a>
          </div>
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
