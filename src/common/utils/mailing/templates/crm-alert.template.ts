// CRM Tools alert email — a distinct, higher-urgency house style from
// crm-newsletter-campaign.template.ts: a red/amber priority banner up
// top (not the plain purple newsletter header) naming the category and
// priority, then the alert's own summary/action-required/date fields
// laid out the same way the tenant captures them, before the same
// cream footer convention every other CRM Tools email in this house
// style uses.

export type CrmAlertRecipientRole = 'client' | 'contact' | 'board member';

const PRIORITY_COLOR: Record<string, string> = {
  Critical: '#c0392b',
  High: '#d4891e',
  Medium: '#8a6d16',
  Low: '#34495e',
};

export interface CrmAlertEmailData {
  businessName: string;
  // Omitted for a test send — there's no real recipient to greet.
  recipientName?: string;
  recipientRole?: CrmAlertRecipientRole;
  title: string;
  category: string;
  priority: string;
  summary: string;
  actionRequired?: string | null;
  source?: string | null;
  effectiveDate?: string | null;
  deadline?: string | null;
  isTest?: boolean;
}

const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

export function crmAlertTemplate(data: CrmAlertEmailData): {
  subject: string;
  html: string;
} {
  const year = new Date().getFullYear();
  const subject = data.isTest ? `[TEST] ${data.title}` : data.title;
  const color = PRIORITY_COLOR[data.priority] ?? '#4B0082';

  const greeting = data.recipientName
    ? `Dear <strong>${data.recipientName}</strong>,`
    : 'Hello,';

  const effective = fmtDate(data.effectiveDate);
  const deadline = fmtDate(data.deadline);

  const metaRows = [
    data.source ? `Source: <strong>${data.source}</strong>` : '',
    effective ? `Effective: <strong>${effective}</strong>` : '',
    deadline ? `Deadline: <strong>${deadline}</strong>` : '',
  ].filter(Boolean);

  const actionBlock = data.actionRequired
    ? `
        <table width="100%" cellpadding="0" cellspacing="0"
          style="background-color:#fdf1d8;border-left:4px solid ${color};border-radius:2px;margin:0 0 24px;">
          <tr>
            <td style="padding:18px 22px;">
              <p style="margin:0 0 6px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${color};font-family:Arial,sans-serif;font-weight:bold;">
                Action required
              </p>
              <p style="margin:0;font-size:14px;color:#333333;line-height:1.6;font-family:Arial,sans-serif;">
                ${data.actionRequired}
              </p>
            </td>
          </tr>
        </table>`
    : '';

  const footerContext = data.isTest
    ? 'This is a test send — recipients will see a personalised version of this message.'
    : `You are receiving this alert because you are a ${data.recipientRole ?? 'client'} of <strong>${data.businessName}</strong>.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${data.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0"
          style="background-color:#ffffff;border:1px solid #d6cfc4;border-radius:4px;overflow:hidden;">

          <!-- Priority banner -->
          <tr>
            <td style="background-color:${color};padding:28px 40px;">
              <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.78);font-family:Arial,sans-serif;font-weight:bold;">
                ${data.category} alert &middot; ${data.priority} priority
              </p>
              <h1 style="margin:8px 0 0;font-size:21px;font-weight:normal;color:#ffffff;font-family:'Georgia',serif;letter-spacing:0.3px;">
                ${data.title}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 30px;">
              <p style="margin:0 0 18px;font-size:15px;color:#333333;line-height:1.7;">
                ${greeting}
              </p>
              <div style="font-size:15px;color:#333333;line-height:1.7;margin-bottom:20px;">
                ${data.summary}
              </div>
              ${
                metaRows.length
                  ? `<p style="margin:0 0 20px;font-size:13px;color:#555555;font-family:Arial,sans-serif;">
                      ${metaRows.join(' &nbsp;&middot;&nbsp; ')}
                    </p>`
                  : ''
              }
              ${actionBlock}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f6f1;border-top:1px solid #e8e2d9;padding:24px 40px;">
              <p style="margin:0 0 10px;font-size:12px;color:#777777;line-height:1.6;font-family:Arial,sans-serif;text-align:center;">
                ${footerContext}
              </p>
              <p style="margin:0;font-size:11px;color:#999999;line-height:1.7;font-family:Arial,sans-serif;text-align:center;">
                This is a confidential system-generated notification.<br/>
                Please do not reply directly to this email.<br/>
                &copy; ${year} ${data.businessName}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
