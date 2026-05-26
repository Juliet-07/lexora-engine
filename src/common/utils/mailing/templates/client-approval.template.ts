export interface ClientApprovalData {
  to: string;
  firstName: string;
  tenantBusinessName: string;
  loginUrl: string;
}

export function clientApprovalTemplate(data: ClientApprovalData): {
  subject: string;
  html: string;
} {
  const subject = `🎉 Your account has been approved — ${data.tenantBusinessName}`;

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
              <div style="font-size:48px;margin-bottom:12px;">🎉</div>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Account Approved</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${data.tenantBusinessName}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;color:#1a1a2e;font-size:16px;font-weight:600;">
                Congratulations, ${data.firstName}!
              </p>
              <p style="margin:0 0 20px;color:#4a4a6a;font-size:15px;line-height:1.7;">
                Your KYC/AML verification has been completed and your account with
                <strong>${data.tenantBusinessName}</strong> has been fully approved.
                You now have full access to your client portal.
              </p>

              <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;margin-bottom:28px;">
                <p style="margin:0;color:#166534;font-size:14px;line-height:1.6;">
                  ✅ <strong>Identity verified</strong><br/>
                  ✅ <strong>KYC/AML checks completed</strong><br/>
                  ✅ <strong>Account fully activated</strong>
                </p>
              </div>

              <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#4B0082,#6A0DAD);border-radius:8px;padding:14px 36px;text-align:center;">
                    <a href="${data.loginUrl}"
                       style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;">
                      Go to Your Portal →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#4a4a6a;font-size:14px;line-height:1.6;text-align:center;">
                If you have any questions, please contact ${data.tenantBusinessName} directly.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8f9fc;padding:24px 40px;border-top:1px solid #e8e8f0;text-align:center;">
              <p style="margin:0;color:#aaa;font-size:11px;">
                Sent on behalf of ${data.tenantBusinessName} via Lexora.
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
