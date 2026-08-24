import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import { ToolContractDocument_ } from '../schemas';

const INK = '#2c2c2c';
const MUTED = '#777777';
const RULE = '#dddddd';

// ── Real letterhead support — if the tenant has uploaded a real
// letterhead image, it's drawn at the top of the page exactly as
// they provided it. If not, this falls back to a plain text header
// (firm name only, no invented branding) rather than pretending a
// letterhead exists. HR's own ContractPdfService hardcodes a
// purple/gold bar for every tenant regardless of who they are —
// deliberately not copied here, since the whole point of this
// stage is that each tenant's real identity shows on their own
// documents. ────────────────────────────────────────────────────

@Injectable()
export class ToolContractPdfService {
  private drawHeader(
    doc: PDFKit.PDFDocument,
    firmName: string,
    title: string,
    letterheadPath: string | null,
  ) {
    if (letterheadPath && fs.existsSync(letterheadPath)) {
      try {
        doc.image(letterheadPath, 50, 30, { width: 200 });
        doc.y = 100;
      } catch {
        this.drawPlainHeader(doc, firmName, title);
      }
    } else {
      this.drawPlainHeader(doc, firmName, title);
    }
  }

  private drawPlainHeader(
    doc: PDFKit.PDFDocument,
    firmName: string,
    title: string,
  ) {
    doc
      .fillColor(INK)
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(firmName, 50, 40);
    doc.fillColor(MUTED).fontSize(11).font('Helvetica').text(title, 50, 60);
    doc
      .moveTo(50, 90)
      .lineTo(doc.page.width - 50, 90)
      .strokeColor(RULE)
      .stroke();
    doc.y = 105;
  }

  async buildSignedContractPdf(
    contract: ToolContractDocument_,
    firmName: string,
    letterheadPath: string | null,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.drawHeader(
        doc,
        firmName,
        'Fully Executed Agreement',
        letterheadPath,
      );

      doc
        .fillColor(INK)
        .font('Helvetica')
        .fontSize(11)
        .text(contract.renderedBody, 50, doc.y, {
          width: doc.page.width - 100,
          align: 'left',
          lineGap: 4,
        });

      if (doc.y > doc.page.height - 220) {
        doc.addPage();
      } else {
        doc.moveDown(3);
      }

      const sigTop = doc.y;
      const colWidth = (doc.page.width - 100) / 2;

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

      if (contract.tenantSignature?.stampImageData) {
        try {
          const base64 = contract.tenantSignature.stampImageData.split(',')[1];
          const imgBuffer = Buffer.from(base64, 'base64');
          doc.image(imgBuffer, rightX, tenantSigY + 16, { height: 60 });
        } catch {
          // A bad stamp image should never crash the whole PDF.
        }
      }

      doc
        .fontSize(8)
        .fillColor(MUTED)
        .font('Helvetica')
        .text(
          `${firmName} · Generated ${new Date().toLocaleDateString()}`,
          50,
          doc.page.height - 40,
          { width: doc.page.width - 100, align: 'center' },
        );

      doc.end();
    });
  }

  // Real PDF of the contract as it stands when sent for review/
  // signature — no signature blocks, since nobody has signed yet.
  // Attached to the send-for-signature email so the counterparty
  // has a real document to read, not just a link to click through.
  async buildDraftContractPdf(
    renderedBody: string,
    title: string,
    firmName: string,
    letterheadPath: string | null,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.drawHeader(doc, firmName, title, letterheadPath);

      doc
        .fillColor(INK)
        .font('Helvetica')
        .fontSize(11)
        .text(renderedBody, 50, doc.y, {
          width: doc.page.width - 100,
          align: 'left',
          lineGap: 4,
        });

      doc
        .fontSize(8)
        .fillColor(MUTED)
        .font('Helvetica')
        .text(
          `${firmName} · For review — not yet signed · Generated ${new Date().toLocaleDateString()}`,
          50,
          doc.page.height - 40,
          { width: doc.page.width - 100, align: 'center' },
        );

      doc.end();
    });
  }
}
