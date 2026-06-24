export interface ContractSignedConfirmationEmailData {
  to: string;
  signerName: string;
}

export function contractSignedConfirmationTemplate(
  data: ContractSignedConfirmationEmailData,
): { subject: string; html: string } {
  const subject = 'Signature confirmed';
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:680px;margin:0 auto;">
      <p style="font-size:15px;color:#0f172a;">Hi ${escapeHtml(data.signerName)},</p>
      <p style="font-size:14px;color:#334155;line-height:1.6;">
        This confirms your signature has been recorded successfully. A copy of the signed
        document will be made available to you shortly.
      </p>
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
