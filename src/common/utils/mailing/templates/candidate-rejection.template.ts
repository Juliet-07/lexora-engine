export interface CandidateRejectionEmailData {
  to: string;
  candidateName: string;
  roleAppliedFor: string;
}

export function candidateRejectionTemplate(data: CandidateRejectionEmailData): {
  subject: string;
  html: string;
} {
  const subject = `Update on your application — ${data.roleAppliedFor}`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:680px;margin:0 auto;">
      <p style="font-size:15px;color:#0f172a;">Hi ${escapeHtml(data.candidateName)},</p>
      <p style="font-size:14px;color:#334155;line-height:1.6;">
        Thank you for your interest in the <strong>${escapeHtml(data.roleAppliedFor)}</strong> position
        and for the time you invested in our process.
      </p>
      <p style="font-size:14px;color:#334155;line-height:1.6;">
        After careful consideration, we've decided to move forward with other candidates at this time.
        We genuinely appreciate your interest and wish you the very best in your search.
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
