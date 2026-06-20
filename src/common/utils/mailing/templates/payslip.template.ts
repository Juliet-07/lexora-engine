export interface PayslipEmailData {
  to: string;
  employeeName: string;
  periodLabel: string;
  payslipHtml: string;
}

export function payslipTemplate(data: PayslipEmailData): {
  subject: string;
  html: string;
} {
  const subject = `Your payslip — ${data.periodLabel}`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:680px;margin:0 auto;">
      <p style="font-size:15px;color:#0f172a;">Hi ${escapeHtml(data.employeeName)},</p>
      <p style="font-size:14px;color:#334155;line-height:1.6;">
        Your payslip for <strong>${escapeHtml(data.periodLabel)}</strong> is attached below.
        If you have any questions about it, please reach out to your HR administrator.
      </p>
      <div style="margin:24px 0;">
        ${data.payslipHtml}
      </div>
      <p style="font-size:12px;color:#94a3b8;margin-top:24px;">
        This is an automated message — please do not reply directly to this email.
      </p>
    </div>
  `;

  return { subject, html };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
