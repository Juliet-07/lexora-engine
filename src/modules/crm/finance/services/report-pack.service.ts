import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AccountType,
  Bill,
  BillDocument,
  BillStatus,
  GlEntry,
  GlEntryDocument,
  InvoiceStage,
  ManagementReport,
  ManagementReportDocument,
  ReportPeriodType,
} from '../schemas';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import {
  BoardMember,
  BoardMemberDocument,
  BoardMemberLifecycleStatus,
} from 'src/modules/grc/governance/schemas';
import { ExchangeRateService } from 'src/modules/hr/services/exchange-rate.service';
import { MandateService } from 'src/modules/crm/projects/services';
import {
  FinancialStatementsService,
  TrialBalanceService,
} from './acounting.service';
import { BudgetService } from './budget.service';
import { InvoiceService } from './invoice.service';
import { GL_ACCOUNTS } from './gl-posting.service';

// ─────────────────────────────────────────────────────────────────
// The Report page's single data source.
//
// Every tab of Finance → Report (Overview, P&L, Balance sheet, Cash
// flow, Trial balance, Aged receivables, Aged payables, Budget vs
// actuals, Ratios, Management report) reads from one "pack", built
// here from the same posted general-ledger entries, invoices, bills
// and budgets the rest of Finance already reads. Nothing in the pack
// is stored — it is computed on read, so it can't drift from the
// ledger. Only what the tenant *writes* in the management report
// (messages, commentary, risks, actions) is persisted.
//
// Currency: the GL is always in the tenant's base currency. Every
// amount in the pack is converted once, here, into the requested
// display currency (base → display at today's rate, the same
// treatment Management Reporting and the Accounting overview use).
// Invoices and bills carry their own currency and convert from that.
// ─────────────────────────────────────────────────────────────────

const DAY = 86400000;
const r2 = (n: number) => Number((n || 0).toFixed(2));
const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export interface PeriodBounds {
  periodType: ReportPeriodType;
  periodKey: string;
  start: Date;
  end: Date;
  ytdStart: Date;
  ytdEnd: Date;
  year: number;
  // Calendar month (1-12) the period ends in.
  endMonth: number;
  label: string;
  shortLabel: string;
}

export function periodBounds(
  periodType: ReportPeriodType,
  periodKey: string,
): PeriodBounds {
  if (periodType === ReportPeriodType.MONTH) {
    const [y, m] = periodKey.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59));
    return {
      periodType,
      periodKey,
      start,
      end,
      ytdStart: new Date(Date.UTC(y, 0, 1)),
      ytdEnd: end,
      year: y,
      endMonth: m,
      label: `${start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`,
      shortLabel: `${MONTHS[m - 1]} ${y}`,
    };
  }
  if (periodType === ReportPeriodType.QUARTER) {
    const [y, q] = periodKey.split('-Q').map(Number);
    const startMonth = (q - 1) * 3;
    const start = new Date(Date.UTC(y, startMonth, 1));
    const end = new Date(Date.UTC(y, startMonth + 3, 0, 23, 59, 59));
    return {
      periodType,
      periodKey,
      start,
      end,
      ytdStart: new Date(Date.UTC(y, 0, 1)),
      ytdEnd: end,
      year: y,
      endMonth: startMonth + 3,
      label: `Q${q} ${y}`,
      shortLabel: `Q${q} ${y}`,
    };
  }
  const y = Number(periodKey);
  const start = new Date(Date.UTC(y, 0, 1));
  const end = new Date(Date.UTC(y, 11, 31, 23, 59, 59));
  return {
    periodType,
    periodKey,
    start,
    end,
    ytdStart: start,
    ytdEnd: end,
    year: y,
    endMonth: 12,
    label: String(y),
    shortLabel: String(y),
  };
}

export function priorPeriodKey(
  periodType: ReportPeriodType,
  periodKey: string,
): string {
  if (periodType === ReportPeriodType.MONTH) {
    const [y, m] = periodKey.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  }
  if (periodType === ReportPeriodType.QUARTER) {
    const [y, q] = periodKey.split('-Q').map(Number);
    return q === 1 ? `${y - 1}-Q4` : `${y}-Q${q - 1}`;
  }
  return String(Number(periodKey) - 1);
}

type Cls = 'revenue' | 'otherIncome' | 'cos' | 'opex' | 'otherExpense' | 'tax';

// How each ledger account lands on the income statement. Revenue and
// expense accounts carry a sub-group in the chart of accounts; the
// statement follows it:
//   • "Payroll" (and any "Cost of services/sales/direct" sub-group) is
//     the direct cost of delivering the work — the same definition the
//     Financials KPI dashboard already uses for gross margin;
//   • a sub-group naming interest / finance / forex / FX is other
//     income or expense, below operating profit;
//   • a sub-group or name naming income tax / CIT is the tax charge;
//   • everything else is operating expense.
export function classifyAccount(a: {
  type: AccountType;
  subGroup?: string;
  name?: string;
}): Cls | null {
  const sg = (a.subGroup || '').toLowerCase();
  const nm = (a.name || '').toLowerCase();
  if (a.type === AccountType.REVENUE) {
    return /(other|interest|finance|forex|\bfx\b|gain)/.test(sg)
      ? 'otherIncome'
      : 'revenue';
  }
  if (a.type === AccountType.EXPENSE) {
    if (
      /income tax|corporate tax|\bcit\b/.test(sg) ||
      /income tax|\bcit\b/.test(nm)
    )
      return 'tax';
    if (
      /(interest|finance cost|finance charge|forex|\bfx\b)/.test(sg + ' ' + nm)
    )
      return 'otherExpense';
    if (/(payroll|cost of (services|sales)|direct)/.test(sg)) return 'cos';
    return 'opex';
  }
  return null;
}

// Default targets used to rate each ratio. These are sensible starting
// points, not tenant-configurable yet — the response labels them as
// defaults so the page never presents them as the firm's own goals.
const TARGETS: Record<
  string,
  { label: string; value: number; dir: 'min' | 'max' }
> = {
  grossMargin: { label: '60%', value: 0.6, dir: 'min' },
  ebitMargin: { label: '20%', value: 0.2, dir: 'min' },
  netMargin: { label: '18%', value: 0.18, dir: 'min' },
  roe: { label: '25%', value: 0.25, dir: 'min' },
  roa: { label: '20%', value: 0.2, dir: 'min' },
  currentRatio: { label: '>2.0x', value: 2, dir: 'min' },
  quickRatio: { label: '>1.5x', value: 1.5, dir: 'min' },
  cashRatio: { label: '>1.0x', value: 1, dir: 'min' },
  dso: { label: '30 days', value: 30, dir: 'max' },
  dpo: { label: '30 days', value: 30, dir: 'max' },
  realization: { label: '90%', value: 0.9, dir: 'min' },
  collection: { label: '90%', value: 0.9, dir: 'min' },
  staffCost: { label: '<45%', value: 0.45, dir: 'max' },
  debtToEquity: { label: '<0.5x', value: 0.5, dir: 'max' },
  interestCover: { label: '>5x', value: 5, dir: 'min' },
  equityRatio: { label: '>50%', value: 0.5, dir: 'min' },
};

