import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Ticket,
  TicketDocument,
  TicketStatus,
  SLA_TARGET_HRS_BY_PRIORITY,
} from '../schemas';
import {
  CreateTicketDto,
  AssignTicketDto,
  UpdateTicketStatusDto,
  AddTicketNoteDto,
  RateTicketDto,
} from '../dtos';

@Injectable()
export class TicketService {
  constructor(
    @InjectModel(Ticket.name) private readonly model: Model<TicketDocument>,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const count = await this.model.countDocuments({ tenantId });
    return `TCK-${String(count + 101)}`;
  }

  // Live, pause-aware elapsed hours — never stored, always computed
  // from createdAt / pausedAt / totalPausedMs / slaStoppedAt at read
  // time, so it's correct the instant you look at it rather than
  // however stale the last write happened to be.
  private computeElapsedHrs(t: any): number {
    const now = Date.now();
    const created = new Date(t.createdAt).getTime();
    const end = t.slaStoppedAt ? new Date(t.slaStoppedAt).getTime() : now;
    const currentPauseMs =
      t.pausedAt && !t.slaStoppedAt ? now - new Date(t.pausedAt).getTime() : 0;
    const elapsedMs = end - created - (t.totalPausedMs ?? 0) - currentPauseMs;
    return Math.max(0, elapsedMs / 3600000);
  }

  private normalize(t: any) {
    return { ...t, slaElapsedHrs: this.computeElapsedHrs(t) };
  }

  async getAll(
    tenantId: string,
    filters: {
      status?: TicketStatus;
      agentUserId?: string;
      clientUserId?: string;
    } = {},
  ) {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (filters.status) query.status = filters.status;
    if (filters.agentUserId)
      query.agentUserId = new Types.ObjectId(filters.agentUserId);
    if (filters.clientUserId)
      query.clientUserId = new Types.ObjectId(filters.clientUserId);
    const rows = await this.model.find(query).sort({ createdAt: -1 }).lean();
    return rows.map((t) => this.normalize(t));
  }

  async getById(tenantId: string, id: string) {
    const t = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!t) throw new NotFoundException('Ticket not found');
    return this.normalize(t);
  }

  private async getRawDoc(tenantId: string, id: string) {
    const t = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!t) throw new NotFoundException('Ticket not found');
    return t;
  }

  // The only creation path — always the client, always Portal,
  // always starts at New with an SLA target derived from priority.
  async create(
    tenantId: string,
    clientUserId: string,
    clientName: string,
    dto: CreateTicketDto,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      subject: dto.subject,
      description: dto.description,
      clientUserId: new Types.ObjectId(clientUserId),
      clientName,
      category: dto.category,
      priority: dto.priority,
      slaTargetHrs: SLA_TARGET_HRS_BY_PRIORITY[dto.priority],
    });
    return this.normalize(created.toObject());
  }

  // Sets the agent. Only bumps status New → Assigned — reassigning a
  // ticket that's already further along (In Progress, etc.) changes
  // who owns it without regressing the status, which is more useful
  // than blindly resetting progress every time ownership changes.
  async assign(tenantId: string, id: string, dto: AssignTicketDto) {
    const t = await this.getRawDoc(tenantId, id);
    t.agentUserId = new Types.ObjectId(dto.agentUserId);
    t.agent = dto.agentName;
    if (t.status === TicketStatus.NEW) t.status = TicketStatus.ASSIGNED;
    await t.save();
    return this.normalize(t.toObject());
  }

  // Owns the SLA pause/resume/freeze rules — the one place that
  // logic lives, so every caller (tenant, employee, and the client's
  // own "close my ticket" if that's ever added) goes through it
  // rather than each reimplementing when the clock should move.
  async setStatus(tenantId: string, id: string, dto: UpdateTicketStatusDto) {
    const t = await this.getRawDoc(tenantId, id);
    const wasPaused = t.status === TicketStatus.PENDING_CLIENT;
    const willPause = dto.status === TicketStatus.PENDING_CLIENT;
    const willStop =
      !t.slaStoppedAt &&
      [TicketStatus.RESOLVED, TicketStatus.CLOSED].includes(dto.status);

    if (wasPaused && !willPause && t.pausedAt) {
      t.totalPausedMs += Date.now() - t.pausedAt.getTime();
      t.pausedAt = null;
    }
    if (willPause && !wasPaused) {
      t.pausedAt = new Date();
    }
    if (willStop) {
      // If it was paused right up to the moment it's marked
      // resolved/closed, fold that final pause in before freezing.
      if (t.pausedAt) {
        t.totalPausedMs += Date.now() - t.pausedAt.getTime();
        t.pausedAt = null;
      }
      t.slaStoppedAt = new Date();
    }

    t.status = dto.status;
    await t.save();
    return this.normalize(t.toObject());
  }

  async addNote(tenantId: string, id: string, dto: AddTicketNoteDto) {
    const t = await this.getRawDoc(tenantId, id);
    t.notes.push({
      author: dto.author,
      internal: dto.internal ?? true,
      body: dto.body,
      at: new Date(),
    } as any);
    await t.save();
    return this.normalize(t.toObject());
  }

  // Client-only, and only once the ticket is genuinely Closed —
  // matches the confirmed prototype's gate exactly (Resolved isn't
  // enough; the tenant has to formally close it first).
  async rate(
    tenantId: string,
    id: string,
    clientUserId: string,
    dto: RateTicketDto,
  ) {
    const t = await this.getRawDoc(tenantId, id);
    if (String(t.clientUserId) !== String(clientUserId)) {
      throw new BadRequestException('This ticket is not yours to rate');
    }
    if (t.status !== TicketStatus.CLOSED) {
      throw new BadRequestException('Only closed tickets can be rated');
    }
    t.rating = dto.rating;
    t.ratingComment = dto.comment ?? null;
    await t.save();
    return this.normalize(t.toObject());
  }
}
