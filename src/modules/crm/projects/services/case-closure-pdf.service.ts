import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';

const INK = '#2c2c2c';
const MUTED = '#777777';
const RULE = '#dddddd';
const ACCENT = '#4B0082';

export interface CaseClosureReportData {
  caseType: 'ADR' | 'Litigation';
  ref: string;
  title: string;
  clientOrParties: string;
  filedOn: Date | string;
  closedOn: Date | string | null;
  durationDays: number;
  status: string;
  outcome: string | null;
  totalFees: number;
  totalDisbursements: number;
  currency: string;
  closure: {
    facts: string;
    issues: string;
    rules: string;
    application: string;
    conclusion: string;
    clientSatisfaction: string;
    clientSatisfactionNotes: string;
    lessonsLearned: string;
    precedentValue: boolean;
    precedentNotes: string;
    recordedBy: string;
    recordedAt: Date | string | null;
  } | null;
}

// A real, downloadable PDF built specifically to be shared with
// management — a structured summary of the case plus the FIRAC
// legal analysis, not a dump of every field on the record.
@Injectable()
export class CaseClosurePdfService {
  private money(n: number, currency: string) {
    return `${currency} ${Number(n || 0).toLocaleString()}`;
  }

  private dateLabel(d: Date | string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  private drawSectionHeading(doc: PDFKit.PDFDocument, text: string) {
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
  }

  private drawLabelValue(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
  ) {
    doc
      .fontSize(9)
      .fillColor(MUTED)
      .font('Helvetica')
      .text(label.toUpperCase(), { continued: false, characterSpacing: 0.5 });
    doc
      .fontSize(11)
      .fillColor(INK)
      .font('Helvetica')
      .text(value || '—');
    doc.moveDown(0.6);
  }

  private drawFiracBlock(doc: PDFKit.PDFDocument, label: string, text: string) {
    doc.fontSize(10).fillColor(ACCENT).font('Helvetica-Bold').text(label);
    doc
      .fontSize(10.5)
      .fillColor(INK)
      .font('Helvetica')
      .text(text?.trim() || 'Not recorded.', { lineGap: 2 });
    doc.moveDown(0.7);
  }

  async buildClosureReportPdf(
    data: CaseClosureReportData,
    firmName: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Header ──────────────────────────────────────────────
      doc
        .fontSize(9)
        .fillColor(MUTED)
        .font('Helvetica')
        .text(firmName.toUpperCase(), { characterSpacing: 1 });
      doc
        .fontSize(20)
        .fillColor(INK)
        .font('Helvetica-Bold')
        .text('Case Closure Report');
      doc
        .fontSize(11)
        .fillColor(MUTED)
        .font('Helvetica')
        .text(`${data.caseType} · ${data.ref} · ${data.title}`);
      doc
        .moveTo(50, doc.y + 8)
        .lineTo(doc.page.width - 50, doc.y + 8)
        .strokeColor(ACCENT)
        .lineWidth(2)
        .stroke();
      doc.moveDown(1);

      // ── Case summary ────────────────────────────────────────
      this.drawSectionHeading(doc, 'Case Summary');
      this.drawLabelValue(doc, 'Parties', data.clientOrParties);
      this.drawLabelValue(doc, 'Status', data.status);
      this.drawLabelValue(doc, 'Filed on', this.dateLabel(data.filedOn));
      this.drawLabelValue(doc, 'Closed on', this.dateLabel(data.closedOn));
      this.drawLabelValue(doc, 'Duration', `${data.durationDays} days`);
      if (data.outcome) {
        this.drawLabelValue(doc, 'Outcome', data.outcome);
      }

      // ── Financial summary ───────────────────────────────────
      this.drawSectionHeading(doc, 'Financial Summary');
      this.drawLabelValue(
        doc,
        'Total fees billed',
        this.money(data.totalFees, data.currency),
      );
      this.drawLabelValue(
        doc,
        'Disbursements',
        this.money(data.totalDisbursements, data.currency),
      );

      // ── FIRAC analysis ──────────────────────────────────────
      this.drawSectionHeading(doc, 'FIRAC Analysis');
      this.drawFiracBlock(doc, 'Facts', data.closure?.facts ?? '');
      this.drawFiracBlock(doc, 'Issues', data.closure?.issues ?? '');
      this.drawFiracBlock(doc, 'Rules', data.closure?.rules ?? '');
      this.drawFiracBlock(doc, 'Application', data.closure?.application ?? '');
      this.drawFiracBlock(doc, 'Conclusion', data.closure?.conclusion ?? '');

      // ── Closure assessment ──────────────────────────────────
      this.drawSectionHeading(doc, 'Closure Assessment');
      this.drawLabelValue(
        doc,
        'Client satisfaction',
        data.closure?.clientSatisfaction || 'Not recorded',
      );
      if (data.closure?.clientSatisfactionNotes) {
        this.drawLabelValue(
          doc,
          'Satisfaction notes',
          data.closure.clientSatisfactionNotes,
        );
      }
      this.drawLabelValue(
        doc,
        'Lessons learned',
        data.closure?.lessonsLearned || 'Not recorded',
      );
      this.drawLabelValue(
        doc,
        'Precedent / knowledge-base value',
        data.closure
          ? data.closure.precedentValue
            ? 'Yes'
            : 'No'
          : 'Not flagged',
      );
      if (data.closure?.precedentValue && data.closure?.precedentNotes) {
        this.drawLabelValue(
          doc,
          'Precedent notes',
          data.closure.precedentNotes,
        );
      }

      // ── Footer ──────────────────────────────────────────────
      doc
        .fontSize(8)
        .fillColor(MUTED)
        .font('Helvetica')
        .text(
          `${firmName} · Confidential — for internal management use · ` +
            `Recorded by ${data.closure?.recordedBy || 'Unknown'} on ` +
            `${this.dateLabel(data.closure?.recordedAt ?? null)} · ` +
            `Generated ${new Date().toLocaleDateString()}`,
          50,
          doc.page.height - 40,
          { width: doc.page.width - 100, align: 'center' },
        );

      doc.end();
    });
  }
}
