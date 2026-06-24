export interface SignedContractCopyEmailData {
  to: string;
  signerName: string;
  contractBody: string;
  signerSignatureName: string;
  signerSignedAt: Date;
  tenantSignatureName: string;
  tenantSignedAt: Date;
  tenantSignatureImageData: string | null;
  tenantStampImageData: string | null;
}

export function signedContractCopyTemplate(data: SignedContractCopyEmailData): {
  subject: string;
  html: string;
} {
  const year = new Date().getFullYear();
  const firmName = process.env.FIRM_NAME || 'Lexora';

  const subject = `Your fully executed agreement`;

  const fmt = (d: Date) =>
    new Date(d).toLocaleString('en-US', {
      dateStyle: 'long',
      timeStyle: 'short',
    });

  const tenantSigBlock = data.tenantSignatureImageData
    ? `<img src="${data.tenantSignatureImageData}" alt="Signature" style="max-height:60px;display:block;margin-bottom:6px;" />`
    : `<p style="font-family:'Georgia',serif;font-style:italic;font-size:18px;margin:0 0 6px;">${data.tenantSignatureName}</p>`;

  const stampBlock = data.tenantStampImageData
    ? `<img src="${data.tenantStampImageData}" alt="Company stamp" style="max-height:80px;margin-top:8px;" />`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Fully Executed Agreement</title>
</head>
<body style="margin:0;padding:0;background-color:#f2f0ed;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f0ed;padding:48px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background-color:#ffffff;border:1px solid #ddd8d0;border-radius:6px;overflow:hidden;">
 
        <tr>
          <td style="background-color:#4B0082;padding:32px 48px 28px;">
            <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;
                       color:#c9a84c;font-family:Arial,sans-serif;">${firmName}</p>
            <h1 style="margin:0;font-size:22px;font-weight:normal;color:#ffffff;
                        font-family:'Georgia',serif;line-height:1.4;">
              Fully executed agreement
            </h1>
          </td>
        </tr>
        <tr><td style="background-color:#c9a84c;height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>
 
        <tr>
          <td style="padding:40px 48px 0;">
            <p style="margin:0 0 18px;font-size:15px;color:#2c2c2c;line-height:1.8;">
              Dear <strong>${data.signerName}</strong>,
            </p>
            <p style="margin:0 0 18px;font-size:15px;color:#2c2c2c;line-height:1.8;">
              Both parties have now signed this agreement. Please find the fully executed copy below
              for your records.
            </p>
          </td>
        </tr>
 
        <tr>
          <td style="padding:0 48px;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background-color:#f8f6f1;border:1px solid #e0dbd4;border-radius:3px;">
              <tr>
                <td style="padding:24px 28px;font-family:Arial,sans-serif;font-size:13px;
                           color:#2c2c2c;line-height:1.7;white-space:pre-wrap;">
                  ${data.contractBody}
                </td>
              </tr>
            </table>
          </td>
        </tr>
 
        <tr>
          <td style="padding:32px 48px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="50%" style="vertical-align:top;padding-right:16px;">
                  <p style="margin:0 0 8px;font-size:11px;letter-spacing:2px;text-transform:uppercase;
                             color:#888888;font-family:Arial,sans-serif;">Signed by</p>
                  <p style="font-family:'Georgia',serif;font-style:italic;font-size:18px;margin:0 0 6px;">
                    ${data.signerSignatureName}
                  </p>
                  <p style="margin:0;font-size:11px;color:#777777;font-family:Arial,sans-serif;">
                    ${fmt(data.signerSignedAt)}
                  </p>
                </td>
                <td width="50%" style="vertical-align:top;">
                  <p style="margin:0 0 8px;font-size:11px;letter-spacing:2px;text-transform:uppercase;
                             color:#888888;font-family:Arial,sans-serif;">Countersigned by</p>
                  ${tenantSigBlock}
                  <p style="margin:0;font-size:11px;color:#777777;font-family:Arial,sans-serif;">
                    ${fmt(data.tenantSignedAt)}
                  </p>
                  ${stampBlock}
                </td>
              </tr>
            </table>
          </td>
        </tr>
 
        <tr>
          <td style="padding:32px 48px 40px;">
            <p style="margin:0;font-size:13px;color:#777777;line-height:1.8;font-family:Arial,sans-serif;">
              This email and its contents serve as your copy of the fully executed agreement. Please
              retain it for your records.
            </p>
          </td>
        </tr>
 
        <tr>
          <td style="background-color:#f2f0ed;border-top:1px solid #e0dbd4;padding:20px 48px;">
            <p style="margin:0;font-size:11px;color:#aaaaaa;line-height:1.8;
                       font-family:Arial,sans-serif;text-align:center;">
              Powered by ${firmName} &copy; ${year}
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
