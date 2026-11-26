import * as PDFKitImport from 'pdfkit';
const PDFDocument = ((PDFKitImport as any).default ?? PDFKitImport) as any;
import { htmlToParagraphs } from '../html-to-paragraphs.util';

const NAVY = '#252B5E';
const ACCENT = '#6366F1';
const BODY = '#1E1E1E';
const MUTED = '#787878';
const RULE = '#D8DAE5';
const WASH = '#F3F4F8';
const MARGIN = 50;

const money = (n: number, cur: string) =>
  `${cur} ${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDate = (d: Date | string | null | undefined) =>
  d
    ? new Date(d).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—';

export interface CallNoticeData {
  fundName: string;
  fundDescriptor: string;
  gpName: string;
  noticeDate: Date;
  callRef: string;
  lpaDate: Date | null;
  lpName: string;
  lpType: string;
  closeLabel: string;
  currency: string;
  totalCall: number;
  pct: number;
  lpAmount: number;
  dueDate: Date;
  cureDays: number;
  defaultInterestPct: number;
  forfeiturePct: number;
  lpaCallClause: string;
  lpaDefaultInterestClause: string;
  lpaDefaultClause: string;
  commitment: number;
  previouslyCalled: number;
  totalCalledAfter: number;
  pctCalledAfter: number;
  remainingUnfunded: number;
  purpose: string;
  narrative: string;
  wire: {
    beneficiary: string;
    bank: string;
    accountNumber: string;
    swift: string;
    branch: string;
    currency: string;
    reference: string;
  };
  useOfProceeds: { label: string; amount: number; note: string }[];
  signatory: string;
  signatoryTitle: string;
}

/** The formal capital call notice, one per LP, letterhead style — several LPs make one PDF, a page-run each. */
export function buildCapitalCallNoticesPdf(
  notices: CallNoticeData[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const W = doc.page.width - MARGIN * 2;

    const space = (h: number) => {
      if (doc.y + h > doc.page.height - 60) doc.addPage();
    };
    const heading = (t: string) => {
      space(40);
      doc.moveDown(0.6);
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(NAVY)
        .text(t, MARGIN, doc.y, {
          characterSpacing: 0.6,
        });
      doc.moveDown(0.3);
    };
    // Two-column rows with a rule under each; `strong` shades the row.
    const rows = (data: [string, string, boolean?][], labelW = W * 0.5) => {
      for (const [k, v, strong] of data) {
        space(22);
        const y = doc.y;
        if (strong) doc.rect(MARGIN, y - 2, W, 20).fill(WASH);
        doc
          .fillColor(BODY)
          .font(strong ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(strong ? 10 : 9)
          .text(k, MARGIN + (strong ? 6 : 0), y + 2, { width: labelW - 8 });
        doc
          .font(strong ? 'Helvetica-Bold' : 'Helvetica')
          .text(v, MARGIN + labelW, y + 2, {
            width: W - labelW - 4,
            align: 'left',
          });
        const bottom = Math.max(doc.y, y + 18);
        doc
          .moveTo(MARGIN, bottom + 1)
          .lineTo(MARGIN + W, bottom + 1)
          .strokeColor(RULE)
          .lineWidth(0.5)
          .stroke();
        doc.y = bottom + 3;
      }
    };

    const render = (d: CallNoticeData) => {
      // Letterhead
      doc
        .font('Helvetica-Bold')
        .fontSize(17)
        .fillColor(NAVY)
        .text(d.fundName.toUpperCase(), MARGIN, MARGIN, { width: W * 0.62 });
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(MUTED)
        .text(d.fundDescriptor, MARGIN, doc.y + 1, { width: W * 0.62 });
      if (d.gpName)
        doc.text(`General Partner: ${d.gpName}`, MARGIN, doc.y, {
          width: W * 0.62,
        });
      const headBottom = doc.y;
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(NAVY)
        .text('CAPITAL CALL NOTICE', MARGIN + W * 0.62, MARGIN, {
          width: W * 0.38,
          align: 'right',
        });
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
      doc.text(
        `Notice date: ${longDate(d.noticeDate)}`,
        MARGIN + W * 0.62,
        doc.y + 2,
        { width: W * 0.38, align: 'right' },
      );
      doc.text(`Call reference: ${d.callRef}`, MARGIN + W * 0.62, doc.y, {
        width: W * 0.38,
        align: 'right',
      });
      if (d.lpaDate)
        doc.text(`LPA date: ${longDate(d.lpaDate)}`, MARGIN + W * 0.62, doc.y, {
          width: W * 0.38,
          align: 'right',
        });
      doc.y = Math.max(headBottom, doc.y) + 8;
      doc
        .moveTo(MARGIN, doc.y)
        .lineTo(MARGIN + W, doc.y)
        .strokeColor(NAVY)
        .lineWidth(1.5)
        .stroke();
      doc.y += 14;

      // Addressee
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(BODY)
        .text(d.lpName, MARGIN, doc.y);
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(MUTED)
        .text(`${d.lpType}${d.closeLabel ? ` — ${d.closeLabel} close` : ''}`);
      doc.moveDown(0.8);

      // Body
      doc.font('Helvetica').fontSize(9.5).fillColor(BODY);
      doc.text('Dear Limited Partner,', { width: W });
      doc.moveDown(0.5);
      doc.text(
        `Pursuant to Section ${d.lpaCallClause} of the Limited Partnership Agreement${d.lpaDate ? ` dated ${longDate(d.lpaDate)}` : ''} (the "LPA"), the General Partner hereby issues this capital call notice to draw down a portion of your unfunded commitment to ${d.fundName} (the "Fund").`,
        { width: W, align: 'justify' },
      );
      if (d.purpose || d.narrative) {
        doc.moveDown(0.5);
        doc.text(
          d.narrative?.trim() ||
            `The proceeds of this capital call will be applied towards: ${d.purpose}.`,
          { width: W, align: 'justify' },
        );
      }

      heading('CALL DETAILS');
      rows([
        ['Total fund call amount', money(d.totalCall, d.currency)],
        ['Your commitment percentage', `${d.pct.toFixed(2)}%`],
        ['Your pro-rata share due', money(d.lpAmount, d.currency), true],
        ['Payment due date', longDate(d.dueDate)],
        ['Cure period', `${d.cureDays} days from the due date`],
        [
          'Default interest rate',
          `${d.defaultInterestPct}% per annum on overdue amounts`,
        ],
      ]);

      heading('YOUR COMMITMENT POSITION');
      rows([
        ['Total commitment', money(d.commitment, d.currency)],
        ['Previously called', money(d.previouslyCalled, d.currency)],
        [`This call (${d.callRef})`, money(d.lpAmount, d.currency)],
        [
          'Total called after this notice',
          `${money(d.totalCalledAfter, d.currency)} (${d.pctCalledAfter.toFixed(1)}%)`,
          true,
        ],
        ['Remaining unfunded', money(d.remainingUnfunded, d.currency)],
      ]);

      // Wire instructions
      heading('WIRE TRANSFER INSTRUCTIONS');
      const wireTop = doc.y;
      const wire: [string, string][] = [
        ['Beneficiary', d.wire.beneficiary],
        ['Bank', d.wire.bank + (d.wire.branch ? ` — ${d.wire.branch}` : '')],
        ['Account number', d.wire.accountNumber],
        ['SWIFT / BIC', d.wire.swift],
        ['Currency', d.wire.currency],
        ['Payment reference', d.wire.reference],
      ].filter(([, v]) => !!v) as [string, string][];
      space(wire.length * 15 + 50);
      doc.rect(MARGIN, doc.y, W, wire.length * 15 + 36).fill(WASH);
      let wy = doc.y + 8;
      wire.forEach(([k, v]) => {
        doc
          .fillColor(BODY)
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(k, MARGIN + 10, wy, { width: 110 });
        doc
          .font(k === 'Payment reference' ? 'Helvetica-Bold' : 'Helvetica')
          .fillColor(k === 'Payment reference' ? ACCENT : BODY)
          .text(v, MARGIN + 125, wy, { width: W - 140 });
        wy += 15;
      });
      doc
        .font('Helvetica-Oblique')
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          'Please quote the payment reference exactly as shown so your payment is allocated to your account promptly.',
          MARGIN + 10,
          wy + 2,
          { width: W - 20 },
        );
      doc.y = wireTop + wire.length * 15 + 44;

      if (d.useOfProceeds.length) {
        heading('USE OF PROCEEDS');
        rows([
          ...d.useOfProceeds.map(
            (u) =>
              [
                u.label + (u.note ? `  (${u.note})` : ''),
                money(u.amount, d.currency),
              ] as [string, string],
          ),
          ['Total', money(d.lpAmount, d.currency), true],
        ]);
      }

      // Legal notice
      space(90);
      doc.moveDown(0.8);
      const lt = doc.y;
      doc.font('Helvetica').fontSize(8.5).fillColor(BODY);
      const legal = `Default provisions: failure to remit the called amount by the due date may result in default interest at ${d.defaultInterestPct}% per annum on overdue amounts, as provided in Section ${d.lpaDefaultInterestClause} of the LPA, and may trigger the default provisions in Section ${d.lpaDefaultClause}, including forfeiture of up to ${d.forfeiturePct}% of the defaulting partner's interest in the Fund.`;
      const conf =
        'Confidentiality: this notice and the information in it are confidential and are intended solely for the named addressee. Any unauthorised disclosure or distribution is prohibited.';
      const h1 = doc.heightOfString(legal, { width: W - 20 });
      const h2 = doc.heightOfString(conf, { width: W - 20 });
      doc.rect(MARGIN, lt, 3, h1 + h2 + 16).fill('#D9A441');
      doc
        .fillColor(BODY)
        .text(legal, MARGIN + 12, lt + 4, { width: W - 20, align: 'justify' });
      doc.text(conf, MARGIN + 12, doc.y + 6, {
        width: W - 20,
        align: 'justify',
      });

      // Signature
      space(90);
      doc.moveDown(1.4);
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(NAVY)
        .text(d.gpName || d.fundName);
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(MUTED)
        .text('General Partner');
      doc.moveDown(1.6);
      const sy = doc.y;
      doc
        .moveTo(MARGIN, sy)
        .lineTo(MARGIN + 190, sy)
        .strokeColor(MUTED)
        .lineWidth(0.6)
        .stroke();
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(BODY)
        .text(d.signatory || 'Authorised Signatory', MARGIN, sy + 4);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          `${d.signatoryTitle ? d.signatoryTitle + '  ·  ' : ''}Date: ${longDate(d.noticeDate)}`,
        );
    };
    const startPages: number[] = [];
    notices.forEach((n, i) => {
      if (i > 0) doc.addPage();
      startPages.push(doc.bufferedPageRange().count - 1);
      render(n);
    });

    // Footer
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      let ni = 0;
      startPages.forEach((sp, k) => {
        if (sp <= i) ni = k;
      });
      const n = notices[ni];
      const bm = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          `${n.callRef} / ${n.lpName.replace(/\s+/g, '-').slice(0, 14).toUpperCase()}   ·   Page ${i + 1} of ${range.count}`,
          MARGIN,
          doc.page.height - 32,
          { width: W, align: 'right', lineBreak: false },
        );
      doc.page.margins.bottom = bm;
    }
    doc.end();
  });
}

