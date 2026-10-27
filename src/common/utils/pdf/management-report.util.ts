import * as PDFDocument from 'pdfkit';

const INK = '#2c2c2c';
const MUTED = '#777777';
const RULE = '#dddddd';
const ACCENT = '#4B0082';
const POSITIVE = '#1a7f37';
const NEGATIVE = '#c62828';
const AMBER = '#b45309';
const SOFT = '#f3f1fa';

type Cols3 = { cur: number; prior: number; ytd: number };
type ActBud = { actual: number; budget: number };

// The slice of the Finance → Report "pack" the PDF prints. The pack is
// built by ReportPackService; this file only draws it, so the PDF can
// never show a figure the page doesn't.
export interface ManagementReportPdfData {
  firmName: string;
  meta: {
    periodType: 'Month' | 'Quarter' | 'Year';
    periodLabel: string;
    shortLabel: string;
    priorLabel: string;
    ytdLabel: string;
    currency: string;
  };
  overview: {
    kpis: {
      revenue: number;
      revenuePrior: number;
      revenueChangePct: number | null;
      netMargin: number | null;
      cashPosition: number;
      revenueYtd: number;
      revenuePctOfAnnualBudget: number | null;
      monthlyBurn: number;
      runwayMonths: number | null;
    };
    revenueTrend: { label: string; value: number }[];
    expenseBreakdown: {
      total: number;
      items: { name: string; val: number; pct: number }[];
    };
  };
  pnl: {
    totals: {
      revenue: Cols3;
      costOfServices: Cols3;
      grossProfit: Cols3;
      operatingExpenses: Cols3;
      profitBeforeTax: Cols3;
    };
  };
  revenueAnalysis: {
    serviceLines: { name: string; val: number; pct: number }[];
    topClients: { name: string; val: number }[];
  };
  cashFlow: {
    ytd: {
      operating: number;
      investing: number;
      financing: number;
      netChange: number;
    };
  };
  agedReceivables: {
    buckets: {
      current: number;
      d30: number;
      d60: number;
      d90: number;
      d90p: number;
    };
    total: number;
  };
  agedPayables: {
    buckets: { current: number; d30: number; d60: number; d60p: number };
    total: number;
  };
  budget: {
    hasBudget: boolean;
    totals: {
      revenue: ActBud;
      costOfServices: ActBud;
      grossProfit: ActBud;
      operatingExpenses: ActBud;
      netProfit: ActBud;
    };
  };
  ratios: {
    group: string;
    items: {
      name: string;
      display: string;
      target: string;
      ok: boolean | null;
    }[];
  }[];
  lights: Record<
    'revenue' | 'collections' | 'costs',
    { status: string; text: string }
  >;
  management: {
    commentary: {
      ceoMessage: string;
      revenue: string;
      costs: string;
      cashflow: string;
      receivables: string;
      payables: string;
      budget: string;
    };
    risks: {
      severity: string;
      text: string;
      impact: string;
      owner: string;
      mitigation: string;
    }[];
    actions: { priority: string; text: string; owner: string; due: string }[];
  };
}

const ZERO_DECIMAL = new Set([
  'RWF',
  'UGX',
  'BIF',
  'XOF',
  'XAF',
  'JPY',
  'KMF',
  'DJF',
]);

