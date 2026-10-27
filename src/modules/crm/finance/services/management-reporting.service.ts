import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ManagementReport,
  ManagementReportDocument,
  ReportPeriodType,
} from '../schemas';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';
import { buildManagementReportPdf } from 'src/common/utils/pdf/management-report.util';
import { ReportPackService } from './report-pack.service';

// The management report is now a full pack (see ReportPackService) —
// this service keeps the original endpoints working (headline figures,
// the single executive summary) and adds the PDF / email for the
// complete report. Figures are never stored; only what the tenant
// writes is.
@Injectable()
export class ManagementReportingService {
  constructor(
    @InjectModel(ManagementReport.name)
    private readonly model: Model<ManagementReportDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
    private readonly reportPack: ReportPackService,
  ) {}

  // Headline figures + executive summary, in the shape this endpoint
  // has always returned. Revenue / expenses read the same GL P&L
  // columns as the Report page, so the two can't disagree.
  async getReport(
    tenantId: string,
    periodType: ReportPeriodType,
    periodKey: string,
    displayCurrency?: string,
  ) {
    const pack = await this.reportPack.buildPack(
      tenantId,
      periodType,
      periodKey,
      displayCurrency,
    );
    const rev = pack.pnl.totals.revenue.cur;
    const exp =
      pack.pnl.totals.costOfServices.cur +
      pack.pnl.totals.operatingExpenses.cur;
    return {
      periodLabel: pack.meta.periodLabel,
      currency: pack.meta.currency,
      revenue: rev,
      expenses: Number(exp.toFixed(2)),
      netIncome: pack.pnl.totals.netProfit.cur,
      outstandingReceivables: pack.overview.kpis.receivables,
      outstandingPayables: pack.overview.kpis.payables,
      cashPosition: pack.overview.kpis.cashPosition,
      periodType,
      periodKey,
      executiveSummary: pack.management.commentary.ceoMessage,
    };
  }

  async getPack(
    tenantId: string,
    periodType: ReportPeriodType,
    periodKey: string,
    displayCurrency?: string,
  ) {
    return this.reportPack.buildPack(
      tenantId,
      periodType,
      periodKey,
      displayCurrency,
    );
  }

  async saveExecutiveSummary(
    tenantId: string,
    periodType: ReportPeriodType,
    periodKey: string,
    executiveSummary: string,
    lastEditedBy: string,
  ) {
    const saved = await this.model.findOneAndUpdate(
      {
        tenantId: new Types.ObjectId(tenantId),
        periodType,
        periodKey,
      },
      {
        $set: {
          executiveSummary,
          'commentary.ceoMessage': executiveSummary,
          lastEditedBy,
        },
      },
      { upsert: true, new: true },
    );
    return saved.toObject();
  }

  saveContent(
    tenantId: string,
    periodType: ReportPeriodType,
    periodKey: string,
    dto: Parameters<ReportPackService['saveContent']>[3],
    editedBy: string,
  ) {
    return this.reportPack.saveContent(
      tenantId,
      periodType,
      periodKey,
      dto,
      editedBy,
    );
  }

  private async buildPdf(
    tenantId: string,
    periodType: ReportPeriodType,
    periodKey: string,
    displayCurrency?: string,
  ) {
    const [pack, firmName] = await Promise.all([
      this.reportPack.buildPack(
        tenantId,
        periodType,
        periodKey,
        displayCurrency,
      ),
      resolveBusinessName(this.userModel, tenantId),
    ]);
    const pdf = await buildManagementReportPdf({
      firmName,
      ...(pack as any),
    });
    return { pdf, firmName, periodLabel: pack.meta.periodLabel };
  }

  async downloadReportPdf(
    tenantId: string,
    periodType: ReportPeriodType,
    periodKey: string,
    displayCurrency?: string,
  ): Promise<Buffer> {
    return (
      await this.buildPdf(tenantId, periodType, periodKey, displayCurrency)
    ).pdf;
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
    const { pdf, firmName, periodLabel } = await this.buildPdf(
      tenantId,
      periodType,
      periodKey,
      displayCurrency,
    );
    await this.emailService.sendManagementReport(
      {
        to: recipientEmail,
        recipientName,
        subject,
        firmName,
        periodLabel,
      },
      pdf,
    );
    return { sent: true, to: recipientEmail };
  }

  // Sends the report PDF to every active board member — the "Email to
  // Board" action on the Management report tab.
  async emailReportToBoard(
    tenantId: string,
    periodType: ReportPeriodType,
    periodKey: string,
    displayCurrency: string | undefined,
    subject?: string,
  ) {
    const recipients = await this.reportPack.boardRecipients(tenantId);
    if (!recipients.length) {
      throw new BadRequestException(
        'There are no active board members with an email address to send this to.',
      );
    }
    const { pdf, firmName, periodLabel } = await this.buildPdf(
      tenantId,
      periodType,
      periodKey,
      displayCurrency,
    );
    const subj = subject?.trim() || `Management report — ${periodLabel}`;
    for (const r of recipients) {
      await this.emailService.sendManagementReport(
        {
          to: r.email,
          recipientName: r.name,
          subject: subj,
          firmName,
          periodLabel,
        },
        pdf,
      );
    }
    return { sent: true, count: recipients.length };
  }
}
