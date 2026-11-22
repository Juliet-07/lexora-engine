import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';

const INK = '#1c1c28';
const MUTED = '#77778a';
const RULE = '#e3e3ea';
const ACCENT = '#2b2a8f';
const TINT = '#eeedfb';

// The shape both the on-screen "View record" panel and the PDF are
// drawn from, so the two can never disagree.
export interface OutcomeSection {
  h: string;
  rows: [string, string][];
  tables: { head: string[]; rows: string[][] }[];
  ticks: string[];
}

export interface OutcomeRecordPdfData {
  firmName: string;
  kind: string;
  ref: string;
  matter: string;
  version: number;
  recordedBy: string;
  recordedAt: string;
  status: string;
  sections: OutcomeSection[];
  sharing: { when: string; text: string }[];
}

export interface OutcomeDocumentPdfData {
  firmName: string;
  title: string; // "Settlement Agreement" | "Consent Order"
  ref: string;
  caption: string; // case title / court caption
  subCaption: string;
  preamble: string;
  parties: { name: string; role: string }[];
  clauses: { heading: string; body: string[] }[];
  scheduleTable?: { head: string[]; rows: string[][] } | null;
  signatories: string[];
  note: string;
}

@Injectable()
export class CaseOutcomePdfService {
  private start(): {
    doc: PDFKit.PDFDocument;
    done: Promise<Buffer>;
  } {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    return { doc, done };
  }

  private ensure(doc: PDFKit.PDFDocument, h: number) {
    if (doc.y + h > doc.page.height - 70) doc.addPage();
  }

