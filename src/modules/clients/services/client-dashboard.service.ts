import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import {
  OnboardingSubmission,
  OnboardingDocument,
  OnboardingStatus,
} from '../schemas/onboarding.schema';
import {
  ComplianceAlert,
  ComplianceAlertDocument,
  AlertStatus,
} from '../../kyc/schemas/compliance-alert.schema';
import {
  Mandate,
  MandateDocument_,
  MandateStage,
} from '../../crm/projects/schemas/mandate.schema';
import {
  Ticket,
  TicketDocument,
  TicketStatus,
} from '../../crm/projects/schemas/ticket.schema';
import {
  Invoice,
  InvoiceDocument,
  InvoiceStage,
} from '../../crm/finance/schemas/invoice.schema';
import {
  ToolContract,
  ToolContractDocument_,
  SignatureStatus,
} from '../../crm/tools/schemas/contract.schema';
import {
  Campaign,
  CampaignDocument,
  CampaignStatus,
} from '../../crm/tools/schemas/newsletter.schema';

@Injectable()
export class ClientDashboardService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(OnboardingSubmission.name)
    private readonly onboardingModel: Model<OnboardingDocument>,
    @InjectModel(ComplianceAlert.name)
    private readonly alertModel: Model<ComplianceAlertDocument>,
    @InjectModel(Mandate.name)
    private readonly mandateModel: Model<MandateDocument_>,
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
    @InjectModel(Invoice.name)
    private readonly invoiceModel: Model<InvoiceDocument>,
    @InjectModel(ToolContract.name)
    private readonly contractModel: Model<ToolContractDocument_>,
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════

  async getDashboard(clientId: string) {
    const client = await this.userModel
      .findById(clientId)
      .select('-password -passwordResetToken')
      .populate('tenantId', 'firstName lastName tenantProfile.businessName')
      .lean();

    if (!client) throw new NotFoundException('Client not found');
    const tenantId = (client as any).tenantId?._id ?? (client as any).tenantId;
    const cId = new Types.ObjectId(clientId);
    const tId = new Types.ObjectId(String(tenantId));

    const [
      onboarding,
      openAlerts,
      projects,
      invoices,
      tickets,
      contracts,
      newsletters,
      activeProjectCount,
      openInvoiceCount,
      openTicketCount,
      allOpenInvoices,
    ] = await Promise.all([
      this.onboardingModel
        .findOne({ clientId: cId })
        .select(
          'status clientType completionPercent sectionCompletion submittedAt lastSavedAt',
        )
        .lean(),
      this.alertModel
        .find({ tenantId: tId, clientId: cId, status: AlertStatus.OPEN })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      this.mandateModel
        .find({ tenantId: tId, clientUserId: cId })
        .sort({ updatedAt: -1 })
        .limit(6)
        .select('ref name stage progress manager targetDate')
        .lean(),
      this.invoiceModel
        .find({ tenantId: tId, clientUserId: cId })
        .sort({ updatedAt: -1 })
        .limit(6)
        .lean(),
      this.ticketModel
        .find({ tenantId: tId, clientUserId: cId })
        .sort({ updatedAt: -1 })
        .limit(6)
        .select('ref subject status updatedAt')
        .lean(),
      this.contractModel
        .find({
          tenantId: tId,
          clientId: cId,
          signatureStatus: { $ne: SignatureStatus.NOT_SENT },
        })
        .sort({ updatedAt: -1 })
        .limit(10)
        .select('title signatureStatus interactions updatedAt')
        .lean(),
      this.campaignModel
        .find({
          tenantId: tId,
          status: CampaignStatus.SENT,
          'recipients.clientId': cId,
        })
        .sort({ sentAt: -1 })
        .limit(5)
        .select('name subject sentAt recipients')
        .lean(),
      this.mandateModel.countDocuments({
        tenantId: tId,
        clientUserId: cId,
        stage: { $ne: MandateStage.CLOSE },
      }),
      this.invoiceModel.countDocuments({
        tenantId: tId,
        clientUserId: cId,
        stage: {
          $in: [
            InvoiceStage.SENT,
            InvoiceStage.PART_PAID,
            InvoiceStage.OVERDUE,
          ],
        },
      }),
      this.ticketModel.countDocuments({
        tenantId: tId,
        clientUserId: cId,
        status: { $nin: [TicketStatus.RESOLVED, TicketStatus.CLOSED] },
      }),
      // Uncapped — a stat card's "outstanding balance" has to reflect
      // every real open invoice, not just the 6 shown in the preview
      // list above.
      this.invoiceModel
        .find({
          tenantId: tId,
          clientUserId: cId,
          stage: {
            $in: [
              InvoiceStage.SENT,
              InvoiceStage.PART_PAID,
              InvoiceStage.OVERDUE,
            ],
          },
        })
        .select('lines discount vatRate whtRate paidAmount currency')
        .lean(),
    ]);

    const clientType =
      (client as any).clientProfile?.classifications || 'individual';
    const kycStatus = (client as any).clientProfile?.kycStatus || 'not_started';
    const riskLevel = (client as any).clientProfile?.riskLevel || 'unrated';
    const tenantName =
      (client as any).tenantId?.tenantProfile?.businessName ||
      (client as any).tenantId?.firstName ||
      'Your Provider';

    const invoicesWithTotals = invoices.map((i) => this.withInvoiceTotal(i));
    const pendingActions = this.buildPendingActions(
      onboarding,
      contracts,
      invoicesWithTotals,
      openAlerts,
    );
    const recentActivity = this.buildRecentActivity(
      contracts,
      tickets,
      invoicesWithTotals,
    );

    // Grouped by currency — summing across different currencies into
    // one number would be a meaningless figure, not a real total.
    const outstandingByCurrency: Record<string, number> = {};
    for (const inv of allOpenInvoices) {
      const withTotal = this.withInvoiceTotal(inv);
      const remaining = withTotal.payable - (inv.paidAmount ?? 0);
      outstandingByCurrency[inv.currency] =
        (outstandingByCurrency[inv.currency] ?? 0) + remaining;
    }

    return {
      client: {
        id: client._id,
        fullName: `${(client as any).firstName} ${(client as any).lastName}`,
        email: (client as any).email,
        phone: (client as any).phone,
        status: (client as any).status,
        clientType,
        kycStatus,
        riskLevel,
        mustChangePassword: (client as any).mustChangePassword,
        managedBy: tenantName,
        openAlerts: openAlerts.length,
      },
      onboarding: onboarding
        ? {
            status: onboarding.status,
            completionPercent: onboarding.completionPercent,
            submittedAt: onboarding.submittedAt,
            lastSavedAt: onboarding.lastSavedAt,
            banner: this.getOnboardingBanner(
              onboarding.status,
              onboarding.completionPercent,
            ),
          }
        : {
            status: 'not_started',
            completionPercent: 0,
            submittedAt: null,
            lastSavedAt: null,
            banner: {
              type: 'info',
              title: 'Complete Your Onboarding',
              message:
                'Please complete your KYC/AML onboarding form to activate your account.',
              action: 'Start Onboarding',
              link: '/onboarding',
            },
          },
      projects,
      stats: {
        activeProjectCount,
        openInvoiceCount,
        openTicketCount,
        outstandingByCurrency,
      },
      invoices: invoicesWithTotals.map((i: any) => ({
        _id: i._id,
        ref: i.ref,
        stage: i.stage,
        currency: i.currency,
        payable: i.payable,
        paidAmount: i.paidAmount,
        dueOn: i.dueOn,
        mandateName: i.mandateName,
      })),
      tickets,
      alerts: openAlerts.map((a: any) => ({
        _id: a._id,
        title: a.title,
        severity: a.severity,
        type: a.type,
        createdAt: a.createdAt,
      })),
      pendingActions,
      recentActivity,
      newsletters: newsletters.map((n: any) => ({
        _id: n._id,
        name: n.name,
        subject: n.subject,
        sentAt: n.sentAt,
        opened:
          (n.recipients as any[]).find((r) => String(r.clientId) === clientId)
            ?.opened ?? false,
      })),
    };
  }

  // Real, computed the same way InvoiceService.computeTotals does —
  // there's no stored total, it's always derived from line items
  // plus VAT/WHT/discount, so it can never drift from what the
  // lines actually say. Duplicated here (rather than injecting
  // InvoiceService) to keep this module free of cross-module
  // dependencies; the arithmetic itself is simple and stable.
  private withInvoiceTotal(inv: any) {
    const subtotal = (inv.lines ?? []).reduce(
      (s: number, l: any) => s + l.qty * l.unit,
      0,
    );
    const net = subtotal - (inv.discount ?? 0);
    const vat = (net * (inv.vatRate ?? 0)) / 100;
    const wht = (net * (inv.whtRate ?? 0)) / 100;
    return { ...inv, payable: net + vat - wht };
  }

  // A real, derived list — not a stored model — built fresh from
  // whatever in the client's real records genuinely needs their
  // attention right now, rather than a separate "actions" table
  // that could drift out of sync with the records themselves.
  private buildPendingActions(
    onboarding: any,
    contracts: any[],
    invoices: any[],
    openAlerts: any[],
  ) {
    const actions: {
      title: string;
      context: string;
      type: string;
      urgent: boolean;
      to: string;
    }[] = [];

    if (!onboarding || onboarding.status === OnboardingStatus.DRAFT) {
      actions.push({
        title:
          onboarding && onboarding.completionPercent > 0
            ? 'Continue your onboarding'
            : 'Complete your onboarding',
        context: onboarding
          ? `${onboarding.completionPercent}% complete`
          : 'Required to activate your account',
        type: 'form',
        urgent: !onboarding || onboarding.completionPercent < 50,
        to: '/onboarding',
      });
    }

    for (const c of contracts) {
      if (c.signatureStatus === SignatureStatus.SENT) {
        actions.push({
          title: `Sign ${c.title}`,
          context: 'Awaiting your signature',
          type: 'signature',
          urgent: true,
          to: '/documents',
        });
      }
    }

    for (const inv of invoices) {
      if (
        inv.stage === InvoiceStage.SENT ||
        inv.stage === InvoiceStage.OVERDUE ||
        inv.stage === InvoiceStage.PART_PAID
      ) {
        actions.push({
          title: `Settle Invoice ${inv.ref}`,
          context: `${inv.currency} ${(inv.payable - (inv.paidAmount ?? 0)).toLocaleString()} · due ${new Date(inv.dueOn).toLocaleDateString()}`,
          type: 'payment',
          urgent: inv.stage === InvoiceStage.OVERDUE,
          to: '/payments',
        });
      }
    }

    for (const a of openAlerts) {
      actions.push({
        title: `Respond to: ${a.title}`,
        context: 'Compliance alert requires a response',
        type: 'compliance',
        urgent: true,
        to: '/alerts',
      });
    }

    return actions;
  }

  // Merges real, timestamped events from the sources that actually
  // carry a history (contract interactions log every send/view/
  // sign/comment) with the current state of records that don't have
  // a granular log of their own (tickets, invoices) — for those, the
  // most recent update to the record itself is the honest signal
  // available, not a fabricated blow-by-blow history.
  private buildRecentActivity(
    contracts: any[],
    tickets: any[],
    invoices: any[],
  ) {
    const events: { text: string; meta: string; at: Date }[] = [];

    for (const c of contracts) {
      for (const i of c.interactions ?? []) {
        events.push({
          text: `${c.title} — ${String(i.type).replace(/_/g, ' ')}`,
          meta: 'Documents',
          at: new Date(i.occurredAt),
        });
      }
    }
    for (const t of tickets) {
      events.push({
        text: `Ticket ${t.ref} — ${t.subject} is ${t.status}`,
        meta: 'Service Desk',
        at: new Date(t.updatedAt),
      });
    }
    for (const inv of invoices) {
      events.push({
        text: `Invoice ${inv.ref} is ${inv.stage}`,
        meta: 'Payments',
        at: new Date(inv.updatedAt),
      });
    }

    return events
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 8)
      .map((e) => ({ text: e.text, meta: e.meta, at: e.at }));
  }

  // ═══════════════════════════════════════════════════════════
  // CLIENT ALERTS
  // ═══════════════════════════════════════════════════════════

  /**
   * GET /client/alerts
   * Returns all alerts for this client, newest first.
   * Includes open + acknowledged + reviewed + dismissed.
   */
  async getMyAlerts(clientId: string) {
    const alerts = await this.alertModel
      .find({ clientId: new Types.ObjectId(clientId) })
      .sort({ createdAt: -1 })
      .lean();

    // Separate into open (action required) and historical
    const open = alerts.filter((a) => a.status === AlertStatus.OPEN);
    const acknowledged = alerts.filter(
      (a) => a.status === AlertStatus.ACKNOWLEDGED,
    );
    const resolved = alerts.filter(
      (a) =>
        a.status === AlertStatus.REVIEWED ||
        a.status === AlertStatus.DISMISSED ||
        a.status === AlertStatus.ESCALATED,
    );

    return {
      summary: {
        total: alerts.length,
        open: open.length,
        acknowledged: acknowledged.length,
        resolved: resolved.length,
      },
      alerts,
    };
  }

  /**
   * GET /client/alerts/:id
   * Returns a single alert — only if it belongs to this client.
   */
  async getMyAlertById(alertId: string, clientId: string) {
    const alert = await this.alertModel
      .findOne({
        _id: alertId,
        clientId: new Types.ObjectId(clientId),
      })
      .lean();

    if (!alert) throw new NotFoundException('Alert not found');
    return alert;
  }

  /**
   * POST /client/alerts/:id/respond
   * Client acknowledges the alert and submits their response.
   *
   * - Can only respond to OPEN alerts
   * - Sets status to ACKNOWLEDGED
   * - Saves their note + optional document URL
   * - This is the client's only action on an alert — one response per alert
   */
  async respondToAlert(
    alertId: string,
    clientId: string,
    dto: { note: string; documentUrl?: string },
  ) {
    if (!dto.note?.trim()) {
      throw new BadRequestException('A response note is required.');
    }

    const alert = await this.alertModel.findOne({
      _id: alertId,
      clientId: new Types.ObjectId(clientId),
    });

    if (!alert) throw new NotFoundException('Alert not found');

    if (alert.status !== AlertStatus.OPEN) {
      throw new BadRequestException(
        alert.status === AlertStatus.ACKNOWLEDGED
          ? 'You have already responded to this alert.'
          : 'This alert has already been resolved and cannot be responded to.',
      );
    }

    const now = new Date();

    const updated = await this.alertModel
      .findByIdAndUpdate(
        alertId,
        {
          $set: {
            status: AlertStatus.ACKNOWLEDGED,
            clientResponse: {
              note: dto.note.trim(),
              documentUrl: dto.documentUrl ?? null,
              acknowledgedAt: now,
              respondedAt: now,
            },
          },
        },
        { new: true },
      )
      .lean();

    return updated;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════

  private getOnboardingBanner(status: string, percent: number) {
    const banners: Record<string, any> = {
      [OnboardingStatus.DRAFT]: {
        type: percent > 0 ? 'warning' : 'info',
        title: percent > 0 ? 'Onboarding In Progress' : 'Start Your Onboarding',
        message:
          percent > 0
            ? `Your onboarding form is ${percent}% complete. Please finish and submit.`
            : 'Please complete your KYC/AML onboarding form to activate your account.',
        action: 'Continue Onboarding',
        link: '/onboarding',
      },
      [OnboardingStatus.SUBMITTED]: {
        type: 'success',
        title: 'Form Submitted',
        message: 'Your onboarding form has been submitted and is under review.',
        action: null,
        link: null,
      },
      [OnboardingStatus.UNDER_REVIEW]: {
        type: 'warning',
        title: 'Additional Information Requested',
        message:
          'Your advisor has requested additional information. Please update your form.',
        action: 'Update Form',
        link: '/onboarding',
      },
      [OnboardingStatus.APPROVED]: {
        type: 'success',
        title: 'Account Activated',
        message:
          'Your onboarding has been approved. Your account is fully active.',
        action: null,
        link: null,
      },
      [OnboardingStatus.REJECTED]: {
        type: 'error',
        title: 'Onboarding Rejected',
        message:
          'Your onboarding was not approved. Please contact your advisor for details.',
        action: 'Contact Advisor',
        link: null,
      },
    };

    return banners[status] || banners[OnboardingStatus.DRAFT];
  }
}
