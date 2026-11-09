export interface StrToFicEmailData {
  to: string;
  strId: string;
  tenantBusinessName: string;
  customerName: string;
  amount: number;
  currency: string;
  xml: string;
  // Optional cover note written by the tenant in the submit popup.
  message?: string;
  // Replies from the FIC go to the person who filed it, not to Lexora.
  replyTo?: string;
}

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function strToFicTemplate(data: StrToFicEmailData): {
  subject: string;
  html: string;
} {
  const subject =
    `Suspicious Transaction Report ${data.strId} — ${data.tenantBusinessName}`.replace(
      /[\r\n]+/g,
      ' ',
    );
  const business = esc(data.tenantBusinessName);
  const note = data.message
    ? `<p style="font-size:14px; line-height:1.6; white-space:pre-line; background:#F5F3FF; border-left:3px solid #4B0082; padding:10px 14px; margin:0 0 16px;">${esc(data.message)}</p>`
    : '';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1A1A2E;">
      <div style="background:#4B0082; padding:20px 24px; border-radius:8px 8px 0 0;">
        <p style="color:#FFFFFF; font-size:18px; font-weight:bold; margin:0;">
          Suspicious Transaction Report
        </p>
        <p style="color:rgba(255,255,255,0.75); font-size:12px; margin:4px 0 0;">
          Filed by ${business} via Lexora
        </p>
      </div>
      <div style="border:1px solid #E5E5EA; border-top:none; padding:24px; border-radius:0 0 8px 8px;">
        ${note}
        <p style="font-size:14px; line-height:1.6;">
          Please find attached Suspicious Transaction Report
          <strong>${esc(data.strId)}</strong>, submitted in goAML XML format
          in accordance with AML/CFT reporting requirements.
        </p>
        <table style="width:100%; border-collapse:collapse; margin:16px 0; font-size:13px;">
          <tr>
            <td style="padding:6px 0; color:#6B7280;">Report ID</td>
            <td style="padding:6px 0; text-align:right; font-weight:600;">${esc(data.strId)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280;">Customer</td>
            <td style="padding:6px 0; text-align:right; font-weight:600;">${esc(data.customerName)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280;">Amount</td>
            <td style="padding:6px 0; text-align:right; font-weight:600;">${esc(data.currency)} ${Number(data.amount).toLocaleString()}</td>
          </tr>
        </table>
        <p style="font-size:13px; color:#6B7280;">
          The attached XML file follows the goAML 4.0 schema. Please reply to
          this email if anything further is needed.
        </p>
      </div>
      <p style="font-size:11px; color:#9CA3AF; text-align:center; margin-top:16px;">
        This is an automated compliance submission from Lexora on behalf of
        ${business}.
      </p>
    </div>
  `;
  return { subject, html };
}