/** A drafted fund document (HTML from the editor) as a clean PDF. */
export function buildTextDocumentPdf(def: {
  companyName?: string;
  title: string;
  subtitle?: string;
  html: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const W = doc.page.width - MARGIN * 2;

    const band = () => {
      doc.rect(0, 0, doc.page.width, 64).fill(NAVY);
      doc.fillColor('#FFFFFF');
      if (def.companyName)
        doc
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .text(def.companyName.toUpperCase(), MARGIN, 14, {
            width: W,
            lineBreak: false,
          });
      doc.font('Helvetica-Bold').fontSize(14).text(def.title, MARGIN, 28, {
        width: W,
        lineBreak: false,
        ellipsis: true,
      });
      if (def.subtitle)
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .text(def.subtitle, MARGIN, 47, { width: W, lineBreak: false });
      doc.y = 64 + 22;
      doc.fillColor(BODY);
    };
    band();
    doc.on('pageAdded', band);

    doc.font('Helvetica').fontSize(10).fillColor(BODY);
    for (const p of htmlToParagraphs(def.html || '')) {
      doc.text(p, MARGIN, doc.y, { width: W, align: 'justify' });
      doc.moveDown(0.6);
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bm = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          `Generated by Lexora   ·   Page ${i + 1} of ${range.count}`,
          MARGIN,
          doc.page.height - 30,
          { width: W, align: 'right', lineBreak: false },
        );
      doc.page.margins.bottom = bm;
    }
    doc.end();
  });
}
