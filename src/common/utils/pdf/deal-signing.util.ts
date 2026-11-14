import * as PDFDocument from 'pdfkit';

// Pages added to a deal document when it is signed: the signature page that
// follows the text, and the separate signing certificate.

const NAVY = '#1f2a5a';
const GREY = '#6b7280';
const GOOD = '#067647';

export interface SignedSignatory {
  name: string;
  title: string;
  /** "Party A" / "Party B". */
  side: string;
  email: string;
  signed: boolean;
  method: string | null;
  /** The typed name, or a PNG data URL for a drawn signature. */
  data: string | null;
  signedAt: Date | null;
  ip: string | null;
  device: string | null;
  hash: string | null;
}

export interface SigningAuditLine {
  at: Date;
  text: string;
  ip: string | null;
}

export interface SigningPackData {
  businessName: string;
  /** The deal (or other record) the document belongs to; omitted if blank. */
  dealName: string;
  /** Label for `dealName` on the certificate — "Deal" unless set. */
  contextLabel?: string;
  documentName: string;
  reference: string;
  /** SHA-256 of the document text that was sent and signed. */
  hash: string;
  initiatedAt: Date | null;
  completedAt: Date | null;
  signatories: SignedSignatory[];
  audit: SigningAuditLine[];
}

const TZ = 'Africa/Kigali';
export const fmtCat = (d: Date | null | undefined): string =>
  d
    ? `${new Date(d).toLocaleString('en-GB', {
        timeZone: TZ,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })} CAT`
    : '—';

