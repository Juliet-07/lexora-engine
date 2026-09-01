export interface TenantNotificationEmailData {
  to: string;
  firstName: string;
  title: string;
  description: string;
  link: string | null;
  appUrl: string;
}

export function tenantNotificationTemplate(data: TenantNotificationEmailData): {
  subject: string;
  html: string;
} {
  const subject = data.title;
  const actionUrl = data.link ? `${data.appUrl}${data.link}` : data.appUrl;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1A1A2E;">
      <div style="background:#4B0082; padding:20px 24px; border-radius:8px 8px 0 0;">
        <p style="color:#FFFFFF; font-size:16px; font-weight:bold; margin:0;">
          ${data.title}
        </p>
      </div>
      <div style="border:1px solid #E5E5EA; border-top:none; padding:24px; border-radius:0 0 8px 8px;">
        <p style="font-size:14px; line-height:1.6;">Hi ${data.firstName},</p>
        <p style="font-size:14px; line-height:1.6;">${data.description}</p>
        <div style="text-align:center; margin:24px 0;">
          <a href="${actionUrl}" style="background:#4B0082; color:#FFFFFF; padding:12px 28px; border-radius:6px; text-decoration:none; font-size:14px; font-weight:600; display:inline-block;">
            View in Lexora
          </a>
        </div>
      </div>
    </div>
  `;
  return { subject, html };
}
