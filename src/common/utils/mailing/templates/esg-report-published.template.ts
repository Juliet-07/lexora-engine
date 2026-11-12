export interface EsgReportPublishedEmailData {
  to: string;
  memberName: string;
  reportTitle: string;
  frameworkLabel: string;
  period: string;
  publishedAt: Date;
  disclosureCount: number;
  signedOffCount: number;
  // Optional cover note the tenant typed when publishing.
  message: string;
  // Deep link to the Board Pack page in the board portal.
  boardPackLink: string;
  businessName: string;
  // Whether the report PDF is attached to this email.
  hasAttachment: boolean;
}

const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function esgReportPublishedTemplate(data: EsgReportPublishedEmailData): {
  subject: string;
  html: string;
} {
  const year = new Date().getFullYear();
  const subject = `Board Pack: ${data.reportTitle}`;
  const published = data.publishedAt.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>${esc(data.reportTitle)}</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#4B0082;padding:32px 48px 28px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">${esc(data.businessName)}</p>
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;font-family:'Georgia',serif;">${esc(data.reportTitle)}</h1>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px 32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">Dear <strong>${esc(data.memberName)}</strong>,</p>
          <p style="margin:0 0 16px;font-size:14px;color:#2c2c2c;line-height:1.7;">
            ${esc(data.businessName)} has published its <strong>${esc(data.frameworkLabel)}</strong> ESG report for <strong>${esc(data.period)}</strong>
            and added it to your Board Pack.
          </p>
          ${data.message ? `<p style="margin:0 0 20px;padding:12px 16px;border-left:3px solid #c9a84c;background:#faf8f3;font-size:14px;color:#2c2c2c;line-height:1.7;">${esc(data.message)}</p>` : ''}
          <table cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:13px;color:#2c2c2c;font-family:Arial,sans-serif;">
            <tr><td style="padding:3px 18px 3px 0;color:#777;">Published</td><td>${published}</td></tr>
            <tr><td style="padding:3px 18px 3px 0;color:#777;">Disclosures</td><td>${data.disclosureCount}</td></tr>
            <tr><td style="padding:3px 18px 3px 0;color:#777;">Signed off</td><td>${data.signedOffCount} of ${data.disclosureCount}</td></tr>
          </table>
          <div style="margin-top:24px;text-align:center;">
            <a href="${esc(data.boardPackLink)}" style="display:inline-block;background:#4B0082;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;">Open in Board Pack</a>
          </div>
          ${data.hasAttachment ? '<p style="margin:20px 0 0;font-size:12px;color:#777;text-align:center;">A PDF copy of the report is attached to this email.</p>' : ''}
        </td></tr>
        <tr><td style="padding:0 48px 32px;border-top:1px solid #eee;">
          <p style="margin:24px 0 0;font-size:11px;color:#999;font-family:Arial,sans-serif;">&copy; ${year} ${esc(data.businessName)}. This is an automated notice.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, html };
}
