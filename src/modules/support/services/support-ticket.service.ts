import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import {
  Ticket,
  TicketDocument,
} from 'src/modules/crm/projects/schemas/ticket.schema';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';
import {
  SupportTicket,
  SupportTicketDocument,
  SupportTicketStatus,
  SupportTicketPriority,
  SupportTicketSource,
} from '../schemas';
import {
  CreateSupportTicketDto,
  EscalateTicketDto,
  AdminSupportMessageDto,
} from '../dtos';

const OPEN_STATUSES = [
  SupportTicketStatus.OPEN,
  SupportTicketStatus.IN_PROGRESS,
  SupportTicketStatus.WAITING_ON_TENANT,
];

@Injectable()
export class SupportTicketService {
  constructor(
    @InjectModel(SupportTicket.name)
    private readonly model: Model<SupportTicketDocument>,
    @InjectModel(Ticket.name)
    private readonly clientTicketModel: Model<TicketDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── helpers ────────────────────────────────────────────────

  private async nextRef(): Promise<string> {
    const count = await this.model.countDocuments({});
    return `SUP-${String(count + 1001)}`;
  }

  private async personName(userId: string): Promise<string> {
    const u: any = await this.userModel
      .findById(userId)
      .select('firstName lastName email')
      .lean();
    const name = [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
    return name || u?.email || 'Team member';
  }

  // What the tenant sees: everything except platform-only notes.
  private forTenant(t: any) {
    return {
      ...t,
      messages: (t.messages ?? []).filter((m: any) => !m.internal),
    };
  }

  // What the platform team sees. Deliberately drops the link back to the
  // tenant's client ticket: Super Admin works the problem through the tenant
  // and has no route to the tenant's client.
  private forAdmin(t: any) {
    const { sourceTicketId, ...rest } = t;
    return { ...rest, escalated: t.source === SupportTicketSource.ESCALATED };
  }

  private async getTenantDoc(tenantId: string, id: string) {
    const t = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!t) throw new NotFoundException('Ticket not found');
    return t;
  }

  private async getAnyDoc(id: string) {
    const t = await this.model.findById(id);
    if (!t) throw new NotFoundException('Ticket not found');
    return t;
  }

  // ── tenant ─────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateSupportTicketDto) {
    return this.createTicket(
      tenantId,
      userId,
      SupportTicketSource.TENANT,
      null,
      dto,
    );
  }

  private async createTicket(
    tenantId: string,
    userId: string,
    source: SupportTicketSource,
    sourceTicketId: string | null,
    dto: {
      subject: string;
      description: string;
      category: string;
      priority: SupportTicketPriority;
    },
  ) {
    const [tenantName, raisedByName, ref] = await Promise.all([
      resolveBusinessName(this.userModel, tenantId),
      this.personName(userId),
      this.nextRef(),
    ]);
    const created = await this.model.create({
      ref,
      tenantId: new Types.ObjectId(tenantId),
      tenantName,
      raisedByUserId: new Types.ObjectId(userId),
      raisedByName,
      source,
      sourceTicketId: sourceTicketId
        ? new Types.ObjectId(sourceTicketId)
        : null,
      subject: dto.subject.trim(),
      description: dto.description.trim(),
      category: dto.category,
      priority: dto.priority,
      lastActor: 'tenant',
      lastActivityAt: new Date(),
    });
    this.eventEmitter.emit('platform.support.created', {
      ticketId: String(created._id),
      ref,
      tenantName,
      subject: created.subject,
    });
    return this.forTenant(created.toObject());
  }

  async listForTenant(tenantId: string, status?: SupportTicketStatus) {
    const q: any = { tenantId: new Types.ObjectId(tenantId) };
    if (status) q.status = status;
    const rows = await this.model.find(q).sort({ lastActivityAt: -1 }).lean();
    return rows.map((t) => this.forTenant(t));
  }

  async getForTenant(tenantId: string, id: string) {
    const t = await this.getTenantDoc(tenantId, id);
    return this.forTenant(t.toObject());
  }

  async tenantReply(
    tenantId: string,
    userId: string,
    id: string,
    body: string,
  ) {
    const t = await this.getTenantDoc(tenantId, id);
    if (t.status === SupportTicketStatus.CLOSED) {
      throw new BadRequestException(
        'This ticket is closed — reopen it to add a message.',
      );
    }
    t.messages.push({
      authorType: 'tenant',
      authorName: await this.personName(userId),
      body: body.trim(),
      internal: false,
      at: new Date(),
    } as any);
    // A reply answers a question (Waiting on Tenant) or re-opens a ticket the
    // platform team had marked resolved.
    if (t.status === SupportTicketStatus.WAITING_ON_TENANT)
      t.status = SupportTicketStatus.IN_PROGRESS;
    if (t.status === SupportTicketStatus.RESOLVED) {
      t.status = SupportTicketStatus.OPEN;
      t.resolvedAt = null;
    }
    t.lastActor = 'tenant';
    t.lastActivityAt = new Date();
    await t.save();
    return this.forTenant(t.toObject());
  }

