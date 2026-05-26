export interface SubscriptionRenewedData {
  to: string;
  firstName: string;
  businessName: string;
  plan: string;
  newPeriodEnd: Date;
  loginUrl: string;
}

export function subscriptionRenewedTemplate(data: SubscriptionRenewedData): {
  subject: string;
  html: string;
} {
  const periodEndStr = data.newPeriodEnd.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const subject = `🎉 Subscription renewed — your Lexora account is active again`;

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
            <td style="background:linear-gradient(135deg,#4B0082,#6A0DAD);padding:40px;text-align:center;">
              <div style="font-size:48px;margin-bottom:12px;">✅</div>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Account Reactivated</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${data.businessName}</p>
            </td>
          </tr>

          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;color:#1a1a2e;font-size:16px;font-weight:600;">
                Welcome back, ${data.firstName}!
              </p>
              <p style="margin:0 0 20px;color:#4a4a6a;font-size:15px;line-height:1.7;">
                Your Lexora subscription has been successfully renewed and your workspace
                is now fully active.
              </p>

              <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:20px;margin-bottom:28px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="color:#166534;font-size:13px;padding-bottom:8px;">
                      <strong>Plan:</strong> ${data.plan}
                    </td>
                  </tr>
                  <tr>
                    <td style="color:#166534;font-size:13px;">
                      <strong>Next renewal date:</strong> ${periodEndStr}
                    </td>
                  </tr>
                </table>
              </div>

              <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#4B0082,#6A0DAD);border-radius:8px;padding:14px 36px;text-align:center;">
                    <a href="${data.loginUrl}"
                       style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;">
                      Log In to Your Dashboard →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#4a4a6a;font-size:14px;line-height:1.6;text-align:center;">
                Thank you for continuing with Lexora. If you have any questions,
                please contact us at support@lexora.app.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#f8f9fc;padding:24px 40px;border-top:1px solid #e8e8f0;text-align:center;">
              <p style="margin:0;color:#aaa;font-size:11px;">Lexora Platform · ${data.businessName}</p>
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
