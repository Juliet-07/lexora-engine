export interface PayslipEmailData {
  to: string;
  employeeName: string;
  periodLabel: string;
  payslipHtml: string;
  // Tenant-composed message (PO, Oct 2026 — see SendPayslipEmailDto).
  // Both optional: omitting either keeps the original fixed default for
  // that part, so a tenant who only customizes the subject (or only the
  // body) still gets a sensible result, and every other caller of
  // sendPayslip (none currently, but future ones) keeps working as-is.
  customSubject?: string;
  customBody?: string;
}

const EMPLOYEE_NAME_TOKEN = /\{\{\s*employeeName\s*\}\}/gi;

// Substitutes the {{employeeName}} token in a tenant-typed string with
// the real recipient's name — this is what lets one composed message
// in an "Email All Payslips" batch personalize every employee's copy.
function applyPlaceholders(text: string, employeeName: string): string {
  return text.replace(EMPLOYEE_NAME_TOKEN, employeeName);
}

// Tenant-typed body is plain text (a simple textarea, not a rich-text
// editor) — escape it for HTML safety, then turn blank lines into
// paragraph breaks and single line breaks into <br> so it reads the
// way it was typed.
function plainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(
      (para) =>
        `<p style="font-size:14px;color:#334155;line-height:1.6;">${escapeHtml(
          para,
        ).replace(/\n/g, '<br>')}</p>`,
    )
    .join('\n');
}

export function payslipTemplate(data: PayslipEmailData): {
  subject: string;
  html: string;
} {
  const subject = data.customSubject
    ? applyPlaceholders(data.customSubject, data.employeeName)
    : `Your Payslip - ${data.periodLabel}`;

  const bodyHtml = data.customBody
    ? plainTextToHtml(applyPlaceholders(data.customBody, data.employeeName))
    : `
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
    `;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:680px;margin:0 auto;">
      ${bodyHtml}
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
