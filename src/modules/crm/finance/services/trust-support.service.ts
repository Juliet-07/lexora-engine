import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import {
  TrustAuditEntry,
  TrustAuditEntryDocument,
  TrustAuditAction,
  TrustLedger,
  TrustLedgerDocument,
} from '../schemas';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import {
  ClientNotification,
  ClientNotificationDocument,
  ClientNotificationType,
} from 'src/modules/clients/schemas/client-notification.schema';

// Who did it, as it is written into the audit trail. The id is what the
// dual-control rules compare; the name is what a person reads.
export interface TrustActor {
  id: string;
  name: string;
  ip?: string;
}

// ── Audit trail ────────────────────────────────────────────────────
// Append-only. There is no update or delete here, on purpose — a
// trust audit log you can edit is not a trust audit log.

@Injectable()
export class TrustAuditService {
  constructor(
    @InjectModel(TrustAuditEntry.name)
    private readonly model: Model<TrustAuditEntryDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  // Resolves the signed-in user to a real name for the trail. Never
  // throws — the action being audited matters more than the lookup.
  async actor(userId: string, ip?: string): Promise<TrustActor> {
    let name = 'A team member';
    try {
      const u: any = await this.userModel
        .findById(userId)
        .select('firstName lastName tenantProfile.businessName')
        .lean();
      name =
        [u?.firstName, u?.lastName].filter(Boolean).join(' ') ||
        u?.tenantProfile?.businessName ||
        name;
    } catch {
      /* fall through with the generic name */
    }
    return { id: userId, name, ip };
  }

  async log(
    tenantId: string,
    e: {
      action: TrustAuditAction;
      ledger?: { _id?: any; clientName?: string } | null;
      movementId?: any;
      details: string;
      amount?: number | null;
      currency?: string;
      actor?: TrustActor | null;
    },
  ) {
    await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      action: e.action,
      ledgerId: e.ledger?._id ? new Types.ObjectId(String(e.ledger._id)) : null,
      clientName: e.ledger?.clientName ?? 'All',
      movementId: e.movementId
        ? new Types.ObjectId(String(e.movementId))
        : null,
      details: e.details,
      amount: e.amount ?? null,
      currency: e.currency ?? '',
      userName: e.actor?.name ?? 'System',
      userId: e.actor?.id ?? null,
      ip: e.actor?.ip ?? '',
    });
  }

  async list(
    tenantId: string,
    f: {
      action?: string;
      ledgerId?: string;
      q?: string;
      from?: string;
      to?: string;
      limit?: number;
    } = {},
  ) {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (f.action && f.action !== 'all') query.action = f.action;
    if (f.ledgerId) query.ledgerId = new Types.ObjectId(f.ledgerId);
    if (f.from || f.to) {
      query.createdAt = {};
      if (f.from) query.createdAt.$gte = new Date(f.from);
      if (f.to) {
        const end = new Date(f.to);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }
    if (f.q?.trim()) {
      const rx = new RegExp(
        f.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      query.$or = [{ details: rx }, { clientName: rx }, { userName: rx }];
    }
    return this.model
      .find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(f.limit ?? 500, 5000))
      .lean();
  }
}

// ── Client notices ─────────────────────────────────────────────────
// Every notice goes to the client's portal in real time (the portal
// listener files it), and is emailed to the portal contact — straight
// away, or rolled into a daily/weekly digest, as the ledger says.

@Injectable()
export class TrustNotifierService {
  private readonly logger = new Logger(TrustNotifierService.name);

  constructor(
    private readonly events: EventEmitter2,
    private readonly email: EmailService,
    @InjectModel(TrustLedger.name)
    private readonly ledgerModel: Model<TrustLedgerDocument>,
    @InjectModel(ClientNotification.name)
    private readonly notificationModel: Model<ClientNotificationDocument>,
  ) {}

  private appUrl() {
    return process.env.CLIENT_APP_URL || process.env.APP_URL || '';
  }

  private recipients(ledger: any): string[] {
    return Array.from(
      new Set(
        [ledger.portalContactEmail, ...(ledger.additionalPortalUsers ?? [])]
          .map((e: string) =>
            String(e ?? '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    );
  }

  // `pref` is the ledger's own notification switch for this kind of
  // notice — if the client turned it off, nothing is sent.
  async notify(
    tenantId: string,
    ledger: any,
    pref: keyof NonNullable<TrustLedger['notifyPrefs']>,
    title: string,
    description: string,
  ) {
    try {
      if (ledger.notifyPrefs && ledger.notifyPrefs[pref] === false) return;
      const fullTitle = `Trust: ${title}`;
      if (ledger.portalAccess !== 'Disabled' && ledger.clientUserId) {
        this.events.emit('client.general.notice', {
          tenantId,
          clientUserId: String(ledger.clientUserId),
          title: fullTitle,
          description,
          type: ClientNotificationType.PAYMENT,
        });
      }
      const digest = ledger.emailDigest ?? 'Real-time';
      if (!String(digest).toLowerCase().startsWith('real')) return;
      await this.emailAll(ledger, fullTitle, description);
    } catch (e: any) {
      this.logger.warn(`Trust notice failed: ${e?.message ?? e}`);
    }
  }

  private async emailAll(ledger: any, title: string, description: string) {
    for (const to of this.recipients(ledger)) {
      await this.email.sendTenantNotification({
        to,
        firstName: ledger.clientName,
        title,
        description,
        link: null,
        appUrl: this.appUrl(),
      });
    }
  }

  // Daily and weekly digests: one email per ledger with everything
  // that was filed to the client's portal since the last one.
  @Cron('0 7 * * *')
  async sendDigests() {
    const weekly = new Date().getDay() === 1;
    const ledgers = await this.ledgerModel
      .find({
        emailDigest: weekly
          ? { $in: ['Daily digest', 'Weekly summary'] }
          : 'Daily digest',
        portalContactEmail: { $ne: '' },
      })
      .lean();
    for (const l of ledgers) {
      try {
        const days = l.emailDigest === 'Weekly summary' ? 7 : 1;
        const since = new Date(Date.now() - days * 86400000);
        const items = await this.notificationModel
          .find({
            tenantId: l.tenantId,
            clientUserId: l.clientUserId,
            title: /^Trust:/,
            createdAt: { $gte: since },
          })
          .sort({ createdAt: 1 })
          .lean();
        if (!items.length) continue;
        await this.emailAll(
          l,
          `Trust account ${days === 7 ? 'weekly summary' : 'daily digest'}`,
          items
            .map(
              (i: any) =>
                `• ${i.title.replace(/^Trust: /, '')} — ${i.description}`,
            )
            .join(' · '),
        );
      } catch (e: any) {
        this.logger.warn(`Trust digest failed: ${e?.message ?? e}`);
      }
    }
  }
}
