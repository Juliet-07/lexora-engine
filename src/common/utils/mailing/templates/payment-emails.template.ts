// ─────────────────────────────────────────────────────────────
// RECEIPT EMAIL TEMPLATE
// ─────────────────────────────────────────────────────────────

export interface PaymentReceiptEmailData {
  to: string;
  firstName: string;
  businessName: string;
  receiptNumber: string;
  planName: string;
  amount: number;
  currency: string;
  paidAt: Date;
  periodEnd: Date;
}

export function paymentReceiptTemplate(data: PaymentReceiptEmailData): {
  subject: string;
  html: string;
} {
  const year = new Date().getFullYear();
  const firmName = process.env.FIRM_NAME || 'Lexora';
  const paidDate = data.paidAt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const periodEnd = data.periodEnd.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const amountFormatted = `${data.currency} ${Number(
    data.amount,
  ).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  const subject = `Payment Receipt ${data.receiptNumber} — ${firmName}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Payment Receipt</title>
</head>
<body style="margin:0;padding:0;background-color:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background-color:#ffffff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">

        <!-- Green confirmation banner -->
        <tr>
          <td style="background-color:#16a34a;padding:12px 48px;text-align:center;">
            <p style="margin:0;font-size:13px;font-weight:bold;letter-spacing:1px;color:#ffffff;font-family:Arial,sans-serif;">
              ✓ PAYMENT CONFIRMED
            </p>
          </td>
        </tr>

        <!-- Header -->
        <tr>
          <td style="background-color:#4B0082;padding:32px 48px 28px;">
            <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">
              ${firmName}
            </p>
            <h1 style="margin:0;font-size:22px;font-weight:normal;color:#ffffff;font-family:'Georgia',serif;line-height:1.4;">
              Payment Receipt
            </h1>
            <p style="margin:6px 0 0;font-size:13px;color:#d4b8f0;font-family:Arial,sans-serif;">
              ${data.receiptNumber}
            </p>
          </td>
        </tr>
        <tr><td style="background-color:#c9a84c;height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 48px 0;">
            <p style="margin:0 0 18px;font-size:15px;color:#2c2c2c;line-height:1.8;">
              Dear <strong>${data.firstName}</strong>,
            </p>
            <p style="margin:0 0 24px;font-size:15px;color:#2c2c2c;line-height:1.8;">
              Thank you for your payment. Your subscription is now active.
            </p>
          </td>
        </tr>

        <!-- Receipt details -->
        <tr>
          <td style="padding:0 48px;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="border:1px solid #e0dbd4;border-radius:4px;overflow:hidden;">
              <tr>
                <td style="background-color:#f8f6f1;padding:16px 24px;">
                  <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;
                             color:#888888;font-family:Arial,sans-serif;">
                    Receipt Details
                  </p>
                </td>
              </tr>
              ${[
                ['Receipt Number', data.receiptNumber],
                ['Business', data.businessName],
                ['Plan', data.planName],
                ['Amount Paid', amountFormatted],
                ['Payment Date', paidDate],
                ['Valid Until', periodEnd],
              ]
                .map(
                  ([label, value]) => `
              <tr style="border-top:1px solid #f0ebe4;">
                <td style="padding:12px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="width:45%;font-size:12px;color:#777777;font-family:Arial,sans-serif;">
                        ${label}
                      </td>
                      <td style="font-size:14px;color:#2c2c2c;font-family:Arial,sans-serif;font-weight:${label === 'Amount Paid' ? 'bold' : 'normal'};">
                        ${value}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`,
                )
                .join('')}
            </table>
          </td>
        </tr>

        <!-- Sign off -->
        <tr>
          <td style="padding:32px 48px 40px;">
            <p style="margin:0;font-size:15px;color:#2c2c2c;line-height:1.8;">
              If you have any questions about this receipt, please contact us.
            </p>
            <p style="margin:24px 0 0;font-size:15px;color:#2c2c2c;line-height:1.9;">
              Thank you for choosing <strong style="color:#4B0082;">${firmName}</strong>.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#f2f0ed;border-top:1px solid #e0dbd4;padding:20px 48px;">
            <p style="margin:0;font-size:11px;color:#aaaaaa;line-height:1.8;font-family:Arial,sans-serif;text-align:center;">
              This is an official receipt from ${firmName}.<br/>
              &copy; ${year} ${firmName}. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

// ─────────────────────────────────────────────────────────────
// INVOICE EMAIL TEMPLATE
// ─────────────────────────────────────────────────────────────

export interface PaymentInvoiceEmailData {
  to: string;
  firstName: string;
  businessName: string;
  invoiceNumber: string;
  planName: string;
  amount: number;
  currency: string;
  dueDate: Date;
}

export function paymentInvoiceTemplate(data: PaymentInvoiceEmailData): {
  subject: string;
  html: string;
} {
  const year = new Date().getFullYear();
  const firmName = process.env.FIRM_NAME || 'Lexora';
  const dueDateFmt = data.dueDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const amountFormatted = `${data.currency} ${Number(
    data.amount,
  ).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  const subject = `Invoice ${data.invoiceNumber} — ${firmName} Subscription`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Invoice</title>
</head>
<body style="margin:0;padding:0;background-color:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background-color:#ffffff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">

        <!-- Invoice banner -->
        <tr>
          <td style="background-color:#d97706;padding:12px 48px;text-align:center;">
            <p style="margin:0;font-size:13px;font-weight:bold;letter-spacing:1px;color:#ffffff;font-family:Arial,sans-serif;">
              INVOICE — PAYMENT DUE
            </p>
          </td>
        </tr>

        <!-- Header -->
        <tr>
          <td style="background-color:#4B0082;padding:32px 48px 28px;">
            <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">
              ${firmName}
            </p>
            <h1 style="margin:0;font-size:22px;font-weight:normal;color:#ffffff;font-family:'Georgia',serif;line-height:1.4;">
              Subscription Invoice
            </h1>
            <p style="margin:6px 0 0;font-size:13px;color:#d4b8f0;font-family:Arial,sans-serif;">
              ${data.invoiceNumber}
            </p>
          </td>
        </tr>
        <tr><td style="background-color:#c9a84c;height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 48px 0;">
            <p style="margin:0 0 18px;font-size:15px;color:#2c2c2c;line-height:1.8;">
              Dear <strong>${data.firstName}</strong>,
            </p>
            <p style="margin:0 0 24px;font-size:15px;color:#2c2c2c;line-height:1.8;">
              Please find your invoice below for your ${firmName} subscription.
              Your account will be activated once payment is received.
            </p>
          </td>
        </tr>

        <!-- Invoice details -->
        <tr>
          <td style="padding:0 48px;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="border:1px solid #e0dbd4;border-radius:4px;overflow:hidden;">
              <tr>
                <td style="background-color:#f8f6f1;padding:16px 24px;">
                  <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;
                             color:#888888;font-family:Arial,sans-serif;">
                    Invoice Details
                  </p>
                </td>
              </tr>
              ${[
                ['Invoice Number', data.invoiceNumber],
                ['Bill To', data.businessName],
                ['Plan', data.planName],
                ['Amount Due', amountFormatted],
                ['Due Date', dueDateFmt],
              ]
                .map(
                  ([label, value]) => `
              <tr style="border-top:1px solid #f0ebe4;">
                <td style="padding:12px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="width:45%;font-size:12px;color:#777777;font-family:Arial,sans-serif;">
                        ${label}
                      </td>
                      <td style="font-size:14px;color:#2c2c2c;font-family:Arial,sans-serif;font-weight:${label === 'Amount Due' ? 'bold' : 'normal'};">
                        ${value}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`,
                )
                .join('')}
            </table>
          </td>
        </tr>

        <!-- Payment instructions -->
        <tr>
          <td style="padding:20px 48px 0;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background-color:#fff8f0;border:1px solid #f0e0cc;border-radius:4px;">
              <tr>
                <td style="padding:18px 24px;">
                  <p style="margin:0 0 8px;font-size:12px;font-weight:bold;letter-spacing:1px;
                             text-transform:uppercase;color:#c97a2c;font-family:Arial,sans-serif;">
                    How to Pay
                  </p>
                  <p style="margin:0;font-size:13px;color:#555555;line-height:1.8;font-family:Arial,sans-serif;">
                    Please make payment using the bank details provided by your account manager,
                    quoting invoice number <strong>${data.invoiceNumber}</strong> as your payment reference.
                    Your account will be activated within 24 hours of payment confirmation.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Sign off -->
        <tr>
          <td style="padding:32px 48px 40px;">
            <p style="margin:0;font-size:15px;color:#2c2c2c;line-height:1.8;">
              If you have any questions about this invoice, please contact us.
            </p>
            <p style="margin:24px 0 0;font-size:15px;color:#2c2c2c;line-height:1.9;">
              Kind regards,<br/>
              <strong style="color:#4B0082;font-size:16px;">${firmName}</strong>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#f2f0ed;border-top:1px solid #e0dbd4;padding:20px 48px;">
            <p style="margin:0;font-size:11px;color:#aaaaaa;line-height:1.8;font-family:Arial,sans-serif;text-align:center;">
              This is an official invoice from ${firmName}.<br/>
              &copy; ${year} ${firmName}. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
