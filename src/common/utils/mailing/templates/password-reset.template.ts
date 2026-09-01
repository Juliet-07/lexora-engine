export interface PasswordResetEmailData {
  to: string;
  firstName: string;
  resetUrl: string;
}

export function passwordResetTemplate(data: PasswordResetEmailData): {
  subject: string;
  html: string;
} {
  const subject = 'Reset your password';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1A1A2E;">
      <div style="background:#4B0082; padding:20px 24px; border-radius:8px 8px 0 0;">
        <p style="color:#FFFFFF; font-size:18px; font-weight:bold; margin:0;">
          Reset your password
        </p>
      </div>
      <div style="border:1px solid #E5E5EA; border-top:none; padding:24px; border-radius:0 0 8px 8px;">
        <p style="font-size:14px; line-height:1.6;">Hi ${data.firstName},</p>
        <p style="font-size:14px; line-height:1.6;">
          We received a request to reset your password. Click the button below
          to choose a new one. This link expires in 1 hour.
        </p>
        <div style="text-align:center; margin:24px 0;">
          <a href="${data.resetUrl}" style="background:#4B0082; color:#FFFFFF; padding:12px 28px; border-radius:6px; text-decoration:none; font-size:14px; font-weight:600; display:inline-block;">
            Reset Password
          </a>
        </div>
        <p style="font-size:12px; color:#6B7280; line-height:1.6;">
          If you didn't request this, you can safely ignore this email — your
          password will not be changed.
        </p>
      </div>
    </div>
  `;
  return { subject, html };
}
