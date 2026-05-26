export interface ClientCredentialsAfterSigningData {
  to: string;
  firstName: string;
  tenantBusinessName: string;
  tempPassword: string;
  loginUrl: string;
}

export function clientCredentialsAfterSigningTemplate(
  data: ClientCredentialsAfterSigningData,
): { subject: string; html: string } {
  const subject = `You're all set — your login credentials for ${data.tenantBusinessName}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4B0082,#6A0DAD);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${data.tenantBusinessName}</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Powered by Lexora</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;color:#1a1a2e;font-size:16px;font-weight:600;">
                Welcome, ${data.firstName}!
              </p>
              <p style="margin:0 0 20px;color:#4a4a6a;font-size:15px;line-height:1.7;">
                Thank you for signing your engagement letter. You can now log in to begin
                your onboarding with <strong>${data.tenantBusinessName}</strong>.
              </p>

              <!-- Credentials box -->
              <div style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:10px;padding:24px;margin-bottom:28px;">
                <p style="margin:0 0 4px;color:#5b21b6;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Your login details</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
                  <tr>
                    <td style="color:#6d28d9;font-size:13px;padding-bottom:10px;width:120px;"><strong>Email</strong></td>
                    <td style="color:#1a1a2e;font-size:13px;padding-bottom:10px;">${data.to}</td>
                  </tr>
                  <tr>
                    <td style="color:#6d28d9;font-size:13px;"><strong>Password</strong></td>
                    <td style="font-family:monospace;font-size:16px;font-weight:700;color:#1a1a2e;letter-spacing:1.5px;">${data.tempPassword}</td>
                  </tr>
                </table>
              </div>

              <div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:14px;margin-bottom:28px;">
                <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;">
                  🔒 For your security, you will be asked to set a new password when you first log in.
                  Please do not share these credentials with anyone.
                </p>
              </div>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#4B0082,#6A0DAD);border-radius:8px;padding:14px 36px;text-align:center;">
                    <a href="${data.loginUrl}"
                       style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;">
                      Log In &amp; Start Onboarding →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#888;font-size:12px;text-align:center;">
                Login URL: <a href="${data.loginUrl}" style="color:#4B0082;">${data.loginUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f9fc;padding:24px 40px;border-top:1px solid #e8e8f0;text-align:center;">
              <p style="margin:0;color:#aaa;font-size:11px;">
                This email was sent on behalf of ${data.tenantBusinessName} via Lexora.
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
