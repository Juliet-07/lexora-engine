import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import {
  TenantNotification,
  TenantNotificationDocument,
  TenantNotificationType,
  ClientProfileRecord,
  ClientProfileDocument,
} from '../schemas';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import { Employee, EmployeeDocument } from '../../hr/schemas';
import { EmailService } from '../../../common/utils/mailing/email.service';

interface InvoicePaidEvent {
  tenantId: string;
  clientUserId: string;
  clientName: string;
  invoiceId: string;
  ref: string;
  amount: number;
  currency: string;
}
interface TicketClientRepliedEvent {
  tenantId: string;
  clientUserId: string;
  clientName: string;
  ticketId: string;
  ref: string;
  subject: string;
}
interface ComplianceAlertEvent {
  tenantId: string;
  clientUserId: string | null;
  alertId: string;
  title: string;
  severity: string;
}
interface DocumentSignedEvent {
  tenantId: string;
  clientUserId: string | null;
  contractId: string;
  title: string;
  signerName: string;
}
interface OnboardingSubmittedEvent {
  tenantId: string;
  clientUserId: string;
  clientName: string;
}
interface ProbationStartedEvent {
  tenantId: string;
  employeeId: string;
  probationEndDate: Date;
}

@Injectable()
export class TenantNotificationService {
  constructor(
    @InjectModel(TenantNotification.name)
    private readonly model: Model<TenantNotificationDocument>,
    @InjectModel(ClientProfileRecord.name)
    private readonly profileModel: Model<ClientProfileDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly mailService: EmailService,
  ) {}

  // ── Real recipient resolution — the client's actual assigned
  // relationship owner where one is set, falling back to the real
  // tenant owner account. Never a broadcast-to-everyone default. ──
  private async resolveRecipient(
    tenantId: string,
    clientUserId: string | null,
  ): Promise<string> {
    if (clientUserId) {
      const profile = await this.profileModel
        .findOne({ userId: new Types.ObjectId(clientUserId) })
        .select('assignedTo')
        .lean();
      if (profile?.assignedTo) return String(profile.assignedTo);
    }
    return tenantId;
  }

  // ── Real creation — only ever called internally, by the event
  // listeners below reacting to something that actually happened.
  // skipEmail is only true for events that already send their own
  // real email elsewhere, to avoid a duplicate. ──
  private async create(
    tenantId: string,
    recipientUserId: string,
    type: TenantNotificationType,
    title: string,
    description = '',
    link: string | null = null,
    skipEmail = false,
  ) {
    let emailSent = false;

    if (!skipEmail) {
      try {
        const recipient = await this.userModel
          .findById(recipientUserId)
          .select('email firstName')
          .lean();
        if (recipient?.email) {
          await this.mailService.sendTenantNotification({
            to: recipient.email,
            firstName: recipient.firstName ?? 'there',
            title,
            description,
            link,
            appUrl: process.env.TENANT_APP_URL || '',
          });
          emailSent = true;
        }
      } catch (err) {
        // Log but never let email failure stop the in-app record
        // from being created — the person should still see it here.
        console.error('Failed to send tenant notification email:', err);
      }
    }

    return this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      recipientUserId: new Types.ObjectId(recipientUserId),
      type,
      title,
      description,
      link,
      emailSent,
    });
  }

  // ── Tenant-facing reads/actions ──────────────────────────────
  async getMyNotifications(recipientUserId: string) {
    return this.model
      .find({ recipientUserId: new Types.ObjectId(recipientUserId) })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
  }

  async getUnreadCount(recipientUserId: string) {
    const count = await this.model.countDocuments({
      recipientUserId: new Types.ObjectId(recipientUserId),
      read: false,
    });
    return { count };
  }

  async markRead(recipientUserId: string, id: string) {
    const notif = await this.model.findOne({
      _id: id,
      recipientUserId: new Types.ObjectId(recipientUserId),
    });
    if (!notif) throw new NotFoundException('Notification not found');
    if (!notif.read) {
      notif.read = true;
      notif.readAt = new Date();
      await notif.save();
    }
    return notif.toObject();
  }

  async markAllRead(recipientUserId: string) {
    const now = new Date();
    await this.model.updateMany(
      { recipientUserId: new Types.ObjectId(recipientUserId), read: false },
      { $set: { read: true, readAt: now } },
    );
    return { marked: true };
  }

  // ═══════════════════════════════════════════════════════════
  // EVENT LISTENERS — the only place notifications get created.
  // Each one reacts to a real action already happening elsewhere
  // in the app; none of this is speculative or invented data.
  // ═══════════════════════════════════════════════════════════

  @OnEvent('tenant.invoice.paid')
  async onInvoicePaid(e: InvoicePaidEvent) {
    const recipient = await this.resolveRecipient(e.tenantId, e.clientUserId);
    await this.create(
      e.tenantId,
      recipient,
      TenantNotificationType.INVOICE,
      `Payment received — Invoice ${e.ref}`,
      `${e.clientName} paid ${e.currency} ${e.amount.toLocaleString()} for Invoice ${e.ref}.`,
      '/finance/invoicing',
    );
  }

  @OnEvent('tenant.ticket.client_replied')
  async onTicketClientReplied(e: TicketClientRepliedEvent) {
    const recipient = await this.resolveRecipient(e.tenantId, e.clientUserId);
    await this.create(
      e.tenantId,
      recipient,
      TenantNotificationType.TICKET,
      `${e.clientName} replied — Ticket ${e.ref}`,
      e.subject,
      '/crm/service-desk',
    );
  }

  @OnEvent('tenant.compliance.alert_created')
  async onComplianceAlertCreated(e: ComplianceAlertEvent) {
    const recipient = await this.resolveRecipient(e.tenantId, e.clientUserId);
    await this.create(
      e.tenantId,
      recipient,
      TenantNotificationType.COMPLIANCE,
      `New compliance alert (${e.severity})`,
      e.title,
      '/aml/transaction-monitoring',
    );
  }

  @OnEvent('tenant.document.signed_by_counterparty')
  async onDocumentSigned(e: DocumentSignedEvent) {
    const recipient = await this.resolveRecipient(e.tenantId, e.clientUserId);
    await this.create(
      e.tenantId,
      recipient,
      TenantNotificationType.DOCUMENT,
      `${e.signerName} signed — ${e.title}`,
      `Ready for your countersignature to finalise the document.`,
      '/crm/contracts',
    );
  }

  @OnEvent('tenant.onboarding.submitted')
  async onOnboardingSubmitted(e: OnboardingSubmittedEvent) {
    const recipient = await this.resolveRecipient(e.tenantId, e.clientUserId);
    // Real email for this one already sent directly from
    // OnboardingService — skip a second email here.
    await this.create(
      e.tenantId,
      recipient,
      TenantNotificationType.ONBOARDING,
      'New KYC form submitted',
      `${e.clientName} submitted their onboarding form and is ready for review.`,
      `/clients/onboarding/${e.clientUserId}`,
      true,
    );
  }

  @OnEvent('employee.probation.started')
  async onProbationStarted(e: ProbationStartedEvent) {
    const employee = await this.employeeModel
      .findById(e.employeeId)
      .select('firstName lastName')
      .lean();
    const name = employee
      ? `${employee.firstName} ${employee.lastName}`
      : 'An employee';
    await this.create(
      e.tenantId,
      e.tenantId,
      TenantNotificationType.HR,
      'Probation period started',
      `${name}'s probation ends ${new Date(e.probationEndDate).toLocaleDateString()}.`,
      '/hr/employees',
    );
  }
}
