export interface MeetingNoticeEmailData {
  to: string;
  attendeeName: string;
  meetingTitle: string;
  date: Date;
  location: string;
  chair: string;
  noticeBody: string;
  rsvpDeadline: Date | null;
  // null for a real board member — they RSVP in-app on the board
  // portal instead of via an emailed token link.
  rsvpLink: string | null;
  boardPortalLink: string | null;
  businessName: string;
}

export function meetingNoticeTemplate(data: MeetingNoticeEmailData): {
  subject: string;
  html: string;
} {
  const year = new Date().getFullYear();
  const subject = `Notice of Meeting: ${data.meetingTitle}`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Notice of Meeting</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#4B0082;padding:32px 48px 28px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">${data.businessName}</p>
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;font-family:'Georgia',serif;">Notice of Meeting — ${data.meetingTitle}</h1>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px 32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">Dear <strong>${data.attendeeName}</strong>,</p>
          <p style="margin:0 0 16px;font-size:14px;color:#555;line-height:1.7;">
            ${data.date.toLocaleString()} · ${data.location} · Chair: ${data.chair}
          </p>
          <div style="margin:0 0 20px;font-size:14px;color:#2c2c2c;line-height:1.7;">${data.noticeBody}</div>
          ${
            data.rsvpDeadline
              ? `<p style="margin:0 0 20px;font-size:13px;color:#b45309;">Please RSVP by ${data.rsvpDeadline.toLocaleDateString()}.</p>`
              : ''
          }
          <div style="margin-top:24px;text-align:center;">
            ${
              data.rsvpLink
                ? `<a href="${data.rsvpLink}" style="display:inline-block;background:#4B0082;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;">RSVP to this meeting</a>`
                : ''
            }
            ${
              data.boardPortalLink
                ? `<a href="${data.boardPortalLink}" style="display:inline-block;background:#fff;color:#4B0082;text-decoration:none;padding:11px 28px;border-radius:6px;font-size:14px;border:1px solid #4B0082;margin-left:10px;">RSVP on Board Portal</a>`
                : ''
            }
          </div>
        </td></tr>
        <tr><td style="padding:0 48px 32px;border-top:1px solid #eee;">
          <p style="margin:24px 0 0;font-size:11px;color:#999;font-family:Arial,sans-serif;">&copy; ${year} ${data.businessName}. This is an automated notice. The board pack will follow separately once preparation is complete.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, html };
}