type ColMap = Map<string, number>;

@Injectable()
export class ReportPackService {
  constructor(
    @InjectModel(GlEntry.name)
    private readonly glModel: Model<GlEntryDocument>,
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(BoardMember.name)
    private readonly boardMemberModel: Model<BoardMemberDocument>,
    @InjectModel(ManagementReport.name)
    private readonly reportModel: Model<ManagementReportDocument>,
    private readonly fs: FinancialStatementsService,
    private readonly trialBalanceService: TrialBalanceService,
    private readonly budgetService: BudgetService,
    private readonly invoiceService: InvoiceService,
    private readonly mandateService: MandateService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  // ── Currency ────────────────────────────────────────────────────

  private async currencyContext(tenantId: string, displayCurrency?: string) {
    const tenant = await this.userModel
      .findById(tenantId)
      .select('tenantProfile.baseCurrency')
      .lean();
    const baseCurrency = (
      (tenant as any)?.tenantProfile?.baseCurrency || 'USD'
    ).toUpperCase();
    const currency = (displayCurrency || baseCurrency).toUpperCase();
    const cache = new Map<string, number>();
    const rateFrom = async (from: string): Promise<number> => {
      const f = (from || baseCurrency).toUpperCase();
      if (f === currency) return 1;
      if (cache.has(f)) return cache.get(f)!;
      const { rate } = await this.exchangeRateService.getRate(f, currency);
      cache.set(f, rate);
      return rate;
    };
    const baseRate = await rateFrom(baseCurrency);
    return {
      baseCurrency,
      currency,
      baseRate,
      rateFrom,
      // Convert a base-currency (GL) amount into the display currency.
      c: (n: number) => r2((n || 0) * baseRate),
    };
  }

  // ── GL helpers ──────────────────────────────────────────────────

  // Net movement per account over a window as a signed number that is
  // positive in the account's natural direction (revenue = credit,
  // expense = debit) — what the P&L, budget and breakdowns need.
  private async flowMap(
    tenantId: string,
    from: Date,
    to: Date,
    accounts: any[],
  ): Promise<ColMap> {
    const { balanceMap } = await this.fs.getAccountBalances(
      tenantId,
      from.toISOString(),
      to.toISOString(),
    );
    const out: ColMap = new Map();
    for (const a of accounts) {
      const net = balanceMap.get(a.code) ?? 0;
      if (a.type === AccountType.REVENUE) out.set(a.code, -net);
      else if (a.type === AccountType.EXPENSE) out.set(a.code, net);
    }
    return out;
  }

  private totals(accounts: any[], m: ColMap) {
    const t = {
      revenue: 0,
      otherIncome: 0,
      cos: 0,
      opex: 0,
      otherExpense: 0,
      tax: 0,
      payroll: 0,
      depreciation: 0,
    };
    for (const a of accounts) {
      const cls = classifyAccount(a);
      if (!cls) continue;
      const v = m.get(a.code) ?? 0;
      t[cls] += v;
      if (a.type === AccountType.EXPENSE) {
        if (/payroll/i.test(a.subGroup || '')) t.payroll += v;
        if (/deprec|amortis|amortiz/i.test(a.name || '')) t.depreciation += v;
      }
    }
    const grossProfit = t.revenue - t.cos;
    const ebit = grossProfit - t.opex;
    const pbt = ebit + t.otherIncome - t.otherExpense;
    const npat = pbt - t.tax;
    return { ...t, grossProfit, ebit, pbt, npat };
  }

  // ── Income-statement layout ────────────────────────────────────
  //
  // One builder for both the P&L (columns: period, prior, YTD) and the
  // budget view (columns: actual, budget) so the two always share the
  // same structure and subtotals.

  private buildStatement(
    accounts: any[],
    cols: Record<string, ColMap>,
    conv: (n: number) => number,
  ) {
    const keys = Object.keys(cols);
    const zero = () => Object.fromEntries(keys.map((k) => [k, 0]));
    const sections: Record<Cls, { a: any; vals: Record<string, number> }[]> = {
      revenue: [],
      cos: [],
      opex: [],
      otherIncome: [],
      otherExpense: [],
      tax: [],
    };
    for (const a of accounts) {
      const cls = classifyAccount(a);
      if (!cls) continue;
      const vals: Record<string, number> = {};
      for (const k of keys) vals[k] = cols[k].get(a.code) ?? 0;
      if (keys.every((k) => Math.abs(vals[k]) < 0.005)) continue;
      sections[cls].push({ a, vals });
    }
    const sum = (list: { vals: Record<string, number> }[]) => {
      const s = zero();
      list.forEach((r) => keys.forEach((k) => (s[k] += r.vals[k])));
      return s;
    };
    const sub = (a: Record<string, number>, b: Record<string, number>) =>
      Object.fromEntries(keys.map((k) => [k, a[k] - b[k]]));
    const add = (a: Record<string, number>, b: Record<string, number>) =>
      Object.fromEntries(keys.map((k) => [k, a[k] + b[k]]));
    const cv = (v: Record<string, number>) =>
      Object.fromEntries(keys.map((k) => [k, conv(v[k])]));

    const rows: any[] = [];
    const head = (name: string) => rows.push({ type: 'h', name });
    const line = (r: { a: any; vals: Record<string, number> }, sign = 1) =>
      rows.push({
        type: 'row',
        code: r.a.code,
        name: r.a.name,
        vals: cv(Object.fromEntries(keys.map((k) => [k, r.vals[k] * sign]))),
      });
    const total = (type: string, name: string, v: Record<string, number>) =>
      rows.push({ type, name, vals: cv(v) });
    const spacer = () => rows.push({ type: 's' });

    const rev = sum(sections.revenue);
    const cos = sum(sections.cos);
    const opex = sum(sections.opex);
    const oi = sum(sections.otherIncome);
    const oe = sum(sections.otherExpense);
    const tax = sum(sections.tax);
    const gp = sub(rev, cos);
    const ebit = sub(gp, opex);
    const otherNet = sub(oi, oe);
    const pbt = add(ebit, otherNet);
    const npat = sub(pbt, tax);

    head('Revenue');
    sections.revenue.forEach((r) => line(r));
    total('t', 'Total Revenue', rev);
    spacer();
    head('Cost of Services');
    sections.cos.forEach((r) => line(r));
    total('t', 'Total Cost of Services', cos);
    total('sub', 'Gross Profit', gp);
    spacer();
    head('Operating Expenses');
    sections.opex.forEach((r) => line(r));
    total('t', 'Total Operating Expenses', opex);
    spacer();
    total('sub', 'Operating Profit (EBIT)', ebit);
    if (sections.otherIncome.length || sections.otherExpense.length) {
      spacer();
      head('Other Income / (Expenses)');
      sections.otherIncome.forEach((r) => line(r));
      sections.otherExpense.forEach((r) => line(r, -1));
      total('t', 'Total Other Income / (Expenses)', otherNet);
    }
    spacer();
    total('sub', 'Profit Before Tax', pbt);
    if (sections.tax.length) {
      sections.tax.forEach((r) => line(r, -1));
    }
    total('hl', 'Net Profit After Tax', npat);

    return {
      rows,
      totals: {
        revenue: cv(rev),
        costOfServices: cv(cos),
        grossProfit: cv(gp),
        operatingExpenses: cv(opex),
        ebit: cv(ebit),
        otherNet: cv(otherNet),
        profitBeforeTax: cv(pbt),
        tax: cv(tax),
        netProfit: cv(npat),
      },
    };
  }

  // ── Balance sheet, trial balance, cash flow ────────────────────

  private groupBalanceSheet(bs: any, c: (n: number) => number) {
    const isCurrent = (sg: string) => /current/i.test(sg) && !/non/i.test(sg);
    const rows: any[] = [];
    const head = (name: string) => rows.push({ type: 'h', name });
    const sh = (name: string) => rows.push({ type: 'sh', name });
    const line = (r: any) =>
      rows.push({ type: 'row', code: r.code, name: r.name, val: c(r.amount) });
    const total = (type: string, name: string, v: number) =>
      rows.push({ type, name, val: c(v) });
    const spacer = () => rows.push({ type: 's' });
    const sumOf = (l: any[]) => l.reduce((s, r) => s + r.amount, 0);

    const nca = bs.assets.filter((r: any) => !isCurrent(r.subGroup || ''));
    const ca = bs.assets.filter((r: any) => isCurrent(r.subGroup || ''));
    const ncl = bs.liabilities.filter((r: any) => !isCurrent(r.subGroup || ''));
    const cl = bs.liabilities.filter((r: any) => isCurrent(r.subGroup || ''));

    head('ASSETS');
    sh('Non-Current Assets');
    nca.forEach(line);
    total('t', 'Total Non-Current Assets', sumOf(nca));
    spacer();
    sh('Current Assets');
    ca.forEach(line);
    total('t', 'Total Current Assets', sumOf(ca));
    spacer();
    total('gt', 'TOTAL ASSETS', bs.totalAssets);
    spacer();
    head('EQUITY AND LIABILITIES');
    sh('Equity');
    bs.equity.forEach(line);
    total('t', 'Total Equity', bs.totalEquity);
    spacer();
    if (ncl.length) {
      sh('Non-Current Liabilities');
      ncl.forEach(line);
      total('t', 'Total Non-Current Liabilities', sumOf(ncl));
      spacer();
    }
    sh('Current Liabilities');
    cl.forEach(line);
    total('t', 'Total Current Liabilities', sumOf(cl));
    spacer();
    total(
      'gt',
      'TOTAL EQUITY AND LIABILITIES',
      bs.totalLiabilities + bs.totalEquity,
    );

    return {
      rows,
      totalAssets: c(bs.totalAssets),
      totalLiabilities: c(bs.totalLiabilities),
      totalEquity: c(bs.totalEquity),
      currentAssets: c(sumOf(ca)),
      currentLiabilities: c(sumOf(cl)),
      nonCurrentAssets: c(sumOf(nca)),
      nonCurrentLiabilities: c(sumOf(ncl)),
      balanced: bs.balanced,
    };
  }

  // Indirect-method cash flow, built from the ledger itself. "Cash" is
  // the operating bank account (1110) — the same account the Financials
  // direct cash flow and the Accounting overview use. Every other
  // account's movement is a cash effect (a debit increase is cash out,
  // a credit increase is cash in), so the three sections plus profit
  // always reconcile to the real change in cash; anything the chart of
  // accounts can't place is shown on its own line rather than hidden.
  private async cashFlowFor(
    tenantId: string,
    from: Date,
    to: Date,
    accounts: any[],
    c: (n: number) => number,
  ) {
    const before = new Date(from.getTime() - 1);
    const [open, close, flows] = await Promise.all([
      this.fs.getAccountBalances(tenantId, undefined, before.toISOString()),
      this.fs.getAccountBalances(tenantId, undefined, to.toISOString()),
      this.flowMap(tenantId, from, to, accounts),
    ]);
    const cashCode = GL_ACCOUNTS.BANK_OPERATING.code;
    const accDepCode = GL_ACCOUNTS.ACCUMULATED_DEPRECIATION.code;
    const bal = (m: ColMap | Map<string, number>, code: string) =>
      m.get(code) ?? 0;
    const delta = (code: string) =>
      bal(close.balanceMap, code) - bal(open.balanceMap, code);

    const totals = this.totals(accounts, flows);
    const netProfit = totals.npat;

    const operating: { name: string; val: number }[] = [];
    const investing: { name: string; val: number }[] = [];
    const financing: { name: string; val: number }[] = [];
    const adjustments: { name: string; val: number }[] = [];
    const working: { name: string; val: number }[] = [];

    const dep = -delta(accDepCode);
    if (Math.abs(dep) > 0.005)
      adjustments.push({ name: 'Depreciation and amortisation', val: dep });

    for (const a of accounts) {
      if (a.code === cashCode || a.code === accDepCode) continue;
      if (a.type === AccountType.REVENUE || a.type === AccountType.EXPENSE)
        continue;
      const effect = -delta(a.code);
      if (Math.abs(effect) < 0.005) continue;
      const sg = a.subGroup || '';
      const nonCurrent = /non/i.test(sg) && /current/i.test(sg);
      if (a.type === AccountType.ASSET) {
        if (nonCurrent)
          investing.push({
            name: `${effect < 0 ? 'Purchase of' : 'Disposal of'} ${a.name}`,
            val: effect,
          });
        else
          working.push({
            name: `(Increase)/decrease in ${a.name}`,
            val: effect,
          });
      } else if (a.type === AccountType.EQUITY) {
        financing.push({
          name: `${effect > 0 ? 'Capital contributed' : 'Capital withdrawn'} — ${a.name}`,
          val: effect,
        });
      } else if (
        nonCurrent ||
        /paid-in capital|loan|borrowing|lease liabilit/i.test(a.name || '')
      ) {
        financing.push({
          name: `Movement in ${a.name}`,
          val: effect,
        });
      } else {
        working.push({
          name: `Increase/(decrease) in ${a.name}`,
          val: effect,
        });
      }
    }

    const sumV = (l: { val: number }[]) => l.reduce((s, x) => s + x.val, 0);
    const opTotalBeforeResidual = netProfit + sumV(adjustments) + sumV(working);
    const netChange = delta(cashCode);
    const computed = opTotalBeforeResidual + sumV(investing) + sumV(financing);
    const residual = netChange - computed;
    if (Math.abs(residual) > 0.01) {
      working.push({
        name: 'Other movements (not mapped to the chart of accounts)',
        val: residual,
      });
    }

    const opTotal = netProfit + sumV(adjustments) + sumV(working);
    const rows: any[] = [];
    const head = (name: string) => rows.push({ type: 'h', name });
    const sh = (name: string) => rows.push({ type: 'sh', name });
    const line = (name: string, v: number) =>
      rows.push({ type: 'row', name, val: c(v) });
    const total = (type: string, name: string, v: number) =>
      rows.push({ type, name, val: c(v) });
    const spacer = () => rows.push({ type: 's' });

    head('Cash flows from operating activities');
    line('Net profit for the period', netProfit);
    if (adjustments.length) {
      sh('Adjustments for:');
      adjustments.forEach((x) => line(x.name, x.val));
    }
    if (working.length) {
      sh('Changes in working capital:');
      working.forEach((x) => line(x.name, x.val));
    }
    total('t', 'Net cash from operating activities', opTotal);
    spacer();
    head('Cash flows from investing activities');
    investing.forEach((x) => line(x.name, x.val));
    total('t', 'Net cash from investing activities', sumV(investing));
    spacer();
    head('Cash flows from financing activities');
    financing.forEach((x) => line(x.name, x.val));
    total('t', 'Net cash from financing activities', sumV(financing));
    spacer();
    total('gt', 'Net increase / (decrease) in cash', netChange);
    line('Cash at beginning of period', bal(open.balanceMap, cashCode));
    total('gt', 'Cash at end of period', bal(close.balanceMap, cashCode));

    return {
      rows,
      operating: c(opTotal),
      investing: c(sumV(investing)),
      financing: c(sumV(financing)),
      netChange: c(netChange),
      openingCash: c(bal(open.balanceMap, cashCode)),
      closingCash: c(bal(close.balanceMap, cashCode)),
      unmapped: c(residual),
    };
  }

  // ── Aged receivables / payables ───────────────────────────────

  private async agedReceivables(
    tenantId: string,
    asOf: Date,
    ctx: Awaited<ReturnType<ReportPackService['currencyContext']>>,
    glReceivable: number,
  ) {
    const OPEN: string[] = [
      InvoiceStage.SENT,
      InvoiceStage.PART_PAID,
      InvoiceStage.OVERDUE,
    ];
    const invoices = (await this.invoiceService.getAll(tenantId)) as any[];
    const open = invoices.filter((i) => OPEN.includes(i.stage) && !i.proforma);
    const byClient = new Map<string, any>();
    for (const i of open) {
      const owed = (i.payable ?? 0) - (i.paidAmount ?? 0);
      if (owed <= 0.005) continue;
      const rate = await ctx.rateFrom(i.currency);
      const amount = owed * rate;
      const days = Math.floor(
        (asOf.getTime() - new Date(i.dueOn).getTime()) / DAY,
      );
      const key = String(i.clientUserId ?? i.clientName);
      const row = byClient.get(key) ?? {
        client: i.clientName,
        clientUserId: i.clientUserId ? String(i.clientUserId) : null,
        current: 0,
        d30: 0,
        d60: 0,
        d90: 0,
        d90p: 0,
        total: 0,
        invoices: 0,
        oldestDays: 0,
      };
      if (days <= 0) row.current += amount;
      else if (days <= 30) row.d30 += amount;
      else if (days <= 60) row.d60 += amount;
      else if (days <= 90) row.d90 += amount;
      else row.d90p += amount;
      row.total += amount;
      row.invoices += 1;
      row.oldestDays = Math.max(row.oldestDays, days);
      byClient.set(key, row);
    }
    const rows = [...byClient.values()]
      .map((r) => ({
        ...r,
        current: r2(r.current),
        d30: r2(r.d30),
        d60: r2(r.d60),
        d90: r2(r.d90),
        d90p: r2(r.d90p),
        total: r2(r.total),
      }))
      .sort((a, b) => b.total - a.total);
    const sum = (k: string) => r2(rows.reduce((s, r) => s + (r as any)[k], 0));
    const buckets = {
      current: sum('current'),
      d30: sum('d30'),
      d60: sum('d60'),
      d90: sum('d90'),
      d90p: sum('d90p'),
    };
    const total = sum('total');
    return {
      asOf: asOf.toISOString(),
      rows,
      buckets,
      total,
      overdue60Plus: r2(buckets.d90 + buckets.d90p),
      overdueTotal: r2(total - buckets.current),
      // The ledger's own receivable balance, shown so any gap between
      // invoices and the GL (e.g. history posted before a fix) is
      // visible instead of silently averaged away.
      glBalance: ctx.c(glReceivable),
      difference: r2(total - ctx.c(glReceivable)),
    };
  }

  private async agedPayables(
    tenantId: string,
    asOf: Date,
    ctx: Awaited<ReturnType<ReportPackService['currencyContext']>>,
    glPayable: number,
  ) {
    const bills = await this.billModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        status: { $in: [BillStatus.APPROVED, BillStatus.SCHEDULED] },
      })
      .lean();
    const byVendor = new Map<string, any>();
    for (const b of bills) {
      const rate = await ctx.rateFrom(b.currency);
      const amount = (b.amount ?? 0) * rate;
      const days = Math.floor(
        (asOf.getTime() - new Date(b.dueOn).getTime()) / DAY,
      );
      const key = String(b.vendorId ?? b.vendorName);
      const row = byVendor.get(key) ?? {
        vendor: b.vendorName,
        vendorId: b.vendorId ? String(b.vendorId) : null,
        current: 0,
        d30: 0,
        d60: 0,
        d60p: 0,
        total: 0,
        bills: 0,
        oldestDays: 0,
      };
      if (days <= 0) row.current += amount;
      else if (days <= 30) row.d30 += amount;
      else if (days <= 60) row.d60 += amount;
      else row.d60p += amount;
      row.total += amount;
      row.bills += 1;
      row.oldestDays = Math.max(row.oldestDays, days);
      byVendor.set(key, row);
    }
    const rows = [...byVendor.values()]
      .map((r) => ({
        ...r,
        current: r2(r.current),
        d30: r2(r.d30),
        d60: r2(r.d60),
        d60p: r2(r.d60p),
        total: r2(r.total),
      }))
      .sort((a, b) => b.total - a.total);
    const sum = (k: string) => r2(rows.reduce((s, r) => s + (r as any)[k], 0));
    const buckets = {
      current: sum('current'),
      d30: sum('d30'),
      d60: sum('d60'),
      d60p: sum('d60p'),
    };
    const total = sum('total');
    return {
      asOf: asOf.toISOString(),
      rows,
      buckets,
      total,
      glBalance: ctx.c(glPayable),
      difference: r2(total - ctx.c(glPayable)),
    };
  }

  // ── Budget (YTD) ───────────────────────────────────────────────

  private async budgetYtd(
    tenantId: string,
    p: PeriodBounds,
    accounts: any[],
    actualYtd: ColMap,
    conv: (n: number) => number,
  ) {
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const budgets = await Promise.all(
      months.map((m) =>
        this.budgetService.getBudget(tenantId, `${p.year}-${pad(m)}`),
      ),
    );
    const monthMap = (idx: number): ColMap => {
      const m: ColMap = new Map();
      ((budgets[idx] as any).lines ?? []).forEach((l: any) =>
        m.set(l.accountCode, (m.get(l.accountCode) ?? 0) + l.budgetedAmount),
      );
      return m;
    };
    const sumMonths = (from: number, to: number): ColMap => {
      const out: ColMap = new Map();
      for (let i = from - 1; i < to; i++)
        monthMap(i).forEach((v, k) => out.set(k, (out.get(k) ?? 0) + v));
      return out;
    };
    const firstMonthOfPeriod =
      p.periodType === ReportPeriodType.MONTH
        ? p.endMonth
        : p.periodType === ReportPeriodType.QUARTER
          ? p.endMonth - 2
          : 1;
    const ytdBudget = sumMonths(1, p.endMonth);
    const periodBudget = sumMonths(firstMonthOfPeriod, p.endMonth);
    const annualBudget = sumMonths(1, 12);
    const hasBudget = budgets.some((b: any) => (b.lines ?? []).length > 0);

    const statement = this.buildStatement(
      accounts,
      { actual: actualYtd, budget: ytdBudget },
      conv,
    );
    const totalsOf = (m: ColMap) => this.totals(accounts, m);
    return {
      hasBudget,
      rows: statement.rows,
      totals: statement.totals,
      periodBudget: {
        revenue: conv(totalsOf(periodBudget).revenue),
        expenses: conv(
          totalsOf(periodBudget).cos + totalsOf(periodBudget).opex,
        ),
      },
      annualBudget: {
        revenue: conv(totalsOf(annualBudget).revenue),
        expenses: conv(
          totalsOf(annualBudget).cos + totalsOf(annualBudget).opex,
        ),
      },
    };
  }

  // ── Ratios ─────────────────────────────────────────────────────

  private ratioSet(x: {
    cur: ReturnType<ReportPackService['totals']>;
    ytd: ReturnType<ReportPackService['totals']>;
    monthsYtd: number;
    daysYtd: number;
    bs: ReturnType<ReportPackService['groupBalanceSheet']>;
    cash: number;
    receivables: number;
    payables: number;
    employees: number;
    realization: number | null;
    collection: number | null;
  }) {
    const div = (a: number, b: number) => (b > 0.005 ? a / b : null);
    const annual = x.monthsYtd > 0 ? 12 / x.monthsYtd : 1;
    const costBase = Math.max(0, x.ytd.cos + x.ytd.opex - x.ytd.depreciation);
    const interest = x.ytd.otherExpense;
    return {
      grossMargin: div(x.cur.grossProfit, x.cur.revenue),
      ebitMargin: div(x.cur.ebit, x.cur.revenue),
      netMargin: div(x.cur.npat, x.cur.revenue),
      roe: div(x.ytd.npat * annual, x.bs.totalEquity),
      roa: div(x.ytd.npat * annual, x.bs.totalAssets),
      currentRatio: div(x.bs.currentAssets, x.bs.currentLiabilities),
      quickRatio: div(x.cash + x.receivables, x.bs.currentLiabilities),
      cashRatio: div(x.cash, x.bs.currentLiabilities),
      dso:
        x.ytd.revenue > 0.005
          ? (x.receivables / x.ytd.revenue) * x.daysYtd
          : null,
      dpo: costBase > 0.005 ? (x.payables / costBase) * x.daysYtd : null,
      revenuePerEmployee: x.employees > 0 ? x.ytd.revenue / x.employees : null,
      realization: x.realization,
      collection: x.collection,
      staffCost: div(x.cur.payroll, x.cur.revenue),
      debtToEquity: div(x.bs.totalLiabilities, x.bs.totalEquity),
      interestCover: interest > 0.005 ? x.ytd.ebit / interest : null,
      equityRatio: div(x.bs.totalEquity, x.bs.totalAssets),
    };
  }

  private buildRatios(
    cur: Record<string, number | null>,
    prior: Record<string, number | null>,
    employees: number,
    conv: (n: number) => number,
    currency: string,
  ) {
    const pct = (v: number | null) =>
      v === null ? '—' : `${(v * 100).toFixed(1)}%`;
    const xr = (v: number | null) => (v === null ? '—' : `${v.toFixed(2)}x`);
    const days = (v: number | null) =>
      v === null ? '—' : `${Math.round(v)} days`;
    const fmtMoney = (v: number | null) =>
      v === null
        ? '—'
        : `${currency} ${conv(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

    type Def = {
      key: string;
      name: string;
      fmt: (v: number | null) => string;
      formula: string;
      target?: string;
    };
    const group = (name: string, defs: Def[]) => ({
      group: name,
      items: defs.map((d) => {
        const v = cur[d.key] ?? null;
        const pv = prior[d.key] ?? null;
        const t = TARGETS[d.key];
        let ok: boolean | null = null;
        if (v !== null && t) ok = t.dir === 'min' ? v >= t.value : v <= t.value;
        let trend: 'up' | 'down' | 'flat' | null = null;
        if (v !== null && pv !== null) {
          const base = Math.max(Math.abs(pv), 1e-9);
          const change = (v - pv) / base;
          trend = change > 0.01 ? 'up' : change < -0.01 ? 'down' : 'flat';
        }
        return {
          key: d.key,
          name: d.name,
          value: v,
          display: d.fmt(v),
          target: t ? t.label : '—',
          ok,
          trend,
          formula: d.formula,
        };
      }),
    });

    return [
      group('Profitability', [
        {
          key: 'grossMargin',
          name: 'Gross profit margin',
          fmt: pct,
          formula: 'Gross Profit / Revenue',
        },
        {
          key: 'ebitMargin',
          name: 'EBIT margin',
          fmt: pct,
          formula: 'EBIT / Revenue',
        },
        {
          key: 'netMargin',
          name: 'Net profit margin',
          fmt: pct,
          formula: 'Net Profit / Revenue',
        },
        {
          key: 'roe',
          name: 'Return on equity (ROE)',
          fmt: pct,
          formula: 'Net profit (YTD, annualised) / Total equity',
        },
        {
          key: 'roa',
          name: 'Return on assets (ROA)',
          fmt: pct,
          formula: 'Net profit (YTD, annualised) / Total assets',
        },
      ]),
      group('Liquidity', [
        {
          key: 'currentRatio',
          name: 'Current ratio',
          fmt: xr,
          formula: 'Current assets / Current liabilities',
        },
        {
          key: 'quickRatio',
          name: 'Quick ratio',
          fmt: xr,
          formula: '(Cash + Receivables) / Current liabilities',
        },
        {
          key: 'cashRatio',
          name: 'Cash ratio',
          fmt: xr,
          formula: 'Cash / Current liabilities',
        },
      ]),
      group('Efficiency', [
        {
          key: 'dso',
          name: 'Days sales outstanding',
          fmt: days,
          formula: '(Receivables / YTD revenue) x days elapsed',
        },
        {
          key: 'dpo',
          name: 'Days payable outstanding',
          fmt: days,
          formula: '(Payables / YTD costs excl. depreciation) x days elapsed',
        },
        {
          key: 'revenuePerEmployee',
          name: 'Revenue per employee',
          fmt: fmtMoney,
          formula: `YTD revenue / ${employees || 0} active employees`,
        },
        {
          key: 'realization',
          name: 'Realisation rate',
          fmt: pct,
          formula: 'Value billed / standard value of time billed',
        },
        {
          key: 'collection',
          name: 'Collection rate',
          fmt: pct,
          formula: 'Cash collected / invoiced in the year to date',
        },
        {
          key: 'staffCost',
          name: 'Staff cost ratio',
          fmt: pct,
          formula: 'Payroll costs / Revenue',
        },
      ]),
      group('Leverage', [
        {
          key: 'debtToEquity',
          name: 'Debt-to-equity',
          fmt: xr,
          formula: 'Total liabilities / Equity',
        },
        {
          key: 'interestCover',
          name: 'Interest coverage',
          fmt: xr,
          formula: 'EBIT / Interest expense (year to date)',
        },
        {
          key: 'equityRatio',
          name: 'Equity ratio',
          fmt: pct,
          formula: 'Equity / Total assets',
        },
      ]),
    ];
  }

  // ── Revenue analysis (service lines, clients, trend, costs) ────

  private async revenueAnalysis(
    tenantId: string,
    p: PeriodBounds,
    ctx: Awaited<ReturnType<ReportPackService['currencyContext']>>,
  ) {
    const BILLED: string[] = [
      InvoiceStage.SENT,
      InvoiceStage.PART_PAID,
      InvoiceStage.PAID,
      InvoiceStage.OVERDUE,
      InvoiceStage.WRITTEN_OFF,
    ];
    const [invoices, mandates] = await Promise.all([
      this.invoiceService.getAll(tenantId) as Promise<any[]>,
      this.mandateService.getAll(tenantId) as Promise<any[]>,
    ]);
    const typeByMandate = new Map(
      mandates.map((m) => [String(m._id), m.type || 'Unassigned']),
    );
    const lines = new Map<string, number>();
    const clients = new Map<string, number>();
    for (const i of invoices) {
      if (!BILLED.includes(i.stage) || i.proforma) continue;
      const t = new Date(i.issuedOn).getTime();
      if (t < p.ytdStart.getTime() || t > p.ytdEnd.getTime()) continue;
      const amt = (i.net ?? 0) * (await ctx.rateFrom(i.currency));
      const line = typeByMandate.get(String(i.mandateId)) ?? 'Unassigned';
      lines.set(line, (lines.get(line) ?? 0) + amt);
      clients.set(i.clientName, (clients.get(i.clientName) ?? 0) + amt);
    }
    const total = [...lines.values()].reduce((s, v) => s + v, 0);
    const serviceLines = [...lines.entries()]
      .map(([name, val]) => ({
        name,
        val: r2(val),
        pct: total > 0 ? r2((val / total) * 100) : 0,
      }))
      .sort((a, b) => b.val - a.val);
    const sortedClients = [...clients.entries()]
      .map(([name, val]) => ({ name, val: r2(val) }))
      .sort((a, b) => b.val - a.val);
    const topClients = sortedClients.slice(0, 7);
    const rest = sortedClients.slice(7);
    if (rest.length)
      topClients.push({
        name: `All others (${rest.length} client${rest.length === 1 ? '' : 's'})`,
        val: r2(rest.reduce((s, c) => s + c.val, 0)),
      });
    return { serviceLines, topClients, invoicedTotal: r2(total) };
  }

  private async monthlyRevenue(
    tenantId: string,
    p: PeriodBounds,
    accounts: any[],
    c: (n: number) => number,
  ) {
    const revenueCodes = new Set(
      accounts
        .filter((a) => classifyAccount(a) === 'revenue')
        .map((a) => a.code),
    );
    const rows = await this.glModel.aggregate([
      {
        $match: {
          tenantId: new Types.ObjectId(tenantId),
          date: {
            $gte: new Date(Date.UTC(p.year, 0, 1)),
            $lte: new Date(Date.UTC(p.year, 11, 31, 23, 59, 59)),
          },
        },
      },
      {
        $group: {
          _id: { m: { $month: '$date' }, code: '$accountCode' },
          debit: { $sum: '$debit' },
          credit: { $sum: '$credit' },
        },
      },
    ]);
    const perMonth = new Array(12).fill(0);
    rows.forEach((r) => {
      if (revenueCodes.has(r._id.code))
        perMonth[r._id.m - 1] += r.credit - r.debit;
    });
    return Array.from({ length: p.endMonth }, (_, i) => ({
      label: MONTHS[i],
      value: c(perMonth[i]),
    }));
  }

  private expenseBreakdown(
    accounts: any[],
    m: ColMap,
    c: (n: number) => number,
  ) {
    const items = accounts
      .filter((a) => {
        const k = classifyAccount(a);
        return k === 'cos' || k === 'opex' || k === 'otherExpense';
      })
      .map((a) => ({ name: a.name, val: m.get(a.code) ?? 0 }))
      .filter((x) => x.val > 0.005)
      .sort((a, b) => b.val - a.val);
    const total = items.reduce((s, x) => s + x.val, 0);
    const top = items.slice(0, 6);
    const rest = items.slice(6).reduce((s, x) => s + x.val, 0);
    if (rest > 0.005) top.push({ name: 'Other', val: rest });
    return {
      total: c(total),
      items: top.map((x) => ({
        name: x.name,
        val: c(x.val),
        pct: total > 0 ? r2((x.val / total) * 100) : 0,
      })),
    };
  }

  // ── Management report content ──────────────────────────────────

  async getContent(
    tenantId: string,
    periodType: ReportPeriodType,
    periodKey: string,
  ) {
    const saved: any = await this.reportModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        periodType,
        periodKey,
      })
      .lean();
    const commentary = saved?.commentary ?? {};
    return {
      commentary: {
        ceoMessage: commentary.ceoMessage || saved?.executiveSummary || '',
        revenue: commentary.revenue ?? '',
        costs: commentary.costs ?? '',
        cashflow: commentary.cashflow ?? '',
        receivables: commentary.receivables ?? '',
        payables: commentary.payables ?? '',
        budget: commentary.budget ?? '',
      },
      ceoMessageStatus: saved?.ceoMessageStatus ?? 'Draft',
      risks: (saved?.risks ?? []).map((r: any) => ({
        id: String(r._id),
        severity: r.severity,
        text: r.text,
        impact: r.impact,
        likelihood: r.likelihood,
        owner: r.owner,
        mitigation: r.mitigation,
      })),
      actions: (saved?.actions ?? []).map((a: any) => ({
        id: String(a._id),
        priority: a.priority,
        text: a.text,
        owner: a.owner,
        due: a.due,
      })),
      lastEditedBy: saved?.lastEditedBy ?? '',
      updatedAt: saved?.updatedAt ?? null,
    };
  }

  async saveContent(
    tenantId: string,
    periodType: ReportPeriodType,
    periodKey: string,
    dto: {
      commentary?: object;
      ceoMessageStatus?: string;
      risks?: any[];
      actions?: any[];
    },
    editedBy: string,
  ) {
    const $set: Record<string, any> = { lastEditedBy: editedBy };
    for (const [k, v] of Object.entries(dto.commentary ?? {}) as [
      string,
      unknown,
    ][]) {
      if (typeof v === 'string') $set[`commentary.${k}`] = v;
    }
    if (dto.ceoMessageStatus) $set.ceoMessageStatus = dto.ceoMessageStatus;
    if (dto.risks) $set.risks = dto.risks;
    if (dto.actions) $set.actions = dto.actions;
    await this.reportModel.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId), periodType, periodKey },
      { $set },
      { upsert: true, new: true },
    );
    return this.getContent(tenantId, periodType, periodKey);
  }

  async boardRecipients(tenantId: string) {
    const members = await this.boardMemberModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        lifecycleStatus: BoardMemberLifecycleStatus.ACTIVE,
      })
      .select('name email')
      .lean();
    return members
      .filter((m: any) => !!m.email)
      .map((m: any) => ({ name: m.name as string, email: m.email as string }));
  }

  // ── The pack ───────────────────────────────────────────────────

  async buildPack(
    tenantId: string,
    periodType: ReportPeriodType,
    periodKey: string,
    displayCurrency?: string,
  ) {
    const p = periodBounds(periodType, periodKey);
    const priorKey = priorPeriodKey(periodType, periodKey);
    const pp = periodBounds(periodType, priorKey);
    const now = new Date();
    const asOf = p.end.getTime() > now.getTime() ? now : p.end;

    const ctx = await this.currencyContext(tenantId, displayCurrency);
    const { c } = ctx;

    const { accounts } = await this.fs.getAccountBalances(tenantId);
    const [curMap, priorMap, ytdMap, priorYtdMap] = await Promise.all([
      this.flowMap(tenantId, p.start, p.end, accounts),
      this.flowMap(tenantId, pp.start, pp.end, accounts),
      this.flowMap(tenantId, p.ytdStart, p.ytdEnd, accounts),
      this.flowMap(tenantId, pp.ytdStart, pp.ytdEnd, accounts),
    ]);
    const cur = this.totals(accounts, curMap);
    const prior = this.totals(accounts, priorMap);
    const ytd = this.totals(accounts, ytdMap);
    const priorYtd = this.totals(accounts, priorYtdMap);

    const [
      bsRaw,
      bsPriorRaw,
      tb,
      cfPeriod,
      cfYtd,
      kpi,
      trend,
      revenueAnalysis,
      asOfNow,
    ] = await Promise.all([
      this.fs.getBalanceSheet(tenantId, p.end.toISOString()),
      this.fs.getBalanceSheet(tenantId, pp.end.toISOString()),
      this.trialBalanceService.getTrialBalance(tenantId, p.end.toISOString()),
      this.cashFlowFor(tenantId, p.start, p.end, accounts, c),
      this.cashFlowFor(tenantId, p.ytdStart, p.ytdEnd, accounts, c),
      this.fs.getKpiDashboard(
        tenantId,
        p.ytdStart.toISOString(),
        p.ytdEnd.toISOString(),
      ),
      this.monthlyRevenue(tenantId, p, accounts, c),
      this.revenueAnalysis(tenantId, p, ctx),
      this.fs.getAccountBalances(tenantId, undefined, now.toISOString()),
    ]);

    const bs = this.groupBalanceSheet(bsRaw, c);

    const rowAmount = (bsx: any, code: string) =>
      [...bsx.assets, ...bsx.liabilities].find((r: any) => r.code === code)
        ?.amount ?? 0;
    const cashCode = GL_ACCOUNTS.BANK_OPERATING.code;
    const arCode = GL_ACCOUNTS.ACCOUNTS_RECEIVABLE.code;
    const apCode = GL_ACCOUNTS.ACCOUNTS_PAYABLE.code;
    const nowBal = (code: string) => asOfNow.balanceMap.get(code) ?? 0;
    const glReceivableNow = Math.max(0, nowBal(arCode));
    const glPayableNow = Math.max(0, -nowBal(apCode));
    const cashNow = nowBal(cashCode);

    const [receivables, payables] = await Promise.all([
      this.agedReceivables(tenantId, now, ctx, glReceivableNow),
      this.agedPayables(tenantId, now, ctx, glPayableNow),
    ]);

    // Income statement + budget
    const pnl = this.buildStatement(
      accounts,
      { cur: curMap, prior: priorMap, ytd: ytdMap },
      c,
    );
    const budget = await this.budgetYtd(tenantId, p, accounts, ytdMap, c);

    // Ratios (current vs prior period)
    const monthsYtd = Math.max(
      1,
      (Math.min(p.ytdEnd.getTime(), now.getTime()) - p.ytdStart.getTime()) /
        (DAY * 30.4375),
    );
    const monthsYtdPrior = Math.max(
      1,
      (pp.ytdEnd.getTime() - pp.ytdStart.getTime()) / (DAY * 30.4375),
    );
    const daysYtd = Math.max(
      1,
      Math.round(
        (Math.min(p.ytdEnd.getTime(), now.getTime()) - p.ytdStart.getTime()) /
          DAY,
      ),
    );
    const daysYtdPrior = Math.max(
      1,
      Math.round((pp.ytdEnd.getTime() - pp.ytdStart.getTime()) / DAY),
    );
    const ratiosCur = this.ratioSet({
      cur,
      ytd,
      monthsYtd,
      daysYtd,
      bs: this.rawBs(bsRaw),
      cash: rowAmount(bsRaw, cashCode),
      receivables: Math.max(0, rowAmount(bsRaw, arCode)),
      payables: Math.max(0, rowAmount(bsRaw, apCode)),
      employees: kpi.activeEmployees,
      realization: kpi.realizationRate,
      collection: kpi.collectionRate,
    });
    const ratiosPrior = this.ratioSet({
      cur: prior,
      ytd: priorYtd,
      monthsYtd: monthsYtdPrior,
      daysYtd: daysYtdPrior,
      bs: this.rawBs(bsPriorRaw),
      cash: rowAmount(bsPriorRaw, cashCode),
      receivables: Math.max(0, rowAmount(bsPriorRaw, arCode)),
      payables: Math.max(0, rowAmount(bsPriorRaw, apCode)),
      employees: kpi.activeEmployees,
      realization: null,
      collection: null,
    });
    const ratios = this.buildRatios(
      ratiosCur as any,
      ratiosPrior as any,
      kpi.activeEmployees,
      c,
      ctx.currency,
    );

    // Cash runway: how many months the cash on hand covers at the
    // year-to-date average monthly cash cost of running the firm.
    const monthlyBurn =
      Math.max(0, ytd.cos + ytd.opex - ytd.depreciation) / monthsYtd;
    const runwayMonths = monthlyBurn > 0.005 ? cashNow / monthlyBurn : null;

    const cashStart = rowAmount(bsPriorRaw, cashCode);
    const pctChange = (a: number, b: number) =>
      Math.abs(b) > 0.005 ? r2(((a - b) / Math.abs(b)) * 100) : null;
    const dso = (ratiosCur as any).dso as number | null;

    const periodRevenueBudget = budget.periodBudget.revenue;
    const overview = {
      kpis: {
        revenue: c(cur.revenue),
        revenuePrior: c(prior.revenue),
        revenueChangePct: pctChange(cur.revenue, prior.revenue),
        netProfit: c(cur.npat),
        netProfitPrior: c(prior.npat),
        netMargin:
          cur.revenue > 0.005 ? r2((cur.npat / cur.revenue) * 100) : null,
        cashPosition: c(cashNow),
        cashChangePct: pctChange(cashNow, cashStart),
        receivables: c(glReceivableNow),
        receivablesOverdue60Plus: receivables.overdue60Plus,
        payables: c(glPayableNow),
        revenueYtd: c(ytd.revenue),
        revenuePctOfAnnualBudget:
          budget.annualBudget.revenue > 0.005
            ? r2((c(ytd.revenue) / budget.annualBudget.revenue) * 100)
            : null,
        monthlyBurn: c(monthlyBurn),
        runwayMonths: runwayMonths === null ? null : r2(runwayMonths),
        dso: dso === null ? null : r2(dso),
      },
      revenueTrend: trend,
      expenseBreakdown: this.expenseBreakdown(accounts, curMap, c),
    };

    // Headline traffic lights for the executive summary.
    const lights = (() => {
      const revVsBudget =
        periodRevenueBudget > 0.005
          ? ((c(cur.revenue) - periodRevenueBudget) / periodRevenueBudget) * 100
          : null;
      const revenueLight =
        revVsBudget === null
          ? {
              status: 'neutral',
              text: 'No revenue budget set for this period.',
            }
          : {
              status:
                revVsBudget >= 0 ? 'good' : revVsBudget > -10 ? 'warn' : 'bad',
              text: `${revVsBudget >= 0 ? 'Ahead of' : 'Behind'} budget by ${Math.abs(revVsBudget).toFixed(1)}% for the period.`,
            };
      const dsoTarget = TARGETS.dso.value;
      const collectionsLight =
        dso === null
          ? {
              status: 'neutral',
              text: 'Not enough billing history to measure DSO.',
            }
          : {
              status:
                dso <= dsoTarget
                  ? 'good'
                  : dso <= dsoTarget * 1.5
                    ? 'warn'
                    : 'bad',
              text: `DSO at ${Math.round(dso)} days (target ${dsoTarget}).`,
            };
      const opexBudgetYtd = budget.totals.operatingExpenses.budget;
      const opexActualYtd = budget.totals.operatingExpenses.actual;
      const costsLight =
        budget.hasBudget && opexBudgetYtd > 0.005
          ? (() => {
              const v = ((opexActualYtd - opexBudgetYtd) / opexBudgetYtd) * 100;
              return {
                status: v <= 0 ? 'good' : v < 10 ? 'warn' : 'bad',
                text: `Operating expenses ${Math.abs(v).toFixed(1)}% ${v <= 0 ? 'under' : 'over'} budget year to date.`,
              };
            })()
          : { status: 'neutral', text: 'No operating expense budget set.' };
      return {
        revenue: revenueLight,
        collections: collectionsLight,
        costs: costsLight,
      };
    })();

    const content = await this.getContent(tenantId, periodType, periodKey);
    const recipients = await this.boardRecipients(tenantId);

    return {
      meta: {
        periodType,
        periodKey,
        periodLabel: p.label,
        shortLabel: p.shortLabel,
        priorLabel: pp.shortLabel,
        ytdLabel: `YTD ${p.year}`,
        from: p.start.toISOString(),
        to: p.end.toISOString(),
        ytdFrom: p.ytdStart.toISOString(),
        asOf: asOf.toISOString(),
        baseCurrency: ctx.baseCurrency,
        currency: ctx.currency,
        rate: ctx.baseRate,
        generatedAt: now.toISOString(),
      },
      overview,
      pnl: {
        rows: pnl.rows,
        totals: pnl.totals,
      },
      balanceSheet: { ...bs, asOf: p.end.toISOString() },
      cashFlow: { period: cfPeriod, ytd: cfYtd },
      trialBalance: {
        asOf: tb.asOf,
        rows: tb.rows.map((r) => ({
          code: r.code,
          name: r.name,
          type: r.type,
          debit: c(r.debit),
          credit: c(r.credit),
        })),
        totalDebit: c(tb.totalDebit),
        totalCredit: c(tb.totalCredit),
        balanced: tb.balanced,
      },
      agedReceivables: receivables,
      agedPayables: payables,
      budget,
      ratios,
      revenueAnalysis,
      lights,
      management: {
        ...content,
        boardRecipients: recipients.length,
      },
      notes: {
        costOfServices:
          'Cost of services is the Payroll sub-group of the chart of accounts (and any sub-group named cost of services / direct costs); everything else is operating expense.',
        targets: 'Ratio targets are default benchmarks, not yet set per firm.',
        position:
          'Cash, receivables and payables are balances as of today, from the general ledger.',
      },
    };
  }

  // Splits the raw balance sheet into the few totals the ratios need.
  private rawBs(bs: any) {
    const isCurrent = (sg: string) => /current/i.test(sg) && !/non/i.test(sg);
    const sum = (l: any[]) => l.reduce((s, r) => s + r.amount, 0);
    return {
      rows: [],
      totalAssets: bs.totalAssets,
      totalLiabilities: bs.totalLiabilities,
      totalEquity: bs.totalEquity,
      currentAssets: sum(
        bs.assets.filter((r: any) => isCurrent(r.subGroup || '')),
      ),
      currentLiabilities: sum(
        bs.liabilities.filter((r: any) => isCurrent(r.subGroup || '')),
      ),
      nonCurrentAssets: 0,
      nonCurrentLiabilities: 0,
      balanced: bs.balanced,
    };
  }
}
