import * as PDFDocument from 'pdfkit';

const INK = '#2c2c2c';
const MUTED = '#777777';
const RULE = '#dddddd';
const ACCENT = '#4B0082';
const POSITIVE = '#1a7f37';
const NEGATIVE = '#c62828';

export interface ManagementReportPdfData {
  firmName: string;
  periodType: 'Month' | 'Quarter' | 'Year';
  periodLabel: string;
  currency: string;
  revenue: number;
  expenses: number;
  netIncome: number;
  outstandingReceivables: number;
  outstandingPayables: number;
  cashPosition: number;
  executiveSummary: string;
}

export function buildManagementReportPdf(
  data: ManagementReportPdfData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const money = (n: number) =>
      `${data.currency} ${Number(n || 0).toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })}`;

    const sectionHeading = (text: string) => {
      doc.moveDown(0.75);
      doc
        .fontSize(12)
        .fillColor(ACCENT)
        .font('Helvetica-Bold')
        .text(text.toUpperCase(), { characterSpacing: 0.5 });
      doc
        .moveTo(doc.x, doc.y + 2)
        .lineTo(doc.page.width - 50, doc.y + 2)
        .strokeColor(RULE)
        .lineWidth(1)
        .stroke();
      doc.moveDown(0.5);
    };

    const figureRow = (label: string, value: string, color = INK) => {
      const y = doc.y;
      doc
        .fontSize(11)
        .fillColor(INK)
        .font('Helvetica')
        .text(label, 50, y, { width: 300 });
      doc
        .fontSize(11)
        .fillColor(color)
        .font('Helvetica-Bold')
        .text(value, 50, y, { width: doc.page.width - 100, align: 'right' });
      doc.moveDown(0.5);
    };

    // ── Header ──────────────────────────────────────────────
    doc
      .fontSize(9)
      .fillColor(MUTED)
      .font('Helvetica')
      .text(data.firmName.toUpperCase(), { characterSpacing: 1 });
    doc
      .fontSize(20)
      .fillColor(INK)
      .font('Helvetica-Bold')
      .text('Management Report');
    doc
      .fontSize(12)
      .fillColor(MUTED)
      .font('Helvetica')
      .text(`${data.periodType} · ${data.periodLabel}`);
    doc
      .moveTo(50, doc.y + 8)
      .lineTo(doc.page.width - 50, doc.y + 8)
      .strokeColor(ACCENT)
      .lineWidth(2)
      .stroke();
    doc.moveDown(1);

    // ── Financial summary ────────────────────────────────────
    sectionHeading('Financial Summary');
    figureRow('Revenue', money(data.revenue), POSITIVE);
    figureRow('Expenses', money(data.expenses), NEGATIVE);
    figureRow(
      'Net income',
      money(data.netIncome),
      data.netIncome >= 0 ? POSITIVE : NEGATIVE,
    );

    sectionHeading('Position');
    figureRow('Cash position (as of today)', money(data.cashPosition));
    figureRow('Outstanding receivables', money(data.outstandingReceivables));
    figureRow('Outstanding payables', money(data.outstandingPayables));

    // ── Executive summary ────────────────────────────────────
    sectionHeading('Executive Summary');
    doc
      .fontSize(10.5)
      .fillColor(INK)
      .font('Helvetica')
      .text(
        data.executiveSummary?.trim() ||
          'No executive summary has been written for this period yet.',
        { lineGap: 3 },
      );

    // ── Footer ──────────────────────────────────────────────
    doc
      .fontSize(8)
      .fillColor(MUTED)
      .font('Helvetica')
      .text(
        `${data.firmName} · Confidential — for internal management use · Generated ${new Date().toLocaleDateString()}`,
        50,
        doc.page.height - 40,
        { width: doc.page.width - 100, align: 'center' },
      );

    doc.end();
  });
}
