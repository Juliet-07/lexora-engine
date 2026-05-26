import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

export interface SigningCertificateData {
  // Letter details
  letterTitle: string;
  letterVersion: number;
  documentType: string;

  // Tenant details
  tenantBusinessName: string;
  tenantEmail: string;

  // Client/signer details
  clientName: string;
  clientEmail: string;
  signedByName: string; // name they typed at signing
  signedAt: Date;
  signedIpAddress: string | null;

  // Output path
  outputPath: string;
}

/**
 * Generates a signed certificate PDF and saves it to outputPath.
 * Returns the output path on success.
 *
 * The certificate contains:
 *  - Document title and version
 *  - Tenant and signer details
 *  - Date/time and IP of signing
 *  - Lexora platform watermark
 *
 * Uses pdfkit — lightweight, no browser required.
 * Install: npm install pdfkit @types/pdfkit
 */
export async function generateSigningCertificate(
  data: SigningCertificateData,
): Promise<string> {
  // Ensure output directory exists
  const outputDir = path.dirname(data.outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 60, bottom: 60, left: 72, right: 72 },
    });

    const stream = fs.createWriteStream(data.outputPath);
    doc.pipe(stream);

    // ── Colour palette ──────────────────────────────────────────
    const INDIGO = '#4B0082';
    const GOLD = '#C9A84C';
    const DARK = '#1a1a2e';
    const GREY = '#6b7280';
    const LIGHT_BG = '#f8f9fc';

    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - 144; // margins

    // ── Header bar ──────────────────────────────────────────────
    doc.rect(0, 0, pageWidth, 80).fill(INDIGO);

    doc
      .fillColor('#ffffff')
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('LEXORA', 72, 24, { align: 'left' });

    doc
      .fillColor('rgba(255,255,255,0.7)')
      .fontSize(10)
      .font('Helvetica')
      .text('Compliance & Engagement Platform', 72, 50, { align: 'left' });

    doc
      .fillColor('#ffffff')
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('SIGNING CERTIFICATE', 0, 32, {
        align: 'right',
        width: pageWidth - 72,
      });

    // ── Gold accent line ────────────────────────────────────────
    doc.rect(0, 80, pageWidth, 4).fill(GOLD);

    // ── Title section ───────────────────────────────────────────
    doc.moveDown(3);

    doc
      .fillColor(DARK)
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('Document Signing Certificate', { align: 'center' });

    doc
      .moveDown(0.4)
      .fillColor(GREY)
      .fontSize(11)
      .font('Helvetica')
      .text(
        'This certificate confirms that the document described below was reviewed and signed electronically.',
        { align: 'center' },
      );

    // ── Divider ─────────────────────────────────────────────────
    doc
      .moveDown(1.2)
      .moveTo(72, doc.y)
      .lineTo(pageWidth - 72, doc.y)
      .strokeColor(GOLD)
      .lineWidth(1.5)
      .stroke();

    doc.moveDown(1.2);

    // ── Helper: render a labelled row ───────────────────────────
    const row = (label: string, value: string) => {
      const y = doc.y;
      doc
        .fillColor(GREY)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(label.toUpperCase(), 72, y, { width: 160, continued: false });

      doc
        .fillColor(DARK)
        .fontSize(11)
        .font('Helvetica')
        .text(value, 240, y, { width: contentWidth - 168 });

      doc.moveDown(0.9);
    };

    // ── Helper: section heading ─────────────────────────────────
    const sectionHeading = (title: string) => {
      doc.moveDown(0.5);
      doc.rect(72, doc.y, contentWidth, 24).fill('#f0ebf8');

      doc
        .fillColor(INDIGO)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(title.toUpperCase(), 80, doc.y - 18, {
          width: contentWidth - 16,
        });

      doc.moveDown(1.2);
    };

    // ── Document Details ────────────────────────────────────────
    sectionHeading('Document Details');
    row('Document Title', data.letterTitle);
    row(
      'Document Type',
      data.documentType === 'engagement_letter'
        ? 'Engagement Letter'
        : 'Terms & Agreement',
    );
    row('Version', `Version ${data.letterVersion}`);
    row('Prepared By', data.tenantBusinessName);

    // ── Signer Details ──────────────────────────────────────────
    sectionHeading('Signer Details');
    row('Full Name', data.clientName);
    row('Email Address', data.clientEmail);
    row('Name Confirmed As', `"${data.signedByName}"`);

    // ── Signing Event ───────────────────────────────────────────
    sectionHeading('Signing Event');
    row(
      'Signed On',
      data.signedAt.toLocaleString('en-GB', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      }),
    );
    row('IP Address', data.signedIpAddress || 'Not captured');
    row('Signing Method', 'Electronic — Email Token Authentication');
    row('Platform', 'Lexora Compliance & Engagement Platform');

    // ── Legal note ──────────────────────────────────────────────
    doc.moveDown(1.5);
    doc.rect(72, doc.y, contentWidth, 70).fill('#fffbeb').stroke('#f59e0b');

    doc
      .fillColor('#92400e')
      .fontSize(9)
      .font('Helvetica')
      .text(
        'This certificate serves as evidence that the signer accessed the document via a secure, ' +
          'time-limited link delivered to their registered email address, reviewed the document, ' +
          'and confirmed their acceptance by entering their full name. ' +
          'This constitutes a valid electronic signature pursuant to applicable electronic ' +
          'transactions legislation.',
        80,
        doc.y - 60,
        { width: contentWidth - 16, lineGap: 3 },
      );

    // ── Footer ──────────────────────────────────────────────────
    const footerY = doc.page.height - 60;
    doc.rect(0, footerY - 10, pageWidth, 70).fill(INDIGO);

    doc
      .fillColor('rgba(255,255,255,0.6)')
      .fontSize(9)
      .font('Helvetica')
      .text(
        `Generated by Lexora · ${new Date().toLocaleDateString('en-GB')} · ${data.tenantBusinessName}`,
        0,
        footerY + 4,
        { align: 'center', width: pageWidth },
      );

    doc.end();

    stream.on('finish', () => resolve(data.outputPath));
    stream.on('error', reject);
  });
}
