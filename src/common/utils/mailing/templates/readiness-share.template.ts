export interface ReadinessShareEmailData {
  to: string;
  recipientName: string;
  businessName: string;
  // 'room' = secure data room link, 'report' = the readiness report.
  kind: 'room' | 'report';
  link?: string;
  message?: string;
  expiresOn?: string;
  accessLevel?: 'view' | 'download';
  ndaRequired?: boolean;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function readinessShareTemplate(data: ReadinessShareEmailData): {
  subject: string;
  html: string;
} {
  const year = new Date().getFullYear();
  const isRoom = data.kind === 'room';
  const subject = isRoom
    ? `${data.businessName} — secure data room access`
    : `${data.businessName} — Investor Readiness Report`;
  const intro = isRoom
    ? `${esc(data.businessName)} has given you access to its investor data room.`
    : `${esc(data.businessName)} has shared its Investor Readiness Report with you. The report is attached as a PDF.`;
  const message = data.message
    ? `<p style="margin:0 0 20px;font-size:15px;color:#2c2c2c;line-height:1.8;white-space:pre-line;">${esc(data.message)}</p>`
    : '';
  const details =
    isRoom && data.link
      ? `<p style="margin:0 0 20px;font-size:13px;color:#555;line-height:1.7;">
           Access: <strong>${data.accessLevel === 'download' ? 'view and download' : 'view only'}</strong>${
             data.expiresOn
               ? ` &middot; link expires <strong>${esc(data.expiresOn)}</strong>`
               : ''
           }${data.ndaRequired ? ' &middot; a confidentiality agreement must be accepted before you can open the documents' : ''}.
         </p>
         <div style="text-align:center;">
           <a href="${data.link}" style="display:inline-block;background:#4B0082;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;">Open data room</a>
         </div>`
      : '';
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#4B0082;padding:32px 48px 28px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">${esc(data.businessName)}</p>
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;">${isRoom ? 'Secure data room access' : 'Investor Readiness Report'}</h1>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">Dear <strong>${esc(data.recipientName)}</strong>,</p>
          <p style="margin:0 0 20px;font-size:15px;color:#2c2c2c;line-height:1.8;">${intro}</p>
          ${message}
          ${details}
        </td></tr>
        <tr><td style="padding:0 48px 32px;border-top:1px solid #eee;">
          <p style="margin:24px 0 0;font-size:11px;color:#999;font-family:Arial,sans-serif;">&copy; ${year} ${esc(data.businessName)}. This message and its contents are confidential.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, html };
}
