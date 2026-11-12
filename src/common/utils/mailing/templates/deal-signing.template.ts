export interface DealSigningEmailData {
  to: string;
  recipientName: string;
  dealName: string;
  documentName: string;
  /** What this email is: first request, a reminder, or the signed copies. */
  kind: 'request' | 'reminder' | 'executed';
  signLink?: string;
  message?: string;
  businessName: string;
}

const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function dealSigningTemplate(data: DealSigningEmailData): {
  subject: string;
  html: string;
} {
  const year = new Date().getFullYear();
  const doc = esc(data.documentName);
  const deal = esc(data.dealName);
  const subject =
    data.kind === 'executed'
      ? `Executed copy: ${data.documentName}`
      : data.kind === 'reminder'
        ? `Reminder — please sign: ${data.documentName}`
        : `Please sign: ${data.documentName}`;
  const heading =
    data.kind === 'executed' ? 'Executed copy' : 'Signature requested';
  const lead =
    data.kind === 'executed'
      ? `Everyone has signed <strong>${doc}</strong> for <strong>${deal}</strong>. The executed copy is attached.`
      : `You are asked to sign <strong>${doc}</strong> for <strong>${deal}</strong>. Open the document, read it, and sign with a typed or drawn signature.`;
  const note = data.message
    ? `<p style="margin:0 0 20px;font-size:14px;color:#444;line-height:1.7;border-left:3px solid #c9a84c;padding-left:12px;">${esc(data.message)}</p>`
    : '';
  const button =
    data.kind !== 'executed' && data.signLink
      ? `<div style="text-align:center;"><a href="${esc(data.signLink)}" style="display:inline-block;background:#4B0082;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;">Review and sign</a></div>
         <p style="margin:18px 0 0;font-size:12px;color:#888;text-align:center;">This link is personal to you. Please do not forward it.</p>`
      : '';
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#4B0082;padding:32px 48px 28px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">${esc(data.businessName)}</p>
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;font-family:'Georgia',serif;">${esc(heading)} — ${deal}</h1>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px 32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">Dear <strong>${esc(data.recipientName)}</strong>,</p>
          <p style="margin:0 0 20px;font-size:15px;color:#2c2c2c;line-height:1.8;">${lead}</p>
          ${note}
          ${button}
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
