import * as PDFDocument from 'pdfkit';

// The established Lexora brand palette — same purple/gold pairing
// already used across the email templates, so the PDF and the
// emails read as the same brand rather than two different systems.
const PURPLE = '#4B0082';
const GOLD = '#c9a84c';
const PURPLE_TINT = '#F3EDF9';
const INK = '#1a1a1a';
const MUTED = '#6b7280';

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const fmtNumber = (amount: number) =>
  amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export interface PurchaseOrderPdfData {
  ref: string;
  vendorName: string;
  vendorTin: string;
  currency: string;
  issuedOn: Date | null;
  expectedDelivery: Date | null;
  notes: string;
  lines: {
    description: string;
    qty: number;
    unit: number;
    discountPct: number;
    taxLabel: string;
  }[];
  deliveryAddress: string;
  deliveryAttention: string;
  deliveryPhone: string;
  deliveryInstructions: string;
  // Real tenant branding — never the platform's own name. Logo is a
  // base64 data URL (same convention the payslip PDF already uses);
  // falls back to the business name in text if none is set.
  firmName: string;
  firmAddressLines: string[];
  firmRegistrationNumber: string;
  firmTaxId: string;
  logoDataUrl: string | null;
}

// Clean, document-style layout matching a standard issued PO format
// — plain white background, no brand-color banner, since this is a
// formal document handed to an external vendor, not an internal
// notification. Status is deliberately never printed: a vendor
// receiving their own copy doesn't need to see internal workflow
// state like "Draft"/"Issued".
export function buildPurchaseOrderPdf(
  data: PurchaseOrderPdfData,
): Promise<Buffer> {
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

    // A thin gold accent bar down the left edge — enough to give the
    // document real identity without turning it into a colored
    // banner that would clash with the clean, sample-matched layout.
    doc.rect(0, 0, 6, pageHeight).fill(GOLD);

    // ── Header: heading + vendor on the left, logo + metadata on the right ──
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
      .text('PURCHASE ORDER', 50, 50);
    doc.moveDown(0.6);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(INK)
      .text(data.vendorName, 50, doc.y);
    if (data.vendorTin) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(MUTED)
        .text(`Tax Number: ${data.vendorTin}`, 50, doc.y + 2);
    }

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
    rightY = metaRow(
      'Purchase Order Date',
      data.issuedOn ? fmtDate(data.issuedOn) : '—',
      rightY,
    );
    rightY = metaRow(
      'Delivery Date',
      data.expectedDelivery ? fmtDate(data.expectedDelivery) : '—',
      rightY,
    );
    rightY = metaRow('Purchase Order Number', data.ref, rightY);
    if (data.notes) rightY = metaRow('Reference', data.notes, rightY);

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
    doc.moveDown(1);

    // ── Line item table ──
    const colDesc = 50;
    const colDescW = 210;
    const colQty = 262;
    const colQtyW = 45;
    const colUnit = 310;
    const colUnitW = 75;
    const colDiscount = 388;
    const colDiscountW = 55;
    const colTax = 446;
    const colTaxW = 65;
    const colAmount = 50 + contentWidth - 85;
    const colAmountW = 85;

    const headerY = doc.y;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(PURPLE);
    doc.text('DESCRIPTION', colDesc, headerY, { width: colDescW });
    doc.text('QUANTITY', colQty, headerY, { width: colQtyW, align: 'right' });
    doc.text('UNIT PRICE', colUnit, headerY, {
      width: colUnitW,
      align: 'right',
    });
    doc.text('DISCOUNT', colDiscount, headerY, {
      width: colDiscountW,
      align: 'right',
    });
    doc.text('TAX', colTax, headerY, { width: colTaxW, align: 'right' });
    doc.text(`AMOUNT ${data.currency}`, colAmount, headerY, {
      width: colAmountW,
      align: 'right',
    });
    doc.y = headerY + 16;
    doc
      .moveTo(50, doc.y)
      .lineTo(50 + contentWidth, doc.y)
      .lineWidth(1)
      .strokeColor(GOLD)
      .stroke();
    doc.moveDown(0.6);

    let subtotal = 0;
    data.lines.forEach((l) => {
      const gross = l.qty * l.unit;
      const net = gross * (1 - (l.discountPct || 0) / 100);
      subtotal += net;
      const rowY = doc.y;
      doc.font('Helvetica').fontSize(9).fillColor(INK);
      doc.text(l.description, colDesc, rowY, { width: colDescW });
      const rowBottom = doc.y;
      doc.text(fmtNumber(l.qty), colQty, rowY, {
        width: colQtyW,
        align: 'right',
      });
      doc.text(fmtNumber(l.unit), colUnit, rowY, {
        width: colUnitW,
        align: 'right',
      });
      doc.text(`${(l.discountPct || 0).toFixed(2)}%`, colDiscount, rowY, {
        width: colDiscountW,
        align: 'right',
      });
      doc.fontSize(8).text(l.taxLabel || '—', colTax, rowY, {
        width: colTaxW,
        align: 'right',
      });
      doc.fontSize(9).text(fmtNumber(net), colAmount, rowY, {
        width: colAmountW,
        align: 'right',
      });
      doc.y = Math.max(rowBottom, doc.y) + 6;
    });

    doc
      .moveTo(50, doc.y)
      .lineTo(50 + contentWidth, doc.y)
      .lineWidth(1)
      .strokeColor(GOLD)
      .stroke();
    doc.moveDown(0.6);

    const totalsBandY = doc.y - 4;
    doc
      .rect(colTax - 60, totalsBandY, 50 + contentWidth - (colTax - 60), 46)
      .fill(PURPLE_TINT);

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(INK)
      .text('Subtotal', colTax - 60, doc.y + 4, {
        width: colTaxW + 60,
        align: 'right',
      });
    doc.text(fmtNumber(subtotal), colAmount, doc.y - doc.currentLineHeight(), {
      width: colAmountW,
      align: 'right',
    });
    doc.moveDown(0.5);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(PURPLE)
      .text(`TOTAL ${data.currency}`, colTax - 60, doc.y + 2, {
        width: colTaxW + 60,
        align: 'right',
      });
    doc.text(fmtNumber(subtotal), colAmount, doc.y - doc.currentLineHeight(), {
      width: colAmountW,
      align: 'right',
    });
    doc.y = totalsBandY + 46 + 10;

    // ── Delivery details ──
    const deliveryY = Math.max(doc.y + 60, 620);
    doc
      .moveTo(50, deliveryY)
      .lineTo(50 + contentWidth, deliveryY)
      .lineWidth(1.5)
      .strokeColor(GOLD)
      .stroke();
    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(PURPLE)
      .text('DELIVERY DETAILS', 50, deliveryY + 14);

    const colW = contentWidth / 3;
    const fieldsY = deliveryY + 48;
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(PURPLE)
      .text('Delivery Address', 50, fieldsY, { width: colW - 10 });
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(INK)
      .text(data.deliveryAddress || '—', 50, fieldsY + 14, {
        width: colW - 10,
      });

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(PURPLE)
      .text('Attention', 50 + colW, fieldsY, { width: colW - 10 });
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(INK)
      .text(data.deliveryAttention || '—', 50 + colW, fieldsY + 14, {
        width: colW - 10,
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(PURPLE)
      .text('Telephone', 50 + colW, doc.y + 8, { width: colW - 10 });
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(INK)
      .text(data.deliveryPhone || '—', 50 + colW, doc.y + 14, {
        width: colW - 10,
      });

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(PURPLE)
      .text('Delivery Instructions', 50 + colW * 2, fieldsY, {
        width: colW - 10,
      });
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(INK)
      .text(data.deliveryInstructions || '—', 50 + colW * 2, fieldsY + 14, {
        width: colW - 10,
      });

    // ── Footer ──
    const footerParts = [
      data.firmRegistrationNumber
        ? `Company Registration No: ${data.firmRegistrationNumber}`
        : null,
      data.firmTaxId ? `Tax identification number: ${data.firmTaxId}` : null,
      data.firmAddressLines.length
        ? `Registered Office: ${data.firmAddressLines.join(', ')}`
        : null,
    ].filter(Boolean);
    if (footerParts.length) {
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(MUTED)
        .text(footerParts.join('.  '), 50, doc.page.height - 50, {
          width: contentWidth,
        });
    }

    doc.end();
  });
}