  // The tenant can close their own ticket or reopen a finished one — no other
  // status moves are theirs to make.
  async tenantSetStatus(tenantId: string, id: string, closed: boolean) {
    const t = await this.getTenantDoc(tenantId, id);
    if (closed) {
      t.status = SupportTicketStatus.CLOSED;
      t.resolvedAt = t.resolvedAt ?? new Date();
    } else {
      if (OPEN_STATUSES.includes(t.status))
        throw new BadRequestException('This ticket is already open.');
      t.status = SupportTicketStatus.OPEN;
      t.resolvedAt = null;
    }
    t.lastActor = 'tenant';
    t.lastActivityAt = new Date();
    await t.save();
    return this.forTenant(t.toObject());
  }

  // ── escalation of a client ticket ──────────────────────────

  async escalate(
    tenantId: string,
    userId: string,
    clientTicketId: string,
    dto: EscalateTicketDto,
  ) {
    const clientTicket = await this.clientTicketModel.findOne({
      _id: clientTicketId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!clientTicket) throw new NotFoundException('Ticket not found');

    // Only platform-side problems go up. A "Billing" or "Advisory" question
    // is the tenant's own business to answer.
    if (!/portal/i.test(clientTicket.category)) {
      throw new BadRequestException(
        'Only tickets in the Portal access category can be escalated to the platform team.',
      );
    }

    const existing = await this.model.findOne({
      tenantId: new Types.ObjectId(tenantId),
      sourceTicketId: clientTicket._id,
      status: { $in: OPEN_STATUSES },
    });
    if (existing) {
      throw new BadRequestException(
        `This ticket is already escalated (${existing.ref}).`,
      );
    }

    // The platform team must not learn who the tenant's client is. Stop the
    // obvious slip — the client's name typed into what the tenant sends up.
    const name = (clientTicket.clientName ?? '').trim();
    if (name.length >= 3) {
      const hay = `${dto.subject}\n${dto.description}`.toLowerCase();
      if (hay.includes(name.toLowerCase())) {
        throw new BadRequestException(
          "Remove the client's name from the subject and description — the platform team can't see your clients' details.",
        );
      }
    }

    const priority = dto.priority ?? (clientTicket.priority as any);
    const created = await this.createTicket(
      tenantId,
      userId,
      SupportTicketSource.ESCALATED,
      clientTicketId,
      {
        subject: dto.subject,
        description: dto.description,
        category: 'Portal access',
        priority,
      },
    );

    const author = await this.personName(userId);
    clientTicket.notes.push({
      author: 'System',
      internal: true,
      body: `Escalated to platform support as ${created.ref} by ${author}.`,
      at: new Date(),
    } as any);
    if (dto.notifyClient) {
      clientTicket.notes.push({
        author,
        internal: false,
        body: "We've escalated this to our platform team and will update you here as soon as we hear back.",
        at: new Date(),
      } as any);
    }
    await clientTicket.save();
    if (dto.notifyClient) {
      this.eventEmitter.emit('client.ticket.replied', {
        tenantId,
        clientUserId: String(clientTicket.clientUserId),
        ticketId: String(clientTicket._id),
        ref: clientTicket.ref,
        subject: clientTicket.subject,
      });
    }
    return created;
  }

  // The platform thread behind a client ticket, if it was escalated — the
  // most recent one. Null when the ticket was never escalated.
  async getForClientTicket(tenantId: string, clientTicketId: string) {
    if (!Types.ObjectId.isValid(clientTicketId)) return null;
    const t = await this.model
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        sourceTicketId: new Types.ObjectId(clientTicketId),
      })
      .sort({ createdAt: -1 })
      .lean();
    return t ? this.forTenant(t) : null;
  }

  // ── Super Admin ────────────────────────────────────────────

  async adminList(filters: {
    status?: SupportTicketStatus;
    priority?: SupportTicketPriority;
    source?: SupportTicketSource;
    needsReply?: boolean;
    q?: string;
  }) {
    const q: any = {};
    if (filters.status) q.status = filters.status;
    if (filters.priority) q.priority = filters.priority;
    if (filters.source) q.source = filters.source;
    if (filters.needsReply) {
      q.lastActor = 'tenant';
      q.status = { $in: OPEN_STATUSES };
    }
    if (filters.q?.trim()) {
      const rx = new RegExp(
        filters.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      q.$or = [{ subject: rx }, { ref: rx }, { tenantName: rx }];
    }
    const rows = await this.model
      .find(q)
      .select('-messages')
      .sort({ lastActivityAt: -1 })
      .lean();
    return rows.map((t) => this.forAdmin(t));
  }

  async adminStats() {
    const [open, needsReply, urgent, resolved] = await Promise.all([
      this.model.countDocuments({ status: { $in: OPEN_STATUSES } }),
      this.model.countDocuments({
        status: { $in: OPEN_STATUSES },
        lastActor: 'tenant',
      }),
      this.model.countDocuments({
        status: { $in: OPEN_STATUSES },
        priority: SupportTicketPriority.URGENT,
      }),
      this.model.countDocuments({
        status: {
          $in: [SupportTicketStatus.RESOLVED, SupportTicketStatus.CLOSED],
        },
      }),
    ]);
    return { open, needsReply, urgent, resolved };
  }

  async adminGet(id: string) {
    const t = await this.getAnyDoc(id);
    return this.forAdmin(t.toObject());
  }

  async adminReply(
    adminUserId: string,
    id: string,
    dto: AdminSupportMessageDto,
  ) {
    const t = await this.getAnyDoc(id);
    const internal = !!dto.internal;
    const name = await this.personName(adminUserId);
    t.messages.push({
      authorType: 'platform',
      authorName: name,
      body: dto.body.trim(),
      internal,
      at: new Date(),
    } as any);
    if (!internal) {
      t.lastActor = 'platform';
      if (t.status === SupportTicketStatus.OPEN)
        t.status = SupportTicketStatus.IN_PROGRESS;
      t.lastActivityAt = new Date();
    }
    if (!t.assignedToUserId) {
      t.assignedToUserId = new Types.ObjectId(adminUserId);
      t.assignedToName = name;
    }
    await t.save();
    if (!internal) this.emitUpdate(t, 'replied');
    return this.forAdmin(t.toObject());
  }

  async adminSetStatus(
    adminUserId: string,
    id: string,
    status: SupportTicketStatus,
  ) {
    const t = await this.getAnyDoc(id);
    t.status = status;
    t.resolvedAt = [
      SupportTicketStatus.RESOLVED,
      SupportTicketStatus.CLOSED,
    ].includes(status)
      ? (t.resolvedAt ?? new Date())
      : null;
    if (status === SupportTicketStatus.WAITING_ON_TENANT)
      t.lastActor = 'platform';
    if (!t.assignedToUserId) {
      t.assignedToUserId = new Types.ObjectId(adminUserId);
      t.assignedToName = await this.personName(adminUserId);
    }
    t.lastActivityAt = new Date();
    await t.save();
    this.emitUpdate(t, 'status');

    // An escalated ticket's outcome is also written onto the tenant's own
    // client ticket (internal), so whoever is handling that client sees it
    // without opening the platform thread.
    if (
      t.sourceTicketId &&
      [SupportTicketStatus.RESOLVED, SupportTicketStatus.CLOSED].includes(
        status,
      )
    ) {
      await this.clientTicketModel.updateOne(
        { _id: t.sourceTicketId, tenantId: t.tenantId },
        {
          $push: {
            notes: {
              author: 'System',
              internal: true,
              body: `Platform support marked ${t.ref} ${status.toLowerCase()}. Share the outcome with the client when ready.`,
              at: new Date(),
            },
          },
        },
      );
    }
    return this.forAdmin(t.toObject());
  }

  async adminAssignToMe(adminUserId: string, id: string) {
    const t = await this.getAnyDoc(id);
    t.assignedToUserId = new Types.ObjectId(adminUserId);
    t.assignedToName = await this.personName(adminUserId);
    await t.save();
    return this.forAdmin(t.toObject());
  }

  private emitUpdate(t: SupportTicketDocument, kind: 'replied' | 'status') {
    this.eventEmitter.emit('platform.support.updated', {
      tenantId: String(t.tenantId),
      recipientUserId: String(t.raisedByUserId),
      ticketId: String(t._id),
      ref: t.ref,
      subject: t.subject,
      status: t.status,
      escalated: t.source === SupportTicketSource.ESCALATED,
      kind,
    });
  }
}
