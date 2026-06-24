export interface ContractForSignatureEmailData {
  to: string;
  signerName: string;
  signingUrl: string;
}

export function contractForSignatureTemplate(
  data: ContractForSignatureEmailData,
): { subject: string; html: string } {
  const subject = 'A document is waiting for your signature';
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:680px;margin:0 auto;">
      <p style="font-size:15px;color:#0f172a;">Hi ${escapeHtml(data.signerName)},</p>
      <p style="font-size:14px;color:#334155;line-height:1.6;">
        A document has been sent to you for review and signature.
      </p>
      <p style="margin:24px 0;">
        <a href="${data.signingUrl}"
           style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;display:inline-block;">
          Review &amp; Sign
        </a>
      </p>
      <p style="font-size:13px;color:#64748b;line-height:1.6;">
        If you have any questions or would like to discuss any part of this document before signing,
        you can leave a comment directly on the signing page.
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
