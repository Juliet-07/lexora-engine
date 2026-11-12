import * as PDFKitImport from 'pdfkit';
const PDFDocument = ((PDFKitImport as any).default ?? PDFKitImport) as any;

// The frozen content of a compiled/published ESG report — built by
// EsgFrameworkService#buildSnapshot, stored on the report, rendered
// here for the PDF and straight to JSON for the tenant/board viewers.
export interface EsgReportSnapshotIndicator {
  code: string;
  title: string;
  owner: string;
  requirement: string;
  response: string;
  status: string;
  isApplicable: boolean;
  applicabilityNote: string;
  evidence: string[];
  signedOffBy: string | null;
  signedOffAt: string | Date | null;
  esgChairName: string;
  esgChairDecidedAt: string | Date | null;
  boardChairName: string;
  boardChairDecidedAt: string | Date | null;
}

export interface EsgReportSnapshot {
  businessName: string;
  frameworkLabel: string;
  frameworkDescription: string;
  builtAt: string | Date;
  totals: {
    total: number;
    applicable: number;
    notApplicable: number;
    signedOff: number;
    pending: number;
    pct: number;
  };
  indicators: EsgReportSnapshotIndicator[];
}

export interface EsgReportPdfInput {
  title: string;
  period: string;
  status: string;
  publishedAt?: string | Date | null;
  compiledAt?: string | Date | null;
  snapshot: EsgReportSnapshot;
}

const HEADER_BAND = '#252B5E';
const ACCENT = '#6366F1';
const BODY_TEXT = '#1E1E1E';
const MUTED_TEXT = '#787878';
const RULE = '#E2E4EC';
const GOOD = '#047857';
const WARN = '#B45309';
const M = 48;
const BAND = 92;

const fmtDate = (d: string | Date | null | undefined) =>
  d
    ? new Date(d).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '';

