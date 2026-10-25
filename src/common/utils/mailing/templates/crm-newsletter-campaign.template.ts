// CRM Tools newsletter/event-invite campaign email — same house style
// (deep purple #4B0082 header, gold #c9a84c divider/accents, Georgia
// serif headline, cream footer) as tenant-welcome.template.ts and
// board-member-appointed.template.ts, so a tenant's own clients,
// CRM contacts and board members all receive something that looks
// like it belongs to the same platform, not a raw, unstyled dump of
// whatever the tenant typed into the rich-text composer.

import { footerExtrasHtml, type FooterExtras } from './footer-extras';

export type CrmNewsletterRecipientRole = 'client' | 'contact' | 'board member';

export interface CrmNewsletterCampaignEmailData {
  businessName: string;
  // Omitted for a test send — there's no real recipient to greet or
  // attribute the email to.
  recipientName?: string;
  recipientRole?: CrmNewsletterRecipientRole;
  subject: string;
  // Raw HTML from the tenant's RichTextEditor — same content that
  // was previously sent completely unstyled.
  bodyHtml: string;
  isEventInvite: boolean;
  event?: {
    title?: string;
    dateTime?: string;
    location?: string;
    rsvp?: boolean;
  } | null;
  isTest?: boolean;
  // Tenant social links / address / unsubscribe link for the footer.
  footer?: FooterExtras | null;
}

export function crmNewsletterCampaignTemplate(
  data: CrmNewsletterCampaignEmailData,
): { subject: string; html: string } {
  const year = new Date().getFullYear();
  const headline = data.isEventInvite ? 'Event Invitation' : 'Newsletter';
  const subject = data.isTest
    ? `[TEST] ${data.subject}`
    : data.subject || headline;

  const greeting = data.recipientName
    ? `Dear <strong>${data.recipientName}</strong>,`
    : 'Hello,';

  const eventBlock =
    data.isEventInvite && data.event
      ? `
        <table width="100%" cellpadding="0" cellspacing="0"
          style="background-color:#f8f6f1;border-left:4px solid #c9a84c;border-radius:2px;margin:0 0 28px;">
          <tr>
            <td style="padding:22px 26px;">
              ${
                data.event.title
                  ? `<p style="margin:0 0 10px;font-size:16px;font-weight:bold;color:#1a2744;font-family:'Georgia',serif;">${data.event.title}</p>`
                  : ''
              }
              ${
                data.event.dateTime || data.event.location
                  ? `<p style="margin:0 0 6px;font-size:13px;color:#555555;font-family:Arial,sans-serif;">
                      ${[data.event.dateTime, data.event.location].filter(Boolean).join(' &nbsp;&middot;&nbsp; ')}
                    </p>`
                  : ''
              }
              ${
                data.event.rsvp
                  ? `<p style="margin:10px 0 0;font-size:12px;letter-spacing:0.5px;text-transform:uppercase;color:#8a6d16;font-family:Arial,sans-serif;font-weight:bold;">RSVP requested</p>`
                  : ''
              }
            </td>
          </tr>
        </table>`
      : '';

  const footerContext = data.isTest
    ? 'This is a test send — recipients will see a personalised version of this message.'
    : `You are receiving this because you are a ${data.recipientRole ?? 'client'} of <strong>${data.businessName}</strong>.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${headline}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0"
          style="background-color:#ffffff;border:1px solid #d6cfc4;border-radius:4px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background-color:#4B0082;padding:32px 40px;">
              <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#c9a84c;font-family:'Georgia',serif;">
                ${data.businessName}
              </p>
              <h1 style="margin:8px 0 0;font-size:22px;font-weight:normal;color:#ffffff;font-family:'Georgia',serif;letter-spacing:0.5px;">
                ${headline}
              </h1>
            </td>
          </tr>

          <!-- Gold divider -->
          <tr>
            <td style="background-color:#c9a84c;height:3px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 20px;font-size:15px;color:#333333;line-height:1.7;">
                ${greeting}
              </p>
              ${eventBlock}
              <div style="font-size:15px;color:#333333;line-height:1.7;">
                ${data.bodyHtml || '<p style="margin:0;color:#777;">(No content)</p>'}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f6f1;border-top:1px solid #e8e2d9;padding:24px 40px;">
              <p style="margin:0 0 10px;font-size:12px;color:#777777;line-height:1.6;font-family:Arial,sans-serif;text-align:center;">
                ${footerContext}
              </p>
              ${footerExtrasHtml(data.footer)}
              <p style="margin:0;font-size:11px;color:#999999;line-height:1.7;font-family:Arial,sans-serif;text-align:center;">
                This is a confidential system-generated notification.<br/>
                Please do not reply directly to this email.<br/>
                &copy; ${year} ${data.businessName}. All rights reserved.
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
