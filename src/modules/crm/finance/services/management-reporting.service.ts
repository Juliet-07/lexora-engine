import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ManagementReport,
  ManagementReportDocument,
  ReportPeriodType,
} from '../schemas';
import { FinancialStatementsService } from './acounting.service';
import { GL_ACCOUNTS } from './gl-posting.service';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { ExchangeRateService } from 'src/modules/hr/services/exchange-rate.service';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';
import {
  buildManagementReportPdf,
  ManagementReportPdfData,
} from 'src/common/utils/pdf/management-report.util';

// Turns a period type + key ("2026-07", "2026-Q3", "2026") into the
// actual calendar range it covers, and a human label for display.
function periodRange(
  periodType: ReportPeriodType,
  periodKey: string,
): { start: Date; end: Date; label: string } {
  if (periodType === ReportPeriodType.MONTH) {
    const [y, m] = periodKey.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59));
    const label = start.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return { start, end, label };
  }
  if (periodType === ReportPeriodType.QUARTER) {
    const [y, q] = periodKey.split('-Q').map(Number);
    const startMonth = (q - 1) * 3;
    const start = new Date(Date.UTC(y, startMonth, 1));
    const end = new Date(Date.UTC(y, startMonth + 3, 0, 23, 59, 59));
    return { start, end, label: `Q${q} ${y}` };
  }
  const y = Number(periodKey);
  const start = new Date(Date.UTC(y, 0, 1));
  const end = new Date(Date.UTC(y, 11, 31, 23, 59, 59));
  return { start, end, label: String(y) };
}

@Injectable()
export class ManagementReportingService {
  constructor(
    @InjectModel(ManagementReport.name)
    private readonly model: Model<ManagementReportDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly financialStatementsService: FinancialStatementsService,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly emailService: EmailService,
  ) {}

  // Revenue/expenses now read the exact same posted GlEntry rows the
  // Financials P&L reads for the same period — previously this
  // summed Invoice.net/Bill.amount directly, re-converting each one
  // at TODAY's live fx rate regardless of when it was actually
  // posted, while the P&L (and everywhere else) uses the rate frozen
  // at posting time. That's what let a single month here show more
  // revenue than an entire year-to-date on the P&L: two different
  // data sets, two different fx treatments, not just two different
  // date windows. GL amounts are always in the tenant's base
  // currency already, so only one further conversion — base →
  // requested display currency, at today's rate — happens here.
  //
  // Receivables/payables/cash stay as-of-today balance snapshots
  // (this section is literally headed "Position (as of today)" in
  // the UI) rather than period-bound flows — same real GL accounts
  // the Chart of Accounts and Accounting overview read, so this
  // matches them too, not just the P&L.
  private async buildFigures(
    tenantId: string,
    periodType: ReportPeriodType,
    periodKey: string,
    displayCurrency?: string,
  ) {
    const { start, end, label } = periodRange(periodType, periodKey);
    const today = new Date();
    const [pnl, asOfNow, tenant] = await Promise.all([
      this.financialStatementsService.getProfitAndLoss(
        tenantId,
        start.toISOString(),
        end.toISOString(),
      ),
      this.financialStatementsService.getAccountBalances(
        tenantId,
        undefined,
        today.toISOString(),
      ),
      this.userModel
        .findById(tenantId)
        .select('tenantProfile.baseCurrency')
        .lean(),
    ]);

    const baseCurrency = (tenant as any)?.tenantProfile?.baseCurrency || 'USD';
    const targetCurrency = (displayCurrency || baseCurrency).toUpperCase();
    const rateCache = new Map<string, number>();
    const rateTo = async (currency: string): Promise<number> => {
      const cur = (currency || 'USD').toUpperCase();
      if (cur === targetCurrency) return 1;
      if (rateCache.has(cur)) return rateCache.get(cur)!;
      const { rate } = await this.exchangeRateService.getRate(
        cur,
        targetCurrency,
      );
      rateCache.set(cur, rate);
      return rate;
    };
    const toDisplay = async (baseAmount: number) =>
      baseAmount * (await rateTo(baseCurrency));

    const balanceOf = (code: string) => asOfNow.balanceMap.get(code) ?? 0;
    // AR (1200) is debit-normal, AP (2110) and cash (1110) sign
    // conventions follow the same balanceMap the Balance sheet uses.
    const outstandingReceivablesBase = Math.max(
      0,
      balanceOf(GL_ACCOUNTS.ACCOUNTS_RECEIVABLE.code),
    );
    const outstandingPayablesBase = Math.max(
      0,
      -balanceOf(GL_ACCOUNTS.ACCOUNTS_PAYABLE.code),
    );
    const cashPositionBase = balanceOf(GL_ACCOUNTS.BANK_OPERATING.code);

    const [
      revenue,
      expenses,
      outstandingReceivables,
      outstandingPayables,
      cashPosition,
    ] = await Promise.all([
      toDisplay(pnl.totalRevenue),
      toDisplay(pnl.totalExpenses),
      toDisplay(outstandingReceivablesBase),
      toDisplay(outstandingPayablesBase),
      toDisplay(cashPositionBase),
    ]);

    return {
      periodLabel: label,
      currency: targetCurrency,
      revenue: Number(revenue.toFixed(2)),
      expenses: Number(expenses.toFixed(2)),
      netIncome: Number((revenue - expenses).toFixed(2)),
      outstandingReceivables: Number(outstandingReceivables.toFixed(2)),
      outstandingPayables: Number(outstandingPayables.toFixed(2)),
      cashPosition: Number(cashPosition.toFixed(2)),
    };
  }

