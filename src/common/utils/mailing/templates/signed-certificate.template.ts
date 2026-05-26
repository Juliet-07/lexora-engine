export interface SignedCertificateEmailData {
  toClient: string;
  toTenant: string;
  clientName: string;
  tenantBusinessName: string;
  letterTitle: string;
  signedAt: Date;
  certificateUrl: string;
}

export function signedCertificateTemplate(data: SignedCertificateEmailData): {
  subject: string;
  html: string;
} {
  const signedStr = data.signedAt.toLocaleString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const subject = `Signed document — ${data.letterTitle}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <tr>
            <td style="background:linear-gradient(135deg,#4B0082,#6A0DAD);padding:36px 40px;text-align:center;">
              <div style="font-size:40px;margin-bottom:8px;">✍️</div>
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Document Signed</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">
                ${data.tenantBusinessName}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;color:#1a1a2e;font-size:15px;line-height:1.7;">
                This email confirms that <strong>${data.clientName}</strong> has
                reviewed and signed the following document with
                <strong>${data.tenantBusinessName}</strong>.
              </p>

              <div style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:10px;
                          padding:20px;margin-bottom:24px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="color:#6d28d9;font-size:12px;font-weight:bold;
                                text-transform:uppercase;padding-bottom:12px;letter-spacing:0.8px;">
                      Signing Details
                    </td>
                  </tr>
                  <tr>
                    <td style="color:#4a4a6a;font-size:13px;padding-bottom:8px;">
                      <strong>Document:</strong> ${data.letterTitle}
                    </td>
                  </tr>
                  <tr>
                    <td style="color:#4a4a6a;font-size:13px;padding-bottom:8px;">
                      <strong>Signed by:</strong> ${data.clientName}
                    </td>
                  </tr>
                  <tr>
                    <td style="color:#4a4a6a;font-size:13px;">
                      <strong>Date & time:</strong> ${signedStr}
                    </td>
                  </tr>
                </table>
              </div>

              <p style="margin:0 0 20px;color:#4a4a6a;font-size:14px;line-height:1.6;">
                Your signed certificate is available at the link below.
                We recommend saving a copy for your records.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#4B0082,#6A0DAD);
                              border-radius:8px;padding:12px 32px;text-align:center;">
                    <a href="${data.certificateUrl}"
                       style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">
                      Download Signed Certificate →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#888;font-size:11px;text-align:center;word-break:break-all;">
                ${data.certificateUrl}
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#f8f9fc;padding:20px 40px;border-top:1px solid #e8e8f0;
                        text-align:center;">
              <p style="margin:0;color:#aaa;font-size:11px;">
                Sent via Lexora · ${data.tenantBusinessName}
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
