import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';

const PURPLE = '#4B0082';
const GOLD = '#c9a84c';
const INK = '#2c2c2c';
const MUTED = '#777777';

@Injectable()
export class CertificatePdfService {
  async buildCertificatePdf(data: {
    employeeName: string;
    courseTitle: string;
    score: number;
    completedAt: Date;
    businessName: string;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 0,
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { width, height } = doc.page;

      doc
        .rect(20, 20, width - 40, height - 40)
        .lineWidth(2)
        .stroke(GOLD);
      doc
        .rect(30, 30, width - 60, height - 60)
        .lineWidth(0.5)
        .stroke(PURPLE);

      doc
        .fillColor(GOLD)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(data.businessName.toUpperCase(), 0, 70, {
          align: 'center',
          characterSpacing: 3,
        });

      doc
        .fillColor(PURPLE)
        .fontSize(32)
        .font('Helvetica-Bold')
        .text('Certificate of Completion', 0, 110, { align: 'center' });

      doc
        .fillColor(MUTED)
        .fontSize(12)
        .font('Helvetica')
        .text('This certifies that', 0, 175, { align: 'center' });

      doc
        .fillColor(INK)
        .fontSize(26)
        .font('Helvetica-Bold')
        .text(data.employeeName, 0, 200, { align: 'center' });

      doc
        .fillColor(MUTED)
        .fontSize(12)
        .font('Helvetica')
        .text('has successfully completed', 0, 245, { align: 'center' });

      doc
        .fillColor(INK)
        .fontSize(20)
        .font('Helvetica-Bold')
        .text(data.courseTitle, 60, 270, {
          align: 'center',
          width: width - 120,
        });

      doc
        .fillColor(MUTED)
        .fontSize(11)
        .font('Helvetica')
        .text(
          `Score: ${data.score}%   ·   Completed ${data.completedAt.toLocaleDateString()}`,
          0,
          320,
          { align: 'center' },
        );

      doc
        .fontSize(9)
        .fillColor(MUTED)
        .text(`Issued by ${data.businessName}`, 0, height - 60, {
          align: 'center',
        });

      doc.end();
    });
  }
}
