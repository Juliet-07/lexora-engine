import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
import {
  TrustLedger,
  TrustLedgerDocument,
  TrustMovement,
  TrustMovementDocument,
  TrustMovementType,
  TrustMovementStatus,
  TrustAuditAction,
  BankAccount,
  BankAccountDocument,
  BankAccountType,
} from '../schemas';
import {
  buildReportPdf,
  lookupTenantCompanyName,
  ReportSection,
} from 'src/common/utils/pdf/report-builder.util';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { TrustLedgerService, TrustMovementService } from './trust.service';
import { TrustInterestService } from './trust-interest.service';
import { TrustAuditService } from './trust-support.service';
import type { TrustActor } from './trust-support.service';
import { EmailTrustStatementsDto } from '../dtos';

export type TrustReportKind =
  | 'regulatory-return'
  | 'source-of-funds'
  | 'client-statements'
  | 'balances'
  | 'movements'
  | 'interest'
  | 'reconciliation-history'
  | 'drawdown-audit'
  | 'audit-trail';

export const TRUST_REPORT_KINDS: TrustReportKind[] = [
  'regulatory-return',
  'source-of-funds',
  'client-statements',
  'balances',
  'movements',
  'interest',
  'reconciliation-history',
  'drawdown-audit',
  'audit-trail',
];

export interface TrustReportFilters {
  ledgerId?: string;
  from?: string;
  to?: string;
  type?: string;
  status?: string;
  action?: string;
  q?: string;
}

export interface TrustReportFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

