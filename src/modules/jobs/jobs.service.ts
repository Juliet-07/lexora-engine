import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Invoice, InvoiceStatus } from '../billing/schemas/billing.schema';
import { KycRecord, KycStatus } from '../kyc/schemas/kyc-record.schema';
import { ScreeningResult } from '../kyc/schemas/screening-result.schema';
import { Client } from '../clients/schemas/client.schema';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<any>,
    @InjectModel(KycRecord.name) private kycModel: Model<any>,
    @InjectModel(ScreeningResult.name) private screeningModel: Model<any>,
    @InjectModel(Client.name) private clientModel: Model<any>,
  ) {}

  /**
   * Mark past-due invoices as overdue — runs daily at midnight
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markOverdueInvoices() {
    this.logger.log('[JOB] Running: markOverdueInvoices');
    try {
      const result = await this.invoiceModel.updateMany(
        {
          status: { $in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
          dueDate: { $lt: new Date() },
        },
        { $set: { status: InvoiceStatus.OVERDUE } },
      );
      this.logger.log(`[JOB] markOverdueInvoices: updated ${result.modifiedCount} invoices`);
    } catch (err) {
      this.logger.error('[JOB] markOverdueInvoices failed', err);
    }
  }

  /**
   * Flag expiring KYC records (within 30 days) — runs daily at 6am
   */
  @Cron('0 6 * * *')
  async flagExpiringKyc() {
    this.logger.log('[JOB] Running: flagExpiringKyc');
    try {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const expiring = await this.kycModel.find({
        status: KycStatus.APPROVED,
        expiresAt: { $lt: thirtyDaysFromNow, $gt: new Date() },
      }).select('clientId organizationId expiresAt');

      this.logger.log(`[JOB] flagExpiringKyc: found ${expiring.length} records expiring within 30 days`);
      // In production: trigger notifications for each record
    } catch (err) {
      this.logger.error('[JOB] flagExpiringKyc failed', err);
    }
  }

  /**
   * Mark expired KYC records — runs daily at 1am
   */
  @Cron('0 1 * * *')
  async expireKycRecords() {
    this.logger.log('[JOB] Running: expireKycRecords');
    try {
      const result = await this.kycModel.updateMany(
        {
          status: KycStatus.APPROVED,
          expiresAt: { $lt: new Date() },
        },
        { $set: { status: KycStatus.EXPIRED } },
      );
      this.logger.log(`[JOB] expireKycRecords: expired ${result.modifiedCount} KYC records`);
    } catch (err) {
      this.logger.error('[JOB] expireKycRecords failed', err);
    }
  }

  /**
   * Trigger periodic AML re-screening — runs every Sunday at 2am
   */
  @Cron('0 2 * * 0')
  async scheduledScreeningReminders() {
    this.logger.log('[JOB] Running: scheduledScreeningReminders');
    try {
      const dueForScreening = await this.screeningModel.find({
        nextScreeningDate: { $lt: new Date() },
      }).select('clientId organizationId');

      this.logger.log(`[JOB] scheduledScreeningReminders: ${dueForScreening.length} clients due for re-screening`);
      // In production: enqueue individual screening jobs via BullMQ
    } catch (err) {
      this.logger.error('[JOB] scheduledScreeningReminders failed', err);
    }
  }

  /**
   * Send invoice due reminders (3 days before due) — runs daily at 8am
   */
  @Cron('0 8 * * *')
  async invoiceDueReminders() {
    this.logger.log('[JOB] Running: invoiceDueReminders');
    try {
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);

      const dueSoon = await this.invoiceModel
        .find({
          status: { $in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
          dueDate: { $gt: tomorrow, $lt: threeDaysFromNow },
        })
        .populate('clientId', 'firstName lastName email')
        .lean();

      this.logger.log(`[JOB] invoiceDueReminders: ${dueSoon.length} invoices due within 3 days`);
      // In production: send email reminders for each
    } catch (err) {
      this.logger.error('[JOB] invoiceDueReminders failed', err);
    }
  }

  /**
   * Update client lastActivityAt — runs every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async heartbeat() {
    this.logger.debug('[JOB] Heartbeat - all cron jobs running');
  }

  // Manual trigger endpoints for testing
  async triggerMarkOverdue() {
    return this.markOverdueInvoices();
  }

  async triggerExpireKyc() {
    return this.expireKycRecords();
  }
}
