export interface EngagementLetterInviteData {
  to: string;
  firstName: string;
  tenantBusinessName: string;
  letterTitle: string;
  signingUrl: string;
  expiresAt: Date;
}

export function engagementLetterInviteTemplate(
  data: EngagementLetterInviteData,
): {
  subject: string;
  html: string;
} {
  const expiryStr = data.expiresAt.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const subject = `Action Required: Please sign your engagement letter — ${data.tenantBusinessName}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Engagement Letter</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4B0082,#6A0DAD);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">
                ${data.tenantBusinessName}
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">
                Powered by Lexora
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;color:#1a1a2e;font-size:16px;font-weight:600;">
                Dear ${data.firstName},
              </p>
              <p style="margin:0 0 16px;color:#4a4a6a;font-size:15px;line-height:1.7;">
                <strong>${data.tenantBusinessName}</strong> has invited you to review and sign
                your engagement letter before we begin working together.
              </p>
              <p style="margin:0 0 8px;color:#4a4a6a;font-size:14px;">
                <strong>Document:</strong> ${data.letterTitle}
              </p>
              <p style="margin:0 0 28px;color:#4a4a6a;font-size:14px;">
                <strong>Link expires:</strong> ${expiryStr}
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#4B0082,#6A0DAD);border-radius:8px;padding:14px 36px;text-align:center;">
                    <a href="${data.signingUrl}"
                       style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;letter-spacing:0.3px;">
                      Review &amp; Sign Engagement Letter →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#888;font-size:12px;text-align:center;">
                Or copy this link into your browser:
              </p>
              <p style="margin:0 0 28px;word-break:break-all;color:#4B0082;font-size:12px;text-align:center;">
                ${data.signingUrl}
              </p>

              <div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin-bottom:24px;">
                <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;">
                  <strong>⏳ Important:</strong> This signing link expires on <strong>${expiryStr}</strong>.
                  After signing, you will receive your login credentials to begin onboarding.
                  If you have questions, reply to this email or contact ${data.tenantBusinessName} directly.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f9fc;padding:24px 40px;border-top:1px solid #e8e8f0;text-align:center;">
              <p style="margin:0;color:#aaa;font-size:11px;">
                This email was sent on behalf of ${data.tenantBusinessName} via Lexora.
                If you did not expect this, please disregard.
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
