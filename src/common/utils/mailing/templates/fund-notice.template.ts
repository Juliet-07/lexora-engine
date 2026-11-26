export interface FundNoticeEmailData {
  to: string;
  cc?: string;
  recipientName: string;
  fundName: string;
  subject: string;
  // The body, plain text — blank lines make paragraphs.
  message: string;
  // Shown under the message as a highlighted line, e.g. the amount due.
  highlight?: string;
  // A line saying what is attached, when something is.
  attachmentNote?: string;
  appUrl?: string;
  linkLabel?: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function fundNoticeTemplate(data: FundNoticeEmailData): {
  subject: string;
  html: string;
} {
  const firmName = process.env.FIRM_NAME || 'Lexora';
  const year = new Date().getFullYear();
  const paragraphs = (data.message || '')
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.7;">${esc(p).replace(/\n/g, '<br/>')}</p>`,
    )
    .join('');
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>${esc(data.subject)}</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#252B5E;padding:28px 40px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#c9a84c;">${esc(data.fundName)}</p>
          <h1 style="margin:0;font-size:19px;font-weight:normal;color:#fff;">${esc(data.subject)}</h1>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:28px 40px 8px;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;">Dear <strong>${esc(data.recipientName)}</strong>,</p>
          ${paragraphs}
          ${data.highlight ? `<p style="margin:0 0 16px;padding:12px 16px;background:#f3f4f8;border-left:3px solid #6366F1;font-size:15px;color:#252B5E;font-weight:bold;">${esc(data.highlight)}</p>` : ''}
          ${data.attachmentNote ? `<p style="margin:0 0 16px;font-size:13px;color:#666;">${esc(data.attachmentNote)}</p>` : ''}
          ${data.appUrl ? `<p style="margin:0 0 16px;"><a href="${data.appUrl}" style="display:inline-block;padding:10px 18px;background:#252B5E;color:#fff;text-decoration:none;border-radius:4px;font-size:14px;">${esc(data.linkLabel ?? 'Open in your portal')}</a></p>` : ''}
        </td></tr>
        <tr><td style="padding:8px 40px 28px;border-top:1px solid #eee;">
          <p style="margin:20px 0 0;font-size:11px;color:#999;">&copy; ${year} ${esc(firmName)}. This message is confidential and intended only for the addressee.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject: data.subject, html };
}
