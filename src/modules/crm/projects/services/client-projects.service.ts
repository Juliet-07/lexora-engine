import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  KbAudience,
  KbStatus,
  Mandate,
  MandateDocument_,
  MessageDirection,
} from '../schemas';
import { MandateWorkspaceService } from './mandate-workspace.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AddTicketNoteDto,
  CreateMessageDto,
  CreateTicketDto,
  RateTicketDto,
  VoteKbArticleDto,
} from '../dtos';
import { KbArticleService } from './kb-article.service';
import { TicketService } from './ticket.service';

// Simpler than the employee case: Mandate.clientUserId already IS
// the client's own real User id directly (that's exactly what
// ClientSelect captures at mandate creation) — no Employee-style
// indirection to resolve first.
@Injectable()
export class ClientProjectsService {
  constructor(
    @InjectModel(Mandate.name)
    private readonly mandateModel: Model<MandateDocument_>,
    private readonly workspaceService: MandateWorkspaceService,
  ) {}

  private normalizeMandate(m: any) {
    return {
      ...m,
      description: m.description ?? '',
      milestones: m.milestones ?? [],
    };
  }

  async getMyProjects(tenantId: string, clientUserId: string) {
    const rows = await this.mandateModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        clientUserId: new Types.ObjectId(clientUserId),
      })
      .sort({ createdAt: -1 })
      .lean();
    return rows.map((m) => this.normalizeMandate(m));
  }

  // The authorization check here is simply "is this mandate's client
  // genuinely you" — matched directly, no team/task ambiguity like
  // the employee side has.
  private async getAuthorizedMandate(
    tenantId: string,
    clientUserId: string,
    mandateId: string,
  ) {
    const mandate = await this.mandateModel
      .findOne({
        _id: mandateId,
        tenantId: new Types.ObjectId(tenantId),
        clientUserId: new Types.ObjectId(clientUserId),
      })
      .lean();
    if (!mandate) throw new NotFoundException('Project not found');
    return mandate;
  }

  async getProjectDetail(
    tenantId: string,
    clientUserId: string,
    mandateId: string,
  ) {
    const mandate = await this.getAuthorizedMandate(
      tenantId,
      clientUserId,
      mandateId,
    );
    return this.normalizeMandate(mandate);
  }

  // Reuses the exact same thread the tenant's Communications tab
  // reads — this is the other end of that same conversation, not a
  // separate one.
  async getMessages(tenantId: string, clientUserId: string, mandateId: string) {
    await this.getAuthorizedMandate(tenantId, clientUserId, mandateId);
    return this.workspaceService.getMessages(tenantId, mandateId);
  }

  async sendMessage(
    tenantId: string,
    clientUserId: string,
    mandateId: string,
    dto: CreateMessageDto,
  ) {
    await this.getAuthorizedMandate(tenantId, clientUserId, mandateId);
    return this.workspaceService.addMessage(
      tenantId,
      mandateId,
      MessageDirection.CLIENT,
      dto,
    );
  }

  // Same documents the tenant sees — a client-uploaded file is
  // exactly what shows up in the tenant's "received from client"
  // inbox, not a separate store.
  async getDocuments(
    tenantId: string,
    clientUserId: string,
    mandateId: string,
  ) {
    await this.getAuthorizedMandate(tenantId, clientUserId, mandateId);
    return this.workspaceService.getDocuments(tenantId, mandateId);
  }

  async uploadDocument(
    tenantId: string,
    clientUserId: string,
    mandateId: string,
    folder: string,
    uploadedBy: string,
    file: Express.Multer.File,
  ) {
    await this.getAuthorizedMandate(tenantId, clientUserId, mandateId);
    return this.workspaceService.uploadDocument(
      tenantId,
      mandateId,
      folder,
      uploadedBy,
      file,
      true,
    );
  }
}

@Injectable()
export class ClientTicketsService {
  constructor(
    private readonly ticketService: TicketService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Internal notes are staff-only by definition — stripped here,
  // server-side, on every single path that returns a ticket to a
  // client, never left to the frontend to hide. A client must never
  // receive an internal note in a response body at all, whether
  // that's the list, one ticket, or the result of posting a reply.
  private stripInternalNotes(ticket: any) {
    return { ...ticket, notes: ticket.notes.filter((n: any) => !n.internal) };
  }

  // The only real ticket-creation path in the whole system.
  async raiseTicket(
    tenantId: string,
    clientUserId: string,
    clientName: string,
    dto: CreateTicketDto,
  ) {
    const ticket = await this.ticketService.create(
      tenantId,
      clientUserId,
      clientName,
      dto,
    );
    return this.stripInternalNotes(ticket);
  }

  async getMyTickets(tenantId: string, clientUserId: string) {
    const tickets = await this.ticketService.getAll(tenantId, { clientUserId });
    return tickets.map((t) => this.stripInternalNotes(t));
  }

  private async getOwnedTicket(
    tenantId: string,
    clientUserId: string,
    ticketId: string,
  ) {
    const ticket = await this.ticketService.getById(tenantId, ticketId);
    if (String(ticket.clientUserId) !== String(clientUserId)) {
      throw new BadRequestException('This ticket is not yours');
    }
    return ticket;
  }

  async getMyTicket(tenantId: string, clientUserId: string, ticketId: string) {
    const ticket = await this.getOwnedTicket(tenantId, clientUserId, ticketId);
    return this.stripInternalNotes(ticket);
  }

  // Always non-internal, always from the client — there's no
  // internal/external choice on this side, unlike the tenant/agent note.
  async reply(
    tenantId: string,
    clientUserId: string,
    ticketId: string,
    clientName: string,
    body: string,
  ) {
    await this.getOwnedTicket(tenantId, clientUserId, ticketId);
    const dto: AddTicketNoteDto = { author: clientName, body, internal: false };
    const ticket = await this.ticketService.addNote(tenantId, ticketId, dto);
    this.eventEmitter.emit('tenant.ticket.client_replied', {
      tenantId,
      clientUserId,
      clientName,
      ticketId,
      ref: (ticket as any).ref,
      subject: (ticket as any).subject,
    });
    return this.stripInternalNotes(ticket);
  }

  async rate(
    tenantId: string,
    clientUserId: string,
    ticketId: string,
    dto: RateTicketDto,
  ) {
    const ticket = await this.ticketService.rate(
      tenantId,
      ticketId,
      clientUserId,
      dto,
    );
    return this.stripInternalNotes(ticket);
  }
}

@Injectable()
export class ClientKbService {
  constructor(private readonly kbService: KbArticleService) {}

  async getArticles(tenantId: string) {
    return this.kbService.getAll(tenantId, {
      audience: KbAudience.CLIENT_FACING,
      status: KbStatus.PUBLISHED,
    });
  }

  async recordView(tenantId: string, id: string) {
    return this.kbService.recordView(tenantId, id);
  }

  async vote(tenantId: string, id: string, dto: VoteKbArticleDto) {
    return this.kbService.vote(tenantId, id, dto);
  }
}
