export interface SubscriptionExpiredData {
  to: string;
  firstName: string;
  businessName: string;
  plan: string;
  renewalUrl: string;
}

export function subscriptionExpiredTemplate(data: SubscriptionExpiredData): {
  subject: string;
  html: string;
} {
  const subject = `Your Lexora account has been suspended — action required`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <tr>
            <td style="background:#dc2626;padding:12px 40px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:1px;">
                🔴 ACCOUNT SUSPENDED — SUBSCRIPTION EXPIRED
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:linear-gradient(135deg,#4B0082,#6A0DAD);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Lexora</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${data.businessName}</p>
            </td>
          </tr>

          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;color:#1a1a2e;font-size:16px;">Dear ${data.firstName},</p>
              <p style="margin:0 0 20px;color:#4a4a6a;font-size:15px;line-height:1.7;">
                Your <strong>${data.plan}</strong> Lexora subscription has expired and your workspace
                has been <strong>suspended</strong>.
              </p>

              <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:18px;margin-bottom:24px;">
                <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.7;">
                  <strong>What this means:</strong><br/>
                  • Your account and all team member accounts are currently inactive<br/>
                  • All client accounts under your workspace are suspended<br/>
                  • Your data is safely retained and will be fully restored on renewal
                </p>
              </div>

              <p style="margin:0 0 24px;color:#4a4a6a;font-size:15px;line-height:1.7;">
                To restore access, please renew your subscription using the link below.
                Our team processes renewals within <strong>24 hours</strong> of payment confirmation.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>
                  <td style="background:#dc2626;border-radius:8px;padding:14px 36px;text-align:center;">
                    <a href="${data.renewalUrl}"
                       style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;">
                      Renew Subscription →
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
                Need help? Contact us at support@lexora.app · Lexora Platform
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
