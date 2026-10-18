import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';

export interface TerminationNoticeData {
  businessName: string;
  businessAddress: string | null;
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

      doc
        .fontSize(11)
        .fillColor('#4B0082')
        .text(data.businessName.toUpperCase(), { align: 'center' });
      if (data.businessAddress) {
        doc
          .fontSize(9)
          .fillColor('#777777')
          .text(data.businessAddress, { align: 'center' });
      }
      doc.moveDown(1.5);

      doc
        .fontSize(13)
        .fillColor('#000')
        .text('NOTICE OF TERMINATION OF EMPLOYMENT', {
          align: 'center',
          underline: true,
        })
        .moveDown(1.25);

      doc
        .fontSize(11)
        .fillColor('#2c2c2c')
        .text(`Date: ${fmtDate(data.initiatedDate)}`)
        .moveDown(0.5)
        .text(`To: ${data.employeeName}`)
        .text(`Position: ${data.jobTitle}`)
        .moveDown(1);

      doc.text(`Dear ${data.employeeName.split(' ')[0]},`).moveDown(0.75);

      doc
        .text(
          `We write to formally notify you that your employment with ${data.businessName} is terminated with effect from ${fmtDate(data.lastWorkingDay)}, subject to the notice period set out below.`,
          { align: 'justify' },
        )
        .moveDown(0.9);

      doc
        .fontSize(11)
        .fillColor('#000')
        .text('1. Grounds for termination', { continued: false })
        .fillColor('#2c2c2c');
      doc.moveDown(0.25);
      doc
        .text(
          `This termination is made on the grounds of ${data.category.toLowerCase().replace(/_/g, ' ')}, as set out in the proceedings initiated on ${fmtDate(data.initiatedDate)} and conducted in accordance with company policy and the Labour Law of Rwanda (Law No. 66/2018).`,
          { align: 'justify' },
        )
        .moveDown(0.9);

      doc.fillColor('#000').text('2. Notice period').fillColor('#2c2c2c');
      doc.moveDown(0.25);
      doc
        .text(
          `In accordance with Article 27 of Law No. 66/2018, you are entitled to a notice period of ${data.noticePeriodLabel}. Your last working day will be ${fmtDate(data.lastWorkingDay)}.`,
          { align: 'justify' },
        )
        .moveDown(0.9);

      doc.fillColor('#000').text('3. Final entitlements').fillColor('#2c2c2c');
      doc.moveDown(0.25);
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

      doc
        .fillColor('#000')
        .text('4. Post-termination obligations')
        .fillColor('#2c2c2c');
      doc.moveDown(0.25);
      doc
        .text(
          'You are reminded of your continuing obligations under the confidentiality and non-disclosure provisions of your employment contract, which survive termination.',
          { align: 'justify' },
        )
        .moveDown(0.9);

      doc.fillColor('#000').text('5. Right of appeal').fillColor('#2c2c2c');
      doc.moveDown(0.25);
      doc
        .text(
          `You have the right to appeal this decision in writing within ${data.appealWindowLabel} of receipt of this notice. Appeals should be addressed to ${data.signatoryName}.`,
          { align: 'justify' },
        )
        .moveDown(0.9);

      doc.fillColor('#000').text('6. Return of property').fillColor('#2c2c2c');
      doc.moveDown(0.25);
      doc
        .text(
          'Please return all company property, including IT equipment, access cards, and confidential documents, to the Office Manager on or before your last working day.',
          { align: 'justify' },
        )
        .moveDown(1.2);

      doc.text('We wish you well in your future endeavours.').moveDown(1.5);
      doc.text('Yours sincerely,').moveDown(1.5);
      doc
        .fontSize(11)
        .fillColor('#000')
        .text(data.signatoryName, { continued: false });
      doc.fillColor('#2c2c2c').text(data.signatoryTitle);
      doc.text(data.businessName).moveDown(1);

      doc
        .fontSize(9)
        .fillColor('#777777')
        .text(
          'cc: Employee file · RSSB notification · Labour inspector (if applicable)',
        );

      doc.end();
    });
  }
}
