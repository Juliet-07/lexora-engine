export interface SubscriptionWarningData {
  to: string;
  firstName: string;
  businessName: string;
  plan: string;
  daysRemaining: number;
  expiresAt: Date;
  renewalUrl: string;
}

export function subscriptionWarningTemplate(data: SubscriptionWarningData): {
  subject: string;
  html: string;
} {
  const urgency =
    data.daysRemaining === 1
      ? { label: 'URGENT', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' }
      : data.daysRemaining <= 3
        ? {
            label: 'IMPORTANT',
            color: '#ea580c',
            bg: '#fff7ed',
            border: '#fed7aa',
          }
        : {
            label: 'NOTICE',
            color: '#d97706',
            bg: '#fffbeb',
            border: '#fde68a',
          };

  const expiryStr = data.expiresAt.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const dayWord = data.daysRemaining === 1 ? 'day' : 'days';

  const subject = `[${urgency.label}] Your Lexora subscription expires in ${data.daysRemaining} ${dayWord}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Urgency banner -->
          <tr>
            <td style="background:${urgency.color};padding:12px 40px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:1px;">
                ⚠️ ${urgency.label}: SUBSCRIPTION EXPIRING IN ${data.daysRemaining} ${dayWord.toUpperCase()}
              </p>
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4B0082,#6A0DAD);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Lexora</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${data.businessName}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;color:#1a1a2e;font-size:16px;">Dear ${data.firstName},</p>
              <p style="margin:0 0 20px;color:#4a4a6a;font-size:15px;line-height:1.7;">
                Your <strong>${data.plan}</strong> subscription will expire in
                <strong style="color:${urgency.color};">${data.daysRemaining} ${dayWord}</strong>
                on <strong>${expiryStr}</strong>.
              </p>

              <div style="background:${urgency.bg};border:1px solid ${urgency.border};border-radius:8px;padding:16px;margin-bottom:24px;">
                <p style="margin:0;color:${urgency.color};font-size:14px;line-height:1.6;">
                  When your subscription expires, your account and all client accounts under your workspace
                  will be automatically <strong>suspended</strong> until renewal is completed.
                </p>
              </div>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>
                  <td style="background:${urgency.color};border-radius:8px;padding:14px 36px;text-align:center;">
                    <a href="${data.renewalUrl}"
                       style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;">
                      Renew Subscription Now →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#888;font-size:12px;text-align:center;word-break:break-all;">
                ${data.renewalUrl}
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#f8f9fc;padding:24px 40px;border-top:1px solid #e8e8f0;text-align:center;">
              <p style="margin:0;color:#aaa;font-size:11px;">
                Lexora Platform · If you have already renewed, please disregard this notice.
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
