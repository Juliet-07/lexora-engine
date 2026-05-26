export interface EngagementLetterSignedNotificationData {
  to: string;
  tenantFirstName: string;
  clientName: string;
  clientEmail: string;
  signedAt: Date;
  businessName: string;
}

export function engagementLetterSignedNotificationTemplate(
  data: EngagementLetterSignedNotificationData,
): { subject: string; html: string } {
  const signedStr = data.signedAt.toLocaleString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const subject = `✅ Engagement letter signed — ${data.clientName}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#4B0082,#6A0DAD);padding:36px 40px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:28px;line-height:56px;">✅</div>
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Engagement Letter Signed</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;color:#1a1a2e;font-size:16px;">Dear ${data.tenantFirstName},</p>
              <p style="margin:0 0 20px;color:#4a4a6a;font-size:15px;line-height:1.7;">
                <strong>${data.clientName}</strong> has reviewed and signed their engagement letter.
                Their login credentials have been automatically sent and they can now begin their onboarding.
              </p>

              <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:20px;margin-bottom:24px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="color:#166534;font-size:13px;padding-bottom:8px;">
                      <strong>Client name:</strong> ${data.clientName}
                    </td>
                  </tr>
                  <tr>
                    <td style="color:#166534;font-size:13px;padding-bottom:8px;">
                      <strong>Email:</strong> ${data.clientEmail}
                    </td>
                  </tr>
                  <tr>
                    <td style="color:#166534;font-size:13px;">
                      <strong>Signed at:</strong> ${signedStr}
                    </td>
                  </tr>
                </table>
              </div>

              <p style="margin:0;color:#4a4a6a;font-size:14px;line-height:1.6;">
                You can track their onboarding progress from your Lexora dashboard under
                <strong>Clients → Onboarding &amp; CDD</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8f9fc;padding:24px 40px;border-top:1px solid #e8e8f0;text-align:center;">
              <p style="margin:0;color:#aaa;font-size:11px;">Lexora · ${data.businessName}</p>
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