// What a browser says about itself, boiled down to "Chrome 119 / macOS".
export function describeDevice(ua: string | null): string | null {
  if (!ua) return null;
  const pick = (re: RegExp) => re.exec(ua)?.[1];
  const browser = pick(/Edg\/(\d+)/)
    ? `Edge ${pick(/Edg\/(\d+)/)}`
    : pick(/Firefox\/(\d+)/)
      ? `Firefox ${pick(/Firefox\/(\d+)/)}`
      : pick(/Chrome\/(\d+)/)
        ? `Chrome ${pick(/Chrome\/(\d+)/)}`
        : pick(/Version\/(\d+).*Safari/)
          ? `Safari ${pick(/Version\/(\d+).*Safari/)}`
          : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} / ${os}` : browser;
}

/** A drawn signature arrives as a PNG data URL; anything else is ignored. */
export function pngFromDataUrl(data: string | null): Buffer | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(data ?? '');
  return m ? Buffer.from(m[1], 'base64') : null;
}

function drawSignature(doc: any, s: SignedSignatory, x: number, w: number) {
  const top = doc.y;
  doc.rect(x, top, w, 62).lineWidth(0.5).strokeColor('#d0d5dd').stroke();
  const png = s.method === 'drawn' ? pngFromDataUrl(s.data) : null;
  if (png) {
    try {
      doc.image(png, x + 12, top + 6, { fit: [w - 24, 50] });
    } catch {
      doc
        .font('Times-Italic')
        .fontSize(22)
        .fillColor(NAVY)
        .text(s.name, x + 12, top + 20, { width: w - 24 });
    }
  } else if (s.data) {
    doc
      .font('Times-Italic')
      .fontSize(24)
      .fillColor(NAVY)
      .text(s.data, x + 12, top + 18, { width: w - 24, lineBreak: false });
  }
  doc.y = top + 68;
}

/** The signature page that follows the document's own text. */
export function drawSignaturePage(doc: any, data: SigningPackData) {
  doc.addPage();
  const x = doc.page.margins.left;
  const w = doc.page.width - x - doc.page.margins.right;
  doc
    .font('Helvetica-Bold')
    .fontSize(15)
    .fillColor('#000000')
    .text('Signatures', x, doc.page.margins.top, { width: w });
  doc.moveDown(0.3);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(GREY)
    .text(
      `${data.documentName}${data.reference ? ` · ${data.reference}` : ''}`,
      { width: w },
    );
  doc.moveDown(1);
  for (const s of data.signatories) {
    if (doc.y > doc.page.height - 190) doc.addPage();
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#000000')
      .text(`${s.side} — ${s.name}`, x, doc.y, { width: w });
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(GREY)
      .text(s.title || 'Authorised signatory', x, doc.y, { width: w });
    doc.moveDown(0.3);
    if (s.signed) {
      drawSignature(doc, s, x, w);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(GREY)
        .text(
          `Signed ${fmtCat(s.signedAt)}${s.ip ? ` · IP ${s.ip}` : ''}`,
          x,
          doc.y,
          { width: w },
        );
    } else {
      doc
        .font('Helvetica-Oblique')
        .fontSize(9)
        .fillColor(GREY)
        .text('Awaiting signature', x, doc.y, { width: w });
    }
    doc.moveDown(1.2);
  }
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(GREY)
    .text(`Document fingerprint (SHA-256): ${data.hash}`, x, doc.y, {
      width: w,
    });
}

/** The certificate of signing: who signed, when, from where, and the trail. */
export function buildSigningCertificate(
  data: SigningPackData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const x = 50;
    const w = doc.page.width - 100;

    doc.rect(0, 0, doc.page.width, 84).fill(NAVY);
    doc
      .fillColor('#ffffff')
      .font('Helvetica')
      .fontSize(9)
      .text('CERTIFICATE OF SIGNING', x, 26, { characterSpacing: 1.5 });
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(data.documentName, x, 42, { width: w });
    doc.fillColor('#000000');
    doc.y = 108;

    const row = (label: string, value: string) => {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(GREY)
        .text(label, x, doc.y, { continued: false, width: 130 });
      const y = doc.y - 11;
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#000000')
        .text(value, x + 140, y, { width: w - 140 });
      doc.moveDown(0.4);
    };
    if (data.dealName) row(data.contextLabel ?? 'Deal', data.dealName);
    row('Document', data.documentName);
    if (data.reference) row('Reference', data.reference);
    row('Prepared by', data.businessName);
    row('Signing initiated', fmtCat(data.initiatedAt));
    row(
      'Completed',
      data.completedAt ? fmtCat(data.completedAt) : 'In progress',
    );
    row('Document fingerprint', data.hash);

    doc.moveDown(0.8);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(NAVY)
      .text('Signatories', x);
    doc.moveDown(0.4);
    for (const s of data.signatories) {
      if (doc.y > doc.page.height - 170) doc.addPage();
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#000000')
        .text(`${s.name}  ·  ${s.side}`, x, doc.y, { width: w });
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(GREY)
        .text(`${s.title || 'Authorised signatory'} · ${s.email}`, x, doc.y, {
          width: w,
        });
      if (s.signed) {
        doc
          .fillColor(GOOD)
          .text(
            `Signed ${fmtCat(s.signedAt)} · ${s.method === 'drawn' ? 'drawn' : 'typed'} signature`,
            x,
            doc.y,
            { width: w },
          );
        doc
          .fillColor(GREY)
          .text(
            `IP ${s.ip ?? '—'} · ${s.device ?? 'device unknown'}`,
            x,
            doc.y,
            { width: w },
          );
        if (s.hash) {
          doc.text(`Fingerprint at signing: ${s.hash}`, x, doc.y, { width: w });
        }
      } else {
        doc.fillColor('#b54708').text('Not yet signed', x, doc.y, { width: w });
      }
      doc.moveDown(0.8);
    }

    doc.moveDown(0.4);
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(NAVY)
      .text('Audit trail', x);
    doc.moveDown(0.4);
    for (const a of data.audit) {
      if (doc.y > doc.page.height - 70) doc.addPage();
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(GREY)
        .text(`${fmtCat(a.at)}${a.ip ? `  ·  IP ${a.ip}` : ''}`, x, doc.y, {
          width: w,
        });
      doc
        .fillColor('#000000')
        .fontSize(9.5)
        .text(a.text, x, doc.y, { width: w });
      doc.moveDown(0.35);
    }
    doc.moveDown(1);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(GREY)
      .text('Generated by Lexora', x, doc.y, { width: w, align: 'center' });
    doc.end();
  });
}