  async getReport(
    tenantId: string,
    periodType: ReportPeriodType,
    periodKey: string,
    displayCurrency?: string,
  ) {
    const [figures, saved] = await Promise.all([
      this.buildFigures(tenantId, periodType, periodKey, displayCurrency),
      this.model
        .findOne({
          tenantId: new Types.ObjectId(tenantId),
          periodType,
          periodKey,
        })
        .lean(),
    ]);
    return {
      ...figures,
      periodType,
      periodKey,
      executiveSummary: saved?.executiveSummary ?? '',
    };
  }

  async saveExecutiveSummary(
    tenantId: string,
    periodType: ReportPeriodType,
    periodKey: string,
    executiveSummary: string,
    lastEditedBy: string,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const saved = await this.model.findOneAndUpdate(
      { tenantId: tId, periodType, periodKey },
      { $set: { executiveSummary, lastEditedBy } },
      { upsert: true, new: true },
    );
    return saved.toObject();
  }

  private async buildPdfData(
    tenantId: string,
    periodType: ReportPeriodType,
    periodKey: string,
    displayCurrency?: string,
  ): Promise<{ data: ManagementReportPdfData; firmName: string }> {
    const report = await this.getReport(
      tenantId,
      periodType,
      periodKey,
      displayCurrency,
    );
    const firmName = await resolveBusinessName(this.userModel, tenantId);
    return {
      firmName,
      data: {
        firmName,
        periodType,
        periodLabel: report.periodLabel,
        currency: report.currency,
        revenue: report.revenue,
        expenses: report.expenses,
        netIncome: report.netIncome,
        outstandingReceivables: report.outstandingReceivables,
        outstandingPayables: report.outstandingPayables,
        cashPosition: report.cashPosition,
        executiveSummary: report.executiveSummary,
      },
    };
  }

  async downloadReportPdf(
    tenantId: string,
    periodType: ReportPeriodType,
    periodKey: string,
    displayCurrency?: string,
  ): Promise<Buffer> {
    const { data } = await this.buildPdfData(
      tenantId,
      periodType,
      periodKey,
      displayCurrency,
    );
    return buildManagementReportPdf(data);
  }

  async emailReport(
    tenantId: string,
    periodType: ReportPeriodType,
    periodKey: string,
    displayCurrency: string | undefined,
    recipientName: string,
    recipientEmail: string,
    subject: string,
  ) {
    const { data } = await this.buildPdfData(
      tenantId,
      periodType,
      periodKey,
      displayCurrency,
    );
    const pdfBuffer = await buildManagementReportPdf(data);
    await this.emailService.sendManagementReport(
      {
        to: recipientEmail,
        recipientName,
        subject,
        firmName: data.firmName,
        periodLabel: data.periodLabel,
      },
      pdfBuffer,
    );
    return { sent: true, to: recipientEmail };
  }
}