  private footers(doc: PDFKit.PDFDocument, left: string) {
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.page.margins.bottom = 0;
      doc
        .fontSize(8)
        .fillColor(MUTED)
        .font('Helvetica')
        .text(left, 50, doc.page.height - 38, {
          width: doc.page.width - 190,
          lineBreak: false,
        })
        .text(
          `Page ${i + 1} of ${range.count}`,
          doc.page.width - 140,
          doc.page.height - 38,
          {
            width: 90,
            align: 'right',
            lineBreak: false,
          },
        );
    }
  }

  private heading(doc: PDFKit.PDFDocument, text: string) {
    this.ensure(doc, 60);
    doc.moveDown(0.8);
    doc
      .fontSize(10)
      .fillColor(ACCENT)
      .font('Helvetica-Bold')
      .text(text.toUpperCase(), { characterSpacing: 0.6 });
    const y = doc.y + 3;
    doc
      .moveTo(50, y)
      .lineTo(doc.page.width - 50, y)
      .strokeColor(ACCENT)
      .lineWidth(1)
      .stroke();
    doc.y = y + 8;
  }

  private kv(doc: PDFKit.PDFDocument, k: string, v: string) {
    const valueWidth = doc.page.width - 100 - 180;
    doc.fontSize(9.5).font('Helvetica');
    const h = Math.max(
      doc.heightOfString(k, { width: 170 }),
      doc.heightOfString(v || '—', { width: valueWidth }),
    );
    this.ensure(doc, h + 10);
    const y = doc.y;
    doc.fillColor(MUTED).text(k, 50, y, { width: 170 });
    doc.fillColor(INK).text(v || '—', 230, y, { width: valueWidth });
    doc.y = y + h + 4;
    doc
      .moveTo(50, doc.y)
      .lineTo(doc.page.width - 50, doc.y)
      .strokeColor(RULE)
      .lineWidth(0.5)
      .stroke();
    doc.y += 6;
  }

  private table(doc: PDFKit.PDFDocument, head: string[], rows: string[][]) {
    const width = doc.page.width - 100;
    const cw = width / head.length;
    this.ensure(doc, 40);
    let y = doc.y;
    doc.rect(50, y - 3, width, 16).fill(TINT);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9);
    head.forEach((t, i) => doc.text(t, 54 + i * cw, y, { width: cw - 8 }));
    y += 18;
    doc.font('Helvetica').fontSize(9);
    rows.forEach((r) => {
      const h = Math.max(
        ...r.map((c, i) => doc.heightOfString(c || '', { width: cw - 8 })),
      );
      if (y + h > doc.page.height - 70) {
        doc.addPage();
        y = doc.y;
      }
      doc.fillColor(INK);
      r.forEach((c, i) => doc.text(c || '', 54 + i * cw, y, { width: cw - 8 }));
      y += h + 4;
      doc
        .moveTo(50, y)
        .lineTo(50 + width, y)
        .strokeColor(RULE)
        .lineWidth(0.5)
        .stroke();
      y += 5;
    });
    doc.y = y + 2;
  }

  /** The full record, as shown in the "View record" panel. */
  async buildRecordPdf(d: OutcomeRecordPdfData): Promise<Buffer> {
    const { doc, done } = this.start();
    doc
      .fontSize(9)
      .fillColor(ACCENT)
      .font('Helvetica-Bold')
      .text(d.firmName.toUpperCase(), { characterSpacing: 1 });
    doc.moveDown(0.3);
    doc.fontSize(20).fillColor(INK).font('Helvetica-Bold').text(d.kind);
    doc.fontSize(11).fillColor(MUTED).font('Helvetica').text(d.matter);
    doc
      .fontSize(9)
      .text(
        `${d.status} by ${d.recordedBy || 'the case team'} on ${d.recordedAt}. Version ${d.version}.`,
      );

    d.sections.forEach((s) => {
      this.heading(doc, s.h);
      s.rows.forEach(([k, v]) => this.kv(doc, k, v));
      s.tables.forEach((t) => this.table(doc, t.head, t.rows));
      s.ticks.forEach((t) => this.kv(doc, t, 'Yes'));
    });

    this.heading(doc, 'Sharing history');
    if (d.sharing.length)
      d.sharing.forEach((s) => this.kv(doc, s.when, s.text));
    else this.kv(doc, 'Status', 'Not shared yet');

    this.footers(
      doc,
      `${d.firmName} · ${d.ref} · Confidential · Generated ${new Date().toLocaleDateString('en-GB')}`,
    );
    doc.end();
    return done;
  }

  /** A draft agreement or order built from the form, for counsel to review and sign. */
  async buildDocumentPdf(d: OutcomeDocumentPdfData): Promise<Buffer> {
    const { doc, done } = this.start();
    doc
      .fontSize(9)
      .fillColor(MUTED)
      .font('Helvetica')
      .text(d.firmName.toUpperCase(), { align: 'center', characterSpacing: 1 });
    doc.moveDown(0.8);
    doc
      .fontSize(18)
      .fillColor(INK)
      .font('Helvetica-Bold')
      .text(d.title.toUpperCase(), { align: 'center', characterSpacing: 1 });
    doc.moveDown(0.4);
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(d.caption, { align: 'center' });
    doc
      .fontSize(9.5)
      .fillColor(MUTED)
      .font('Helvetica')
      .text(d.subCaption, { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(10.5).fillColor(INK).font('Helvetica').text(d.preamble, {
      lineGap: 3,
    });
    doc.moveDown(0.6);
    d.parties.forEach((p, i) => {
      doc
        .font('Helvetica-Bold')
        .text(`${i + 1}. ${p.name}`, { continued: true })
        .font('Helvetica')
        .text(`  (${p.role})`);
    });

    d.clauses.forEach((c, i) => {
      this.ensure(doc, 70);
      doc.moveDown(0.8);
      doc
        .fontSize(10.5)
        .fillColor(ACCENT)
        .font('Helvetica-Bold')
        .text(`${i + 1}. ${c.heading}`);
      doc.moveDown(0.2);
      c.body.forEach((line) => {
        doc.fontSize(10.5).fillColor(INK).font('Helvetica').text(line, {
          lineGap: 3,
        });
        doc.moveDown(0.3);
      });
      if (c.heading === 'Payment' && d.scheduleTable) {
        this.table(doc, d.scheduleTable.head, d.scheduleTable.rows);
      }
    });

    this.ensure(doc, 40 + d.signatories.length * 64);
    doc.moveDown(1.5);
    doc
      .fontSize(10)
      .fillColor(INK)
      .font('Helvetica-Bold')
      .text('Signed by the parties or their authorised counsel');
    doc.moveDown(0.8);
    d.signatories.forEach((s) => {
      this.ensure(doc, 60);
      const y = doc.y + 24;
      doc.moveTo(50, y).lineTo(300, y).strokeColor(INK).lineWidth(0.6).stroke();
      doc.moveTo(330, y).lineTo(500, y).stroke();
      doc
        .fontSize(9)
        .fillColor(MUTED)
        .font('Helvetica')
        .text(s, 50, y + 3, { width: 250 })
        .text('Date', 330, y + 3);
      doc.y = y + 28;
    });

    this.footers(doc, `${d.firmName} · ${d.ref} · ${d.note}`);
    doc.end();
    return done;
  }
}
