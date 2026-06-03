export interface OnboardingSubmittedNotificationData {
  to: string;
  tenantFirstName: string;
  clientName: string;
  clientEmail: string;
  submittedAt: Date;
  businessName: string;
  dashboardUrl: string;
}

export function onboardingSubmittedNotificationTemplate(
  data: OnboardingSubmittedNotificationData,
): { subject: string; html: string } {
  const {
    tenantFirstName,
    clientName,
    clientEmail,
    submittedAt,
    businessName,
    dashboardUrl,
  } = data;

  const year = new Date().getFullYear();
  const firmName = process.env.FIRM_NAME || 'Lexora';

  const submittedStr = submittedAt.toLocaleString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const subject = `Onboarding form submitted - ${clientName} is ready for review`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Onboarding Submitted</title>
</head>
<body style="margin:0;padding:0;background-color:#f2f0ed;font-family:'Georgia',serif;">

  <table width="100%" cellpadding="0" cellspacing="0"
    style="background-color:#f2f0ed;padding:48px 0;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0"
          style="background-color:#ffffff;border:1px solid #ddd8d0;
                 border-radius:6px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background-color:#4B0082;padding:36px 48px 32px;">
              <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;
                         text-transform:uppercase;color:#c9a84c;
                         font-family:Arial,sans-serif;">
                ${firmName}
              </p>
              <h1 style="margin:0;font-size:24px;font-weight:normal;
                          color:#ffffff;font-family:'Georgia',serif;
                          letter-spacing:0.3px;line-height:1.4;">
                Onboarding Form Submitted
              </h1>
            </td>
          </tr>

          <!-- Gold bar -->
          <tr>
            <td style="background-color:#c9a84c;height:3px;
                       font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 48px 0;">
              <p style="margin:0 0 18px;font-size:15px;color:#2c2c2c;line-height:1.8;">
                Dear <strong>${tenantFirstName}</strong>,
              </p>
              <p style="margin:0 0 18px;font-size:15px;color:#2c2c2c;line-height:1.8;">
                <strong>${clientName}</strong> has completed and submitted their
                onboarding form. Their KYC application is now ready for your
                review and verification.
              </p>
            </td>
          </tr>

          <!-- Submission details box -->
          <tr>
            <td style="padding:8px 48px 0;">
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#f0fdf4;border:1px solid #86efac;
                       border-radius:4px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="padding:5px 0;font-size:13px;color:#166534;
                                   font-family:Arial,sans-serif;">
                          <strong>Client name:</strong> ${clientName}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:13px;color:#166534;
                                   font-family:Arial,sans-serif;">
                          <strong>Email:</strong> ${clientEmail}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:13px;color:#166534;
                                   font-family:Arial,sans-serif;">
                          <strong>Submitted at:</strong> ${submittedStr}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Next steps -->
          <tr>
            <td style="padding:20px 48px 0;">
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#f8f6f1;border-left:4px solid #c9a84c;
                       border-radius:3px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 10px;font-size:11px;letter-spacing:2px;
                               text-transform:uppercase;color:#888888;
                               font-family:Arial,sans-serif;">
                      Next Steps
                    </p>
                    <table cellpadding="0" cellspacing="0">
                      ${[
                        'Review the submitted form and uploaded documents',
                        'Run AML/KYC verifications from the Onboarding detail view',
                        'Approve or reject the client once verifications are complete',
                      ]
                        .map(
                          (step, i) => `
                        <tr>
                          <td style="padding:5px 0;vertical-align:top;
                                     width:24px;font-family:Arial,sans-serif;">
                            <span style="display:inline-block;width:18px;height:18px;
                                         background-color:#4B0082;border-radius:50%;
                                         text-align:center;line-height:18px;
                                         font-size:10px;color:#ffffff;font-weight:bold;">
                              ${i + 1}
                            </span>
                          </td>
                          <td style="padding:5px 0 5px 10px;font-size:13px;
                                      color:#555555;font-family:Arial,sans-serif;
                                      line-height:1.6;">
                            ${step}
                          </td>
                        </tr>`,
                        )
                        .join('')}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:28px 48px 0;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#4B0082;border-radius:4px;">
                    <a href="${dashboardUrl}"
                      style="display:inline-block;padding:15px 36px;font-size:13px;
                             font-family:Arial,sans-serif;letter-spacing:2px;
                             text-transform:uppercase;color:#ffffff;
                             text-decoration:none;font-weight:bold;">
                      Review Submission &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Sign off -->
          <tr>
            <td style="padding:32px 48px 40px;">
              <p style="margin:0;font-size:15px;color:#2c2c2c;line-height:1.8;">
                You can manage this client from your dashboard under
                <strong>Clients &rarr; Onboarding &amp; CDD</strong>.
              </p>
              <p style="margin:24px 0 0;font-size:15px;color:#2c2c2c;line-height:1.9;">
                Kind regards,<br/>
                <strong style="color:#4B0082;font-size:16px;">
                  ${businessName}
                </strong><br/>
                <span style="font-size:12px;color:#999999;font-family:Arial,sans-serif;">
                  via ${firmName}
                </span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f2f0ed;border-top:1px solid #e0dbd4;
                       padding:20px 48px;">
              <p style="margin:0;font-size:11px;color:#aaaaaa;line-height:1.8;
                         font-family:Arial,sans-serif;text-align:center;">
                This is a system-generated notification.<br/>
                Please do not reply directly to this email.<br/>
                &copy; ${year} ${firmName}. All rights reserved.
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