const money = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const dateOnly = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const dateTime = (d: any) =>
  d ? new Date(d).toISOString().replace('T', ' ').slice(0, 16) : '';
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const csvCell = (v: any) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (columns: string[], rows: any[][]) =>
  [columns, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');

@Injectable()
export class TrustReportService {
  constructor(
    @InjectModel(TrustLedger.name)
    private readonly ledgerModel: Model<TrustLedgerDocument>,
    @InjectModel(TrustMovement.name)
    private readonly movementModel: Model<TrustMovementDocument>,
    @InjectModel(BankAccount.name)
    private readonly bankAccountModel: Model<BankAccountDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly ledgerService: TrustLedgerService,
    private readonly movementService: TrustMovementService,
    private readonly interestService: TrustInterestService,
    private readonly audit: TrustAuditService,
    private readonly email: EmailService,
  ) {}

  // ── Per-ledger statement ─────────────────────────────────────

  private effective(m: any) {
    return m.type === TrustMovementType.DRAWDOWN && m.authorisedAt
      ? new Date(m.authorisedAt)
      : new Date(m.date);
  }

  // Opening balance, the movements in the period with a running
  // balance, and the closing balance — built from the same rules the
  // live balance uses (recorded deposits and client interest in,
  // approved drawdowns out).
  async statementFor(
    tenantId: string,
    ledger: any,
    from?: string,
    to?: string,
  ) {
    const rows: any[] = await this.movementModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        ledgerId: ledger._id,
        $or: [
          {
            type: {
              $in: [TrustMovementType.DEPOSIT, TrustMovementType.INTEREST],
            },
            status: TrustMovementStatus.RECORDED,
            firmRetained: { $ne: true },
          },
          {
            type: TrustMovementType.DRAWDOWN,
            status: TrustMovementStatus.APPROVED,
          },
        ],
      })
      .lean();
    const dated = rows
      .map((m) => ({ m, at: this.effective(m) }))
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    const fromD = from ? new Date(from) : null;
    const toD = to ? new Date(to) : null;
    if (toD) toD.setHours(23, 59, 59, 999);
    const signed = (m: any) =>
      m.type === TrustMovementType.DRAWDOWN ? -m.amount : m.amount;
    let opening = 0;
    const inPeriod: any[] = [];
    for (const { m, at } of dated) {
      if (fromD && at < fromD) opening += signed(m);
      else if (!toD || at <= toD) inPeriod.push({ m, at });
    }
    let running = opening;
    const lines = inPeriod.map(({ m, at }) => {
      running += signed(m);
      return { m, at, balance: round2(running) };
    });
    return {
      opening: round2(opening),
      lines,
      closing: round2(running),
      deposits: round2(
        lines
          .filter((l) => l.m.type === TrustMovementType.DEPOSIT)
          .reduce((s, l) => s + l.m.amount, 0),
      ),
      drawdowns: round2(
        lines
          .filter((l) => l.m.type === TrustMovementType.DRAWDOWN)
          .reduce((s, l) => s + l.m.amount, 0),
      ),
      interest: round2(
        lines
          .filter((l) => l.m.type === TrustMovementType.INTEREST)
          .reduce((s, l) => s + l.m.amount, 0),
      ),
    };
  }

  private async statementSections(
    tenantId: string,
    ledgers: any[],
    f: TrustReportFilters,
  ): Promise<ReportSection[]> {
    const out: ReportSection[] = [];
    for (const l of ledgers) {
      const s = await this.statementFor(tenantId, l, f.from, f.to);
      out.push({
        heading: `${l.clientName}${l.mandateReference ? ` — ${l.mandateReference}` : l.mandateName ? ` — ${l.mandateName}` : ''} (${l.currency})`,
        note: `Opening balance ${l.currency} ${money(s.opening)}  ·  Deposits ${money(s.deposits)}  ·  Interest ${money(s.interest)}  ·  Drawdowns ${money(s.drawdowns)}  ·  Closing balance ${l.currency} ${money(s.closing)}`,
        columns: [
          'Date',
          'Ref',
          'Type',
          'Linked to / reference',
          'Amount',
          'Balance',
        ],
        weights: [1.1, 0.9, 1, 3, 1.2, 1.2],
        rows: s.lines.map(({ m, at, balance }) => [
          dateOnly(at),
          m.ref,
          m.type === TrustMovementType.DRAWDOWN
            ? (m.drawdownType ?? 'Drawdown')
            : m.type,
          m.linkLabel || m.reference || '',
          `${m.type === TrustMovementType.DRAWDOWN ? '-' : '+'}${money(m.amount)}`,
          money(balance),
        ]),
      });
    }
    return out;
  }

  // ── Builders ─────────────────────────────────────────────────

  private async xlsx(
    sheet: string,
    columns: string[],
    rows: any[][],
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheet.slice(0, 31));
    ws.addRow(columns).font = { bold: true };
    rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c) => (c.width = 22));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private async pdf(
    tenantId: string,
    title: string,
    sections: ReportSection[],
    summary?: { label: string; value: string | number }[],
  ) {
    return buildReportPdf({
      companyName: await lookupTenantCompanyName(this.userModel, tenantId),
      title,
      subtitle: 'Trust Accounting',
      summary,
      sections,
    });
  }

  private async ledgersFor(tenantId: string, ledgerId?: string) {
    const ledgers: any[] = await this.ledgerService.getAll(tenantId);
    const picked = ledgerId
      ? ledgers.filter((l) => String(l._id) === ledgerId)
      : ledgers;
    if (!picked.length) throw new BadRequestException('No trust ledgers found');
    return picked;
  }

  async generate(
    tenantId: string,
    kind: TrustReportKind,
    format: 'pdf' | 'xlsx' | 'csv',
    f: TrustReportFilters,
    actor: TrustActor,
  ): Promise<TrustReportFile> {
    if (!TRUST_REPORT_KINDS.includes(kind)) {
      throw new BadRequestException('Unknown report');
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const file = await this.build(tenantId, kind, format, f);
    await this.audit.log(tenantId, {
      action: TrustAuditAction.REPORT_GENERATED,
      details: `${kind} (${file.filename.split('.').pop()})`,
      actor,
    });
    return { ...file, filename: file.filename.replace('{date}', stamp) };
  }

  private async build(
    tenantId: string,
    kind: TrustReportKind,
    format: 'pdf' | 'xlsx' | 'csv',
    f: TrustReportFilters,
  ): Promise<TrustReportFile> {
    const pdfType = 'application/pdf';
    const xlsxType =
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const mk = (
      buffer: Buffer,
      name: string,
      fmtName: 'pdf' | 'xlsx' | 'csv',
    ): TrustReportFile => ({
      buffer,
      filename: `${name}-{date}.${fmtName}`,
      contentType:
        fmtName === 'pdf'
          ? pdfType
          : fmtName === 'xlsx'
            ? xlsxType
            : 'text/csv',
    });
    // Tabular reports can leave as CSV, XLSX or PDF; the formal
    // documents are PDF (the regulatory return also as XLSX).
    const tabular = async (
      name: string,
      title: string,
      columns: string[],
      rows: any[][],
      weights?: number[],
      summary?: { label: string; value: string | number }[],
    ) => {
      if (format === 'csv') {
        return mk(Buffer.from(toCsv(columns, rows), 'utf8'), name, 'csv');
      }
      if (format === 'xlsx') {
        return mk(await this.xlsx(title, columns, rows), name, 'xlsx');
      }
      return mk(
        await this.pdf(
          tenantId,
          title,
          [{ heading: title, columns, rows, weights }],
          summary,
        ),
        name,
        'pdf',
      );
    };

    switch (kind) {
      case 'client-statements': {
        const ledgers = await this.ledgersFor(tenantId, f.ledgerId);
        const sections = await this.statementSections(tenantId, ledgers, f);
        const period =
          f.from || f.to
            ? `${f.from ? dateOnly(f.from) : 'start'} to ${f.to ? dateOnly(f.to) : 'today'}`
            : `to ${dateOnly(new Date())}`;
        return mk(
          await this.pdf(
            tenantId,
            `Trust account statement — ${period}`,
            sections,
          ),
          ledgers.length === 1
            ? `trust-statement-${ledgers[0].clientName.replace(/\s+/g, '-')}`
            : 'trust-statements',
          'pdf',
        );
      }

      case 'balances': {
        const ledgers = await this.ledgersFor(tenantId, f.ledgerId);
        return tabular(
          'trust-balances',
          'Per-client trust balances',
          [
            'Client',
            'Mandate',
            'Currency',
            'Status',
            'Balance',
            'Awaiting authorisation',
            'Available',
            'Last reconciled',
          ],
          ledgers.map((l) => [
            l.clientName,
            l.mandateReference || l.mandateName || 'General retainer',
            l.currency,
            l.status,
            money(l.balance),
            money(l.reserved),
            money(l.available),
            dateOnly(l.lastReconciledAt) || 'Never',
          ]),
          [2, 2, 0.8, 1, 1.3, 1.3, 1.3, 1.3],
        );
      }

      case 'movements': {
        const rows: any[] = await this.movementService.getAll(tenantId, {
          ledgerId: f.ledgerId,
          type: f.type,
          status: f.status,
          from: f.from,
          to: f.to,
        });
        return tabular(
          'trust-movements',
          'Trust movement report',
          [
            'Date',
            'Ref',
            'Client',
            'Type',
            'Linked to',
            'Bank / reference',
            'Prepared by',
            'Authorised by',
            'Status',
            'Currency',
            'Amount',
          ],
          rows.map((m) => [
            dateOnly(m.date),
            m.ref,
            m.clientName,
            m.drawdownType ?? m.type,
            m.linkLabel || '',
            m.reference,
            m.preparedBy,
            [m.firstAuthorisedBy, m.authorisedBy].filter(Boolean).join(' + '),
            m.status,
            m.currency,
            `${m.type === TrustMovementType.DRAWDOWN ? '-' : '+'}${money(m.amount)}`,
          ]),
          [1, 0.8, 1.6, 1.3, 2, 1.6, 1.3, 1.4, 1.2, 0.7, 1.2],
        );
      }

      case 'interest': {
        const perf = await this.interestService.getPerformance(
          tenantId,
          f.ledgerId,
        );
        return tabular(
          'trust-interest',
          'Interest accrual report',
          [
            'Client',
            'Currency',
            'Treatment',
            'Rate p.a. %',
            'Avg daily balance (MTD)',
            'MTD accrued',
            'Accrued, not yet credited',
            'YTD credited to client',
            'YTD firm-retained',
            'Projected annual',
            'Next credit',
          ],
          perf.rows.map((r) => [
            r.clientName,
            r.currency,
            r.treatment,
            r.rate,
            money(r.avgDailyBalance),
            money(r.mtdAccrued),
            money(r.uncreditedAccrued),
            money(r.ytdCredited),
            money(r.ytdFirmRetained),
            money(r.projectedAnnual),
            dateOnly(r.nextCredit) || '—',
          ]),
          [1.8, 0.8, 1.3, 0.8, 1.4, 1.1, 1.3, 1.3, 1.2, 1.2, 1],
        );
      }

      case 'source-of-funds': {
        const deposits: any[] = await this.movementService.getAll(tenantId, {
          ledgerId: f.ledgerId,
          type: TrustMovementType.DEPOSIT,
          from: f.from,
          to: f.to,
        });
        const ledgers: any[] = await this.ledgerService.getAll(tenantId);
        const missing = deposits.filter(
          (d) => !(d.documents?.length > 0),
        ).length;
        return mk(
          await this.pdf(
            tenantId,
            'Source of funds summary (AML/CFT)',
            [
              {
                heading: 'Declared at ledger opening',
                columns: [
                  'Client',
                  'Mandate',
                  'Risk level',
                  'Expected source',
                  'Expected purpose',
                  'Notes',
                ],
                weights: [1.8, 1.8, 1, 1.8, 1.8, 2.5],
                rows: ledgers.map((l) => [
                  l.clientName,
                  l.mandateReference || l.mandateName || 'General retainer',
                  l.riskLevel,
                  l.sourceOfFunds || '— not declared',
                  l.expectedPurpose || '—',
                  l.sourceOfFundsNotes || '',
                ]),
              },
              {
                heading: 'Declared on every deposit received',
                columns: [
                  'Date',
                  'Ref',
                  'Client',
                  'Remitter',
                  'Declared source',
                  'Purpose',
                  'Amount',
                  'Evidence',
                ],
                weights: [1, 0.8, 1.7, 1.6, 1.8, 1.6, 1.3, 1.1],
                rows: deposits.map((d) => [
                  dateOnly(d.date),
                  d.ref,
                  d.clientName,
                  d.remitterName || '—',
                  d.sourceOfFunds || '— not declared',
                  d.purpose || '—',
                  `${d.currency} ${money(d.amount)}`,
                  d.documents?.length
                    ? `${d.documents.length} file(s)`
                    : 'MISSING',
                ]),
              },
            ],
            [
              { label: 'Deposits', value: deposits.length },
              { label: 'Without supporting evidence', value: missing },
            ],
          ),
          'trust-source-of-funds',
          'pdf',
        );
      }

      case 'drawdown-audit': {
        const rows: any[] = (
          await this.movementService.getAll(tenantId, {
            ledgerId: f.ledgerId,
            type: TrustMovementType.DRAWDOWN,
            from: f.from,
            to: f.to,
          })
        ).filter((m: any) => m.status !== TrustMovementStatus.DRAFT);
        const noSource = rows.filter(
          (m) => !m.linkType && !m.documents?.length,
        ).length;
        return mk(
          await this.pdf(
            tenantId,
            'Drawdown approval audit',
            [
              {
                heading:
                  'Every drawdown — who prepared it, who approved it, what it was drawn against',
                note: 'Segregation of duties: the preparer and every authoriser must be different people.',
                columns: [
                  'Date',
                  'Ref',
                  'Client',
                  'Type',
                  'Source document',
                  'Payee',
                  'Amount',
                  'Prepared by',
                  'Authorised by',
                  'Status',
                  'Segregation',
                ],
                weights: [0.9, 0.7, 1.4, 1, 1.8, 1.3, 1.1, 1.2, 1.4, 1.1, 0.9],
                rows: rows.map((m) => {
                  const approvers = [
                    m.firstAuthorisedBy,
                    m.authorisedBy,
                  ].filter(Boolean);
                  const ok =
                    !m.authorisedBy ||
                    (!approvers.includes(m.preparedBy) &&
                      new Set(approvers).size === approvers.length);
                  return [
                    dateOnly(m.date),
                    m.ref,
                    m.clientName,
                    m.drawdownType ?? 'Drawdown',
                    m.linkLabel ||
                      (m.documents?.length ? 'Uploaded document' : 'NONE'),
                    m.payeeName || '—',
                    `${m.currency} ${money(m.amount)}`,
                    m.preparedBy,
                    approvers.join(' + ') ||
                      (m.status === TrustMovementStatus.REJECTED
                        ? `Rejected: ${m.rejectedReason ?? ''}`
                        : '—'),
                    m.status,
                    m.authorisedBy ? (ok ? 'Compliant' : 'BREACH') : '—',
                  ];
                }),
              },
            ],
            [
              { label: 'Drawdowns', value: rows.length },
              { label: 'With no source document', value: noSource },
            ],
          ),
          'trust-drawdown-audit',
          'pdf',
        );
      }

      case 'reconciliation-history': {
        const entries: any[] = await this.audit.list(tenantId, {
          action: TrustAuditAction.RECONCILIATION,
          from: f.from,
          to: f.to,
          limit: 2000,
        });
        return mk(
          await this.pdf(tenantId, 'Reconciliation history', [
            {
              heading: 'Three-way reconciliation results and sign-offs',
              columns: ['When', 'By', 'Client / account', 'Result', 'Variance'],
              weights: [1.3, 1.5, 1.8, 5, 1.2],
              rows: entries.map((e) => [
                dateTime(e.createdAt),
                e.userName,
                e.clientName === 'All' ? 'Trust account' : e.clientName,
                e.details,
                e.amount != null ? `${e.currency} ${money(e.amount)}` : '',
              ]),
            },
          ]),
          'trust-reconciliation-history',
          'pdf',
        );
      }

      case 'audit-trail': {
        const entries: any[] = await this.audit.list(tenantId, {
          action: f.action,
          ledgerId: f.ledgerId,
          q: f.q,
          from: f.from,
          to: f.to,
          limit: 5000,
        });
        return tabular(
          'trust-audit-trail',
          'Trust accounting audit trail',
          ['Timestamp', 'User', 'Action', 'Client', 'Details', 'Amount', 'IP'],
          entries.map((e) => [
            dateTime(e.createdAt),
            e.userName,
            e.action,
            e.clientName,
            e.details,
            e.amount != null ? `${e.currency} ${money(e.amount)}` : '',
            e.ip || '',
          ]),
          [1.3, 1.4, 1.6, 1.6, 5, 1.3, 1],
        );
      }

      case 'regulatory-return': {
        const ledgers: any[] = await this.ledgersFor(tenantId, f.ledgerId);
        const accounts = await this.bankAccountModel
          .find({
            tenantId: new Types.ObjectId(tenantId),
            type: BankAccountType.TRUST,
          })
          .lean();
        const checks: any[] = [];
        for (const a of accounts) {
          const c = await this.ledgerService.getIntegrityCheck(
            tenantId,
            String(a._id),
          );
          checks.push({ a, c });
        }
        const perf = await this.interestService.getPerformance(tenantId);
        const totals: Record<string, number> = {};
        ledgers.forEach((l) => {
          totals[l.currency] = round2((totals[l.currency] ?? 0) + l.balance);
        });
        const clientRows = ledgers.map((l) => [
          l.clientName,
          l.mandateReference || l.mandateName || 'General retainer',
          l.currency,
          l.status,
          l.riskLevel,
          l.sourceOfFunds || '— not declared',
          `${l.interestTreatment}${l.interestRate ? ` @ ${l.interestRate}%` : ''}`,
          money(l.balance),
          dateOnly(l.lastReconciledAt) || 'Never',
        ]);
        const clientCols = [
          'Client',
          'Mandate',
          'Currency',
          'Status',
          'Risk',
          'Source of funds',
          'Interest',
          'Balance',
          'Last reconciled',
        ];
        if (format === 'xlsx') {
          return mk(
            await this.xlsx('Trust return', clientCols, clientRows),
            'trust-regulatory-return',
            'xlsx',
          );
        }
        return mk(
          await this.pdf(
            tenantId,
            `Regulatory trust account return — as at ${dateOnly(new Date())}`,
            [
              {
                heading: 'Client funds held in trust',
                columns: clientCols,
                weights: [1.8, 1.7, 0.8, 0.9, 0.9, 1.7, 1.6, 1.3, 1.2],
                rows: clientRows,
              },
              {
                heading:
                  'Commingling check — bank balance against client ledgers',
                note: 'The trust bank account must equal the sum of every client ledger.',
                columns: [
                  'Trust account',
                  'Bank balance',
                  'Sum of client ledgers',
                  'Variance',
                  'Ledgers',
                  'Result',
                ],
                rows: checks.map(({ a, c }) => [
                  `${a.name} (${a.currency})`,
                  money(c.bankBalance),
                  money(c.ledgerTotal),
                  money(c.variance),
                  c.ledgerCount,
                  c.matched ? 'No commingling detected' : 'VARIANCE',
                ]),
              },
              {
                heading: 'Interest on client funds',
                columns: [
                  'Client',
                  'Currency',
                  'Treatment',
                  'Rate p.a. %',
                  'YTD credited to client',
                  'YTD firm-retained',
                  'Accrued, not yet credited',
                ],
                rows: perf.rows
                  .filter((r) => r.earns)
                  .map((r) => [
                    r.clientName,
                    r.currency,
                    r.treatment,
                    r.rate,
                    money(r.ytdCredited),
                    money(r.ytdFirmRetained),
                    money(r.uncreditedAccrued),
                  ]),
              },
            ],
            Object.entries(totals).map(([cur, v]) => ({
              label: `Total held (${cur})`,
              value: money(v),
            })),
          ),
          'trust-regulatory-return',
          'pdf',
        );
      }
    }
  }

  // Emails each client's statement (PDF) to their portal contact and
  // any additional portal users.
  async emailStatements(
    tenantId: string,
    dto: EmailTrustStatementsDto,
    actor: TrustActor,
  ) {
    const ledgers: any[] = (await this.ledgerService.getAll(tenantId)).filter(
      (l: any) =>
        (!dto.ledgerIds?.length || dto.ledgerIds.includes(String(l._id))) &&
        l.portalContactEmail &&
        l.notifyPrefs?.monthlyStatements !== false,
    );
    if (!ledgers.length) {
      throw new BadRequestException(
        'None of these ledgers has a portal contact email with statements switched on',
      );
    }
    let sent = 0;
    const failed: string[] = [];
    for (const l of ledgers) {
      try {
        const sections = await this.statementSections(tenantId, [l], dto);
        const buffer = await this.pdf(
          tenantId,
          `Trust account statement — ${l.clientName}`,
          sections,
        );
        const to = Array.from(
          new Set([l.portalContactEmail, ...(l.additionalPortalUsers ?? [])]),
        );
        for (const email of to) {
          await this.email.sendIssuedDocument(
            {
              to: email,
              recipientName: l.clientName,
              documentName: `Trust account statement — ${l.clientName}`,
            },
            buffer,
            `Trust-statement-${l.clientName.replace(/\s+/g, '-')}.pdf`,
          );
        }
        sent++;
      } catch {
        failed.push(l.clientName);
      }
    }
    await this.audit.log(tenantId, {
      action: TrustAuditAction.REPORT_GENERATED,
      details: `Client statements emailed to ${sent} client(s)${failed.length ? `; failed: ${failed.join(', ')}` : ''}`,
      actor,
    });
    return { sent, failed };
  }
}
