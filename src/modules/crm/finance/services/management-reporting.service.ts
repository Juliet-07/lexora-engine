import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ManagementReport,
  ManagementReportDocument,
  ReportPeriodType,
} from '../schemas';
import { InvoiceService } from './invoice.service';
import { BillService } from './purchases.service';
import { BankAccountService } from './banking.service';
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
    private readonly invoiceService: InvoiceService,
    private readonly billService: BillService,
    private readonly bankAccountService: BankAccountService,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly emailService: EmailService,
  ) {}

  private async buildFigures(
    tenantId: string,
    periodType: ReportPeriodType,
    periodKey: string,
    displayCurrency?: string,
  ) {
    const { start, end, label } = periodRange(periodType, periodKey);
    const [invoices, bills, bankAccounts, tenant] = await Promise.all([
      this.invoiceService.getAll(tenantId),
      this.billService.getAll(tenantId),
      this.bankAccountService.getAll(tenantId),
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
    const sumConverted = async (
      rows: any[],
      currencyOf: (r: any) => string,
      valueOf: (r: any) => number,
    ) =>
      (
        await Promise.all(
          rows.map(async (r) => valueOf(r) * (await rateTo(currencyOf(r)))),
        )
      ).reduce((s, v) => s + v, 0);

    const inRange = (d: string | Date) => {
      const t = new Date(d).getTime();
      return t >= start.getTime() && t <= end.getTime();
    };

    const periodInvoices = (invoices as any[]).filter(
      (i) => i.stage !== 'Draft' && inRange(i.issuedOn),
    );
    const periodBills = (bills as any[]).filter((b) => inRange(b.dueOn));

    const revenue = await sumConverted(
      periodInvoices,
      (i) => i.currency,
      (i) => i.net,
    );
    const expenses = await sumConverted(
      periodBills,
      (b) => b.currency,
      (b) => b.amount,
    );
    const outstandingReceivables = await sumConverted(
      (invoices as any[]).filter(
        (i) => !['Paid', 'Draft', 'Written Off'].includes(i.stage),
      ),
      (i) => i.currency,
      (i) => i.payable - i.paidAmount,
    );
    const outstandingPayables = await sumConverted(
      (bills as any[]).filter((b) => b.status !== 'Paid'),
      (b) => b.currency,
      (b) => b.amount,
    );
    // Current cash position — a bank balance is a point-in-time
    // snapshot, not something honestly reconstructable for a past
    // period without replaying every transaction, so this is
    // labelled as "as of today" rather than pretended to be
    // historical.
    const cashPosition = await sumConverted(
      (bankAccounts as any[]).filter((a) => a.type === 'Office'),
      (a) => a.currency,
      (a) => a.balance,
    );

    return {
      periodLabel: label,
      currency: targetCurrency,
      revenue: Number(revenue.toFixed(2)),
      expenses: Number(expenses.toFixed(2)),
      netIncome: Number((revenue - expenses).toFixed(2)),
      outstandingReceivables: Number(outstandingReceivables.toFixed(2)),
      outstandingPayables: Number(outstandingPayables.toFixed(2)),
      cashPosition: Number(cashPosition.toFixed(2)),
      invoiceCount: periodInvoices.length,
      billCount: periodBills.length,
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
