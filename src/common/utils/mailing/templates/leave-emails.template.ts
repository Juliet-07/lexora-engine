// ─────────────────────────────────────────────────────────────
// LEAVE REQUEST NOTIFICATION — sent to tenant when employee applies
// ─────────────────────────────────────────────────────────────

export interface LeaveRequestNotificationData {
  to: string;
  tenantName: string;
  employeeName: string;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  days: number;
  reason: string;
  dashboardUrl: string;
}

export function leaveRequestNotificationTemplate(
  data: LeaveRequestNotificationData,
): { subject: string; html: string } {
  const firmName = process.env.FIRM_NAME || 'Lexora';
  const year = new Date().getFullYear();
  const typeLabel =
    data.leaveType.charAt(0).toUpperCase() + data.leaveType.slice(1);
  const fmt = (d: Date) =>
    new Date(d).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const subject = `Leave Request — ${data.employeeName} (${typeLabel}, ${data.days}d)`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Leave Request</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#4B0082;padding:32px 48px 28px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">${firmName}</p>
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;font-family:'Georgia',serif;">New Leave Request</h1>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px 0;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            Dear <strong>${data.tenantName}</strong>,
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            <strong>${data.employeeName}</strong> has submitted a leave request pending your approval.
          </p>
        </td></tr>
        <tr><td style="padding:0 48px;">
          <table width="100%" cellpadding="0" cellspacing="0"
            style="border:1px solid #e0dbd4;border-radius:4px;overflow:hidden;">
            <tr><td style="background:#f8f6f1;padding:14px 24px;">
              <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#888;font-family:Arial,sans-serif;">Request Details</p>
            </td></tr>
            ${[
              ['Employee', data.employeeName],
              ['Leave Type', typeLabel],
              ['From', fmt(data.startDate)],
              ['To', fmt(data.endDate)],
              ['Days', `${data.days} working day${data.days !== 1 ? 's' : ''}`],
              ['Reason', data.reason],
            ]
              .map(
                ([label, value]) => `
            <tr style="border-top:1px solid #f0ebe4;">
              <td style="padding:10px 24px;">
                <table width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td style="width:40%;font-size:12px;color:#777;font-family:Arial,sans-serif;">${label}</td>
                  <td style="font-size:13px;color:#2c2c2c;font-family:Arial,sans-serif;">${value}</td>
                </tr></table>
              </td>
            </tr>`,
              )
              .join('')}
          </table>
        </td></tr>
        <tr><td style="padding:24px 48px;">
          <table cellpadding="0" cellspacing="0">
            <tr><td style="background:#4B0082;border-radius:4px;">
              <a href="${data.dashboardUrl}"
                style="display:inline-block;padding:14px 32px;font-size:12px;font-family:Arial,sans-serif;
                       letter-spacing:2px;text-transform:uppercase;color:#fff;text-decoration:none;font-weight:bold;">
                Review Request &rarr;
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#f2f0ed;border-top:1px solid #e0dbd4;padding:18px 48px;">
          <p style="margin:0;font-size:11px;color:#aaa;text-align:center;font-family:Arial,sans-serif;">
            &copy; ${year} ${firmName}. All rights reserved.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

// ─────────────────────────────────────────────────────────────
// LEAVE REVIEW NOTIFICATION — sent to employee after approval/rejection
// ─────────────────────────────────────────────────────────────

export interface LeaveReviewNotificationData {
  to: string;
  firstName: string;
  status: string;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  days: number;
  note: string | null;
  portalUrl: string;
}

export function leaveReviewNotificationTemplate(
  data: LeaveReviewNotificationData,
): { subject: string; html: string } {
  const firmName = process.env.FIRM_NAME || 'Lexora';
  const year = new Date().getFullYear();
  const approved = data.status === 'approved';
  const typeLabel =
    data.leaveType.charAt(0).toUpperCase() + data.leaveType.slice(1);
  const fmt = (d: Date) =>
    new Date(d).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const subject = approved
    ? `Your ${typeLabel} Leave Request Has Been Approved`
    : `Your ${typeLabel} Leave Request Has Been Declined`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Leave Decision</title></head>
<body style="margin:0;padding:0;background:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background:#fff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
        <!-- Status banner -->
        <tr><td style="background:${approved ? '#16a34a' : '#dc2626'};padding:10px 48px;text-align:center;">
          <p style="margin:0;font-size:12px;font-weight:bold;letter-spacing:1px;color:#fff;font-family:Arial,sans-serif;">
            ${approved ? '✓ LEAVE APPROVED' : '✗ LEAVE DECLINED'}
          </p>
        </td></tr>
        <tr><td style="background:#4B0082;padding:28px 48px 24px;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">${firmName}</p>
          <h1 style="margin:0;font-size:20px;font-weight:normal;color:#fff;font-family:'Georgia',serif;">
            Leave ${approved ? 'Approved' : 'Declined'}
          </h1>
        </td></tr>
        <tr><td style="background:#c9a84c;height:3px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 48px 0;">
          <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            Dear <strong>${data.firstName}</strong>,
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#2c2c2c;line-height:1.8;">
            Your <strong>${typeLabel} leave</strong> request has been
            <strong style="color:${approved ? '#16a34a' : '#dc2626'};">
              ${approved ? 'approved' : 'declined'}
            </strong>.
          </p>
        </td></tr>
        <tr><td style="padding:0 48px;">
          <table width="100%" cellpadding="0" cellspacing="0"
            style="border:1px solid #e0dbd4;border-radius:4px;overflow:hidden;">
            <tr><td style="background:#f8f6f1;padding:14px 24px;">
              <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#888;font-family:Arial,sans-serif;">Leave Details</p>
            </td></tr>
            ${[
              ['Leave Type', typeLabel],
              ['From', fmt(data.startDate)],
              ['To', fmt(data.endDate)],
              ['Days', `${data.days} working day${data.days !== 1 ? 's' : ''}`],
              ['Decision', approved ? 'Approved' : 'Declined'],
              ...(data.note ? [['Note', data.note]] : []),
            ]
              .map(
                ([label, value]) => `
            <tr style="border-top:1px solid #f0ebe4;">
              <td style="padding:10px 24px;">
                <table width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td style="width:40%;font-size:12px;color:#777;font-family:Arial,sans-serif;">${label}</td>
                  <td style="font-size:13px;color:#2c2c2c;font-family:Arial,sans-serif;">${value}</td>
                </tr></table>
              </td>
            </tr>`,
              )
              .join('')}
          </table>
        </td></tr>
        <tr><td style="padding:24px 48px;">
          <table cellpadding="0" cellspacing="0">
            <tr><td style="background:#4B0082;border-radius:4px;">
              <a href="${data.portalUrl}"
                style="display:inline-block;padding:14px 32px;font-size:12px;font-family:Arial,sans-serif;
                       letter-spacing:2px;text-transform:uppercase;color:#fff;text-decoration:none;font-weight:bold;">
                View in Portal &rarr;
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#f2f0ed;border-top:1px solid #e0dbd4;padding:18px 48px;">
          <p style="margin:0;font-size:11px;color:#aaa;text-align:center;font-family:Arial,sans-serif;">
            &copy; ${year} ${firmName}. All rights reserved.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
