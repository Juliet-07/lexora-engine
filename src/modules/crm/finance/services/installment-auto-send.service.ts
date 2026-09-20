import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Invoice, InvoiceDocument, InvoiceStage } from '../schemas';
import { InvoiceService } from './invoice.service';

// The other half of the payment-plan redesign: PaymentPlanService
// generates every instalment invoice up front and the tenant
// approves them once, as a batch (see PaymentPlanService.approveAll).
// From there, no one has to remember to come back and click "send"
// on each instalment as its month rolls around — this runs daily and
// sends any Approved instalment invoice whose due date has arrived,
// the exact same InvoiceService.send() path a tenant clicking Send
// manually would trigger (same email, same GL posting).
@Injectable()
export class InstalmentAutoSendService {
  private readonly logger = new Logger(InstalmentAutoSendService.name);

  constructor(
    @InjectModel(Invoice.name)
    private readonly model: Model<InvoiceDocument>,
    private readonly invoiceService: InvoiceService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendDueInstalments(): Promise<void> {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const due = await this.model
      .find({
        instalmentPlanId: { $ne: null },
        stage: InvoiceStage.APPROVED,
        dueOn: { $lte: endOfToday },
      })
      .lean();

    for (const invoice of due) {
      try {
        await this.invoiceService.send(
          String(invoice.tenantId),
          String(invoice._id),
        );
      } catch (err) {
        // One instalment failing to send (e.g. tenant removed their
        // remittance details) shouldn't stop every other tenant's
        // instalments from going out on the same run.
        this.logger.error(
          `Failed to auto-send instalment invoice ${invoice.ref} (${invoice._id}): ${(err as Error).message}`,
        );
      }
    }
  }
}
