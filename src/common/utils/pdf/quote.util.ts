import * as PDFDocument from 'pdfkit';

// Same brand palette as the purchase order PDF, for one consistent
// document identity across everything the firm issues.
const PURPLE = '#4B0082';
const GOLD = '#c9a84c';
const INK = '#1a1a1a';
const MUTED = '#6b7280';

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const fmtNumber = (n: number) =>
  n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export interface QuotePdfData {
  ref: string;
  kind: 'Quote' | 'Proforma';
  clientName: string;
  title: string;
  amount: number;
  currency: string;
  issued: Date;
  expires: Date;
  // Real tenant branding — never the platform's own name. Logo if
  // they've set one, business name as text either way, same
  // convention the purchase order PDF already established.
  firmName: string;
  firmAddressLines: string[];
  logoDataUrl: string | null;
}

export function buildQuotePdf(data: QuotePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
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
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor(INK)
        .text(data.firmName, rightColX, rightY, {
          width: rightColW,
          align: 'right',
        });
      rightY += 22;
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(24)
      .fillColor(PURPLE)
      .text(data.kind.toUpperCase(), 50, 50);
    doc.moveDown(0.6);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(INK)
      .text(data.clientName, 50, doc.y);

    const metaRow = (label: string, value: string, y: number) => {
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(INK)
        .text(label, rightColX, y, { width: rightColW, align: 'right' });
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(INK)
        .text(value, rightColX, y + 12, { width: rightColW, align: 'right' });
      return y + 30;
    };
    rightY = metaRow(`${data.kind} number`, data.ref, rightY);
    rightY = metaRow('Issued', fmtDate(data.issued), rightY);
    rightY = metaRow('Valid until', fmtDate(data.expires), rightY);

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(INK)
      .text(data.firmName, rightColX, rightY, {
        width: rightColW,
        align: 'right',
      });
    rightY += 12;
    data.firmAddressLines.forEach((line) => {
      doc
        .font('Helvetica')
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
    doc.font('Helvetica-Bold').fontSize(8).fillColor(PURPLE);
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
      .font('Helvetica')
      .fontSize(10)
      .fillColor(INK)
      .text(data.title, 50, rowY, { width: contentWidth - 120 });
    doc.text(fmtNumber(data.amount), 50 + contentWidth - 120, rowY, {
      width: 120,
      align: 'right',
    });
    doc.y = Math.max(doc.y, rowY) + 20;

    doc
      .moveTo(50, doc.y)
      .lineTo(50 + contentWidth, doc.y)
      .lineWidth(1)
      .strokeColor(GOLD)
      .stroke();
    doc.moveDown(0.6);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(PURPLE)
      .text(`TOTAL ${data.currency}`, 50, doc.y, { width: contentWidth - 120 });
    doc.text(
      fmtNumber(data.amount),
      50 + contentWidth - 120,
      doc.y - doc.currentLineHeight(),
      {
        width: 120,
        align: 'right',
      },
    );

    doc.moveDown(3);
    doc
      .font('Helvetica')
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

    doc.end();
  });
}
