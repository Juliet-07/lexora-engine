import * as PDFDocument from 'pdfkit';
import {
  DocumentBranding,
  drawBrandFooter,
  drawDraftWatermark,
  formatDocDate,
  formatDocNumber,
  pdfFonts,
  tintOf,
  withBranding,
} from './branding.util';

// Same brand palette as the purchase order PDF, for one consistent
// document identity across everything the firm issues.
const INK = '#1a1a1a';
const MUTED = '#6b7280';

export interface QuotePdfData {
  ref: string;
  kind: 'Quote' | 'Proforma';
  clientName: string;
  title: string;
  description?: string;
  amount: number;
  vatPercent?: number;
  vatAmount?: number;
  totalAmount?: number;
  currency: string;
  issued: Date;
  expires: Date;
  termsAndConditions?: string;
  // Real tenant branding — never the platform's own name. Logo if
  // they've set one, business name as text either way, same
  // convention the purchase order PDF already established.
  firmName: string;
  firmAddressLines: string[];
  logoDataUrl: string | null;
  // Finance Settings → Document Branding (optional; defaults keep the original look).
  branding?: DocumentBranding;
  // A draft carries the DRAFT watermark when the tenant wants it.
  isDraft?: boolean;
}

export function buildQuotePdf(data: QuotePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const b = withBranding(data.branding);
    const PURPLE = b.headerColor;
    const GOLD = b.highlightColor;
    const ACCENT = b.accentColor;
    const PURPLE_TINT = tintOf(b.headerColor);
    const F = pdfFonts(b, 'body');
    const FH = pdfFonts(b, 'heading');
    const fmtDate = (d: Date | string) => formatDocDate(d, b.dateFormat);
    const fmtNumber = (n: number) => formatDocNumber(n, b.numberFormat);
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = pageWidth - 100;
    const rightColX = 340;
    const rightColW = contentWidth - (rightColX - 50);

    doc.rect(0, 0, 6, pageHeight).fill(GOLD);

    let rightY = 50;
    if (data.logoDataUrl) {
      try {
        const base64 = data.logoDataUrl.split(',')[1];
        if (base64) {
          const imgBuffer = Buffer.from(base64, 'base64');
          doc.image(imgBuffer, pageWidth - 50 - 90, rightY, {
            width: 90,
            align: 'right',
          });
          rightY += 60;
        }
      } catch {
        // malformed logo data — fall through without it
      }
    }
    if (!data.logoDataUrl) {
      doc
        .font(F.bold)
        .fontSize(13)
        .fillColor(INK)
        .text(data.firmName, rightColX, rightY, {
          width: rightColW,
          align: 'right',
        });
      rightY += 22;
    }

    doc
      .font(FH.bold)
      .fontSize(24)
      .fillColor(PURPLE)
      .text(data.kind.toUpperCase(), 50, 50);
    doc.moveDown(0.6);
    doc
      .font(F.bold)
      .fontSize(11)
      .fillColor(INK)
      .text(data.clientName, 50, doc.y);

    const metaRow = (label: string, value: string, y: number) => {
      doc
        .font(F.bold)
        .fontSize(9)
        .fillColor(INK)
        .text(label, rightColX, y, { width: rightColW, align: 'right' });
      doc
        .font(F.regular)
        .fontSize(9)
        .fillColor(INK)
        .text(value, rightColX, y + 12, { width: rightColW, align: 'right' });
      return y + 30;
    };
    rightY = metaRow(`${data.kind} number`, data.ref, rightY);
    rightY = metaRow('Issued', fmtDate(data.issued), rightY);
    rightY = metaRow('Valid until', fmtDate(data.expires), rightY);

    doc
      .font(F.bold)
      .fontSize(9)
      .fillColor(INK)
      .text(data.firmName, rightColX, rightY, {
        width: rightColW,
        align: 'right',
      });
    rightY += 12;
    if (b.showTagline && b.tagline) {
      doc
        .font(F.regular)
        .fontSize(8.5)
        .fillColor(MUTED)
        .text(b.tagline, rightColX, rightY, {
          width: rightColW,
          align: 'right',
        });
      rightY += 12;
    }
    data.firmAddressLines.forEach((line) => {
      doc
        .font(F.regular)
        .fontSize(9)
        .fillColor(MUTED)
        .text(line, rightColX, rightY, { width: rightColW, align: 'right' });
      rightY += 12;
    });

    doc.y = Math.max(doc.y, rightY) + 16;
    doc
      .moveTo(50, doc.y)
      .lineTo(50 + contentWidth, doc.y)
      .lineWidth(1.5)
      .strokeColor(GOLD)
      .stroke();
    doc.moveDown(1.4);

    const tableY = doc.y;
    doc.font(F.bold).fontSize(8).fillColor(PURPLE);
    doc.text('DESCRIPTION', 50, tableY, { width: contentWidth - 120 });
    doc.text(`AMOUNT ${data.currency}`, 50 + contentWidth - 120, tableY, {
      width: 120,
      align: 'right',
    });
    doc.y = tableY + 16;
    doc
      .moveTo(50, doc.y)
      .lineTo(50 + contentWidth, doc.y)
      .lineWidth(1)
      .strokeColor(GOLD)
      .stroke();
    doc.moveDown(0.8);

    const rowY = doc.y;
    doc
      .font(F.regular)
      .fontSize(10)
      .fillColor(INK)
      .text(data.title, 50, rowY, { width: contentWidth - 120 });
    doc.text(fmtNumber(data.amount), 50 + contentWidth - 120, rowY, {
      width: 120,
      align: 'right',
    });
    doc.y = Math.max(doc.y, rowY) + 20;

    if (data.description?.trim()) {
      doc
        .font(F.regular)
        .fontSize(9)
        .fillColor(MUTED)
        .text(data.description.trim(), 50, doc.y, {
          width: contentWidth - 120,
        });
      doc.moveDown(0.8);
    }

    doc
      .moveTo(50, doc.y)
      .lineTo(50 + contentWidth, doc.y)
      .lineWidth(1)
      .strokeColor(GOLD)
      .stroke();
    doc.moveDown(0.6);

    if (data.vatPercent) {
      doc
        .font(F.regular)
        .fontSize(10)
        .fillColor(INK)
        .text(`VAT (${data.vatPercent}%)`, 50, doc.y, {
          width: contentWidth - 120,
        });
      doc.text(
        fmtNumber(data.vatAmount ?? 0),
        50 + contentWidth - 120,
        doc.y - doc.currentLineHeight(),
        { width: 120, align: 'right' },
      );
      doc.moveDown(0.6);
    }

    doc
      .font(F.bold)
      .fontSize(11)
      .fillColor(ACCENT)
      .text(`TOTAL ${data.currency}`, 50, doc.y, { width: contentWidth - 120 });
    doc.text(
      fmtNumber(data.totalAmount ?? data.amount),
      50 + contentWidth - 120,
      doc.y - doc.currentLineHeight(),
      {
        width: 120,
        align: 'right',
      },
    );

    if (data.termsAndConditions?.trim()) {
      doc.moveDown(1.2);
      doc
        .moveTo(50, doc.y)
        .lineTo(50 + contentWidth, doc.y)
        .lineWidth(1)
        .strokeColor(GOLD)
        .stroke();
      doc.moveDown(0.5);
      doc
        .font(F.bold)
        .fontSize(9)
        .fillColor(PURPLE)
        .text('TERMS & CONDITIONS', 50, doc.y, { characterSpacing: 0.5 });
      doc.moveDown(0.3);
      doc
        .font(F.regular)
        .fontSize(9)
        .fillColor(MUTED)
        .text(data.termsAndConditions.trim(), 50, doc.y, {
          width: contentWidth,
          lineGap: 2,
        });
    }

    doc.moveDown(1.2);
    doc
      .font(F.regular)
      .fontSize(9)
      .fillColor(MUTED)
      .text(
        data.kind === 'Proforma'
          ? 'This proforma is for reference only and is not a demand for payment.'
          : `This quote is valid until ${fmtDate(data.expires)}. Prices are subject to change after this date.`,
        50,
        doc.y,
        { width: contentWidth },
      );

    drawBrandFooter(doc, b);
    if (data.isDraft && b.watermarkDrafts) drawDraftWatermark(doc);
    doc.end();
  });
}
