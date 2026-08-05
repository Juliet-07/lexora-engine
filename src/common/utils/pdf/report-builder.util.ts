import * as PDFKitImport from 'pdfkit';
const PDFDocument = ((PDFKitImport as any).default ?? PDFKitImport) as any;

export interface ReportSection {
  heading: string;
  columns: string[];
  rows: (string | number)[][];
  note?: string;
}

export interface ReportDefinition {
  title: string;
  subtitle?: string;
  summary?: { label: string; value: string | number }[];
  sections: ReportSection[];
}

// House style — mirrors the platform's existing client-side report
// exports (reportExport.ts) exactly, so every generated report looks
// consistent regardless of whether it's built client-side or here.
const HEADER_BAND = '#252B5E';
const SUMMARY_HEADER = '#6366F1';
const SECTION_HEADER = '#3F3F6E';
const BODY_TEXT = '#1E1E1E';
const MUTED_TEXT = '#787878';
const STRIPE = '#F3F4F8';
const PAGE_MARGIN = 40;

export function buildReportPdf(def: ReportDefinition): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: PAGE_MARGIN,
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - PAGE_MARGIN * 2;

    const drawHeader = () => {
      doc.rect(0, 0, pageWidth, 64).fill(HEADER_BAND);
      doc
        .fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(16)
        .text(def.title, PAGE_MARGIN, 22);
      doc.font('Helvetica').fontSize(9);
      doc.text(
        def.subtitle ?? 'Governance, Risk & Compliance',
        PAGE_MARGIN,
        44,
      );
      doc.text(`Generated ${new Date().toLocaleString()}`, PAGE_MARGIN, 44, {
        width: contentWidth,
        align: 'right',
      });
      doc.y = 88;
      doc.fillColor(BODY_TEXT);
    };

    const ensureSpace = (needed: number) => {
      if (doc.y + needed > doc.page.height - 50) {
        doc.addPage();
        drawHeader();
      }
    };

    // Hand-rolled table — pdfkit has no autoTable equivalent. Columns
    // split evenly across content width; fixed row height (see the
    // caveat on long free-text cells above).
    const drawTable = (
      columns: string[],
      rows: (string | number)[][],
      headerColor: string,
    ) => {
      const colWidth = contentWidth / columns.length;
      const rowHeight = 20;

      ensureSpace(rowHeight + 10);
      const headerY = doc.y;
      doc.rect(PAGE_MARGIN, headerY, contentWidth, rowHeight).fill(headerColor);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
      columns.forEach((col, i) => {
        doc.text(col, PAGE_MARGIN + i * colWidth + 5, headerY + 6, {
          width: colWidth - 10,
        });
      });
      doc.y = headerY + rowHeight;
      doc.fillColor(BODY_TEXT).font('Helvetica').fontSize(8);

      const displayRows = rows.length
        ? rows
        : [columns.map((_, i) => (i === 0 ? 'No records' : ''))];
      displayRows.forEach((row, ri) => {
        ensureSpace(rowHeight);
        const y = doc.y;
        if (ri % 2 === 1)
          doc.rect(PAGE_MARGIN, y, contentWidth, rowHeight).fill(STRIPE);
        doc.fillColor(BODY_TEXT);
        row.forEach((cell, i) => {
          doc.text(String(cell ?? ''), PAGE_MARGIN + i * colWidth + 5, y + 6, {
            width: colWidth - 10,
          });
        });
        doc.y = y + rowHeight;
      });
      doc.moveDown(1.4);
    };

    drawHeader();

    if (def.summary?.length) {
      drawTable(
        def.summary.map((s) => s.label),
        [def.summary.map((s) => s.value)],
        SUMMARY_HEADER,
      );
    }

    def.sections.forEach((section) => {
      ensureSpace(40);
      doc
        .fillColor(BODY_TEXT)
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(section.heading, PAGE_MARGIN, doc.y);
      doc.moveDown(0.2);
      if (section.note) {
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(MUTED_TEXT)
          .text(section.note, PAGE_MARGIN);
        doc.fillColor(BODY_TEXT);
        doc.moveDown(0.2);
      }
      drawTable(section.columns, section.rows, SECTION_HEADER);
    });

    // Page numbers — needs a second pass since pdfkit doesn't expose
    // total page count until buffered pages are finalized.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .fillColor(MUTED_TEXT)
        .text(
          `Page ${i + 1} of ${range.count}`,
          PAGE_MARGIN,
          doc.page.height - 30,
          { width: contentWidth, align: 'right' },
        );
    }

    doc.end();
  });
}
