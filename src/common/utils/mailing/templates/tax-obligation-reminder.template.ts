export interface TaxObligationReminderEmailData {
  to: string;
  recipientName: string;
  firmName: string;
  type: string;
  period: string;
  dueOn: Date;
  amount: number;
  currency?: string;
}

export function taxObligationReminderTemplate(
  data: TaxObligationReminderEmailData,
): { subject: string; html: string } {
  const year = new Date().getFullYear();
  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  const amountFormatted = `${data.currency ?? 'RWF'} ${Number(
    data.amount,
  ).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const subject = `Reminder: ${data.type} due ${fmtDate(data.dueOn)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#4B0082;padding:32px 48px 28px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">${data.firmName}</p>
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;font-family:'Georgia',serif;">Tax obligation reminder</h1>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px 8px;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            Dear <strong>${data.recipientName}</strong>,
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            A new obligation has been added to the tax calendar. Details below.
          </p>
        </td></tr>
        <tr><td style="padding:0 48px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:4px;">
            <tr>
              <td style="padding:16px 20px;font-size:13px;color:#777;font-family:Arial,sans-serif;">${data.type} — ${data.period}</td>
              <td style="padding:16px 20px;font-size:18px;font-weight:bold;color:#4B0082;text-align:right;font-family:Arial,sans-serif;">${amountFormatted}</td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
            <tr>
              <td style="font-size:12px;color:#999;font-family:Arial,sans-serif;">Due date</td>
            </tr>
            <tr>
              <td style="font-size:15px;color:#2c2c2c;font-family:Arial,sans-serif;font-weight:bold;">${fmtDate(data.dueOn)}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 48px 32px;border-top:1px solid #eee;">
          <p style="margin:24px 0 0;font-size:13px;color:#555;line-height:1.7;">
            File and remit by the due date to stay compliant. This obligation is tracked in the Tax calendar.
          </p>
          <p style="margin:16px 0 0;font-size:11px;color:#999;font-family:Arial,sans-serif;">
            &copy; ${year} ${data.firmName}. This is an automated notice.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
