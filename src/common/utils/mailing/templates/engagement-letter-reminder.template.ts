export interface EngagementLetterReminderData {
  to: string;
  firstName: string;
  tenantBusinessName: string;
  letterTitle: string;
  signingUrl: string;
  expiresAt: Date;
  daysRemaining: number;
}

export function engagementLetterReminderTemplate(
  data: EngagementLetterReminderData,
): { subject: string; html: string } {
  const expiryStr = data.expiresAt.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const isUrgent = data.daysRemaining <= 1;
  const urgencyColor = isUrgent ? '#dc2626' : '#d97706';
  const urgencyBg = isUrgent ? '#fef2f2' : '#fffbeb';
  const urgencyBorder = isUrgent ? '#fca5a5' : '#fde68a';
  const urgencyLabel = isUrgent ? '🔴 Final Reminder' : '⏰ Reminder';
  const dayWord = data.daysRemaining === 1 ? 'day' : 'days';

  const subject = `${urgencyLabel}: Please sign your engagement letter — ${data.daysRemaining} ${dayWord} remaining`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;overflow:hidden;
                      box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Urgency banner -->
          <tr>
            <td style="background:${urgencyColor};padding:10px 40px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.5px;">
                ${urgencyLabel.toUpperCase()} — ${data.daysRemaining} ${dayWord.toUpperCase()} LEFT TO SIGN
              </p>
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4B0082,#6A0DAD);
                        padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">
                ${data.tenantBusinessName}
              </h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">
                Powered by Lexora
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;color:#1a1a2e;font-size:16px;">
                Dear <strong>${data.firstName}</strong>,
              </p>
              <p style="margin:0 0 20px;color:#4a4a6a;font-size:15px;line-height:1.7;">
                This is a reminder that you have not yet signed your engagement
                letter with <strong>${data.tenantBusinessName}</strong>.
                Your signing link expires in
                <strong style="color:${urgencyColor};">
                  ${data.daysRemaining} ${dayWord}
                </strong>
                on <strong>${expiryStr}</strong>.
              </p>

              <div style="background:#f5f3ff;border:1px solid #c4b5fd;
                          border-radius:10px;padding:18px;margin-bottom:24px;">
                <p style="margin:0 0 6px;color:#6d28d9;font-size:12px;
                            font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">
                  Document awaiting your signature
                </p>
                <p style="margin:0;color:#1a1a2e;font-size:14px;font-weight:600;">
                  ${data.letterTitle}
                </p>
              </div>

              <!-- Urgency warning -->
              <div style="background:${urgencyBg};border:1px solid ${urgencyBorder};
                          border-radius:8px;padding:14px;margin-bottom:28px;">
                <p style="margin:0;color:${urgencyColor};font-size:13px;line-height:1.6;">
                  ${
                    isUrgent
                      ? '🔴 <strong>This is your final reminder.</strong> If you do not sign before the link expires, you will need to contact your advisor to request a new signing link.'
                      : '⏰ Please sign soon. Once this link expires you will need to request a new one from your advisor.'
                  }
                </p>
              </div>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#4B0082,#6A0DAD);
                              border-radius:8px;padding:14px 36px;text-align:center;">
                    <a href="${data.signingUrl}"
                       style="color:#ffffff;text-decoration:none;
                              font-size:16px;font-weight:600;">
                      Review &amp; Sign Now →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px;color:#888;font-size:12px;text-align:center;">
                Or copy this link into your browser:
              </p>
              <p style="margin:0;word-break:break-all;color:#4B0082;
                          font-size:11px;text-align:center;">
                ${data.signingUrl}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f9fc;padding:20px 40px;
                        border-top:1px solid #e8e8f0;text-align:center;">
              <p style="margin:0;color:#aaa;font-size:11px;">
                Sent on behalf of ${data.tenantBusinessName} via Lexora.
                If you have questions, contact your advisor directly.
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
