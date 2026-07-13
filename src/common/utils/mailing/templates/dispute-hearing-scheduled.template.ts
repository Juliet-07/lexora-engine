export interface DisputeHearingScheduledData {
  to: string;
  recipientName: string;
  caseNumber: string;
  caseType: string;
  scheduledAt: Date;
  mode: string;
  venue: string | null;
  meetingPlatform: string | null;
  meetingLink: string | null;
  notes: string | null;
  dashboardUrl: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  google_meet: 'Google Meet',
  microsoft_teams: 'Microsoft Teams',
  zoom: 'Zoom',
};

export function disputeHearingScheduledTemplate(
  data: DisputeHearingScheduledData,
): { subject: string; html: string } {
  const firmName = process.env.FIRM_NAME || 'Lexora';
  const year = new Date().getFullYear();
  const typeLabel =
    data.caseType.charAt(0).toUpperCase() + data.caseType.slice(1);
  const when = new Date(data.scheduledAt).toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const subject = `Hearing Scheduled — Case ${data.caseNumber}`;

  const locationBlock =
    data.mode === 'online'
      ? `
        <p style="margin:0 0 8px;font-size:15px;color:#2c2c2c;">
          <strong>Format:</strong> Online — ${PLATFORM_LABELS[data.meetingPlatform ?? ''] ?? data.meetingPlatform}
        </p>
        <p style="margin:0 0 20px;">
          <a href="${data.meetingLink}" style="display:inline-block;background:#4B0082;color:#fff;text-decoration:none;padding:12px 28px;border-radius:4px;font-size:14px;font-family:Arial,sans-serif;">
            Join Meeting
          </a>
        </p>`
      : `
        <p style="margin:0 0 20px;font-size:15px;color:#2c2c2c;">
          <strong>Format:</strong> In person<br/>
          <strong>Venue:</strong> ${data.venue}
        </p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Hearing Scheduled</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#4B0082;padding:32px 48px 28px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">${firmName}</p>
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;font-family:'Georgia',serif;">Hearing Scheduled</h1>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px 0;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            Dear <strong>${data.recipientName}</strong>,
          </p>
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            A hearing has been scheduled for the ${data.caseType} (Case <strong>${data.caseNumber}</strong>):
          </p>
          <p style="margin:0 0 12px;font-size:15px;color:#2c2c2c;">
            <strong>When:</strong> ${when}
          </p>
          ${locationBlock}
          ${
            data.notes
              ? `<blockquote style="margin:0 0 20px;padding:16px 20px;background:#f7f5f2;border-left:3px solid #c9a84c;font-size:14px;color:#2c2c2c;line-height:1.7;">${data.notes}</blockquote>`
              : ''
          }
          <p style="margin:0 0 32px;">
            <a href="${data.dashboardUrl}" style="display:inline-block;background:#fff;color:#4B0082;text-decoration:none;padding:10px 24px;border:1px solid #4B0082;border-radius:4px;font-size:13px;font-family:Arial,sans-serif;">
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
