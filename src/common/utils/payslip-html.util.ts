import {
  PayslipDocument,
  PayslipTemplateDocument,
} from '../../modules/hr/schemas';

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

const fmtMoney = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
};

export function buildPayslipHtml(
  slip: PayslipDocument,
  template: PayslipTemplateDocument,
): string {
  const accent = template.accentColor || '#6366f1';
  const companyName = template.companyName || 'Company';
  const currency = slip.payCurrency;

  const allowanceRows = slip.allowances
    .map(
      (a) =>
        `<tr><td class="label">${escapeHtml(a.label)}</td><td class="amt">${fmtMoney(a.amount, currency)}</td></tr>`,
    )
    .join('');

  const employeeDeductionRows = slip.deductions
    .filter((d) => d.visibleToEmployee)
    .map(
      (d) =>
        `<tr><td class="label">${escapeHtml(d.label)}</td><td class="amt neg">-${fmtMoney(d.employeeAmount, currency)}</td></tr>`,
    )
    .join('');

  const employerContributionRows = template.showEmployerContributions
    ? slip.deductions
        .filter((d) => d.employerAmount > 0)
        .map(
          (d) =>
            `<tr><td class="label">${escapeHtml(d.label)}</td><td class="amt">${fmtMoney(d.employerAmount, currency)}</td></tr>`,
        )
        .join('')
    : '';

  const loanRows =
    template.showLoanDeductions && slip.loanDeductions.length > 0
      ? slip.loanDeductions
          .map(
            (l) =>
              `<tr><td class="label">${escapeHtml(l.label)}</td><td class="amt neg">-${fmtMoney(l.amountDeducted, currency)}</td></tr>`,
          )
          .join('')
      : '';

  const fxNote =
    slip.sourceCurrency && slip.exchangeRateApplied
      ? `<p class="fx-note">Converted from ${escapeHtml(slip.sourceCurrency)} at a rate of ${slip.exchangeRateApplied.toFixed(4)} (as of ${fmtDate(slip.exchangeRateDate!)})</p>`
      : '';

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<title>Payslip — ${escapeHtml(slip.employeeName)} — ${escapeHtml(slip.periodLabel)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:0;padding:32px;background:#f8fafc}
  .doc{max-width:720px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.06)}
  .brandbar{background:${accent};padding:24px 32px;color:#fff;display:flex;justify-content:space-between;align-items:flex-start}
  .brandbar h1{margin:0;font-size:18px;font-weight:700}
  .brandbar p{margin:4px 0 0;font-size:12px;opacity:.85}
  .period{text-align:right;font-size:12px;opacity:.9}
  .content{padding:28px 32px}
  .employee-row{display:flex;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding-bottom:16px;margin-bottom:20px}
  .employee-row h2{margin:0;font-size:16px}
  .employee-row p{margin:2px 0 0;font-size:12px;color:#64748b}
  .net-box{background:#f1f5f9;border-radius:8px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
  .net-box .label{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
  .net-box .value{font-size:24px;font-weight:700;color:${accent}}
  h3{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:20px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{padding:5px 0}
  td.label{color:#334155}
  td.amt{text-align:right;font-family:monospace}
  td.amt.neg{color:#dc2626}
  .totals-row td{border-top:1px solid #e2e8f0;padding-top:8px;font-weight:600}
  .fx-note{font-size:11px;color:#94a3b8;font-style:italic;margin:6px 0 0}
  .footer{margin-top:28px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center}
  @media print{body{background:#fff;padding:0}.doc{box-shadow:none;border-radius:0}}
</style>
</head><body>
<div class="doc">
  <div class="brandbar">
    <div>
      <h1>${escapeHtml(companyName)}</h1>
      ${template.companyAddress ? `<p>${escapeHtml(template.companyAddress)}</p>` : ''}
    </div>
    <div class="period">
      PAYSLIP<br/>${escapeHtml(slip.periodLabel)}
    </div>
  </div>

  <div class="content">
    <div class="employee-row">
      <div>
        <h2>${escapeHtml(slip.employeeName)}</h2>
        <p>${slip.jobTitle ? escapeHtml(slip.jobTitle) : ''}${slip.employeeNumber ? ' · ' + escapeHtml(slip.employeeNumber) : ''}</p>
      </div>
      <div style="text-align:right">
        <p>${fmtDate(slip.periodStart)} – ${fmtDate(slip.periodEnd)}</p>
      </div>
    </div>

    <div class="net-box">
      <span class="label">Net Pay</span>
      <span class="value">${fmtMoney(slip.netSalary, currency)}</span>
    </div>
    ${fxNote}

    <h3>Earnings</h3>
    <table>
      <tr><td class="label">Basic Salary</td><td class="amt">${fmtMoney(slip.basicSalary, currency)}</td></tr>
      ${allowanceRows}
      <tr class="totals-row"><td class="label">Gross Salary</td><td class="amt">${fmtMoney(slip.grossSalary, currency)}</td></tr>
    </table>

    <h3>Employee Deductions</h3>
    <table>
      ${employeeDeductionRows || '<tr><td class="label">No statutory deductions configured</td><td class="amt">—</td></tr>'}
      ${loanRows}
      <tr class="totals-row"><td class="label">Total Deductions</td><td class="amt neg">-${fmtMoney(slip.totalEmployeeDeductions, currency)}</td></tr>
    </table>

    ${
      employerContributionRows
        ? `<h3>Employer Contributions (informational — not deducted from your pay)</h3>
    <table>
      ${employerContributionRows}
      <tr class="totals-row"><td class="label">Total Employer Contributions</td><td class="amt">${fmtMoney(slip.totalEmployerContributions, currency)}</td></tr>
    </table>`
        : ''
    }

    <div class="footer">
      ${template.footerNote ? escapeHtml(template.footerNote) : 'Generated by Lexora'}
    </div>
  </div>
</div>
</body></html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
