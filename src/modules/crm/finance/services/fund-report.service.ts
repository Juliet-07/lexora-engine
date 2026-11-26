import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Fund,
  FundDocument,
  CapitalCommitment,
  CapitalCommitmentDocument,
  CapitalCall,
  CapitalCallDocument,
  CapitalCallStatus,
  Distribution,
  DistributionDocument,
  FundReport,
  FundReportDocument,
  SideLetter,
  SideLetterDocument,
  SideLetterStatus,
  FundExpense,
  FundExpenseDocument,
  ManagementFeeCharge,
  ManagementFeeChargeDocument,
} from '../schemas';
import { GenerateLpReportDto, UploadFundReportDto } from '../dtos';
import {
  buildReportPdf,
  ReportSection,
} from 'src/common/utils/pdf/report-builder.util';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { ClientNotificationType } from 'src/modules/clients/schemas/client-notification.schema';
import {
  NavService,
  PortfolioHoldingService,
  DistributionService,
  ComplianceService,
} from './fund.service';
import { FundNoticeService } from './fund-notice.service';
import {
  FundStatementService,
  resolvePeriod,
  storeGeneratedFile,
} from './fund-statement.service';
import { fileRecord, UploadedFundFile } from './fund-document.service';

export const GENERATED_REPORT_TYPES = [
  {
    type: 'Quarterly LP Report',
    description:
      'NAV, performance, portfolio, capital activity and compliance in one pack',
  },
  {
    type: 'Capital Account Statement',
    description: "Each LP's own capital account for the period",
  },
  { type: 'NAV Statement', description: 'Net asset value and its build-up' },
  {
    type: 'Fee & Expense Summary',
    description: 'Management fees charged and fund expenses borne',
  },
  {
    type: 'Cash Flow Waterfall',
    description: 'Calls, distributions and the waterfall tiers',
  },
  {
    type: 'Investor Update',
    description: 'A short update: headline numbers, portfolio and commentary',
  },
  {
    type: 'Compliance Summary',
    description: 'Compliance calendar and LPA restriction monitoring',
  },
  {
    type: 'Capital Call Notice',
    description: 'The notices for one capital call (choose the call)',
  },
  {
    type: 'Distribution Notice',
    description: 'The notices for one distribution (choose the distribution)',
  },
  { type: 'Custom Report', description: 'Pick the sections yourself' },
];
export const UPLOAD_ONLY_REPORT_TYPES = [
  {
    type: 'Annual Financial Statements',
    description:
      'Audited statements must be prepared by the fund auditor — upload the signed copy',
  },
  {
    type: 'Tax Report',
    description:
      'Tax reports must be prepared by a qualified tax adviser — upload the final version',
  },
];
export const REPORT_SECTIONS = [
  'Performance summary',
  'Portfolio',
  'Capital activity',
  'Fees & expenses',
  'Waterfall',
  'Compliance',
  'LP capital accounts',
];

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n: number, cur = '') =>
  `${cur ? cur + ' ' : ''}${(n ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const dateOnly = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const MIME_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Injectable()
export class FundReportService {
  constructor(
    @InjectModel(FundReport.name)
    private readonly model: Model<FundReportDocument>,
    @InjectModel(Fund.name) private readonly fundModel: Model<FundDocument>,
    @InjectModel(CapitalCommitment.name)
    private readonly commitmentModel: Model<CapitalCommitmentDocument>,
    @InjectModel(CapitalCall.name)
    private readonly callModel: Model<CapitalCallDocument>,
    @InjectModel(Distribution.name)
    private readonly distributionModel: Model<DistributionDocument>,
    @InjectModel(SideLetter.name)
    private readonly sideLetterModel: Model<SideLetterDocument>,
    @InjectModel(FundExpense.name)
    private readonly expenseModel: Model<FundExpenseDocument>,
    @InjectModel(ManagementFeeCharge.name)
    private readonly feeModel: Model<ManagementFeeChargeDocument>,
    private readonly nav: NavService,
    private readonly holdings: PortfolioHoldingService,
    private readonly distributions: DistributionService,
    private readonly compliance: ComplianceService,
    private readonly statements: FundStatementService,
    private readonly notices: FundNoticeService,
    private readonly email: EmailService,
    private readonly events: EventEmitter2,
  ) {}

  private scope(tenantId: string, fundId: string) {
    return {
      tenantId: new Types.ObjectId(tenantId),
      fundId: new Types.ObjectId(fundId),
    };
  }

  private async fund(tenantId: string, fundId: string) {
    const f = await this.fundModel
      .findOne({ _id: fundId, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!f) throw new NotFoundException('Fund not found');
    return f;
  }

  async list(tenantId: string, fundId: string) {
    await this.fund(tenantId, fundId);
    const reports = await this.model
      .find(this.scope(tenantId, fundId))
      .sort({ createdAt: -1 })
      .lean();
    const now = new Date();
    const year = now.getUTCFullYear();
    const q = Math.floor(now.getUTCMonth() / 3) + 1;
    const periods: string[] = [];
    for (let i = 0; i < 6; i++) {
      let qq = q - i;
      let yy = year;
      while (qq < 1) {
        qq += 4;
        yy -= 1;
      }
      periods.push(`${yy}-Q${qq}`);
    }
    return {
      reports,
      types: GENERATED_REPORT_TYPES,
      uploadOnlyTypes: UPLOAD_ONLY_REPORT_TYPES,
      sections: REPORT_SECTIONS,
      periods: [...periods, `FY ${year}`, `FY ${year - 1}`, 'YTD', 'ITD'],
    };
  }

  // ── Building a report ──────────────────────────────────────

  private async build(
    tenantId: string,
    fundId: string,
    type: string,
    win: { label: string; from: Date | null; to: Date },
    sections: string[] | undefined,
    commentary: string,
  ): Promise<{
    title: string;
    summary: { label: string; value: string }[];
    sections: ReportSection[];
  }> {
    const fund: any = await this.fund(tenantId, fundId);
    const cur = fund.currency;
    const want = (s: string) => {
      if (type === 'Custom Report') return !!sections?.includes(s);
      if (type === 'Quarterly LP Report') return true;
      const map: Record<string, string[]> = {
        'NAV Statement': ['Performance summary', 'Portfolio'],
        'Fee & Expense Summary': ['Fees & expenses'],
        'Cash Flow Waterfall': ['Capital activity', 'Waterfall'],
        'Investor Update': [
          'Performance summary',
          'Portfolio',
          'Capital activity',
        ],
        'Compliance Summary': ['Compliance'],
      };
      return (map[type] ?? []).includes(s);
    };

    const [navRes, perf] = await Promise.all([
      this.nav.getNav(tenantId, fundId),
      this.nav.getPerformanceMetrics(tenantId, fundId),
    ]);
    const out: ReportSection[] = [];
    if (commentary.trim())
      out.push({
        heading: 'Commentary from the General Partner',
        columns: [],
        rows: [],
        note: commentary.trim(),
      });

    if (want('Performance summary')) {
      out.push({
        heading: 'Performance summary',
        note: perf.netIrrNote,
        columns: [
          'Called',
          'Distributed',
          'NAV',
          'DPI',
          'RVPI',
          'TVPI',
          'Net IRR',
        ],
        rows: [
          [
            money(perf.called, cur),
            money(perf.distributed, cur),
            money(perf.nav, cur),
            `${perf.dpi.toFixed(2)}x`,
            `${perf.rvpi.toFixed(2)}x`,
            `${perf.tvpi.toFixed(2)}x`,
            perf.netIrr == null ? 'n/a' : `${(perf.netIrr * 100).toFixed(1)}%`,
          ],
        ],
      });
      out.push({
        heading: 'NAV build-up',
        columns: ['Item', 'Amount'],
        weights: [4, 2],
        rows: [
          [
            'Portfolio investments at fair value',
            money(navRes.portfolioTotal, cur),
          ],
          ['Cash held', money(navRes.cashHeld, cur)],
          [
            'Less: accrued management fee',
            money(-navRes.accruedManagementFeePayable, cur),
          ],
          [
            'Less: fund expenses payable',
            money(-navRes.fundExpensesPayable, cur),
          ],
          ['Net asset value', money(navRes.nav, cur)],
        ],
      });
    }

    if (want('Portfolio')) {
      const hs = await this.holdings.getAll(tenantId, fundId);
      out.push({
        heading: 'Portfolio',
        columns: ['Company', 'Cost', 'Fair value', 'Valuation period'],
        weights: [3, 1.5, 1.5, 1.5],
        rows: navRes.portfolioInvestments.map((r: any) => [
          r.companyName,
          money(r.costBasis, cur),
          money(r.fairValue, cur),
          r.period ?? 'At cost',
        ]),
      });
      void hs;
    }

    if (want('Capital activity')) {
      const calls = await this.callModel
        .find({
          ...this.scope(tenantId, fundId),
          status: { $ne: CapitalCallStatus.DRAFT },
        })
        .sort({ issuedOn: 1 })
        .lean();
      const inWin = (d: any) =>
        (!win.from || new Date(d) >= win.from) && new Date(d) <= win.to;
      out.push({
        heading: `Capital calls — ${win.label}`,
        columns: ['Call', 'Issued', 'Due', 'Purpose', 'Called', 'Paid'],
        weights: [1, 1, 1, 3, 1.5, 1.5],
        rows: calls
          .filter((c) => inWin(c.issuedOn))
          .map((c) => [
            c.ref,
            dateOnly(c.issuedOn),
            dateOnly(c.dueOn),
            c.purpose,
            money(c.totalAmount, cur),
            money(
              (c.allocations as any[]).reduce((s, a) => s + a.fundedAmount, 0),
              cur,
            ),
          ]),
      });
      const ds = await this.distributionModel
        .find(this.scope(tenantId, fundId))
        .sort({ date: 1 })
        .lean();
      out.push({
        heading: `Distributions — ${win.label}`,
        columns: ['Reference', 'Date', 'Source', 'Total', 'To LPs'],
        weights: [1, 1, 3, 1.5, 1.5],
        rows: ds
          .filter((d) => inWin(d.date))
          .map((d) => [
            d.ref,
            dateOnly(d.date),
            d.sourceDescription || d.source,
            money(d.totalAmount, cur),
            money(d.totalToLps, cur),
          ]),
      });
    }

    if (want('Fees & expenses')) {
      const [fees, expenses] = await Promise.all([
        this.feeModel
          .find(this.scope(tenantId, fundId))
          .sort({ period: 1 })
          .lean(),
        this.expenseModel
          .find(this.scope(tenantId, fundId))
          .sort({ date: 1 })
          .lean(),
      ]);
      out.push({
        heading: 'Management fees',
        columns: ['Period', 'Basis', 'Base amount', 'Fee', 'Status'],
        weights: [1, 2, 1.5, 1.5, 1],
        rows: fees.map((f) => [
          f.period,
          f.basis,
          money(f.totalBaseAmount, cur),
          money(f.totalFeeAmount, cur),
          f.status,
        ]),
      });
      out.push({
        heading: 'Fund expenses',
        columns: ['Date', 'Category', 'Amount', 'Borne by', 'GP-borne portion'],
        weights: [1, 3, 1.5, 1, 1.5],
        rows: expenses
          .filter((e) => (!win.from || e.date >= win.from) && e.date <= win.to)
          .map((e) => [
            dateOnly(e.date),
            e.category,
            money(e.amount, cur),
            e.borneBy,
            money(e.gpBorneAmount, cur),
          ]),
      });
    }

    if (want('Waterfall')) {
      const w: any = await this.distributions.getWaterfallState(
        tenantId,
        fundId,
      );
      out.push({
        heading: `Distribution waterfall (${w.waterfallType})`,
        columns: ['Tier', 'Target', 'Paid', 'Remaining'],
        weights: [3, 1.5, 1.5, 1.5],
        rows: [
          [
            '1 · Return of capital',
            money(w.tier1.target, cur),
            money(w.tier1.paid, cur),
            money(w.tier1.remaining, cur),
          ],
          [
            '2 · Preferred return',
            money(w.tier2.target, cur),
            money(w.tier2.paid, cur),
            money(w.tier2.remaining, cur),
          ],
          [
            '3 · GP catch-up',
            money(w.tier3.target, cur),
            money(w.tier3.paid, cur),
            money(w.tier3.remaining, cur),
          ],
          [
            '4 · Carried-interest split (LP / GP)',
            '',
            `${money(w.tier4.lpPaid, cur)} / ${money(w.tier4.gpPaid, cur)}`,
            '',
          ],
        ],
      });
    }

    if (want('Compliance')) {
      const [cal, rest]: any[] = await Promise.all([
        this.compliance.getCalendar(tenantId, fundId),
        this.compliance.getRestrictionMonitoring(tenantId, fundId),
      ]);
      out.push({
        heading: 'Compliance calendar',
        columns: [
          'Obligation',
          'Frequency',
          'Last completed',
          'Next due',
          'Status',
        ],
        weights: [3, 1.2, 1.4, 1.4, 1.2],
        rows: cal.map((c: any) => [
          c.name,
          c.frequency,
          c.lastCompletedAt
            ? `${dateOnly(c.lastCompletedAt)} (${c.lastCompletedPeriod})`
            : '—',
          dateOnly(c.nextDueDate) || '—',
          c.status,
        ]),
      });
      const checks: string[][] = [];
      for (const [k, v] of Object.entries(rest ?? {})) {
        if (Array.isArray(v))
          for (const r of v as any[])
            checks.push([
              k,
              String(r.companyName ?? r.sector ?? r.country ?? r.name ?? ''),
              r.breached || r.breach ? 'Breach' : 'Within limit',
            ]);
      }
      if (checks.length)
        out.push({
          heading: 'LPA restriction monitoring',
          columns: ['Restriction', 'Subject', 'Result'],
          rows: checks,
        });
    }

    if (want('LP capital accounts')) {
      const commits = await this.commitmentModel
        .find(this.scope(tenantId, fundId))
        .sort({ createdAt: 1 })
        .lean();
      const rows: string[][] = [];
      for (const c of commits) {
        const st = await this.statements.getStatement(
          tenantId,
          fundId,
          String(c._id),
          {
            period: win.from ? undefined : 'ITD',
            from: win.from ? win.from.toISOString() : undefined,
            to: win.to.toISOString(),
          },
        );
        rows.push([
          c.lpName,
          money(st.position.commitment, cur),
          money(st.position.paid, cur),
          money(st.activity.closing, cur),
          `${st.metrics.tvpi.toFixed(2)}x`,
        ]);
      }
      out.push({
        heading: 'LP capital accounts',
        columns: ['LP', 'Commitment', 'Paid-in', 'Account balance', 'TVPI'],
        weights: [3, 1.5, 1.5, 1.5, 1],
        rows,
      });
    }

    return {
      title: `${type} — ${fund.name}`,
      summary: [
        { label: 'NAV', value: money(navRes.nav, cur) },
        { label: 'TVPI', value: `${perf.tvpi.toFixed(2)}x` },
        { label: 'DPI', value: `${perf.dpi.toFixed(2)}x` },
      ],
      sections: out,
    };
  }

  private async xlsx(sections: ReportSection[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const used = new Set<string>();
    for (const s of sections) {
      if (!s.columns.length) continue;
      let name = s.heading.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28);
      while (used.has(name)) name = name.slice(0, 25) + '_' + used.size;
      used.add(name);
      const ws = wb.addWorksheet(name);
      ws.addRow(s.columns).font = { bold: true };
      s.rows.forEach((r) => ws.addRow(r));
      ws.columns.forEach((c) => (c.width = 26));
    }
    if (!wb.worksheets.length) wb.addWorksheet('Report');
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** The LPs a report goes to: everyone, the LPAC, or one LP. */
  private async recipients(tenantId: string, fundId: string, who: string) {
    const all = await this.commitmentModel
      .find(this.scope(tenantId, fundId))
      .lean();
    if (!who || who === 'all') return all.filter((c) => !c.isGpCommitment);
    if (who === 'lpac') {
      const letters = await this.sideLetterModel
        .find({
          ...this.scope(tenantId, fundId),
          status: SideLetterStatus.EXECUTED,
        })
        .lean();
      const ids = new Set(
        letters
          .filter((l) =>
            l.provisions.some((p) => /lpac|advisory committee/i.test(p.type)),
          )
          .map((l) => String(l.commitmentId)),
      );
      return all.filter((c) => ids.has(String(c._id)));
    }
    const one = all.find((c) => String(c._id) === who);
    if (!one) throw new BadRequestException('That LP is not in this fund');
    return [one];
  }

  private async deliver(
    tenantId: string,
    fund: any,
    title: string,
    label: string,
    delivery: string,
    targets: any[],
    files: { name: string; path: string; mimeType: string }[],
    portalLink?: string,
  ) {
    const out: any[] = [];
    const wantEmail = /email/i.test(delivery);
    const wantPortal = /portal/i.test(delivery);
    const attachments = files
      .filter((f) => existsSync(f.path))
      .map((f) => ({ filename: f.name, content: readFileSync(f.path) }));
    for (const c of targets) {
      if (wantEmail) {
        try {
          if (!c.lpEmail) throw new Error('No email address on file');
          await this.email.sendFundNotice(
            {
              to: c.lpEmail,
              cc: fund.administratorEmail || undefined,
              recipientName: c.lpName,
              fundName: fund.name,
              subject: `${title} (${label})`,
              message: `Please find attached the ${title.toLowerCase()} for ${fund.name}, for ${label}.`,
              attachmentNote: 'The report is attached.',
            },
            attachments,
          );
          out.push({
            lpName: c.lpName,
            email: c.lpEmail,
            sentAt: new Date(),
            channel: 'Email',
            status: 'Sent',
            error: '',
          });
        } catch (e: any) {
          out.push({
            lpName: c.lpName,
            email: c.lpEmail ?? '',
            sentAt: new Date(),
            channel: 'Email',
            status: 'Failed',
            error: String(e?.message ?? e).slice(0, 200),
          });
        }
      }
      if (wantPortal) {
        this.events.emit('client.general.notice', {
          tenantId,
          clientUserId: String(c.lpUserId),
          title: `${title} — ${fund.name}`,
          description: `A new report for ${label} is available.`,
          link: portalLink ?? null,
          type: ClientNotificationType.DOCUMENT,
        });
        out.push({
          lpName: c.lpName,
          email: '',
          sentAt: new Date(),
          channel: 'Portal',
          status: 'Sent',
          error: '',
        });
      }
    }
    return out;
  }

  private deliveryLabel(d?: string) {
    return d && /email|portal|upload/i.test(d) ? d : 'Generate only (download)';
  }

  async generate(
    tenantId: string,
    fundId: string,
    dto: GenerateLpReportDto,
    actorName: string,
  ) {
    const fund: any = await this.fund(tenantId, fundId);
    const type = dto.reportType;
    if (UPLOAD_ONLY_REPORT_TYPES.some((t) => t.type === type))
      throw new BadRequestException(
        `${type} cannot be generated — upload the prepared document instead`,
      );
    if (!GENERATED_REPORT_TYPES.some((t) => t.type === type))
      throw new BadRequestException('Unknown report type');
    const delivery = this.deliveryLabel(dto.delivery);
    const win = resolvePeriod(dto.period, dto.from, dto.to);
    const targets = await this.recipients(
      tenantId,
      fundId,
      dto.recipients ?? 'all',
    );
    if (!targets.length)
      throw new BadRequestException('No LPs match those recipients');
    const format = dto.format ?? 'pdf';

    // Capital account statements are produced LP by LP.
    if (type === 'Capital Account Statement') {
      return this.statements.generate(
        tenantId,
        fundId,
        {
          commitmentIds: targets.map((t) => String(t._id)),
          period: dto.period,
          from: dto.from,
          to: dto.to,
          format,
          delivery:
            /email/i.test(delivery) && /portal/i.test(delivery)
              ? 'email+portal'
              : /email/i.test(delivery)
                ? 'email'
                : /portal/i.test(delivery)
                  ? 'portal'
                  : 'download',
        } as any,
        actorName,
      );
    }

    const files: any[] = [];
    let title = `${type} — ${win.label}`;
    if (type === 'Capital Call Notice') {
      if (!dto.callId) throw new BadRequestException('Choose the capital call');
      const n = await this.notices.pdf(tenantId, fundId, dto.callId);
      const stored = storeGeneratedFile(
        tenantId,
        'fund-reports',
        'pdf',
        n.buffer,
      );
      files.push({
        name: n.filename,
        mimeType: 'application/pdf',
        format: 'pdf',
        ...stored,
      });
      title = n.filename.replace(/\.pdf$/, '').replace(/-/g, ' ');
    } else if (type === 'Distribution Notice') {
      if (!dto.distributionId)
        throw new BadRequestException('Choose the distribution');
      const d = await this.distributionModel
        .findOne({ _id: dto.distributionId, ...this.scope(tenantId, fundId) })
        .lean();
      if (!d) throw new NotFoundException('Distribution not found');
      const mine = (d.allocations as any[]).filter((a) =>
        targets.some((t) => String(t._id) === String(a.commitmentId)),
      );
      const buffer = await buildReportPdf({
        companyName: fund.gpEntityName || fund.name,
        title: `Distribution notice — ${d.ref}`,
        subtitle: `${fund.name} · ${dateOnly(d.date)}`,
        summary: [
          {
            label: 'Total distribution',
            value: money(d.totalAmount, fund.currency),
          },
          {
            label: 'To limited partners',
            value: money(d.totalToLps, fund.currency),
          },
        ],
        sections: [
          {
            heading: 'Amount payable to each limited partner',
            columns: ['Limited partner', 'Amount'],
            weights: [4, 2],
            rows: mine.map((a) => [a.lpName, money(a.amount, fund.currency)]),
          },
        ],
      });
      const stored = storeGeneratedFile(
        tenantId,
        'fund-reports',
        'pdf',
        buffer,
      );
      files.push({
        name: `Distribution-notice-${d.ref}.pdf`,
        mimeType: 'application/pdf',
        format: 'pdf',
        ...stored,
      });
      title = `Distribution notice ${d.ref}`;
    } else {
      const built = await this.build(
        tenantId,
        fundId,
        type,
        win,
        dto.sections,
        dto.commentary ?? '',
      );
      if (!built.sections.length)
        throw new BadRequestException(
          'Choose at least one section for the report',
        );
      title = `${type} — ${win.label}`;
      if (format === 'pdf' || format === 'both') {
        const buffer = await buildReportPdf({
          companyName:
            dto.branding === 'none'
              ? undefined
              : dto.branding === 'gp'
                ? fund.gpEntityName || fund.name
                : fund.name,
          title: built.title,
          subtitle: win.label,
          summary: built.summary,
          sections: built.sections,
        });
        const stored = storeGeneratedFile(
          tenantId,
          'fund-reports',
          'pdf',
          buffer,
        );
        files.push({
          name: `${type.replace(/[^\w]+/g, '-')}-${win.label.replace(/\s+/g, '-')}.pdf`,
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
          await this.xlsx(built.sections),
        );
        files.push({
          name: `${type.replace(/[^\w]+/g, '-')}-${win.label.replace(/\s+/g, '-')}.xlsx`,
          mimeType: MIME_XLSX,
          format: 'xlsx',
          ...stored,
        });
      }
    }

    const deliveries = await this.deliver(
      tenantId,
      fund,
      title,
      win.label,
      delivery,
      targets,
      files,
    );
    const created = await this.model.create({
      ...this.scope(tenantId, fundId),
      reportType: type,
      title,
      period: win.label,
      periodStart: win.from,
      periodEnd: win.to,
      recipients: dto.recipients ?? 'all',
      recipientLabel:
        dto.recipients === 'lpac'
          ? 'LPAC members'
          : targets.length === 1
            ? targets[0].lpName
            : `All LPs (${targets.length})`,
      delivery,
      commentary: dto.commentary ?? '',
      sections: dto.sections ?? [],
      branding:
        dto.branding === 'gp'
          ? 'GP letterhead'
          : dto.branding === 'none'
            ? 'No branding'
            : 'Fund letterhead',
      status: deliveries.length ? 'Sent' : 'Generated',
      files,
      deliveries,
      generatedBy: actorName,
    });
    return created.toObject();
  }

  async upload(
    tenantId: string,
    fundId: string,
    dto: UploadFundReportDto,
    file: UploadedFundFile | undefined,
    actorName: string,
  ) {
    const fund: any = await this.fund(tenantId, fundId);
    if (!file) throw new BadRequestException('Attach the report file');
    const delivery = this.deliveryLabel(dto.delivery);
    const targets = await this.recipients(
      tenantId,
      fundId,
      dto.recipients ?? 'all',
    );
    const rec = fileRecord(file, 'fund-reports', tenantId);
    const files = [
      {
        ...rec,
        format: (file.originalname.split('.').pop() ?? '').toLowerCase(),
      },
    ];
    const title =
      dto.title?.trim() || `${dto.reportType} — ${dto.period ?? ''}`.trim();
    const deliveries = await this.deliver(
      tenantId,
      fund,
      title,
      dto.period ?? '',
      delivery,
      targets,
      files,
    );
    const created = await this.model.create({
      ...this.scope(tenantId, fundId),
      reportType: dto.reportType,
      title,
      period: dto.period ?? '',
      recipients: dto.recipients ?? 'all',
      recipientLabel:
        targets.length === 1
          ? targets[0].lpName
          : `All LPs (${targets.length})`,
      delivery,
      commentary: dto.commentary ?? '',
      uploaded: true,
      status: deliveries.length ? 'Sent' : 'Uploaded',
      files,
      deliveries,
      generatedBy: actorName,
    });
    return created.toObject();
  }

  /** Send (or re-send) a report already in the library. */
  async send(
    tenantId: string,
    fundId: string,
    id: string,
    dto: { recipients?: string; delivery?: string },
  ) {
    const fund: any = await this.fund(tenantId, fundId);
    const r = await this.model.findOne({
      _id: id,
      ...this.scope(tenantId, fundId),
    });
    if (!r) throw new NotFoundException('Report not found');
    const delivery = this.deliveryLabel(
      dto.delivery ?? 'Generate & email to LPs',
    );
    if (!/email|portal/i.test(delivery))
      throw new BadRequestException('Choose email, portal or both');
    const targets = await this.recipients(
      tenantId,
      fundId,
      dto.recipients ?? r.recipients,
    );
    if (!targets.length)
      throw new BadRequestException('No LPs match those recipients');
    const log = await this.deliver(
      tenantId,
      fund,
      r.title,
      r.period,
      delivery,
      targets,
      r.files as any,
    );
    r.deliveries.push(...(log as any));
    r.status = 'Sent';
    await r.save();
    return r.toObject();
  }

  async download(
    tenantId: string,
    fundId: string,
    id: string,
    index = 0,
  ): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const r = await this.model
      .findOne({ _id: id, ...this.scope(tenantId, fundId) })
      .lean();
    const f = r?.files?.[index];
    if (!r || !f) throw new NotFoundException('Report file not found');
    if (!existsSync(f.path))
      throw new NotFoundException('The file is no longer on the server');
    return {
      buffer: readFileSync(f.path),
      filename: f.name,
      mimeType: f.mimeType,
    };
  }

  async remove(tenantId: string, fundId: string, id: string) {
    const r = await this.model.findOne({
      _id: id,
      ...this.scope(tenantId, fundId),
    });
    if (!r) throw new NotFoundException('Report not found');
    if (r.status === 'Sent')
      throw new BadRequestException(
        'A report that was sent to LPs is part of the record and cannot be deleted',
      );
    for (const f of r.files) {
      try {
        if (existsSync(f.path)) unlinkSync(f.path);
      } catch {
        /* the record goes regardless */
      }
    }
    await r.deleteOne();
    return { deleted: true };
  }
}
