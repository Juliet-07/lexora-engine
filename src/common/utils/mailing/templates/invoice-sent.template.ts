export interface InvoiceSentEmailData {
  to: string;
  clientName: string;
  ref: string;
  mandateName: string;
  lines: { description: string; qty: number; unit: number }[];
  currency: string;
  net: number;
  vat: number;
  vatRate: number;
  wht: number;
  whtRate: number;
  payable: number;
  dueOn: Date;
  issuedOn: Date;
}

export function invoiceSentTemplate(data: InvoiceSentEmailData): {
  subject: string;
  html: string;
} {
  const firmName = process.env.FIRM_NAME || 'Lexora';
  const year = new Date().getFullYear();
  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  const fmt = (n: number) =>
    `${data.currency} ${Number(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const subject = `Invoice ${data.ref} — ${firmName}`;

  const lineRows = data.lines
    .map(
      (l) => `
        <tr>
          <td style="padding:10px 0;font-size:13px;color:#2c2c2c;border-bottom:1px solid #f0f0f0;font-family:Arial,sans-serif;">${l.description}</td>
          <td style="padding:10px 0;font-size:13px;color:#555;text-align:right;border-bottom:1px solid #f0f0f0;font-family:Arial,sans-serif;">${fmt(l.qty * l.unit)}</td>
        </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#4B0082;padding:32px 48px 28px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">${firmName}</p>
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;font-family:'Georgia',serif;">Invoice ${data.ref}</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#d9c9ec;font-family:Arial,sans-serif;">${data.mandateName}</p>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px 8px;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            Dear <strong>${data.clientName}</strong>,
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            Please find your invoice below. Payment is due by <strong>${fmtDate(data.dueOn)}</strong>.
          </p>
        </td></tr>
        <tr><td style="padding:0 48px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${lineRows}
          </table>
        </td></tr>
        <tr><td style="padding:16px 48px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:4px 0;font-size:13px;color:#777;font-family:Arial,sans-serif;">Net</td>
                <td style="padding:4px 0;font-size:13px;color:#2c2c2c;text-align:right;font-family:Arial,sans-serif;">${fmt(data.net)}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#777;font-family:Arial,sans-serif;">VAT (${data.vatRate}%)</td>
                <td style="padding:4px 0;font-size:13px;color:#2c2c2c;text-align:right;font-family:Arial,sans-serif;">${fmt(data.vat)}</td></tr>
            ${
              data.wht > 0
                ? `<tr><td style="padding:4px 0;font-size:13px;color:#777;font-family:Arial,sans-serif;">WHT (${data.whtRate}%)</td>
                <td style="padding:4px 0;font-size:13px;color:#2c2c2c;text-align:right;font-family:Arial,sans-serif;">-${fmt(data.wht)}</td></tr>`
                : ''
            }
            <tr><td style="padding:12px 0 0;border-top:1px solid #eee;font-size:15px;font-weight:bold;color:#4B0082;font-family:Arial,sans-serif;">Amount due</td>
                <td style="padding:12px 0 0;border-top:1px solid #eee;font-size:18px;font-weight:bold;color:#4B0082;text-align:right;font-family:Arial,sans-serif;">${fmt(data.payable)}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 48px 32px;border-top:1px solid #eee;">
          <p style="margin:24px 0 0;font-size:13px;color:#555;line-height:1.7;">
            Invoice issued ${fmtDate(data.issuedOn)}. Please contact your engagement team with any questions about
            this invoice or to arrange payment.
          </p>
          <p style="margin:16px 0 0;font-size:11px;color:#999;font-family:Arial,sans-serif;">
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