export function buildEsgReportPdf(input: EsgReportPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const snap = input.snapshot;
    const doc = new PDFDocument({
      size: 'A4',
      margin: M,
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const CW = W - M * 2;
    const bottom = () => doc.page.height - 56;

    const header = () => {
      doc.rect(0, 0, W, BAND).fill(HEADER_BAND);
      doc.fillColor('#FFFFFF');
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .text((snap.businessName || '').toUpperCase(), M, 18, {
          width: CW,
          lineBreak: false,
        });
      doc
        .font('Helvetica-Bold')
        .fontSize(17)
        .text(input.title, M, 34, { width: CW, lineBreak: false });
      doc
        .font('Helvetica')
        .fontSize(9)
        .text(
          `${snap.frameworkLabel} · Reporting period ${input.period} · ${input.status}`,
          M,
          62,
          { width: CW, lineBreak: false },
        );
      doc.fillColor(BODY_TEXT);
      doc.y = BAND + 22;
      doc.x = M;
    };

    const ensure = (h: number) => {
      if (doc.y + h > bottom()) {
        doc.addPage();
      }
    };

    // The band is repeated on every page, including ones pdfkit adds
    // itself when long text flows over.
    doc.on('pageAdded', header);
    header();

    // ── Summary ──
    const t = snap.totals;
    const stats: [string, string][] = [
      ['Disclosures', String(t.total)],
      ['Signed off', `${t.signedOff} of ${t.applicable}`],
      ['Pending sign-off', String(t.pending)],
      ['Coverage', `${t.pct}%`],
    ];
    const boxW = (CW - 3 * 10) / 4;
    const y0 = doc.y;
    stats.forEach(([label, value], i) => {
      const x = M + i * (boxW + 10);
      doc.roundedRect(x, y0, boxW, 50, 4).lineWidth(0.6).stroke(RULE);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED_TEXT)
        .text(label.toUpperCase(), x + 10, y0 + 9, {
          width: boxW - 20,
          lineBreak: false,
        });
      doc
        .font('Helvetica-Bold')
        .fontSize(15)
        .fillColor(BODY_TEXT)
        .text(value, x + 10, y0 + 24, { width: boxW - 20, lineBreak: false });
    });
    doc.y = y0 + 64;
    doc.x = M;

    const meta = [
      snap.frameworkDescription,
      input.compiledAt ? `Compiled ${fmtDate(input.compiledAt)}` : '',
      input.publishedAt ? `Published ${fmtDate(input.publishedAt)}` : '',
    ]
      .filter(Boolean)
      .join('  ·  ');
    if (meta) {
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(MUTED_TEXT)
        .text(meta, M, doc.y, { width: CW });
      doc.moveDown(0.8);
    }

    if (t.pending > 0) {
      ensure(40);
      const ny = doc.y;
      doc.roundedRect(M, ny, CW, 30, 4).fill('#FEF3C7');
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(WARN)
        .text(
          `${t.pending} applicable disclosure${t.pending === 1 ? ' is' : 's are'} not yet signed off. They are included below and marked accordingly.`,
          M + 10,
          ny + 10,
          { width: CW - 20 },
        );
      doc.y = ny + 42;
      doc.x = M;
    }

    // ── Disclosures ──
    const label = (text: string) => {
      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(MUTED_TEXT)
        .text(text.toUpperCase(), M, doc.y, { width: CW });
      doc.moveDown(0.15);
    };

    const body = (text: string, color = BODY_TEXT) => {
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(color)
        .text(text, M, doc.y, { width: CW, lineGap: 1.5 });
    };

    snap.indicators.forEach((ind) => {
      ensure(90);
      doc
        .moveTo(M, doc.y)
        .lineTo(M + CW, doc.y)
        .lineWidth(0.6)
        .stroke(RULE);
      doc.moveDown(0.7);

      // Title line: code + title; status on the right.
      const ty = doc.y;
      const signed = ind.status === 'Signed off';
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(ACCENT)
        .text(ind.code, M, ty, { width: 70, lineBreak: false });
      doc
        .fillColor(BODY_TEXT)
        .text(ind.title, M + 74, ty, { width: CW - 74 - 110 });
      const afterTitle = doc.y;
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(!ind.isApplicable ? MUTED_TEXT : signed ? GOOD : WARN)
        .text(
          !ind.isApplicable ? 'NOT APPLICABLE' : ind.status.toUpperCase(),
          M + CW - 108,
          ty + 2,
          { width: 108, align: 'right', lineBreak: false },
        );
      doc.y = afterTitle + 4;
      doc.x = M;

      if (ind.owner) {
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor(MUTED_TEXT)
          .text(`Owner: ${ind.owner}`, M, doc.y, { width: CW });
        doc.moveDown(0.4);
      }

      if (!ind.isApplicable) {
        label('Why this does not apply');
        body(ind.applicabilityNote || 'No reason recorded.', MUTED_TEXT);
        doc.moveDown(0.9);
        return;
      }

      if (ind.requirement) {
        label('Requirement');
        body(ind.requirement, MUTED_TEXT);
        doc.moveDown(0.5);
      }

      ensure(40);
      label('Disclosure');
      if (ind.response?.trim()) body(ind.response);
      else
        body('No response has been entered for this disclosure.', MUTED_TEXT);
      doc.moveDown(0.5);

      if (ind.evidence.length) {
        ensure(30);
        label('Supporting evidence');
        body(ind.evidence.join('  ·  '), MUTED_TEXT);
        doc.moveDown(0.5);
      }

      if (signed) {
        const bits = [
          ind.esgChairName
            ? `ESG Committee Chair: ${ind.esgChairName}${ind.esgChairDecidedAt ? ` (${fmtDate(ind.esgChairDecidedAt)})` : ''}`
            : '',
          ind.boardChairName
            ? `Board Chair: ${ind.boardChairName}${ind.boardChairDecidedAt ? ` (${fmtDate(ind.boardChairDecidedAt)})` : ''}`
            : ind.signedOffBy
              ? `Signed off by ${ind.signedOffBy}${ind.signedOffAt ? ` (${fmtDate(ind.signedOffAt)})` : ''}`
              : '',
        ].filter(Boolean);
        if (bits.length) {
          ensure(26);
          label('Sign-off');
          body(bits.join('   |   '), GOOD);
        }
      }
      doc.moveDown(0.9);
    });

    if (!snap.indicators.length) {
      body('This framework has no disclosures yet.', MUTED_TEXT);
    }

    // Footer, stamped on every page in a second pass (needs the final
    // page count). Bottom margin is zeroed while writing inside it, or
    // pdfkit adds a blank page per real page.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const mb = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED_TEXT)
        .text(
          `${snap.businessName} · ${input.title} · Generated by Lexora`,
          M,
          doc.page.height - 30,
          { width: CW - 80, lineBreak: false },
        )
        .text(`Page ${i + 1} of ${range.count}`, M, doc.page.height - 30, {
          width: CW,
          align: 'right',
          lineBreak: false,
        });
      doc.page.margins.bottom = mb;
    }

    doc.end();
  });
}
