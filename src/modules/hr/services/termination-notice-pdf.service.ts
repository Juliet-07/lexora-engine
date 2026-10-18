import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';

// The established Lexora brand palette — same purple/gold pairing
// already used across the invoice, quote and purchase order PDFs —
// so this notice looks like it came from the same system as
// everything else the firm issues. The business name/logo shown is
// always the tenant's own; "Lexora" itself never appears on the page.
const PURPLE = '#4B0082';
const GOLD = '#c9a84c';
const INK = '#2c2c2c';
const MUTED = '#777777';

export interface TerminationNoticeData {
  businessName: string;
  businessAddress: string | null;
  logoDataUrl?: string | null;
  employeeName: string;
  jobTitle: string;
  category: string;
  initiatedDate: Date;
  lastWorkingDay: Date;
  noticePeriodLabel: string;
  signatoryName: string;
  signatoryTitle: string;
  appealWindowLabel: string;
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

@Injectable()
export class TerminationNoticePdfService {
  async buildNoticePdf(data: TerminationNoticeData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 60 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const left = 60;
      const contentWidth = pageWidth - left * 2;

      // Thin gold accent bar down the left edge — the same identity
      // marker used on the invoice/quote/purchase-order PDFs. Redrawn
      // on every page (a long notice can spill past page one) so the
      // branding never silently drops off an overflow page.
      doc.rect(0, 0, 6, doc.page.height).fill(GOLD);
      doc.fillColor(INK);

      // ── Letterhead: tenant's own logo if set, else their name in text ──
      let headY = 50;
      if (data.logoDataUrl) {
        try {
          const base64 = data.logoDataUrl.split(',')[1];
          if (base64) {
            doc.image(Buffer.from(base64, 'base64'), left, headY, {
              width: 80,
              height: 40,
              fit: [80, 40],
            });
            headY += 48;
          } else {
            throw new Error('no base64 payload');
          }
        } catch {
          doc
            .font('Helvetica-Bold')
            .fontSize(13)
            .fillColor(PURPLE)
            .text(data.businessName.toUpperCase(), left, headY, {
              width: contentWidth,
            });
          headY = doc.y + 2;
        }
      } else {
        doc
          .font('Helvetica-Bold')
          .fontSize(13)
          .fillColor(PURPLE)
          .text(data.businessName.toUpperCase(), left, headY, {
            width: contentWidth,
          });
        headY = doc.y + 2;
      }
      if (data.businessAddress) {
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor(MUTED)
          .text(data.businessAddress, left, headY, { width: contentWidth });
        headY = doc.y;
      }

      doc.y = headY + 18;
      doc.x = left;

      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor(PURPLE)
        .text('NOTICE OF TERMINATION OF EMPLOYMENT', left, doc.y, {
          align: 'center',
          width: contentWidth,
        });
      doc.moveDown(0.4);
      doc
        .moveTo(left, doc.y)
        .lineTo(left + contentWidth, doc.y)
        .lineWidth(1.5)
        .strokeColor(GOLD)
        .stroke();
      doc.moveDown(1.1);
      doc.x = left;

      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor(INK)
        .text(`Date: ${fmtDate(data.initiatedDate)}`, left, doc.y)
        .moveDown(0.5)
        .text(`To: ${data.employeeName}`, left)
        .text(`Position: ${data.jobTitle}`, left)
        .moveDown(1);

      doc.text(`Dear ${data.employeeName.split(' ')[0]},`, left).moveDown(0.75);

      doc
        .text(
          `We write to formally notify you that your employment with ${data.businessName} is terminated with effect from ${fmtDate(data.lastWorkingDay)}, subject to the notice period set out below.`,
          { align: 'justify' },
        )
        .moveDown(0.9);

      const heading = (text: string) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor(PURPLE)
          .text(text, left);
        doc.font('Helvetica').fillColor(INK);
        doc.moveDown(0.25);
      };

      heading('1. Grounds for termination');
      doc
        .text(
          `This termination is made on the grounds of ${data.category.toLowerCase().replace(/_/g, ' ')}, as set out in the proceedings initiated on ${fmtDate(data.initiatedDate)} and conducted in accordance with company policy and the Labour Law of Rwanda (Law No. 66/2018).`,
          { align: 'justify' },
        )
        .moveDown(0.9);

      heading('2. Notice period');
      doc
        .text(
          `In accordance with Article 27 of Law No. 66/2018, you are entitled to a notice period of ${data.noticePeriodLabel}. Your last working day will be ${fmtDate(data.lastWorkingDay)}.`,
          { align: 'justify' },
        )
        .moveDown(0.9);

      heading('3. Final entitlements');
      doc
        .text('Upon your departure, you will receive payment for:', {
          align: 'justify',
        })
        .moveDown(0.2);
      doc.text('(a) Pro-rata salary to your last working day;');
      doc.text('(b) Accrued but untaken annual leave;');
      doc.text(
        '(c) Any pro-rata bonus entitlements per your contract of employment;',
      );
      doc.text('(d) Reimbursement of verified outstanding expenses.');
      doc.moveDown(0.5);
      doc
        .text(
          'Any amounts owed by you to the company (salary advances, equipment) will be deducted from your final pay in accordance with Article 82.',
          { align: 'justify' },
        )
        .moveDown(0.9);

      heading('4. Post-termination obligations');
      doc
        .text(
          'You are reminded of your continuing obligations under the confidentiality and non-disclosure provisions of your employment contract, which survive termination.',
          { align: 'justify' },
        )
        .moveDown(0.9);

      heading('5. Right of appeal');
      doc
        .text(
          `You have the right to appeal this decision in writing within ${data.appealWindowLabel} of receipt of this notice. Appeals should be addressed to ${data.signatoryName}.`,
          { align: 'justify' },
        )
        .moveDown(0.9);

      heading('6. Return of property');
      doc
        .text(
          'Please return all company property, including IT equipment, access cards, and confidential documents, to the Office Manager on or before your last working day.',
          { align: 'justify' },
        )
        .moveDown(0.9);

      doc.text('We wish you well in your future endeavours.').moveDown(0.8);
      doc.text('Yours sincerely,').moveDown(0.8);
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(INK)
        .text(data.signatoryName, left);
      doc.font('Helvetica').fillColor(MUTED).text(data.signatoryTitle, left);
      doc.fillColor(INK).text(data.businessName, left).moveDown(0.8);

      // doc
      //   .moveTo(left, doc.y)
      //   .lineTo(left + contentWidth, doc.y)
      //   .lineWidth(1)
      //   .strokeColor(GOLD)
      //   .stroke();
      // doc.moveDown(0.5);
      // doc
      //   .font('Helvetica')
      //   .fontSize(9)
      //   .fillColor(MUTED)
      //   .text(
      //     'cc: Employee file · RSSB notification · Labour inspector (if applicable)',
      //     left,
      //   );

      doc.end();
    });
  }
}
