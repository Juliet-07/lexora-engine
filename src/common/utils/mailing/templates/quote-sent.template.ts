export interface QuoteSentEmailData {
  to: string;
  clientName: string;
  ref: string;
  kind: 'Quote' | 'Proforma';
  title: string;
  amount: number;
  currency: string;
  issued: Date;
  expires: Date;
}

export function quoteSentTemplate(data: QuoteSentEmailData): {
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
  const amount = `${data.currency} ${Number(data.amount).toLocaleString(
    'en-US',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )}`;
  const subject = `${data.kind} ${data.ref} — ${firmName}`;

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
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;font-family:'Georgia',serif;">${data.kind} ${data.ref}</h1>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px 8px;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            Dear <strong>${data.clientName}</strong>,
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            Please find your ${data.kind.toLowerCase()} below for your review.
          </p>
        </td></tr>
        <tr><td style="padding:0 48px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:4px;">
            <tr>
              <td style="padding:16px 20px;font-size:13px;color:#777;font-family:Arial,sans-serif;">${data.title}</td>
              <td style="padding:16px 20px;font-size:18px;font-weight:bold;color:#4B0082;text-align:right;font-family:Arial,sans-serif;">${amount}</td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
            <tr>
              <td style="font-size:12px;color:#999;font-family:Arial,sans-serif;">Issued</td>
              <td style="font-size:12px;color:#999;text-align:right;font-family:Arial,sans-serif;">Valid until</td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#2c2c2c;font-family:Arial,sans-serif;">${fmtDate(data.issued)}</td>
              <td style="font-size:14px;color:#2c2c2c;text-align:right;font-family:Arial,sans-serif;">${fmtDate(data.expires)}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 48px 32px;border-top:1px solid #eee;">
          <p style="margin:24px 0 0;font-size:13px;color:#555;line-height:1.7;">
            If you have any questions or would like to proceed, please reply to this email or contact your
            engagement team directly.
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
