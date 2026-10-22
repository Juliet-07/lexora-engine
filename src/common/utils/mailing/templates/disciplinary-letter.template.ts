// One branded layout for every formal letter in the disciplinary
// procedure (precautionary suspension, notice of allegations, outcome
// notification, appeal hearing, appeal outcome). The caller supplies the
// words; this only lays them out — and escapes them, since most of the
// content is free text typed by HR.
export interface DisciplinaryLetterData {
  to: string;
  recipientName: string;
  caseNumber: string;
  subject: string;
  heading: string;
  // Plain paragraphs, in order.
  paragraphs: string[];
  // Optional label/value rows (charges, clause, dates…).
  details?: { label: string; value: string }[];
  // Optional bulleted list (conditions, rights…) with its own title.
  listTitle?: string;
  listItems?: string[];
  dashboardUrl: string;
}

const esc = (v: string): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function disciplinaryLetterTemplate(data: DisciplinaryLetterData): {
  subject: string;
  html: string;
} {
  const firmName = process.env.FIRM_NAME || 'Lexora';
  const year = new Date().getFullYear();

  const paragraphs = data.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">${esc(p).replace(/\n/g, '<br/>')}</p>`,
    )
    .join('');

  const details = data.details?.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #ece7df;border-radius:4px;">${data.details
        .map(
          (d) =>
            `<tr><td style="padding:10px 14px;width:34%;font-size:12px;color:#777;font-family:Arial,sans-serif;vertical-align:top;border-bottom:1px solid #f1ede6;">${esc(d.label)}</td><td style="padding:10px 14px;font-size:14px;color:#2c2c2c;line-height:1.6;border-bottom:1px solid #f1ede6;">${esc(d.value).replace(/\n/g, '<br/>')}</td></tr>`,
        )
        .join('')}</table>`
    : '';

  const list = data.listItems?.length
    ? `<div style="margin:0 0 20px;padding:14px 18px;background:#f7f5f2;border-left:3px solid #c9a84c;">${
        data.listTitle
          ? `<p style="margin:0 0 8px;font-size:13px;font-weight:bold;color:#2c2c2c;font-family:Arial,sans-serif;">${esc(data.listTitle)}</p>`
          : ''
      }<ul style="margin:0;padding-left:18px;font-size:14px;color:#2c2c2c;line-height:1.8;">${data.listItems
        .map((i) => `<li>${esc(i)}</li>`)
        .join('')}</ul></div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>${esc(data.heading)}</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#4B0082;padding:32px 48px 28px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">${esc(firmName)}</p>
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;font-family:'Georgia',serif;">${esc(data.heading)}</h1>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px 0;">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#999;font-family:Arial,sans-serif;">Private and confidential &middot; Case ${esc(data.caseNumber)}</p>
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">Dear <strong>${esc(data.recipientName)}</strong>,</p>
          ${paragraphs}
          ${details}
          ${list}
          <p style="margin:0 0 32px;">
            <a href="${esc(data.dashboardUrl)}" style="display:inline-block;background:#4B0082;color:#fff;text-decoration:none;padding:12px 28px;border-radius:4px;font-size:14px;font-family:Arial,sans-serif;">View case on your dashboard</a>
          </p>
        </td></tr>
        <tr><td style="padding:0 48px 32px;border-top:1px solid #eee;">
          <p style="margin:24px 0 0;font-size:11px;color:#999;font-family:Arial,sans-serif;">
            Yours faithfully, Human Resources &middot; &copy; ${year} ${esc(firmName)}. This is a formal notice sent by the system.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: data.subject, html };
}
