import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  Fund,
  FundDocument,
  CapitalCommitment,
  CapitalCommitmentDocument,
  CapitalCall,
  CapitalCallDocument,
  CapitalCallStatus,
  CapitalAccountEntry,
  CapitalAccountEntryDocument,
  CapitalAccountEntryType,
  FundReport,
  FundReportDocument,
} from '../schemas';
import { GenerateStatementsDto } from '../dtos';
import {
  buildReportPdf,
  lookupTenantCompanyName,
  ReportSection,
} from 'src/common/utils/pdf/report-builder.util';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientNotificationType } from 'src/modules/clients/schemas/client-notification.schema';
import { LpReportingService } from './fund.service';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n: number) =>
  (n ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const dateOnly = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : '');

// ── Periods ────────────────────────────────────────────────────────
// '2026-Q4', 'FY 2026' / '2026', 'YTD', 'ITD' (inception to date), or
// a custom from/to.

export function resolvePeriod(
  period?: string,
  from?: string,
  to?: string,
): { label: string; from: Date | null; to: Date } {
  const now = new Date();
  const p = (period ?? 'ITD').trim();
  const q = /^(\d{4})-Q([1-4])$/i.exec(p);
  if (q) {
    const y = +q[1];
    const n = +q[2];
    return {
      label: `${y}-Q${n}`,
      from: new Date(Date.UTC(y, (n - 1) * 3, 1)),
      to: new Date(Date.UTC(y, n * 3, 0, 23, 59, 59, 999)),
    };
  }
  const fy = /^(?:FY\s*)?(\d{4})$/i.exec(p);
  if (fy) {
    const y = +fy[1];
    return {
      label: `FY ${y}`,
      from: new Date(Date.UTC(y, 0, 1)),
      to: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)),
    };
  }
  if (/^ytd$/i.test(p)) {
    return {
      label: `YTD ${now.getUTCFullYear()}`,
      from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
      to: now,
    };
  }
  if (/^custom$/i.test(p) || from || to) {
    const f = from ? new Date(from) : null;
    const t = to ? new Date(to) : now;
    t.setUTCHours(23, 59, 59, 999);
    return {
      label: `${f ? dateOnly(f) : 'inception'} to ${dateOnly(t)}`,
      from: f,
      to: t,
    };
  }
  return { label: `Inception to ${dateOnly(now)}`, from: null, to: now };
}

