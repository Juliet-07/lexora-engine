export interface ComplianceAlertEmailData {
  to: string;
  firstName: string;
  tenantBusinessName: string;
  alertTitle: string;
  alertType: string;
  alertSeverity: string;
  alertDescription: string;
  loginUrl: string;
}

export function complianceAlertTemplate(data: ComplianceAlertEmailData): {
  subject: string;
  html: string;
} {
  const {
    firstName,
    tenantBusinessName,
    alertTitle,
    alertType,
    alertSeverity,
    alertDescription,
    loginUrl,
  } = data;

  const year = new Date().getFullYear();
  const firmName = process.env.FIRM_NAME || 'Lexora';

  // ── Severity colours ──────────────────────────────────────
  const severityConfig: Record<
    string,
    {
      label: string;
      bg: string;
      border: string;
      color: string;
      bannerBg: string;
    }
  > = {
    critical: {
      label: 'CRITICAL',
      bg: '#fef2f2',
      border: '#fca5a5',
      color: '#991b1b',
      bannerBg: '#dc2626',
    },
    high: {
      label: 'HIGH',
      bg: '#fff7ed',
      border: '#fed7aa',
      color: '#9a3412',
      bannerBg: '#ea580c',
    },
    medium: {
      label: 'MEDIUM',
      bg: '#fffbeb',
      border: '#fde68a',
      color: '#92400e',
      bannerBg: '#d97706',
    },
    low: {
      label: 'LOW',
      bg: '#f0fdf4',
      border: '#86efac',
      color: '#166534',
      bannerBg: '#16a34a',
    },
  };

  const sev =
    severityConfig[alertSeverity.toLowerCase()] ?? severityConfig.medium;

  // ── Alert type labels ─────────────────────────────────────
  const typeLabels: Record<string, string> = {
    sanctions_hit: 'Sanctions Match',
    pep_match: 'PEP Match',
    adverse_media: 'Adverse Media',
    high_risk_client: 'High Risk Client',
    review_overdue: 'Review Overdue',
    ubo_flagged: 'UBO Flagged',
    transaction_flag: 'Transaction Flag',
    watchlist_hit: 'Watchlist Hit',
    manual: 'Manual Alert',
  };

  const typeLabel = typeLabels[alertType] ?? alertType;

  const subject = `[${sev.label}] Compliance Alert: ${alertTitle} — ${tenantBusinessName}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Compliance Alert</title>
</head>
<body style="margin:0;padding:0;background-color:#f2f0ed;font-family:'Georgia',serif;">

  <table width="100%" cellpadding="0" cellspacing="0"
    style="background-color:#f2f0ed;padding:48px 0;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0"
          style="background-color:#ffffff;border:1px solid #ddd8d0;
                 border-radius:6px;overflow:hidden;">

          <!-- Severity banner -->
          <tr>
            <td style="background-color:${sev.bannerBg};padding:12px 48px;text-align:center;">
              <p style="margin:0;font-size:13px;font-weight:bold;letter-spacing:1px;
                         color:#ffffff;font-family:Arial,sans-serif;">
                ${sev.label} SEVERITY — COMPLIANCE ALERT
              </p>
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="background-color:#4B0082;padding:32px 48px 28px;">
              <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;
                         text-transform:uppercase;color:#c9a84c;
                         font-family:Arial,sans-serif;">
                ${firmName}
              </p>
              <h1 style="margin:0;font-size:22px;font-weight:normal;
                          color:#ffffff;font-family:'Georgia',serif;
                          letter-spacing:0.3px;line-height:1.4;">
                Compliance Alert Raised
              </h1>
              <p style="margin:6px 0 0;font-size:13px;color:#d4b8f0;
                         font-family:Arial,sans-serif;">
                ${tenantBusinessName}
              </p>
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
                Dear <strong>${firstName}</strong>,
              </p>
              <p style="margin:0 0 18px;font-size:15px;color:#2c2c2c;line-height:1.8;">
                A compliance alert has been raised on your account with
                <strong>${tenantBusinessName}</strong>. Please review the
                details below and log in to your portal for further information.
              </p>
            </td>
          </tr>

          <!-- Alert details box -->
          <tr>
            <td style="padding:8px 48px 0;">
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background-color:${sev.bg};border:1px solid ${sev.border};
                       border-radius:4px;">
                <tr>
                  <td style="padding:24px 28px;">
                    <p style="margin:0 0 16px;font-size:11px;letter-spacing:2px;
                               text-transform:uppercase;color:#888888;
                               font-family:Arial,sans-serif;">
                      Alert Details
                    </p>
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="padding:5px 0;font-size:12px;color:#777777;
                                   font-family:Arial,sans-serif;width:130px;
                                   vertical-align:top;">
                          Alert Title
                        </td>
                        <td style="padding:5px 0;font-size:14px;color:#2c2c2c;
                                   font-family:Arial,sans-serif;font-weight:bold;">
                          ${alertTitle}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:12px;color:#777777;
                                   font-family:Arial,sans-serif;vertical-align:top;">
                          Alert Type
                        </td>
                        <td style="padding:5px 0;font-size:14px;color:#2c2c2c;
                                   font-family:Arial,sans-serif;">
                          ${typeLabel}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:12px;color:#777777;
                                   font-family:Arial,sans-serif;vertical-align:top;">
                          Severity
                        </td>
                        <td style="padding:5px 0;">
                          <span style="display:inline-block;padding:3px 10px;
                                       font-size:12px;font-weight:bold;
                                       font-family:Arial,sans-serif;
                                       color:${sev.color};
                                       background-color:${sev.bg};
                                       border:1px solid ${sev.border};
                                       border-radius:3px;">
                            ${sev.label}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Description -->
          <tr>
            <td style="padding:20px 48px 0;">
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#f8f6f1;border-left:4px solid #c9a84c;
                       border-radius:3px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;font-size:10px;letter-spacing:2px;
                               text-transform:uppercase;color:#888888;
                               font-family:Arial,sans-serif;">
                      Description
                    </p>
                    <p style="margin:0;font-size:14px;color:#2c2c2c;
                               line-height:1.8;font-family:Arial,sans-serif;">
                      ${alertDescription}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- What to do -->
          <tr>
            <td style="padding:20px 48px 0;">
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#fff8f0;border:1px solid #f0e0cc;
                       border-radius:4px;">
                <tr>
                  <td style="padding:18px 24px;">
                    <p style="margin:0 0 10px;font-size:12px;font-weight:bold;
                               letter-spacing:1px;text-transform:uppercase;
                               color:#c97a2c;font-family:Arial,sans-serif;">
                      What you should do
                    </p>
                    <table cellpadding="0" cellspacing="0">
                      ${[
                        'Log in to your client portal using the button below',
                        'Review the alert details and any associated documents',
                        'Follow any instructions provided by your compliance officer',
                        'Contact your advisor at ' +
                          tenantBusinessName +
                          ' if you have questions',
                      ]
                        .map(
                          (step, i) => `
                        <tr>
                          <td style="padding:5px 0;vertical-align:top;
                                     width:24px;font-family:Arial,sans-serif;">
                            <span style="display:inline-block;width:18px;height:18px;
                                         background-color:#c97a2c;border-radius:50%;
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
                    <a href="${loginUrl}"
                      style="display:inline-block;padding:15px 36px;font-size:13px;
                             font-family:Arial,sans-serif;letter-spacing:2px;
                             text-transform:uppercase;color:#ffffff;
                             text-decoration:none;font-weight:bold;">
                      Log In to My Portal &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:10px 0 0;font-size:11px;color:#aaaaaa;
                         font-family:Arial,sans-serif;">
                Or copy this link:
                <a href="${loginUrl}" style="color:#4B0082;">${loginUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Sign off -->
          <tr>
            <td style="padding:32px 48px 40px;">
              <p style="margin:0;font-size:15px;color:#2c2c2c;line-height:1.8;">
                If you believe this alert was raised in error, please contact
                <strong>${tenantBusinessName}</strong> directly.
              </p>
              <p style="margin:24px 0 0;font-size:15px;color:#2c2c2c;line-height:1.9;">
                Kind regards,<br/>
                <strong style="color:#4B0082;font-size:16px;">
                  ${tenantBusinessName}
                </strong><br/>
                <span style="font-size:12px;color:#999999;font-family:Arial,sans-serif;">
                  via ${firmName} Compliance Platform
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
                This is a system-generated compliance notification.<br/>
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
