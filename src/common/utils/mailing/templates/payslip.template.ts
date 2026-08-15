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
  const subject = `Your Payslip - August 2026`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:680px;margin:0 auto;">
      <p style="font-size:15px;color:#0f172a;">Hi ${escapeHtml(data.employeeName)}, 😀</p>
      <p style="font-size:14px;color:#334155;line-height:1.6;">
        Great news: payday has officially arrived, and your bank account can stop giving you passive-aggressive reminders that a month somehow has 30 days.
      </p>
      <p style="font-size:14px;color:#334155;line-height:1.6;">
       Your payslip this month is attached. Take a moment to admire the numbers, do a little dance, and maybe treat yourself to something nice.
      </p>
      <p style="font-size:14px;color:#334155;line-height:1.6;">
        More seriously though, thank you for everything you brought to the table this month. Your effort does not go unnoticed, and this is just one small way we get to say it. Here is to another month of great work and good vibes ✨
      </p>
       <p style="font-size:14px;color:#334155;line-height:1.6;">
        Spend wisely, save a little, and enjoy the rest of your day!
      </p>
      <div style="margin:24px 0;">
        
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
