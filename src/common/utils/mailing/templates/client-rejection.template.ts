export interface ClientRejectionEmailData {
  to: string;
  firstName: string;
  tenantBusinessName: string;
  reason: string;
  loginUrl: string;
}

export function clientRejectionTemplate(data: ClientRejectionEmailData): {
  subject: string;
  html: string;
} {
  const subject = `Important: Your application with ${data.tenantBusinessName}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    body { margin: 0; padding: 0; background: #f4f4f7; font-family: Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #1a1a2e; padding: 32px 40px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 0.5px; }
    .body { padding: 36px 40px; color: #333333; }
    .body p { font-size: 15px; line-height: 1.7; margin: 0 0 16px; }
    .reason-box { background: #fff5f5; border-left: 4px solid #e53e3e; border-radius: 4px; padding: 16px 20px; margin: 24px 0; }
    .reason-box p { margin: 0; color: #c53030; font-size: 14px; }
    .cta { text-align: center; margin: 28px 0; }
    .cta a { background: #1a1a2e; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600; }
    .footer { background: #f4f4f7; text-align: center; padding: 20px; font-size: 12px; color: #999999; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>${data.tenantBusinessName}</h1>
    </div>
    <div class="body">
      <p>Dear ${data.firstName},</p>
      <p>
        Thank you for submitting your application to <strong>${data.tenantBusinessName}</strong>.
        After a careful review of your documentation, we regret to inform you that we are
        unable to proceed with your onboarding at this time.
      </p>
      <div class="reason-box">
        <p><strong>Reason:</strong> ${data.reason}</p>
      </div>
      <p>
        Common reasons for rejection include incomplete documentation, inability to verify
        provided information, or failure to meet our verification requirements.
      </p>
      <p>
        If you believe this decision was made in error, or if you have since obtained the
        required documents, please contact your provider directly. In some cases your
        account may be reactivated so you can re-submit your application.
      </p>
      <div class="cta">
        <a href="${data.loginUrl}">Contact Support</a>
      </div>
      <p style="font-size:13px; color:#666;">
        If you have questions, please reach out to ${data.tenantBusinessName} directly.
      </p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} ${data.tenantBusinessName}. All rights reserved.
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}
