import * as PDFDocument from 'pdfkit';

// Same brand palette as the Quote and Purchase Order PDFs, for one
// consistent document identity across everything the firm issues.
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

export interface InvoicePdfLine {
  description: string;
  qty: number;
  unit: number;
}

export interface InvoicePdfRemittanceAccount {
  accountName: string;
  bankName: string;
  accountNumber: string;
  currency: string;
  branchCode?: string;
  swiftCode?: string;
}

export interface InvoicePdfData {
  ref: string;
  clientName: string;
  mandateName: string;
  lines: InvoicePdfLine[];
  currency: string;
  net: number;
  vat: number;
  vatRate: number;
  wht: number;
  whtRate: number;
  payable: number;
  issuedOn: Date;
  dueOn: Date;
  // Real tenant branding — never the platform's own name.
  firmName: string;
  firmAddressLines: string[];
  logoDataUrl: string | null;
  // Real bank details for the client to remit payment to — empty
  // if the tenant hasn't added any yet, in which case this section
  // is simply omitted rather than shown blank.
  remittanceAccounts: InvoicePdfRemittanceAccount[];
}

export function buildInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
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
      .text('INVOICE', 50, 50);
    doc.moveDown(0.4);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(INK)
      .text(data.clientName, 50, doc.y);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(data.mandateName, 50, doc.y + 2);

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
    rightY = metaRow('Invoice number', data.ref, rightY);
    rightY = metaRow('Issued', fmtDate(data.issuedOn), rightY);
    rightY = metaRow('Due', fmtDate(data.dueOn), rightY);

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

    // Line items table
    const descW = contentWidth - 260;
    const qtyX = 50 + descW;
    const unitX = qtyX + 60;
    const amountX = unitX + 100;

    const tableY = doc.y;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(PURPLE);
    doc.text('DESCRIPTION', 50, tableY, { width: descW });
    doc.text('QTY', qtyX, tableY, { width: 60, align: 'right' });
    doc.text('UNIT PRICE', unitX, tableY, { width: 100, align: 'right' });
    doc.text(`AMOUNT ${data.currency}`, amountX, tableY, {
      width: 100,
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

    data.lines.forEach((l) => {
      const rowY = doc.y;
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(INK)
        .text(l.description, 50, rowY, { width: descW });
      doc.text(String(l.qty), qtyX, rowY, { width: 60, align: 'right' });
      doc.text(fmtNumber(l.unit), unitX, rowY, { width: 100, align: 'right' });
      doc.text(fmtNumber(l.qty * l.unit), amountX, rowY, {
        width: 100,
        align: 'right',
      });
      doc.y = Math.max(doc.y, rowY) + 18;
    });

    doc
      .moveTo(50, doc.y)
      .lineTo(50 + contentWidth, doc.y)
      .lineWidth(1)
      .strokeColor(GOLD)
      .stroke();
    doc.moveDown(0.8);

    // Totals — each row's label and value share the same explicit
    // rowY, so mixing font sizes across rows (the bold total row)
    // never throws label and value out of alignment.
    const totalsLabelW = contentWidth - 120;
    const totalsValueX = 50 + totalsLabelW;
    const totalsRow = (label: string, value: string, bold = false) => {
      const rowY = doc.y;
      const size = bold ? 11 : 9.5;
      const color = bold ? PURPLE : INK;
      const font = bold ? 'Helvetica-Bold' : 'Helvetica';
      doc
        .font(font)
        .fontSize(size)
        .fillColor(color)
        .text(label, 50, rowY, { width: totalsLabelW });
      doc
        .font(font)
        .fontSize(size)
        .fillColor(color)
        .text(value, totalsValueX, rowY, { width: 120, align: 'right' });
      doc.y = rowY + size + 8;
    };
    totalsRow(`Net ${data.currency}`, fmtNumber(data.net));
    if (data.vat > 0) totalsRow(`VAT (${data.vatRate}%)`, fmtNumber(data.vat));
    if (data.wht > 0)
      totalsRow(`WHT (${data.whtRate}%)`, `-${fmtNumber(data.wht)}`);
    doc.moveDown(0.3);
    doc
      .moveTo(totalsValueX - 10, doc.y)
      .lineTo(50 + contentWidth, doc.y)
      .lineWidth(1)
      .strokeColor(GOLD)
      .stroke();
    doc.moveDown(0.4);
    totalsRow(`TOTAL PAYABLE ${data.currency}`, fmtNumber(data.payable), true);

    // Payment details — the real accounts a client remits to.
    // Omitted entirely rather than shown empty if the tenant hasn't
    // added any yet, since an empty "pay to:" box is worse than none.
    if (data.remittanceAccounts.length > 0) {
      doc.moveDown(1.2);
      doc
        .moveTo(50, doc.y)
        .lineTo(50 + contentWidth, doc.y)
        .lineWidth(1.5)
        .strokeColor(GOLD)
        .stroke();
      doc.moveDown(0.6);
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(PURPLE)
        .text('PAYMENT DETAILS', 50, doc.y);
      doc.moveDown(0.5);

      data.remittanceAccounts.forEach((acc, idx) => {
        const boxY = doc.y;
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor(INK)
          .text(acc.accountName, 50, boxY, { width: contentWidth });
        doc.moveDown(0.15);
        const detailParts = [
          acc.bankName,
          `Acc. no. ${acc.accountNumber}`,
          acc.currency,
          acc.branchCode ? `Branch ${acc.branchCode}` : null,
          acc.swiftCode ? `SWIFT ${acc.swiftCode}` : null,
        ].filter(Boolean);
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(MUTED)
          .text(detailParts.join('  ·  '), 50, doc.y, { width: contentWidth });
        if (idx < data.remittanceAccounts.length - 1) doc.moveDown(0.6);
      });
    }

    doc.end();
  });
}
