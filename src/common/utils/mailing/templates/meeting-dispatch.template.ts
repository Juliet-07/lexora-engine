export interface MeetingDispatchEmailData {
  to: string;
  attendeeName: string;
  meetingTitle: string;
  date: Date;
  location: string;
  chair: string;
  notes: string;
  agenda: { title: string; presenter: string; durationMinutes: number }[];
  boardPackNames: string[];
  ackLink: string;
  businessName: string;
}

export function meetingDispatchTemplate(data: MeetingDispatchEmailData): {
  subject: string;
  html: string;
} {
  const year = new Date().getFullYear();
  const subject = `Meeting Pack: ${data.meetingTitle}`;
  const agendaHtml = data.agenda
    .map(
      (a, i) =>
        `<li>${i + 1}. ${a.title}${a.presenter ? ` — ${a.presenter}` : ''} (${a.durationMinutes}m)</li>`,
    )
    .join('');
  const packHtml = data.boardPackNames.length
    ? `<ul style="margin:0;padding-left:18px;">${data.boardPackNames.map((n) => `<li>${n}</li>`).join('')}</ul>`
    : '<p style="margin:0;color:#777;">No documents attached.</p>';

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Meeting Pack</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#4B0082;padding:32px 48px 28px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">${data.businessName}</p>
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;font-family:'Georgia',serif;">${data.meetingTitle}</h1>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px 32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">Dear <strong>${data.attendeeName}</strong>,</p>
          <p style="margin:0 0 16px;font-size:14px;color:#555;line-height:1.7;">
            ${data.date.toLocaleString()} · ${data.location} · Chair: ${data.chair}
          </p>
          ${data.notes ? `<p style="margin:0 0 20px;font-size:14px;color:#2c2c2c;line-height:1.7;">${data.notes}</p>` : ''}
          <p style="margin:0 0 8px;font-size:14px;color:#2c2c2c;font-weight:bold;">Agenda</p>
          <ul style="margin:0 0 20px;padding-left:18px;font-size:13px;color:#2c2c2c;">${agendaHtml}</ul>
          <p style="margin:0 0 8px;font-size:14px;color:#2c2c2c;font-weight:bold;">Board Pack</p>
          ${packHtml}
          <div style="margin-top:24px;text-align:center;">
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
