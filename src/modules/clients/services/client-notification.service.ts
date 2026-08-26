import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ClientNotification,
  ClientNotificationDocument,
  ClientNotificationType,
} from '../schemas/client-notification.schema';

interface DocumentSignatureEvent {
  tenantId: string;
  clientUserId: string;
  contractId: string;
  title: string;
}
interface InvoiceEvent {
  tenantId: string;
  clientUserId: string;
  invoiceId: string;
  ref: string;
  amount: number;
  currency: string;
}
interface OnboardingStatusEvent {
  tenantId: string;
  clientUserId: string;
  status: string;
}
interface AlertCreatedEvent {
  tenantId: string;
  clientUserId: string;
  alertId: string;
  title: string;
}
interface TicketRepliedEvent {
  tenantId: string;
  clientUserId: string;
  ticketId: string;
  ref: string;
  subject: string;
}
interface NewsletterSentEvent {
  tenantId: string;
  clientUserId: string;
  campaignId: string;
  subject: string;
}

@Injectable()
export class ClientNotificationService {
  constructor(
    @InjectModel(ClientNotification.name)
    private readonly model: Model<ClientNotificationDocument>,
  ) {}

  // ── Real creation — only ever called internally, by the event
  // listeners below reacting to something that actually happened. ──
  private async create(
    tenantId: string,
    clientUserId: string,
    type: ClientNotificationType,
    title: string,
    description = '',
    link: string | null = null,
  ) {
    return this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      clientUserId: new Types.ObjectId(clientUserId),
      type,
      title,
      description,
      link,
    });
  }

  // ── Client-facing reads/actions ──────────────────────────────
  async getMyNotifications(clientUserId: string) {
    return this.model
      .find({ clientUserId: new Types.ObjectId(clientUserId) })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
  }

  async getUnreadCount(clientUserId: string) {
    const count = await this.model.countDocuments({
      clientUserId: new Types.ObjectId(clientUserId),
      read: false,
    });
    return { count };
  }

  async markRead(clientUserId: string, id: string) {
    const notif = await this.model.findOne({
      _id: id,
      clientUserId: new Types.ObjectId(clientUserId),
    });
    if (!notif) throw new NotFoundException('Notification not found');
    if (!notif.read) {
      notif.read = true;
      notif.readAt = new Date();
      await notif.save();
    }
    return notif.toObject();
  }

  async markAllRead(clientUserId: string) {
    const now = new Date();
    await this.model.updateMany(
      { clientUserId: new Types.ObjectId(clientUserId), read: false },
      { $set: { read: true, readAt: now } },
    );
    return { marked: true };
  }

  // ═══════════════════════════════════════════════════════════
  // EVENT LISTENERS — the only place notifications get created.
  // Each one reacts to a real action already happening elsewhere
  // in the app; none of this is speculative or invented data.
  // ═══════════════════════════════════════════════════════════

  @OnEvent('client.document.sent_for_signature')
  async onDocumentSent(e: DocumentSignatureEvent) {
    await this.create(
      e.tenantId,
      e.clientUserId,
      ClientNotificationType.DOCUMENT,
      'Document ready for signature',
      `${e.title} requires your e-signature`,
      '/documents',
    );
  }

  @OnEvent('client.document.countersigned')
  async onDocumentCountersigned(e: DocumentSignatureEvent) {
    await this.create(
      e.tenantId,
      e.clientUserId,
      ClientNotificationType.DOCUMENT,
      'Document fully executed',
      `${e.title} has been signed by both parties`,
      '/documents',
    );
  }

  @OnEvent('client.invoice.sent')
  async onInvoiceSent(e: InvoiceEvent) {
    await this.create(
      e.tenantId,
      e.clientUserId,
      ClientNotificationType.INVOICE,
      `Invoice ${e.ref} generated`,
      `A new invoice of ${e.currency} ${e.amount.toLocaleString()} has been issued`,
      '/payments',
    );
  }

  @OnEvent('client.invoice.paid')
  async onInvoicePaid(e: InvoiceEvent) {
    await this.create(
      e.tenantId,
      e.clientUserId,
      ClientNotificationType.PAYMENT,
      'Payment confirmed',
      `Payment of ${e.currency} ${e.amount.toLocaleString()} for Invoice ${e.ref} received`,
      '/payments',
    );
  }

  @OnEvent('client.onboarding.status_changed')
  async onOnboardingStatusChanged(e: OnboardingStatusEvent) {
    const messages: Record<string, string> = {
      submitted: 'Your onboarding form has been submitted and is under review.',
      under_review: 'Your advisor has requested additional information.',
      approved:
        'Your onboarding has been approved — your account is fully active.',
      rejected:
        'Your onboarding was not approved. Please contact your advisor.',
    };
    await this.create(
      e.tenantId,
      e.clientUserId,
      ClientNotificationType.ONBOARDING,
      'Onboarding status update',
      messages[e.status] ?? `Your onboarding status is now ${e.status}.`,
      '/onboarding',
    );
  }

  @OnEvent('client.alert.created')
  async onAlertCreated(e: AlertCreatedEvent) {
    await this.create(
      e.tenantId,
      e.clientUserId,
      ClientNotificationType.COMPLIANCE,
      'New compliance alert',
      e.title,
      '/alerts',
    );
  }

  @OnEvent('client.ticket.replied')
  async onTicketReplied(e: TicketRepliedEvent) {
    await this.create(
      e.tenantId,
      e.clientUserId,
      ClientNotificationType.TICKET,
      `Update on Ticket ${e.ref}`,
      e.subject,
      '/service-desk',
    );
  }

  @OnEvent('client.newsletter.sent')
  async onNewsletterSent(e: NewsletterSentEvent) {
    await this.create(
      e.tenantId,
      e.clientUserId,
      ClientNotificationType.NEWSLETTER,
      'New newsletter',
      e.subject,
      '/newsletters',
    );
  }
}