/** Writes a generated file under uploads/ and returns where it can be fetched. */
export function storeGeneratedFile(
  tenantId: string,
  folder: string,
  ext: string,
  buffer: Buffer,
) {
  const dir = join(process.cwd(), 'uploads', folder, tenantId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${uuidv4()}.${ext}`);
  writeFileSync(path, buffer);
  const raw = path.replace(/\\/g, '/');
  const i = raw.indexOf('uploads/');
  return {
    path,
    url: `${process.env.APP_URL}/${i !== -1 ? raw.slice(i) : raw}`,
    size: buffer.length,
  };
}

// ── LP capital account statements ──────────────────────────────────
// How one investor's money has flowed through the fund: what they
// committed, what has been called and paid, what the fund has done with
// it (income, expenses, gains, fees), what has come back, and what the
// account is worth. Everything is read from the capital account ledger
// and the issued calls — never typed in.

@Injectable()
export class FundStatementService {
  constructor(
    @InjectModel(Fund.name) private readonly fundModel: Model<FundDocument>,
    @InjectModel(CapitalCommitment.name)
    private readonly commitmentModel: Model<CapitalCommitmentDocument>,
    @InjectModel(CapitalCall.name)
    private readonly callModel: Model<CapitalCallDocument>,
    @InjectModel(CapitalAccountEntry.name)
    private readonly entryModel: Model<CapitalAccountEntryDocument>,
    @InjectModel(FundReport.name)
    private readonly reportModel: Model<FundReportDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly lpReporting: LpReportingService,
    private readonly email: EmailService,
    private readonly events: EventEmitter2,
  ) {}

  private async summarise(
    tenantId: string,
    fundId: string,
    commitmentId: string,
    window: { from: Date | null; to: Date },
  ) {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const [fund, commitment] = await Promise.all([
      this.fundModel.findOne({ _id: fId, tenantId: tId }).lean(),
      this.commitmentModel
        .findOne({ _id: commitmentId, tenantId: tId, fundId: fId })
        .lean(),
    ]);
    if (!fund) throw new NotFoundException('Fund not found');
    if (!commitment) throw new NotFoundException('Commitment not found');
    const entries = await this.entryModel
      .find({ tenantId: tId, fundId: fId, commitmentId: commitment._id })
      .sort({ date: 1, createdAt: 1 })
      .lean();

    const inPeriod = entries.filter(
      (e) => (!window.from || e.date >= window.from) && e.date <= window.to,
    );
    const before = window.from
      ? entries.filter((e) => e.date < window.from!)
      : [];
    const sum = (arr: any[], ...types: CapitalAccountEntryType[]) =>
      r2(
        arr
          .filter((e) => types.includes(e.type))
          .reduce((s, e) => s + e.amount, 0),
      );
    const opening = r2(before.reduce((s, e) => s + e.amount, 0));
    const T = CapitalAccountEntryType;
    const contributions = sum(inPeriod, T.CONTRIBUTION);
    const income = sum(inPeriod, T.INCOME);
    const expenses = sum(inPeriod, T.EXPENSE);
    const gainLoss = sum(inPeriod, T.GAIN_LOSS);
    const distributions = sum(inPeriod, T.DISTRIBUTION);
    const other = r2(
      inPeriod
        .filter(
          (e) =>
            ![
              T.CONTRIBUTION,
              T.INCOME,
              T.EXPENSE,
              T.GAIN_LOSS,
              T.DISTRIBUTION,
            ].includes(e.type),
        )
        .reduce((s, e) => s + e.amount, 0),
    );
    const closing = r2(opening + inPeriod.reduce((s, e) => s + e.amount, 0));
    return {
      fund,
      commitment,
      entries,
      inPeriod,
      opening,
      contributions,
      income,
      expenses,
      gainLoss,
      distributions,
      other,
      closing,
      allTime: {
        paidIn: sum(entries, T.CONTRIBUTION),
        distributed: -sum(entries, T.DISTRIBUTION),
        balance: r2(entries.reduce((s, e) => s + e.amount, 0)),
      },
    };
  }

  async getStatement(
    tenantId: string,
    fundId: string,
    commitmentId: string,
    q: {
      period?: string;
      from?: string;
      to?: string;
      comparative?: boolean;
    } = {},
  ) {
    const tId = new Types.ObjectId(tenantId);
    const win = resolvePeriod(q.period, q.from, q.to);
    const s = await this.summarise(tenantId, fundId, commitmentId, win);

    const calls = await this.callModel
      .find({
        tenantId: tId,
        fundId: new Types.ObjectId(fundId),
        status: { $ne: CapitalCallStatus.DRAFT },
      })
      .sort({ issuedOn: 1 })
      .lean();
    const callRows = calls
      .map((c) => {
        const a: any = (c.allocations as any[]).find(
          (x) => String(x.commitmentId) === commitmentId,
        );
        if (!a) return null;
        return {
          callId: String(c._id),
          ref: c.ref,
          purpose: c.purpose,
          issuedOn: c.issuedOn,
          dueOn: c.dueOn,
          amount: a.amount,
          funded: a.fundedAmount,
          outstanding: r2(a.amount - a.fundedAmount),
          fundedAt: a.fundedAt,
          status: a.status,
          overdue:
            a.fundedAmount < a.amount - 0.005 && new Date(c.dueOn) < new Date(),
        };
      })
      .filter(Boolean) as any[];

    const called = r2(callRows.reduce((x, r) => x + r.amount, 0));
    const paid = r2(callRows.reduce((x, r) => x + r.funded, 0));
    const c = s.commitment;

    // The running ledger for the period, oldest first.
    let run = s.opening;
    const ledger = s.inPeriod.map((e) => {
      run = r2(run + e.amount);
      return {
        date: e.date,
        type: e.type,
        description: e.description,
        amount: e.amount,
        balance: run,
      };
    });

    const paidIn = s.allTime.paidIn;
    const dpi = paidIn > 0 ? s.allTime.distributed / paidIn : 0;
    const rvpi = paidIn > 0 ? s.allTime.balance / paidIn : 0;

    let fees: any = null;
    if (/^\d{4}-Q[1-4]$/i.test(win.label)) {
      try {
        fees = await this.lpReporting.getFeeExpenseDisclosure(
          tenantId,
          fundId,
          commitmentId,
          win.label,
        );
      } catch {
        fees = null;
      }
    }

    let comparative: any = null;
    if (q.comparative && win.from) {
      const span = win.to.getTime() - win.from.getTime();
      const prior = {
        from: new Date(win.from.getTime() - span - 1),
        to: new Date(win.from.getTime() - 1),
      };
      const p = await this.summarise(tenantId, fundId, commitmentId, prior);
      comparative = {
        label: `${dateOnly(prior.from)} to ${dateOnly(prior.to)}`,
        opening: p.opening,
        contributions: p.contributions,
        income: p.income,
        expenses: p.expenses,
        gainLoss: p.gainLoss,
        distributions: p.distributions,
        other: p.other,
        closing: p.closing,
      };
    }

    return {
      fund: { _id: s.fund._id, name: s.fund.name, currency: s.fund.currency },
      lp: {
        commitmentId,
        name: c.lpName,
        type: c.type,
        closeLabel: c.closeLabel,
        email: c.lpEmail,
        hasSideLetter: c.hasSideLetter,
        mgmtFeeRate: c.mgmtFeePctOverride ?? s.fund.mgmtFeePct,
        isGp: c.isGpCommitment,
      },
      period: { label: win.label, from: win.from, to: win.to },
      position: {
        commitment: c.commitment,
        called,
        paid,
        outstanding: r2(called - paid),
        uncalled: r2(c.commitment - called),
        pctCalled: c.commitment ? (called / c.commitment) * 100 : 0,
        pctPaid: c.commitment ? (paid / c.commitment) * 100 : 0,
      },
      activity: {
        opening: s.opening,
        contributions: s.contributions,
        income: s.income,
        expenses: s.expenses,
        gainLoss: s.gainLoss,
        distributions: s.distributions,
        other: s.other,
        closing: s.closing,
      },
      metrics: {
        paidIn,
        distributed: s.allTime.distributed,
        nav: s.allTime.balance,
        dpi,
        rvpi,
        tvpi: dpi + rvpi,
      },
      calls: callRows,
      ledger,
      fees,
      comparative,
    };
  }

  // ── Rendering ────────────────────────────────────────────────

  private sections(
    st: any,
    opt: {
      metrics?: boolean;
      contributions?: boolean;
      fees?: boolean;
      gains?: boolean;
    },
  ): {
    summary: { label: string; value: string }[];
    sections: ReportSection[];
  } {
    const cur = st.fund.currency;
    const a = st.activity;
    const cmp = st.comparative;
    const act: [string, number, number | undefined][] = [
      ['Opening balance', a.opening, cmp?.opening],
      [
        'Capital contributions (calls paid)',
        a.contributions,
        cmp?.contributions,
      ],
      ['Income allocated', a.income, cmp?.income],
      ['Expenses & fees allocated', a.expenses, cmp?.expenses],
    ];
    if (opt.gains !== false)
      act.push([
        'Realised / unrealised gain (loss)',
        a.gainLoss,
        cmp?.gainLoss,
      ]);
    act.push(['Distributions', a.distributions, cmp?.distributions]);
    if (a.other)
      act.push([
        'Other adjustments (default interest, equalisation…)',
        a.other,
        cmp?.other,
      ]);
    act.push(['Closing balance', a.closing, cmp?.closing]);

    const sections: ReportSection[] = [
      {
        heading: 'Your commitment',
        columns: [
          'Commitment',
          'Called',
          'Paid',
          'Called, unpaid',
          'Uncalled',
          '% called',
        ],
        rows: [
          [
            `${cur} ${money(st.position.commitment)}`,
            `${cur} ${money(st.position.called)}`,
            `${cur} ${money(st.position.paid)}`,
            `${cur} ${money(st.position.outstanding)}`,
            `${cur} ${money(st.position.uncalled)}`,
            `${st.position.pctCalled.toFixed(1)}%`,
          ],
        ],
      },
      {
        heading: `Capital account activity — ${st.period.label}`,
        columns: cmp
          ? ['', 'This period', `Prior (${cmp.label})`]
          : ['', 'Amount'],
        weights: cmp ? [3, 1.5, 1.5] : [4, 2],
        rows: act.map(([k, v, p]) =>
          cmp
            ? [k, `${cur} ${money(v)}`, `${cur} ${money(p ?? 0)}`]
            : [k, `${cur} ${money(v)}`],
        ),
      },
    ];
    if (opt.metrics !== false) {
      sections.push({
        heading: 'Performance',
        note: 'DPI = distributions ÷ paid-in capital · RVPI = account balance ÷ paid-in capital · TVPI = DPI + RVPI',
        columns: [
          'Paid-in',
          'Distributed',
          'Account balance',
          'DPI',
          'RVPI',
          'TVPI',
        ],
        rows: [
          [
            `${cur} ${money(st.metrics.paidIn)}`,
            `${cur} ${money(st.metrics.distributed)}`,
            `${cur} ${money(st.metrics.nav)}`,
            `${st.metrics.dpi.toFixed(2)}x`,
            `${st.metrics.rvpi.toFixed(2)}x`,
            `${st.metrics.tvpi.toFixed(2)}x`,
          ],
        ],
      });
    }
    if (opt.contributions !== false) {
      sections.push({
        heading: 'Capital calls',
        columns: [
          'Call',
          'Issued',
          'Due',
          'Purpose',
          'Called',
          'Paid',
          'Status',
        ],
        weights: [0.9, 1, 1, 2.6, 1.3, 1.3, 1.1],
        rows: st.calls.map((c: any) => [
          c.ref,
          dateOnly(c.issuedOn),
          dateOnly(c.dueOn),
          c.purpose,
          `${cur} ${money(c.amount)}`,
          `${cur} ${money(c.funded)}`,
          c.overdue ? 'Overdue' : c.status,
        ]),
      });
    }
    if (opt.fees !== false && st.fees) {
      const f = st.fees;
      sections.push({
        heading: `Fee & expense allocation — ${f.period}`,
        columns: ['Item', 'Fund total', 'Your share'],
        weights: [3, 1.5, 1.5],
        rows: [
          ...(f.managementFee
            ? [
                [
                  `Management fee (${f.managementFee.ratePct}% p.a.)`,
                  `${cur} ${money(f.managementFee.feeAmount)}`,
                  `${cur} ${money(f.managementFee.feeAmount)}`,
                ],
              ]
            : []),
          ...f.expenses.map((e: any) => [
            e.category,
            `${cur} ${money(e.totalAmount)}`,
            `${cur} ${money(e.theirShare)}`,
          ]),
        ],
      });
    }
    sections.push({
      heading: 'Ledger',
      columns: ['Date', 'Type', 'Description', 'Amount', 'Balance'],
      weights: [1, 1.5, 4, 1.4, 1.4],
      rows: st.ledger.map((l: any) => [
        dateOnly(l.date),
        l.type,
        l.description,
        `${l.amount < 0 ? '-' : '+'}${money(Math.abs(l.amount))}`,
        money(l.balance),
      ]),
    });
    return {
      summary: [
        { label: 'Closing balance', value: `${cur} ${money(a.closing)}` },
        {
          label: 'Called to date',
          value: `${cur} ${money(st.position.called)}`,
        },
        { label: 'Uncalled', value: `${cur} ${money(st.position.uncalled)}` },
      ],
      sections,
    };
  }

  async statementPdf(
    tenantId: string,
    fundId: string,
    commitmentId: string,
    q: any = {},
  ): Promise<{ buffer: Buffer; filename: string }> {
    const st = await this.getStatement(tenantId, fundId, commitmentId, q);
    const { summary, sections } = this.sections(st, q);
    const buffer = await buildReportPdf({
      companyName: st.fund.name,
      title: `Capital account statement — ${st.lp.name}`,
      subtitle: `${st.fund.name} · ${st.period.label}`,
      summary,
      sections,
    });
    return {
      buffer,
      filename: `Capital-account-statement-${st.lp.name.replace(/\s+/g, '-')}-${st.period.label.replace(/\s+/g, '-')}.pdf`,
    };
  }

  private async statementXlsx(statements: any[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const used = new Set<string>();
    for (const st of statements) {
      let name = st.lp.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28);
      while (used.has(name)) name = name.slice(0, 26) + '_' + used.size;
      used.add(name);
      const ws = wb.addWorksheet(name);
      const cur = st.fund.currency;
      ws.addRow([`${st.fund.name} — capital account statement`]).font = {
        bold: true,
        size: 13,
      };
      ws.addRow([st.lp.name, st.period.label]);
      ws.addRow([]);
      ws.addRow(['Commitment', st.position.commitment]);
      ws.addRow(['Called', st.position.called]);
      ws.addRow(['Paid', st.position.paid]);
      ws.addRow(['Uncalled', st.position.uncalled]);
      ws.addRow([]);
      ws.addRow(['Activity', cur]).font = { bold: true };
      const a = st.activity;
      [
        ['Opening balance', a.opening],
        ['Contributions', a.contributions],
        ['Income allocated', a.income],
        ['Expenses & fees', a.expenses],
        ['Gain (loss)', a.gainLoss],
        ['Distributions', a.distributions],
        ['Other', a.other],
        ['Closing balance', a.closing],
      ].forEach((r) => ws.addRow(r));
      ws.addRow([]);
      ws.addRow(['DPI', st.metrics.dpi]);
      ws.addRow(['RVPI', st.metrics.rvpi]);
      ws.addRow(['TVPI', st.metrics.tvpi]);
      ws.addRow([]);
      ws.addRow(['Date', 'Type', 'Description', 'Amount', 'Balance']).font = {
        bold: true,
      };
      st.ledger.forEach((l: any) =>
        ws.addRow([
          dateOnly(l.date),
          l.type,
          l.description,
          l.amount,
          l.balance,
        ]),
      );
      ws.columns.forEach((c) => (c.width = 24));
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // ── Generating a pack of statements ───────────────────────────

  async generate(
    tenantId: string,
    fundId: string,
    dto: GenerateStatementsDto,
    actorName: string,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const all = await this.commitmentModel
      .find({ tenantId: tId, fundId: new Types.ObjectId(fundId) })
      .sort({ createdAt: 1 })
      .lean();
    const targets = dto.commitmentIds?.length
      ? all.filter((c) => dto.commitmentIds!.includes(String(c._id)))
      : all;
    if (!targets.length)
      throw new BadRequestException('No LPs to produce statements for');

    const opt = {
      metrics: dto.metrics,
      contributions: dto.contributions,
      fees: dto.fees,
      gains: dto.gains,
    };
    const q = {
      period: dto.period,
      from: dto.from,
      to: dto.to,
      comparative: dto.comparative,
    };
    const statements: any[] = [];
    for (const c of targets) {
      statements.push(
        await this.getStatement(tenantId, fundId, String(c._id), q),
      );
    }
    const fund = statements[0].fund;
    const label = statements[0].period.label;
    const format = dto.format ?? 'pdf';

    const files: any[] = [];
    if (format === 'pdf' || format === 'both') {
      const allSections: ReportSection[] = [];
      let summary: any;
      for (const st of statements) {
        const s = this.sections(st, opt);
        summary = summary ?? s.summary;
        allSections.push({
          heading: `━━ ${st.lp.name} ━━`,
          note: `${st.lp.type} · ${st.lp.closeLabel} close${st.lp.hasSideLetter ? ' · side letter' : ''}`,
          columns: [],
          rows: [],
        });
        allSections.push(...s.sections);
      }
      const buffer = await buildReportPdf({
        companyName: fund.name,
        title:
          statements.length === 1
            ? `Capital account statement — ${statements[0].lp.name}`
            : 'Capital account statements',
        subtitle: `${fund.name} · ${label}`,
        summary: statements.length === 1 ? summary : undefined,
        sections: allSections,
      });
      const stored = storeGeneratedFile(
        tenantId,
        'fund-reports',
        'pdf',
        buffer,
      );
      files.push({
        name: `Capital-account-statements-${label.replace(/\s+/g, '-')}.pdf`,
        mimeType: 'application/pdf',
        format: 'pdf',
        ...stored,
      });
    }
    if (format === 'xlsx' || format === 'both') {
      const stored = storeGeneratedFile(
        tenantId,
        'fund-reports',
        'xlsx',
        await this.statementXlsx(statements),
      );
      files.push({
        name: `Capital-account-statements-${label.replace(/\s+/g, '-')}.xlsx`,
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        format: 'xlsx',
        ...stored,
      });
    }

    // Delivery — each LP gets their own statement, not the whole pack.
    const delivery = dto.delivery ?? 'download';
    const deliveries: any[] = [];
    if (delivery !== 'download') {
      for (const c of targets) {
        if (/email/.test(delivery)) {
          try {
            if (!c.lpEmail) throw new Error('No email address on file');
            const one = await this.statementPdf(
              tenantId,
              fundId,
              String(c._id),
              {
                ...q,
                ...opt,
              },
            );
            await this.email.sendFundNotice(
              {
                to: c.lpEmail,
                recipientName: c.lpName,
                fundName: fund.name,
                subject: `Capital account statement — ${fund.name} (${label})`,
                message: `Please find attached your capital account statement for ${fund.name} for ${label}.`,
                attachmentNote: 'The statement is attached as a PDF.',
              },
              [{ filename: one.filename, content: one.buffer }],
            );
            deliveries.push({
              lpName: c.lpName,
              email: c.lpEmail,
              sentAt: new Date(),
              channel: 'Email',
              status: 'Sent',
              error: '',
            });
          } catch (e: any) {
            deliveries.push({
              lpName: c.lpName,
              email: c.lpEmail ?? '',
              sentAt: new Date(),
              channel: 'Email',
              status: 'Failed',
              error: String(e?.message ?? e).slice(0, 200),
            });
          }
        }
        if (/portal/.test(delivery)) {
          this.events.emit('client.general.notice', {
            tenantId,
            clientUserId: String(c.lpUserId),
            title: `Capital account statement — ${fund.name}`,
            description: `Your statement for ${label} is ready.`,
            type: ClientNotificationType.DOCUMENT,
          });
          deliveries.push({
            lpName: c.lpName,
            email: '',
            sentAt: new Date(),
            channel: 'Portal',
            status: 'Sent',
            error: '',
          });
        }
      }
    }

    const report = await this.reportModel.create({
      tenantId: tId,
      fundId: new Types.ObjectId(fundId),
      reportType: 'Capital Account Statement',
      title: `Capital account statements — ${label}`,
      period: label,
      periodStart: statements[0].period.from,
      periodEnd: statements[0].period.to,
      recipients:
        dto.commitmentIds?.length === 1 ? dto.commitmentIds[0] : 'all',
      recipientLabel:
        targets.length === 1 ? targets[0].lpName : `${targets.length} LPs`,
      delivery:
        delivery === 'download'
          ? 'Generate only (download)'
          : delivery === 'email'
            ? 'Generate & email to LPs'
            : delivery === 'portal'
              ? 'Generate & upload to LP portal'
              : 'Email + portal',
      status: deliveries.length ? 'Sent' : 'Generated',
      files,
      deliveries,
      generatedBy: actorName,
    });
    return report.toObject();
  }

  async companyName(tenantId: string) {
    return lookupTenantCompanyName(this.userModel, tenantId);
  }
}
