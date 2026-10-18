import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';

// Certificate of Service — employment record letter issued on an
// employee's exit. Distinct from CertificatePdfService, which renders
// a Learning & Development course-completion certificate; the two
// share no data shape or purpose despite the similar name.
//
// Same established Lexora brand palette (purple/gold) used across the
// invoice, quote and purchase order PDFs, and the same letter-style
// treatment as the termination notice, since both are formal letters
// issued by the firm to the employee. The business name/logo shown is
// always the tenant's own; "Lexora" itself never appears on the page.
const PURPLE = '#4B0082';
const GOLD = '#c9a84c';
const INK = '#2c2c2c';
const MUTED = '#777777';

export interface EmploymentCertificateData {
  businessName: string;
  businessAddress: string | null;
  logoDataUrl: string | null;
  employeeName: string;
  jobTitle: string;
  startDate: Date;
  endDate: Date;
  signatoryName: string;
  signatoryTitle: string;
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

@Injectable()
export class EmploymentCertificatePdfService {
  async buildCertificatePdf(data: EmploymentCertificateData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 70 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const left = 70;
      const contentWidth = pageWidth - left * 2;

      // Thin gold accent bar down the left edge — the same identity
      // marker used on the invoice/quote/purchase-order PDFs. Redrawn
      // on every page so branding never silently drops off an
      // overflow page.
      doc.rect(0, 0, 6, doc.page.height).fill(GOLD);
      doc.fillColor(INK);

      // ── Letterhead: tenant's own logo if set, else their name in text ──
      let headY = 55;
      if (data.logoDataUrl) {
        try {
          const base64 = data.logoDataUrl.split(',')[1];
          if (base64) {
            doc.image(Buffer.from(base64, 'base64'), 0, headY, {
              width: 80,
              height: 40,
              fit: [80, 40],
              align: 'center',
            });
            headY += 48;
          } else {
            throw new Error('no base64 payload');
          }
        } catch {
          doc
            .font('Helvetica-Bold')
            .fontSize(12)
            .fillColor(PURPLE)
            .text(data.businessName.toUpperCase(), 0, headY, {
              align: 'center',
              width: pageWidth,
            });
          headY = doc.y + 2;
        }
      } else {
        doc
          .font('Helvetica-Bold')
          .fontSize(12)
          .fillColor(PURPLE)
          .text(data.businessName.toUpperCase(), 0, headY, {
            align: 'center',
            width: pageWidth,
          });
        headY = doc.y + 2;
      }
      if (data.businessAddress) {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(MUTED)
          .text(data.businessAddress, 0, headY, {
            align: 'center',
            width: pageWidth,
          });
        headY = doc.y;
      }

      doc.y = headY + 22;
      doc.x = left;

      doc
        .font('Helvetica-Bold')
        .fontSize(17)
        .fillColor(PURPLE)
        .text('CERTIFICATE OF SERVICE', left, doc.y, {
          align: 'center',
          width: contentWidth,
        });
      doc.moveDown(0.4);
      const ruleWidth = 160;
      const ruleX = (pageWidth - ruleWidth) / 2;
      doc
        .moveTo(ruleX, doc.y)
        .lineTo(ruleX + ruleWidth, doc.y)
        .lineWidth(2)
        .strokeColor(GOLD)
        .stroke();
      doc.moveDown(1.6);
      doc.x = left;

      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor(INK)
        .text(
          `This is to certify that ${data.employeeName} was employed by ${data.businessName} in the capacity of ${data.jobTitle} from ${fmtDate(data.startDate)} to ${fmtDate(data.endDate)}.`,
          left,
          doc.y,
          { align: 'justify', width: contentWidth },
        )
        .moveDown(0.9);

      doc
        .text(
          `During the period of employment, ${data.employeeName.split(' ')[0]} discharged the duties and responsibilities associated with the above position.`,
          left,
          doc.y,
          { align: 'justify', width: contentWidth },
        )
        .moveDown(0.9);

      doc
        .text(
          'This certificate is issued at the request of the above-named employee and in accordance with Article 26 of Law No. 66/2018 Governing Labour in Rwanda.',
          left,
          doc.y,
          { align: 'justify', width: contentWidth },
        )
        .moveDown(0.9);

      doc
        .text(
          'This certificate does not constitute a recommendation. It is a record of employment only.',
          left,
          doc.y,
          { align: 'justify', width: contentWidth },
        )
        .moveDown(3);

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(PURPLE)
        .text('Issued by:', left)
        .moveDown(0.75);
      doc.font('Helvetica-Bold').fillColor(INK).text(data.signatoryName, left);
      doc.font('Helvetica').fillColor(MUTED).text(data.signatoryTitle, left);
      doc.fillColor(INK).text(data.businessName, left).moveDown(1);
      doc.text(`Date: ${fmtDate(new Date())}`, left).moveDown(2);

      // doc
      //   .moveTo(left, doc.y)
      //   .lineTo(left + contentWidth, doc.y)
      //   .lineWidth(1)
      //   .strokeColor(GOLD)
      //   .stroke();
      // doc.moveDown(0.6);
      // doc.fontSize(9).fillColor(MUTED).text('Company stamp', left);

      doc.end();
    });
  }
}
