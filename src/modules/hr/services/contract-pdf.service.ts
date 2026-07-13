import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { ContractDocument } from '../schemas/contract.schema';

const PURPLE = '#4B0082';
const GOLD = '#c9a84c';
const INK = '#2c2c2c';
const MUTED = '#777777';

@Injectable()
export class ContractPdfService {
  async buildSignedContractPdf(
    contract: ContractDocument,
    firmName: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header bar
      doc.rect(0, 0, doc.page.width, 90).fill(PURPLE);
      doc
        .fillColor(GOLD)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(firmName.toUpperCase(), 50, 28, { characterSpacing: 2 });
      doc
        .fillColor('#ffffff')
        .fontSize(18)
        .font('Helvetica')
        .text('Fully Executed Agreement', 50, 44);

      doc.moveDown(4);
      doc.y = 110;

      // Document body
      doc
        .fillColor(INK)
        .font('Helvetica')
        .fontSize(11)
        .text(contract.renderedBody, 50, doc.y, {
          width: doc.page.width - 100,
          align: 'left',
          lineGap: 4,
        });

      // Signature blocks — start a fresh page if already deep into
      // the document, so signatures don't get cramped against a
      // long contract body
      if (doc.y > doc.page.height - 220) {
        doc.addPage();
      } else {
        doc.moveDown(3);
      }

      const sigTop = doc.y;
      const colWidth = (doc.page.width - 100) / 2;

      // Left column — the signer
      doc
        .fontSize(9)
        .fillColor(MUTED)
        .font('Helvetica-Bold')
        .text('SIGNED BY', 50, sigTop, { characterSpacing: 1 });
      doc
        .fontSize(15)
        .fillColor(INK)
        .font('Helvetica-Oblique')
        .text(contract.signature?.signerName ?? '—', 50, sigTop + 16);
      doc
        .fontSize(9)
        .fillColor(MUTED)
        .font('Helvetica')
        .text(
          contract.signature
            ? new Date(contract.signature.signedAt).toLocaleString()
            : '',
          50,
          sigTop + 40,
        );

      // Right column — the tenant
      const rightX = 50 + colWidth + 20;
      doc
        .fontSize(9)
        .fillColor(MUTED)
        .font('Helvetica-Bold')
        .text('COUNTERSIGNED BY', rightX, sigTop, { characterSpacing: 1 });

      let tenantSigY = sigTop + 16;
      if (contract.tenantSignature?.signatureImageData) {
        try {
          const base64 =
            contract.tenantSignature.signatureImageData.split(',')[1];
          const imgBuffer = Buffer.from(base64, 'base64');
          doc.image(imgBuffer, rightX, tenantSigY, { height: 40 });
          tenantSigY += 48;
        } catch {
          // Malformed stored image data falls back to typed name
          // rather than crashing the whole PDF generation.
          doc
            .fontSize(15)
            .fillColor(INK)
            .font('Helvetica-Oblique')
            .text(
              contract.tenantSignature?.signerName ?? '—',
              rightX,
              tenantSigY,
            );
          tenantSigY += 24;
        }
      } else {
        doc
          .fontSize(15)
          .fillColor(INK)
          .font('Helvetica-Oblique')
          .text(
            contract.tenantSignature?.signerName ?? '—',
            rightX,
            tenantSigY,
          );
        tenantSigY += 24;
      }

      doc
        .fontSize(9)
        .fillColor(MUTED)
        .font('Helvetica')
        .text(
          contract.tenantSignature
            ? new Date(contract.tenantSignature.signedAt).toLocaleString()
            : '',
          rightX,
          tenantSigY,
        );

      // Stamp, if present
      if (contract.tenantSignature?.stampImageData) {
        try {
          const base64 = contract.tenantSignature.stampImageData.split(',')[1];
          const imgBuffer = Buffer.from(base64, 'base64');
          doc.image(imgBuffer, rightX, tenantSigY + 16, { height: 60 });
        } catch {
          // A bad stamp image should never crash the whole PDF —
          // just silently omit it.
        }
      }

      // Footer
      doc
        .fontSize(8)
        .fillColor(MUTED)
        .font('Helvetica')
        .text(
          `Powered by ${firmName} · Generated ${new Date().toLocaleDateString()}`,
          50,
          doc.page.height - 40,
          {
            width: doc.page.width - 100,
            align: 'center',
          },
        );

      doc.end();
    });
  }

  async buildIssuedLetterPdf(
    contract: ContractDocument,
    firmName: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.rect(0, 0, doc.page.width, 90).fill(PURPLE);
      doc
        .fillColor(GOLD)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(firmName.toUpperCase(), 50, 28, { characterSpacing: 2 });
      doc
        .fillColor('#ffffff')
        .fontSize(18)
        .font('Helvetica')
        .text(contract.templateName || 'Official Document', 50, 44);

      doc.moveDown(4);
      doc.y = 110;

      doc
        .fillColor(INK)
        .font('Helvetica')
        .fontSize(11)
        .text(contract.renderedBody, 50, doc.y, {
          width: doc.page.width - 100,
          align: 'left',
          lineGap: 4,
        });

      if (doc.y > doc.page.height - 180) {
        doc.addPage();
      } else {
        doc.moveDown(3);
      }

      const sigTop = doc.y;

      doc
        .fontSize(9)
        .fillColor(MUTED)
        .font('Helvetica-Bold')
        .text('ISSUED BY', 50, sigTop, { characterSpacing: 1 });

      let sigY = sigTop + 16;
      if (contract.tenantSignature?.signatureImageData) {
        try {
          const base64 =
            contract.tenantSignature.signatureImageData.split(',')[1];
          const imgBuffer = Buffer.from(base64, 'base64');
          doc.image(imgBuffer, 50, sigY, { height: 40 });
          sigY += 48;
        } catch {
          doc
            .fontSize(15)
            .fillColor(INK)
            .font('Helvetica-Oblique')
            .text(contract.tenantSignature?.signerName ?? '—', 50, sigY);
          sigY += 24;
        }
      } else {
        doc
          .fontSize(15)
          .fillColor(INK)
          .font('Helvetica-Oblique')
          .text(contract.tenantSignature?.signerName ?? '—', 50, sigY);
        sigY += 24;
      }

      doc
        .fontSize(9)
        .fillColor(MUTED)
        .font('Helvetica')
        .text(
          contract.tenantSignature
            ? new Date(contract.tenantSignature.signedAt).toLocaleString()
            : '',
          50,
          sigY,
        );

      if (contract.tenantSignature?.stampImageData) {
        try {
          const base64 = contract.tenantSignature.stampImageData.split(',')[1];
          const imgBuffer = Buffer.from(base64, 'base64');
          doc.image(imgBuffer, 50, sigY + 16, { height: 60 });
        } catch {
          // A bad stamp image should never crash the whole PDF.
        }
      }

      doc
        .fontSize(8)
        .fillColor(MUTED)
        .font('Helvetica')
        .text(
          `Issued by ${firmName} · ${new Date().toLocaleDateString()}`,
          50,
          doc.page.height - 40,
          { width: doc.page.width - 100, align: 'center' },
        );

      doc.end();
    });
  }
}