export function buildManagementReportPdf(
  data: ManagementReportPdfData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const cur = data.meta.currency;
    const dp = ZERO_DECIMAL.has(cur) ? 0 : 2;
    const num = (n: number | null | undefined) => {
      if (n === null || n === undefined) return '—';
      const s = Math.abs(n).toLocaleString('en-US', {
        minimumFractionDigits: dp,
        maximumFractionDigits: dp,
      });
      return n < 0 ? `(${s})` : s;
    };
    const money = (n: number | null | undefined) =>
      n === null || n === undefined ? '—' : `${cur} ${num(n)}`;
    const signed = (n: number) => `${n >= 0 ? '+' : '-'}${num(Math.abs(n))}`;
    const pctOf = (a: number, b: number) =>
      Math.abs(b) > 0.005
        ? `${(((a - b) / Math.abs(b)) * 100).toFixed(1)}%`
        : '—';

    const left = 50;
    const width = doc.page.width - 100;
    const bottomLimit = () => doc.page.height - 60;
    const ensure = (h: number) => {
      if (doc.y + h > bottomLimit()) doc.addPage();
    };

    const sectionHeading = (text: string) => {
      ensure(60);
      doc.moveDown(0.9);
      doc
        .fontSize(12)
        .fillColor(ACCENT)
        .font('Helvetica-Bold')
        .text(text.toUpperCase(), left, doc.y, { characterSpacing: 0.5 });
      doc
        .moveTo(left, doc.y + 2)
        .lineTo(left + width, doc.y + 2)
        .strokeColor(RULE)
        .lineWidth(1)
        .stroke();
      doc.moveDown(0.5);
    };

    const paragraph = (text: string, color = INK, italic = false) => {
      doc
        .fontSize(10)
        .fillColor(color)
        .font(italic ? 'Helvetica-Oblique' : 'Helvetica')
        .text(text, left, doc.y, { width, lineGap: 3 });
      doc.moveDown(0.5);
    };

    const commentary = (text: string) => {
      if (!text?.trim()) return;
      ensure(40);
      const y = doc.y;
      doc
        .fontSize(9.5)
        .fillColor(MUTED)
        .font('Helvetica-Oblique')
        .text(text.trim(), left + 10, y, { width: width - 10, lineGap: 2 });
      doc
        .moveTo(left + 2, y)
        .lineTo(left + 2, doc.y)
        .strokeColor(ACCENT)
        .lineWidth(2)
        .stroke();
      doc.moveDown(0.6);
    };

    type Col = {
      label: string;
      w: number;
      align?: 'left' | 'right' | 'center';
    };
    const table = (
      cols: Col[],
      rows: {
        cells: string[];
        bold?: boolean;
        fill?: string;
        color?: string;
      }[],
    ) => {
      const total = cols.reduce((s, c) => s + c.w, 0);
      const scale = width / total;
      const widths = cols.map((c) => c.w * scale);
      const rowH = (cells: string[], bold: boolean) => {
        doc.fontSize(8.5).font(bold ? 'Helvetica-Bold' : 'Helvetica');
        return (
          Math.max(
            ...cells.map((t, i) =>
              doc.heightOfString(t, { width: widths[i] - 8 }),
            ),
          ) + 8
        );
      };
      const drawRow = (
        cells: string[],
        bold: boolean,
        fill?: string,
        color = INK,
        header = false,
      ) => {
        const h = rowH(cells, bold || header);
        ensure(h + 2);
        const y = doc.y;
        if (header || fill) {
          doc
            .rect(left, y, width, h)
            .fillColor(header ? SOFT : fill!)
            .fill();
        }
        let x = left;
        cells.forEach((t, i) => {
          doc
            .fontSize(header ? 8 : 8.5)
            .fillColor(header ? MUTED : color)
            .font(bold || header ? 'Helvetica-Bold' : 'Helvetica')
            .text(header ? t.toUpperCase() : t, x + 4, y + 4, {
              width: widths[i] - 8,
              align: cols[i].align ?? 'left',
            });
          x += widths[i];
        });
        doc.y = y + h;
        doc
          .moveTo(left, doc.y)
          .lineTo(left + width, doc.y)
          .strokeColor(RULE)
          .lineWidth(0.5)
          .stroke();
      };
      drawRow(
        cols.map((c) => c.label),
        true,
        undefined,
        INK,
        true,
      );
      rows.forEach((r) => drawRow(r.cells, !!r.bold, r.fill, r.color));
      doc.moveDown(0.6);
    };

    const kpiBoxes = (
      items: { label: string; value: string; sub?: string; color?: string }[],
    ) => {
      ensure(60);
      const gap = 8;
      const w = (width - gap * (items.length - 1)) / items.length;
      const y = doc.y;
      items.forEach((k, i) => {
        const x = left + i * (w + gap);
        doc.rect(x, y, w, 52).strokeColor(RULE).lineWidth(0.8).stroke();
        doc
          .fontSize(7.5)
          .fillColor(MUTED)
          .font('Helvetica-Bold')
          .text(k.label.toUpperCase(), x + 6, y + 6, { width: w - 12 });
        doc
          .fontSize(11)
          .fillColor(k.color ?? INK)
          .font('Helvetica-Bold')
          .text(k.value, x + 6, y + 19, { width: w - 12 });
        if (k.sub)
          doc
            .fontSize(7.5)
            .fillColor(MUTED)
            .font('Helvetica')
            .text(k.sub, x + 6, y + 38, { width: w - 12 });
      });
      doc.y = y + 62;
    };

    // ── Header ──────────────────────────────────────────────
    doc
      .fontSize(9)
      .fillColor(MUTED)
      .font('Helvetica')
      .text(data.firmName.toUpperCase(), left, 50, { characterSpacing: 1 });
    doc
      .fontSize(20)
      .fillColor(INK)
      .font('Helvetica-Bold')
      .text('Management Report');
    doc
      .fontSize(12)
      .fillColor(MUTED)
      .font('Helvetica')
      .text(`${data.meta.periodType} · ${data.meta.periodLabel}`);
    doc
      .moveTo(left, doc.y + 8)
      .lineTo(left + width, doc.y + 8)
      .strokeColor(ACCENT)
      .lineWidth(2)
      .stroke();
    doc.moveDown(1);

    const m = data.management;
    const k = data.overview.kpis;
    const t = data.pnl.totals;

    // 1 ── CEO / MD message — leads the report
    sectionHeading("1. CEO / Managing Director's Message");
    if (m.commentary.ceoMessage?.trim()) {
      m.commentary.ceoMessage
        .trim()
        .split(/\n\s*\n/)
        .forEach((para) => paragraph(para.replace(/\n/g, ' ')));
    } else {
      paragraph(
        'No CEO / MD message has been written for this period yet.',
        MUTED,
        true,
      );
    }

    // 2 ── Executive summary
    sectionHeading('2. Executive Summary');
    kpiBoxes([
      {
        label: `Revenue (${data.meta.shortLabel})`,
        value: money(k.revenue),
        sub:
          k.revenueChangePct === null
            ? undefined
            : `${k.revenueChangePct >= 0 ? '+' : ''}${k.revenueChangePct}% vs ${data.meta.priorLabel}`,
        color: POSITIVE,
      },
      {
        label: `Revenue (${data.meta.ytdLabel})`,
        value: money(k.revenueYtd),
        sub:
          k.revenuePctOfAnnualBudget === null
            ? 'No annual budget set'
            : `${k.revenuePctOfAnnualBudget}% of annual budget`,
      },
      {
        label: 'Net margin',
        value: k.netMargin === null ? '—' : `${k.netMargin}%`,
        sub: 'target 18%',
      },
      {
        label: 'Cash runway',
        value: k.runwayMonths === null ? '—' : `${k.runwayMonths} months`,
        sub: 'at average monthly costs',
      },
    ]);
    const lightColor = (s: string) =>
      s === 'good'
        ? POSITIVE
        : s === 'bad'
          ? NEGATIVE
          : s === 'warn'
            ? AMBER
            : MUTED;
    (['revenue', 'collections', 'costs'] as const).forEach((key) => {
      const l = data.lights[key];
      doc
        .fontSize(9.5)
        .font('Helvetica-Bold')
        .fillColor(lightColor(l.status))
        .text(`${key.charAt(0).toUpperCase() + key.slice(1)}: `, left, doc.y, {
          continued: true,
        })
        .font('Helvetica')
        .fillColor(INK)
        .text(l.text);
    });
    doc.moveDown(0.4);

    // 3 ── Income statement
    sectionHeading('3. Income Statement Summary');
    const incomeRows: [string, Cols3, boolean?][] = [
      ['Total revenue', t.revenue],
      ['Cost of services', t.costOfServices],
      ['Gross profit', t.grossProfit, true],
      ['Operating expenses', t.operatingExpenses],
      ['Profit before tax', t.profitBeforeTax, true],
    ];
    table(
      [
        { label: '', w: 2.2 },
        { label: data.meta.shortLabel, w: 1.5, align: 'right' },
        { label: data.meta.priorLabel, w: 1.5, align: 'right' },
        { label: 'Variance', w: 1.4, align: 'right' },
        { label: data.meta.ytdLabel, w: 1.6, align: 'right' },
      ],
      incomeRows.map(([label, v, bold]) => ({
        cells: [
          label,
          num(v.cur),
          num(v.prior),
          signed(v.cur - v.prior),
          num(v.ytd),
        ],
        bold,
        fill: bold ? '#f0f4ff' : undefined,
      })),
    );

    // 4 ── Revenue
    sectionHeading('4. Revenue Analysis');
    if (data.overview.revenueTrend.length) {
      const trend = data.overview.revenueTrend;
      const max = Math.max(...trend.map((x) => x.value), 1);
      ensure(110);
      const baseY = doc.y + 80;
      const bw = width / trend.length;
      trend.forEach((x, i) => {
        const h = Math.max(2, (x.value / max) * 70);
        doc
          .rect(left + i * bw + 4, baseY - h, bw - 8, h)
          .fillColor(i === trend.length - 1 ? ACCENT : '#c4cad4')
          .fill();
        doc
          .fontSize(7)
          .fillColor(MUTED)
          .font('Helvetica')
          .text(x.label, left + i * bw, baseY + 3, {
            width: bw,
            align: 'center',
          });
      });
      doc.y = baseY + 16;
    }
    commentary(m.commentary.revenue);
    if (data.revenueAnalysis.serviceLines.length) {
      table(
        [
          { label: 'Service line (YTD)', w: 3 },
          { label: 'Amount', w: 2, align: 'right' },
          { label: '%', w: 1, align: 'right' },
        ],
        data.revenueAnalysis.serviceLines.map((s) => ({
          cells: [s.name, money(s.val), `${s.pct}%`],
        })),
      );
    }
    if (data.revenueAnalysis.topClients.length) {
      table(
        [
          { label: 'Top clients by revenue (YTD)', w: 3 },
          { label: 'Amount', w: 2, align: 'right' },
        ],
        data.revenueAnalysis.topClients.map((c) => ({
          cells: [c.name, money(c.val)],
        })),
      );
    }

    // 5 ── Costs
    sectionHeading('5. Cost Analysis');
    if (data.overview.expenseBreakdown.items.length) {
      table(
        [
          { label: `Expense category (${data.meta.shortLabel})`, w: 3 },
          { label: 'Amount', w: 2, align: 'right' },
          { label: '% of total', w: 1, align: 'right' },
        ],
        data.overview.expenseBreakdown.items.map((e) => ({
          cells: [e.name, money(e.val), `${e.pct}%`],
        })),
      );
    } else {
      paragraph('No expenses were posted in this period.', MUTED, true);
    }
    commentary(m.commentary.costs);

    // 6 ── Cash flow
    sectionHeading('6. Cash Flow');
    kpiBoxes([
      { label: 'Cash position', value: money(k.cashPosition), color: POSITIVE },
      { label: 'Monthly burn', value: money(k.monthlyBurn) },
      {
        label: 'Cash runway',
        value: k.runwayMonths === null ? '—' : `${k.runwayMonths} months`,
      },
    ]);
    table(
      [
        { label: `Category (${data.meta.ytdLabel})`, w: 3 },
        { label: cur, w: 2, align: 'right' },
      ],
      [
        { cells: ['Operating activities', num(data.cashFlow.ytd.operating)] },
        { cells: ['Investing activities', num(data.cashFlow.ytd.investing)] },
        { cells: ['Financing activities', num(data.cashFlow.ytd.financing)] },
        {
          cells: ['Net change in cash', num(data.cashFlow.ytd.netChange)],
          bold: true,
          fill: '#e9f9ef',
        },
      ],
    );
    commentary(m.commentary.cashflow);

    // 7 ── Receivables
    sectionHeading('7. Receivables Aging');
    const ar = data.agedReceivables;
    const arPct = (v: number) =>
      ar.total > 0.005 ? `${((v / ar.total) * 100).toFixed(1)}%` : '—';
    table(
      [
        { label: 'Aging bucket', w: 3 },
        { label: 'Amount', w: 2, align: 'right' },
        { label: '% of total', w: 1, align: 'right' },
      ],
      [
        {
          cells: [
            'Current',
            money(ar.buckets.current),
            arPct(ar.buckets.current),
          ],
        },
        { cells: ['1–30 days', money(ar.buckets.d30), arPct(ar.buckets.d30)] },
        { cells: ['31–60 days', money(ar.buckets.d60), arPct(ar.buckets.d60)] },
        {
          cells: ['61–90 days', money(ar.buckets.d90), arPct(ar.buckets.d90)],
          color: NEGATIVE,
        },
        {
          cells: ['90+ days', money(ar.buckets.d90p), arPct(ar.buckets.d90p)],
          color: NEGATIVE,
        },
        { cells: ['Total receivables', money(ar.total), '100%'], bold: true },
      ],
    );
    commentary(m.commentary.receivables);

    // 8 ── Payables
    sectionHeading('8. Payables Aging');
    const ap = data.agedPayables;
    table(
      [
        { label: 'Aging bucket', w: 3 },
        { label: 'Amount', w: 2, align: 'right' },
      ],
      [
        { cells: ['Current', money(ap.buckets.current)] },
        { cells: ['1–30 days', money(ap.buckets.d30)] },
        { cells: ['31–60 days', money(ap.buckets.d60)] },
        { cells: ['60+ days', money(ap.buckets.d60p)], color: NEGATIVE },
        { cells: ['Total payables', money(ap.total)], bold: true },
      ],
    );
    commentary(m.commentary.payables);

    // 9 ── Budget
    sectionHeading('9. Budget vs Actual');
    if (data.budget.hasBudget) {
      const b = data.budget.totals;
      const lines: [string, ActBud, boolean?][] = [
        ['Revenue', b.revenue],
        ['Cost of services', b.costOfServices],
        ['Gross profit', b.grossProfit, true],
        ['Operating expenses', b.operatingExpenses],
        ['Net profit', b.netProfit, true],
      ];
      table(
        [
          { label: 'Line item (YTD)', w: 2.4 },
          { label: 'Actual', w: 1.6, align: 'right' },
          { label: 'Budget', w: 1.6, align: 'right' },
          { label: 'Variance', w: 1.5, align: 'right' },
          { label: 'Var %', w: 1, align: 'right' },
        ],
        lines.map(([label, v, bold]) => ({
          cells: [
            label,
            num(v.actual),
            num(v.budget),
            signed(v.actual - v.budget),
            pctOf(v.actual, v.budget),
          ],
          bold,
        })),
      );
    } else {
      paragraph('No budget has been set for this year.', MUTED, true);
    }
    commentary(m.commentary.budget);

    // 10 ── KPIs
    sectionHeading('10. Key Performance Indicators');
    const rows: { cells: string[]; color?: string }[] = [];
    data.ratios.forEach((g) =>
      g.items.forEach((r) =>
        rows.push({
          cells: [
            r.name,
            r.display,
            r.target,
            r.ok === null ? '—' : r.ok ? 'On track' : 'Watch',
          ],
          color: r.ok === null ? INK : r.ok ? POSITIVE : AMBER,
        }),
      ),
    );
    table(
      [
        { label: 'Metric', w: 3 },
        { label: 'Value', w: 1.6, align: 'right' },
        { label: 'Target', w: 1.4, align: 'right' },
        { label: 'Status', w: 1.4 },
      ],
      rows,
    );

    // 11 ── Risks
    sectionHeading('11. Risks and Issues');
    if (m.risks.length) {
      table(
        [
          { label: 'Severity', w: 1.1 },
          { label: 'Description', w: 3 },
          { label: 'Impact', w: 1.8 },
          { label: 'Owner', w: 1.1 },
          { label: 'Mitigation', w: 2 },
        ],
        m.risks.map((r) => ({
          cells: [
            r.severity.charAt(0).toUpperCase() + r.severity.slice(1),
            r.text,
            r.impact || '—',
            r.owner || '—',
            r.mitigation || '—',
          ],
        })),
      );
    } else {
      paragraph('No risks have been recorded for this period.', MUTED, true);
    }

    // 12 ── Actions
    sectionHeading('12. Actions for Next Period');
    if (m.actions.length) {
      table(
        [
          { label: 'Priority', w: 1.1 },
          { label: 'Action', w: 4 },
          { label: 'Owner', w: 1.3 },
          { label: 'Due', w: 1.3 },
        ],
        m.actions.map((a) => ({
          cells: [
            a.priority.charAt(0).toUpperCase() + a.priority.slice(1),
            a.text,
            a.owner || '—',
            a.due || '—',
          ],
        })),
      );
    } else {
      paragraph(
        'No actions have been recorded for the next period.',
        MUTED,
        true,
      );
    }

    // ── Footer on every page ────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.page.margins.bottom = 0;
      doc
        .fontSize(8)
        .fillColor(MUTED)
        .font('Helvetica')
        .text(
          `${data.firmName} · Confidential — for internal management use · Generated ${new Date().toLocaleDateString()} · Page ${i + 1} of ${range.count}`,
          left,
          doc.page.height - 40,
          { width, align: 'center', lineBreak: false },
        );
    }
    doc.end();
  });
}
