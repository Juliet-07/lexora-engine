export type HrNoticeEmailKind =
  | 'issued'
  | 'reminder'
  | 'overdue'
  | 'escalation'
  | 'reply';

export interface HrNoticeEmailData {
  to: string;
  kind: HrNoticeEmailKind;
  recipientName: string;
  businessName: string;
  senderName: string;
  noticeRef: string;
  title: string;
  summary: string;
  category: string;
  priority: 'normal' | 'important' | 'critical';
  requireAck: boolean;
  deadline: string | null; // pre-formatted, e.g. "5 Nov 2026"
  link: string;
  footer: string;
  // 'escalation' only — the employee the manager is being told about.
  subjectEmployee?: string;
  // 'reply' only — HR's answer to the employee's question.
  replyText?: string;
}

const esc = (s: string) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] as string,
  );

export function hrNoticeTemplate(data: HrNoticeEmailData): {
  subject: string;
  html: string;
} {
  const year = new Date().getFullYear();
  const prefix =
    data.priority === 'critical'
      ? '[Critical] '
      : data.priority === 'important'
        ? '[Important] '
        : '';

  let subject = `${prefix}${data.title}`;
  let heading = 'New notice from HR';
  let lead = `A new notice has been published for you at ${esc(data.businessName)}.`;
  let cta = data.requireAck ? 'Read and acknowledge' : 'Read the notice';

  if (data.kind === 'reminder') {
    subject = `Reminder: ${data.title}`;
    heading = 'Acknowledgement reminder';
    lead = `You have not yet acknowledged this notice.${data.deadline ? ` Please do so by <strong>${esc(data.deadline)}</strong>.` : ''}`;
    cta = 'Read and acknowledge';
  } else if (data.kind === 'overdue') {
    subject = `Overdue: ${data.title}`;
    heading = 'Acknowledgement overdue';
    lead = `Your acknowledgement of this notice was due${data.deadline ? ` on <strong>${esc(data.deadline)}</strong>` : ''} and is now overdue. Please acknowledge it today.`;
    cta = 'Acknowledge now';
  } else if (data.kind === 'escalation') {
    subject = `Overdue acknowledgement: ${data.subjectEmployee ?? 'a member of your team'}`;
    heading = 'A team member has an overdue notice';
    lead = `<strong>${esc(data.subjectEmployee ?? 'A member of your team')}</strong> has not acknowledged the notice below${data.deadline ? ` that was due on <strong>${esc(data.deadline)}</strong>` : ''}. Please remind them to read and acknowledge it in their employee portal.`;
    cta = 'View the notice';
  } else if (data.kind === 'reply') {
    subject = `Reply to your question: ${data.title}`;
    heading = 'HR replied to your question';
    lead = `${esc(data.senderName || 'HR')} replied to your question about this notice.`;
    cta = 'Open the notice';
  }

  const badge =
    data.priority === 'critical'
      ? '<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:10px;background:#fde8e8;color:#b91c1c;font-size:11px;font-family:Arial,sans-serif;">Critical</span>'
      : data.priority === 'important'
        ? '<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:10px;background:#fef3c7;color:#92400e;font-size:11px;font-family:Arial,sans-serif;">Important</span>'
        : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>${esc(data.title)}</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#4B0082;padding:32px 48px 28px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">${esc(data.businessName)}</p>
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;font-family:'Georgia',serif;">${esc(heading)}</h1>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px 8px;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">Hi <strong>${esc(data.recipientName)}</strong>,</p>
          <p style="margin:0 0 20px;font-size:15px;color:#2c2c2c;line-height:1.8;">${lead}</p>
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#888;font-family:Arial,sans-serif;">${esc(data.noticeRef)} · ${esc(data.category)}</p>
          <p style="margin:0 0 10px;font-size:18px;color:#2c2c2c;font-weight:bold;">${esc(data.title)}${badge}</p>
          ${data.summary ? `<p style="margin:0 0 16px;font-size:14px;color:#555;line-height:1.7;">${esc(data.summary)}</p>` : ''}
          ${data.kind === 'reply' && data.replyText ? `<div style="margin:0 0 16px;padding:12px 16px;background:#f7f3ea;border-left:3px solid #c9a84c;font-size:14px;color:#2c2c2c;line-height:1.7;">${esc(data.replyText)}</div>` : ''}
          ${data.requireAck && data.kind === 'issued' ? `<p style="margin:0 0 16px;font-size:13px;color:#b45309;font-weight:bold;">Acknowledgement required${data.deadline ? ` by ${esc(data.deadline)}` : ''}.</p>` : ''}
        </td></tr>
        <tr><td style="padding:8px 48px 32px;">
          <a href="${esc(data.link)}" style="display:inline-block;padding:12px 26px;background:#4B0082;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;border-radius:4px;">${esc(cta)}</a>
          <p style="margin:14px 0 0;font-size:12px;color:#888;font-family:Arial,sans-serif;">Sign in to your employee portal to read the full notice.</p>
        </td></tr>
        <tr><td style="padding:0 48px 32px;border-top:1px solid #eee;">
          <p style="margin:24px 0 0;font-size:11px;color:#999;font-family:Arial,sans-serif;">
            ${esc(data.footer)}<br/>&copy; ${year} ${esc(data.businessName)}. ${esc(data.senderName)}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
