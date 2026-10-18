import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';

// Certificate of Service — employment record letter issued on an
// employee's exit. Distinct from CertificatePdfService, which renders
// a Learning & Development course-completion certificate; the two
// share no data shape or purpose despite the similar name.
export interface EmploymentCertificateData {
  businessName: string;
  businessAddress: string | null;
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

      doc
        .fontSize(12)
        .fillColor('#4B0082')
        .text(data.businessName.toUpperCase(), { align: 'center' });
      if (data.businessAddress) {
        doc
          .fontSize(9)
          .fillColor('#777777')
          .text(data.businessAddress, { align: 'center' });
      }
      doc.moveDown(2);

      doc
        .fontSize(15)
        .fillColor('#000')
        .text('CERTIFICATE OF SERVICE', { align: 'center', underline: true })
        .moveDown(2);

      doc
        .fontSize(11)
        .fillColor('#2c2c2c')
        .text(
          `This is to certify that ${data.employeeName} was employed by ${data.businessName} in the capacity of ${data.jobTitle} from ${fmtDate(data.startDate)} to ${fmtDate(data.endDate)}.`,
          { align: 'justify' },
        )
        .moveDown(0.9);

      doc
        .text(
          `During the period of employment, ${data.employeeName.split(' ')[0]} discharged the duties and responsibilities associated with the above position.`,
          { align: 'justify' },
        )
        .moveDown(0.9);

      doc
        .text(
          'This certificate is issued at the request of the above-named employee and in accordance with Article 26 of Law No. 66/2018 Governing Labour in Rwanda.',
          { align: 'justify' },
        )
        .moveDown(0.9);

      doc
        .text(
          'This certificate does not constitute a recommendation. It is a record of employment only.',
          {
            align: 'justify',
          },
        )
        .moveDown(3);

      doc.fillColor('#000').text('Issued by:').moveDown(0.75);
      doc.text(data.signatoryName);
      doc.fillColor('#2c2c2c').text(data.signatoryTitle);
      doc.text(data.businessName).moveDown(1);
      doc.text(`Date: ${fmtDate(new Date())}`).moveDown(2);

      doc.fontSize(9).fillColor('#777777').text('Company stamp');

      doc.end();
    });
  }
}
