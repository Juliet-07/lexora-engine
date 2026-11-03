export interface BcpStakeholderNoticeEmailData {
  to: string;
  businessName: string;
  subject: string;
  // Plain text written (and approved) by the tenant. Paragraph breaks
  // are kept; nothing else is assumed about its structure.
  body: string;
  incidentRef: string;
  // Who the recipient can contact; empty when none was set.
  spokesperson: string;
}

const esc = (s: string) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] as string,
  );

export function bcpStakeholderNoticeTemplate(
  data: BcpStakeholderNoticeEmailData,
): {
  subject: string;
  html: string;
} {
  const year = new Date().getFullYear();
  const bodyHtml = data.body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;color:#2c2c2c;line-height:1.7;">${esc(p).replace(/\n/g, '<br/>')}</p>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${esc(data.subject)}</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;max-width:100%;">
        <tr>
          <td style="background:#0d1330;padding:26px 36px;">
            <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#c9a84c;">${esc(data.businessName)}</p>
          </td>
        </tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding:32px 36px 8px;">${bodyHtml}</td>
        </tr>
        <tr>
          <td style="padding:8px 36px 28px;">
            <p style="margin:0;border-top:1px solid #eee;padding-top:14px;font-size:12px;color:#8a8a8a;line-height:1.6;">
              Reference ${esc(data.incidentRef)}.${data.spokesperson ? ` Please direct questions to ${esc(data.spokesperson)}.` : ''}<br/>
              Sent by ${esc(data.businessName)}. &copy; ${year}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: data.subject, html };
}
