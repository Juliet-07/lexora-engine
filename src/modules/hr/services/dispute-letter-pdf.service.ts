import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';

export interface SuspensionLetterData {
  employeeName: string;
  jobTitle: string;
  caseNumber: string;
  businessName: string;
  notes: string | null;
  issuedDate: Date;
}

@Injectable()
export class DisputeLetterPdfService {
  async buildSuspensionLetterPdf(data: SuspensionLetterData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 60 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const dateStr = data.issuedDate.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      doc
        .fontSize(16)
        .fillColor('#4B0082')
        .text(data.businessName, { align: 'left' })
        .moveDown(1.5);

      doc.fontSize(11).fillColor('#2c2c2c').text(dateStr).moveDown(1);

      doc
        .fontSize(13)
        .fillColor('#000')
        .text('NOTICE OF SUSPENSION', { underline: true })
        .moveDown(1);

      doc
        .fontSize(11)
        .fillColor('#2c2c2c')
        .text(`Dear ${data.employeeName},`)
        .moveDown(0.75)
        .text(
          `This letter serves as formal notice that, following the review of Case ${data.caseNumber}, you have been suspended from your position as ${data.jobTitle}, effective immediately.`,
          { align: 'justify' },
        )
        .moveDown(0.75);

      if (data.notes) {
        doc.text('Details:').moveDown(0.25);
        doc.text(data.notes, { align: 'justify' }).moveDown(0.75);
      }

      doc
        .text(
          'Please contact HR for further information regarding the terms and duration of this suspension.',
          { align: 'justify' },
        )
        .moveDown(2);

      doc.text('Sincerely,').moveDown(2);
      doc.text('Human Resources');
      doc.text(data.businessName);

      doc.end();
    });
  }
}
