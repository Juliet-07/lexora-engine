export interface ClientWelcomeEmailData {
  to: string;
  firstName: string;
  tenantBusinessName: string;
  tempPassword: string;
  loginUrl: string;
  clientType: string;
}

export function clientWelcomeTemplate(data: ClientWelcomeEmailData): {
  subject: string;
  html: string;
} {
  const {
    to,
    firstName,
    tenantBusinessName,
    tempPassword,
    loginUrl,
    clientType,
  } = data;
  const year = new Date().getFullYear();
  const firmName = process.env.FIRM_NAME || 'Lexora';
  const isIndividual = clientType === 'individual';

  // ── Checklist blocks ──────────────────────────────────────
  const individualChecklist = `
    <tr>
      <td style="padding:20px 24px 24px;">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;
                   color:#888888;font-family:Arial,sans-serif;">
          For Individual Clients
        </p>
        <table cellpadding="0" cellspacing="0" width="100%">
          ${[
            "Valid government-issued photo ID (passport, national ID, or driver's licence)",
            'Proof of residential address (utility bill or bank statement — not older than 3 months)',
            'Tax identification number',
          ]
            .map(
              (item) => `
            <tr>
              <td style="padding:7px 0;vertical-align:top;width:24px;">
                <span style="display:inline-block;width:18px;height:18px;background-color:#4B0082;
                             border-radius:50%;text-align:center;line-height:18px;
                             font-size:11px;color:#ffffff;font-family:Arial,sans-serif;">✓</span>
              </td>
              <td style="padding:7px 0 7px 8px;font-size:13px;color:#444444;
                          font-family:Arial,sans-serif;line-height:1.6;">
                ${item}
              </td>
            </tr>
          `,
            )
            .join('')}
        </table>
      </td>
    </tr>`;

  const corporateChecklist = `
    <tr>
      <td style="padding:20px 24px 24px;">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;
                   color:#888888;font-family:Arial,sans-serif;">
          For Corporate Clients
        </p>
        <table cellpadding="0" cellspacing="0" width="100%">
          ${[
            'Certificate of Incorporation / Registration',
            'Memorandum and Articles of Association',
            'Register of Directors and Shareholders',
            'Valid ID documents for all beneficial owners (>25% ownership)',
            'Proof of business address (utility bill or bank statement — not older than 3 months)',
            'Tax identification numbers',
            'Details of related entities and group structure',
          ]
            .map(
              (item) => `
            <tr>
              <td style="padding:7px 0;vertical-align:top;width:24px;">
                <span style="display:inline-block;width:18px;height:18px;background-color:#4B0082;
                             border-radius:50%;text-align:center;line-height:18px;
                             font-size:11px;color:#ffffff;font-family:Arial,sans-serif;">✓</span>
              </td>
              <td style="padding:7px 0 7px 8px;font-size:13px;color:#444444;
                          font-family:Arial,sans-serif;line-height:1.6;">
                ${item}
              </td>
            </tr>
          `,
            )
            .join('')}
        </table>
      </td>
    </tr>`;

  const checklist = isIndividual ? individualChecklist : corporateChecklist;

  return {
    subject: `Welcome to ${tenantBusinessName} — Your Onboarding Has Begun`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Welcome — ${tenantBusinessName}</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f2f0ed;font-family:'Georgia',serif;">

        <table width="100%" cellpadding="0" cellspacing="0"
          style="background-color:#f2f0ed;padding:48px 0;">
          <tr>
            <td align="center">
              <table width="640" cellpadding="0" cellspacing="0"
                style="background-color:#ffffff;border:1px solid #ddd8d0;
                       border-radius:6px;overflow:hidden;">

                <!-- ── Header ── -->
                <tr>
                  <td style="background-color:#4B0082;padding:36px 48px 32px;">
                    <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;
                               text-transform:uppercase;color:#c9a84c;
                               font-family:Arial,sans-serif;">
                      ${firmName}
                    </p>
                    <h1 style="margin:0;font-size:26px;font-weight:normal;color:#ffffff;
                                font-family:'Georgia',serif;letter-spacing:0.3px;
                                line-height:1.3;">
                      Welcome, ${firstName}.<br/>
                      <span style="font-size:16px;color:#d4b8f0;font-style:italic;">
                        Your onboarding journey begins here.
                      </span>
                    </h1>
                  </td>
                </tr>

                <!-- Gold bar -->
                <tr>
                  <td style="background-color:#c9a84c;height:3px;
                             font-size:0;line-height:0;">&nbsp;</td>
                </tr>

                <!-- ── Opening message ── -->
                <tr>
                  <td style="padding:40px 48px 0;">
                    <p style="margin:0 0 18px;font-size:15px;color:#2c2c2c;line-height:1.8;">
                      Thank you for choosing to work with
                      <strong>${tenantBusinessName}</strong>. We are excited to begin
                      this journey with you and look forward to supporting you with a
                      seamless, high-value experience.
                    </p>
                    <p style="margin:0 0 18px;font-size:15px;color:#2c2c2c;line-height:1.8;">
                      To help us get started and tailor our services to your needs,
                      we invite you to complete your onboarding profile through the
                      secure client portal we have set up for you.
                    </p>
                    <p style="margin:0;font-size:15px;color:#2c2c2c;line-height:1.8;">
                      We appreciate your time and look forward to building a
                      strong partnership.
                    </p>
                  </td>
                </tr>

                <!-- ── Time estimate chip ── -->
                <tr>
                  <td style="padding:24px 48px 0;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background-color:#f0ebf8;border:1px solid #c9b8e8;
                                   border-radius:20px;padding:8px 20px;">
                          <p style="margin:0;font-size:13px;color:#4B0082;
                                     font-family:Arial,sans-serif;font-weight:bold;">
                            ⏱&nbsp; Estimated completion time: 5–7 minutes
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- ── Credentials ── -->
                <tr>
                  <td style="padding:32px 48px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0"
                      style="background-color:#f8f6f1;border-left:4px solid #c9a84c;
                             border-radius:3px;">
                      <tr>
                        <td style="padding:24px 28px;">
                          <p style="margin:0 0 4px;font-size:10px;letter-spacing:2px;
                                     text-transform:uppercase;color:#999999;
                                     font-family:Arial,sans-serif;">
                            Your Portal Login Credentials
                          </p>
                          <p style="margin:0 0 16px;font-size:12px;color:#888888;
                                     font-family:Arial,sans-serif;">
                            Use these to access your secure onboarding portal.
                            You will be prompted to set a new password on first login.
                          </p>
                          <table cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="padding:5px 0;font-size:12px;color:#777777;
                                         font-family:Arial,sans-serif;width:90px;
                                         vertical-align:top;">
                                Email
                              </td>
                              <td style="padding:5px 0;font-size:14px;color:#4B0082;
                                         font-family:'Courier New',monospace;
                                         font-weight:bold;">
                                ${to}
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:5px 0;font-size:12px;color:#777777;
                                         font-family:Arial,sans-serif;vertical-align:top;">
                                Password
                              </td>
                              <td style="padding:5px 0;font-size:14px;color:#4B0082;
                                         font-family:'Courier New',monospace;
                                         font-weight:bold;letter-spacing:2px;">
                                ${tempPassword}
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:5px 0;font-size:12px;color:#777777;
                                         font-family:Arial,sans-serif;vertical-align:top;">
                                Firm
                              </td>
                              <td style="padding:5px 0;font-size:14px;color:#333333;
                                         font-family:Arial,sans-serif;font-weight:bold;">
                                ${tenantBusinessName}
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- ── CTA button ── -->
                <tr>
                  <td style="padding:28px 48px 0;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background-color:#4B0082;border-radius:4px;">
                          <a href="${loginUrl}"
                            style="display:inline-block;padding:15px 36px;font-size:13px;
                                   font-family:Arial,sans-serif;letter-spacing:2px;
                                   text-transform:uppercase;color:#ffffff;
                                   text-decoration:none;font-weight:bold;">
                            Begin Your Onboarding &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:10px 0 0;font-size:11px;color:#aaaaaa;
                               font-family:Arial,sans-serif;">
                      Or copy this link into your browser:
                      <a href="${loginUrl}" style="color:#4B0082;">${loginUrl}</a>
                    </p>
                  </td>
                </tr>

                <!-- ── Before you begin ── -->
                <tr>
                  <td style="padding:36px 48px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0"
                      style="border:1px solid #e0dbd4;border-radius:4px;overflow:hidden;">
                      <tr>
                        <td style="background-color:#4B0082;padding:14px 24px;">
                          <p style="margin:0;font-size:12px;font-weight:bold;
                                     letter-spacing:1.5px;text-transform:uppercase;
                                     color:#ffffff;font-family:Arial,sans-serif;">
                            Before You Begin — Please Have Ready
                          </p>
                        </td>
                      </tr>
                      ${checklist}
                    </table>
                  </td>
                </tr>

                <!-- ── Important notes ── -->
                <tr>
                  <td style="padding:24px 48px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0"
                      style="background-color:#fff8f0;border:1px solid #f0e0cc;
                             border-radius:4px;">
                      <tr>
                        <td style="padding:18px 24px;">
                          <p style="margin:0 0 10px;font-size:12px;font-weight:bold;
                                     letter-spacing:1px;text-transform:uppercase;
                                     color:#c97a2c;font-family:Arial,sans-serif;">
                            &#x26A0;&nbsp; Important Notes
                          </p>
                          <table cellpadding="0" cellspacing="0">
                            ${[
                              'All fields marked with <strong>*</strong> are mandatory',
                              'Documents must be current — not older than <strong>3 months</strong>',
                              'Accepted formats: <strong>PDF, JPG, PNG</strong> (max 5MB per file)',
                              'Your data is encrypted and handled in strict confidence',
                            ]
                              .map(
                                (note) => `
                              <tr>
                                <td style="padding:4px 0;vertical-align:top;
                                           width:16px;font-size:13px;color:#c97a2c;
                                           font-family:Arial,sans-serif;">
                                  •
                                </td>
                                <td style="padding:4px 0 4px 8px;font-size:13px;
                                            color:#555555;font-family:Arial,sans-serif;
                                            line-height:1.6;">
                                  ${note}
                                </td>
                              </tr>
                            `,
                              )
                              .join('')}
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- ── Security notice ── -->
                <tr>
                  <td style="padding:24px 48px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0"
                      style="border:1px solid #e8e2d9;border-radius:4px;">
                      <tr>
                        <td style="padding:16px 22px;">
                          <p style="margin:0 0 6px;font-size:11px;font-weight:bold;
                                     text-transform:uppercase;letter-spacing:1px;
                                     color:#4B0082;font-family:Arial,sans-serif;">
                            &#x1F512;&nbsp; Security Notice
                          </p>
                          <p style="margin:0;font-size:12px;color:#666666;
                                     line-height:1.7;font-family:Arial,sans-serif;">
                            These credentials are strictly personal. Do not share them with
                            anyone, including staff at <strong>${tenantBusinessName}</strong>.
                            If you did not expect this invitation, please contact
                            <strong>${tenantBusinessName}</strong> immediately and
                            disregard this email.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- ── Sign-off ── -->
                <tr>
                  <td style="padding:36px 48px 40px;">
                    <p style="margin:0 0 6px;font-size:15px;color:#2c2c2c;line-height:1.8;">
                      Should you have any questions before or during the process, please
                      do not hesitate to reach out to
                      <strong>${tenantBusinessName}</strong> directly.
                    </p>
                    <p style="margin:24px 0 0;font-size:15px;color:#2c2c2c;line-height:1.9;">
                      Yours sincerely,<br/>
                      <strong style="color:#4B0082;font-size:16px;">
                        ${tenantBusinessName}
                      </strong><br/>
                      <span style="font-size:12px;color:#999999;font-family:Arial,sans-serif;">
                        via ${firmName} Client Portal
                      </span>
                    </p>
                  </td>
                </tr>

                <!-- ── Footer ── -->
                <tr>
                  <td style="background-color:#f2f0ed;border-top:1px solid #e0dbd4;
                             padding:20px 48px;">
                    <p style="margin:0;font-size:11px;color:#aaaaaa;line-height:1.8;
                               font-family:Arial,sans-serif;text-align:center;">
                      This is a confidential system-generated notification sent on behalf
                      of <strong>${tenantBusinessName}</strong>.<br/>
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
      </html>
    `,
  };
}
