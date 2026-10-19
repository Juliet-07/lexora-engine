import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import {
  Event,
  EventDocument,
  EventMode,
  EventStatus,
  EventAudienceType,
  EventInviteStatus,
} from '../schemas';
import {
  CreateEventDto,
  UpdateEventDto,
  InviteToEventDto,
  RegisterForEventDto,
} from '../dtos';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import {
  ClientProfileRecord,
  ClientProfileDocument,
} from 'src/modules/tenant/schemas/client-profile.schema';
import {
  Contact,
  ContactDocument,
} from 'src/modules/crm/crm/schemas/contact.schema';
import {
  BoardMember,
  BoardMemberDocument,
  BoardMemberLifecycleStatus,
} from 'src/modules/grc/governance/schemas/board-member.schema';
import { Employee, EmployeeDocument } from 'src/modules/hr/schemas';
import { EmploymentStatus } from 'src/modules/hr/schemas/employee.schema';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';
import { eventInviteTemplate } from 'src/common/utils/mailing/templates/event-invite.template';

const newToken = () => crypto.randomBytes(20).toString('hex');
const uid = (p: string) =>
  `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Which real audiences each event mode may invite — enforced here,
// not just on the frontend, since this is what keeps an External
// event's registration flow and an InHouse event's portal-
// acknowledgement flow from ever mixing on the same event.
const ALLOWED_AUDIENCES: Record<EventMode, EventAudienceType[]> = {
  [EventMode.EXTERNAL]: [EventAudienceType.CONTACT],
  [EventMode.IN_HOUSE]: [
    EventAudienceType.CLIENT,
    EventAudienceType.BOARD_MEMBER,
    EventAudienceType.EMPLOYEE,
  ],
};

type ResolvedInvitee = {
  sourceId: string;
  name: string;
  email: string;
  organisation: string;
};

@Injectable()
export class EventService {
  constructor(
    @InjectModel(Event.name)
    private readonly model: Model<EventDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(ClientProfileRecord.name)
    private readonly profileModel: Model<ClientProfileDocument>,
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    @InjectModel(BoardMember.name)
    private readonly boardMemberModel: Model<BoardMemberDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly emailService: EmailService,
  ) {}

  private displayName(u: {
    firstName?: string;
    lastName?: string;
    clientProfile?: { companyName?: string } | null;
    email: string;
  }): string {
    return (
      [u.firstName, u.lastName].filter(Boolean).join(' ') ||
      u.clientProfile?.companyName ||
      u.email
    );
  }

  // Real resolution against whichever collection the ref names — no
  // segment indirection here (unlike Campaign/Alert): an event invites
  // specific real people directly.
  private async resolveInvitee(
    tenantId: string,
    audienceType: EventAudienceType,
    sourceId: string,
  ): Promise<ResolvedInvitee | null> {
    const tId = new Types.ObjectId(tenantId);

    if (audienceType === EventAudienceType.CONTACT) {
      const c = await this.contactModel
        .findOne({ _id: sourceId, tenantId: tId })
        .lean();
      if (!c || !c.email) return null;
      return {
        sourceId,
        name: c.name,
        email: c.email,
        organisation: c.organisation ?? '',
      };
    }

    if (audienceType === EventAudienceType.BOARD_MEMBER) {
      const m = await this.boardMemberModel
        .findOne({ _id: sourceId, tenantId: tId })
        .lean();
      if (
        !m ||
        !m.email ||
        m.lifecycleStatus === BoardMemberLifecycleStatus.OFFBOARDED
      )
        return null;
      return { sourceId, name: m.name, email: m.email, organisation: '' };
    }

    if (audienceType === EventAudienceType.EMPLOYEE) {
      const e = await this.employeeModel
        .findOne({ _id: sourceId, tenantId: tId })
        .lean();
      if (!e || !e.email || e.employmentStatus !== EmploymentStatus.ACTIVE)
        return null;
      return {
        sourceId,
        name: [e.firstName, e.lastName].filter(Boolean).join(' '),
        email: e.email,
        organisation: '',
      };
    }

    // CLIENT
    const u = await this.userModel.findOne({ _id: sourceId, tenantId: tId }).lean();
    if (!u || !u.email) return null;
    const profile = (await this.profileModel
      .findOne({ userId: u._id })
      .select('companyName')
      .lean()) as { companyName?: string } | null;
    return {
      sourceId,
      name: this.displayName({ ...u, clientProfile: profile }),
      email: u.email,
      organisation: profile?.companyName ?? '',
    };
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getById(tenantId: string, id: string) {
    const e = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!e) throw new NotFoundException('Event not found');
    return e;
  }

  private applyDto(doc: EventDocument, dto: CreateEventDto | UpdateEventDto) {
    doc.title = dto.title;
    doc.type = dto.type as any;
    doc.description = dto.description ?? '';
    doc.date = new Date(dto.date);
    doc.startTime = dto.startTime ?? '';
    doc.endTime = dto.endTime ?? '';
    doc.location = dto.location ?? '';
    doc.virtual = dto.virtual ?? false;
    doc.meetingLink = dto.meetingLink ?? '';
    doc.capacity = dto.capacity ?? 0;
    doc.host = dto.host ?? '';
    doc.agenda = dto.agenda ?? '';
    doc.registrationDeadline =
      doc.mode === EventMode.EXTERNAL && dto.registrationDeadline
        ? new Date(dto.registrationDeadline)
        : null;
  }

  async create(tenantId: string, dto: CreateEventDto) {
    const created = new this.model({
      tenantId: new Types.ObjectId(tenantId),
      mode: dto.mode,
      invites: [],
    });
    this.applyDto(created, dto);
    await created.save();
    return created.toObject();
  }

  // Real content editing — allowed while Draft or Published (the
  // event's own details, like venue or agenda, can genuinely still
  // change after invitations go out); refused once Completed or
  // Cancelled. `mode` itself never changes after creation — it
  // decides which real audience and which attendance path (public
  // registration vs. portal acknowledgement) every existing invite
  // already follows.
  async update(tenantId: string, id: string, dto: UpdateEventDto) {
    const e = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!e) throw new NotFoundException('Event not found');
    if (e.status === EventStatus.COMPLETED || e.status === EventStatus.CANCELLED) {
      throw new BadRequestException(
        'This event is completed or cancelled — it can no longer be edited',
      );
    }
    this.applyDto(e, dto);
    await e.save();
    return e.toObject();
  }

  async delete(tenantId: string, id: string) {
    const res = await this.model.deleteOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!res.deletedCount) throw new NotFoundException('Event not found');
    return { deleted: true };
  }

  private buildInviteEmail(
    businessName: string,
    e: EventDocument,
    invite: { name: string; audienceType: EventAudienceType; token: string },
  ) {
    const requiresRegistration = e.mode === EventMode.EXTERNAL;
    const ctaLink = requiresRegistration
      ? `${process.env.TENANT_APP_URL}/event-register/${invite.token}`
      : invite.audienceType === EventAudienceType.CLIENT
        ? `${process.env.CLIENT_APP_URL}/events`
        : invite.audienceType === EventAudienceType.BOARD_MEMBER
          ? `${process.env.BOARD_APP_URL}/events`
          : `${process.env.TENANT_APP_URL}/my/events`;
    return eventInviteTemplate({
      businessName,
      recipientName: invite.name,
      title: e.title,
      type: e.type,
      description: e.description,
      date: e.date.toISOString(),
      startTime: e.startTime,
      endTime: e.endTime,
      location: e.location,
      virtual: e.virtual,
      meetingLink: e.virtual ? e.meetingLink : null,
      requiresRegistration,
      ctaLink,
    });
  }

  // Real, per-recipient sends via EmailService's real SMTP transport
  // — each invite's own sentAt/deliveryError reflects whether that
  // specific send actually succeeded, same partial-failure handling
  // as CampaignService.sendNow.
  private async dispatch(tenantId: string, e: EventDocument, invites: any[]) {
    if (!invites.length) return;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    for (const inv of invites) {
      try {
        const { subject, html } = this.buildInviteEmail(businessName, e, inv);
        await this.emailService.sendCampaign(inv.email, subject, html);
        inv.sentAt = new Date();
        inv.deliveryError = null;
      } catch (err: any) {
        inv.deliveryError = err?.message ?? 'Send failed';
      }
    }
  }

  // Adds real invitees, resolved live against their real collection.
  // If the event is already Published, the newly-added invitees are
  // emailed immediately — joining an already-published event still
  // reaches them. If still Draft, they're only emailed once the
  // event is actually published (see publish() below).
  async inviteMembers(tenantId: string, id: string, dto: InviteToEventDto) {
    const e = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!e) throw new NotFoundException('Event not found');
    if (e.status === EventStatus.COMPLETED || e.status === EventStatus.CANCELLED) {
      throw new BadRequestException(
        'This event is completed or cancelled — no further invitations can go out',
      );
    }

    const allowed = ALLOWED_AUDIENCES[e.mode];
    const existingKeys = new Set(
      e.invites.map((i) => `${i.audienceType}:${String(i.sourceId)}`),
    );

    const fresh: any[] = [];
    for (const ref of dto.invitees) {
      if (!allowed.includes(ref.audienceType)) {
        throw new BadRequestException(
          e.mode === EventMode.EXTERNAL
            ? 'An external event can only invite CRM contacts'
            : 'An in-house event can only invite clients, board members or employees',
        );
      }
      const key = `${ref.audienceType}:${ref.sourceId}`;
      if (existingKeys.has(key)) continue;
      const resolved = await this.resolveInvitee(
        tenantId,
        ref.audienceType,
        ref.sourceId,
      );
      if (!resolved) continue;
      existingKeys.add(key);
      fresh.push({
        id: uid('inv'),
        audienceType: ref.audienceType,
        sourceId: new Types.ObjectId(resolved.sourceId),
        name: resolved.name,
        email: resolved.email,
        organisation: resolved.organisation,
        status: EventInviteStatus.INVITED,
        token: newToken(),
        sentAt: null,
        deliveryError: null,
        respondedAt: null,
        phone: '',
        notes: '',
      });
    }

    if (!fresh.length) {
      throw new BadRequestException(
        'Nothing to invite — everyone selected is already invited, or none could be resolved',
      );
    }

    e.invites.push(...fresh);
    if (e.status === EventStatus.PUBLISHED) {
      await this.dispatch(tenantId, e, fresh);
    }
    await e.save();
    return e.toObject();
  }

  async removeInvite(tenantId: string, id: string, inviteId: string) {
    const e = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!e) throw new NotFoundException('Event not found');
    const invite = e.invites.find((i) => i.id === inviteId);
    if (!invite) throw new NotFoundException('Invite not found');
    if (
      invite.status === EventInviteStatus.REGISTERED ||
      invite.status === EventInviteStatus.ACKNOWLEDGED
    ) {
      throw new BadRequestException(
        'This invitee has already responded — removing them now would silently erase a real attendance record',
      );
    }
    e.invites = e.invites.filter((i) => i.id !== inviteId) as any;
    await e.save();
    return e.toObject();
  }

  // Publishing is the real trigger: every invite that hasn't been
  // emailed yet (sentAt == null) is actually sent now, carrying the
  // registration link (External) or a portal link (InHouse).
  async publish(tenantId: string, id: string) {
    const e = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!e) throw new NotFoundException('Event not found');
    if (e.status !== EventStatus.DRAFT) {
      throw new BadRequestException('Only a draft event can be published');
    }
    e.status = EventStatus.PUBLISHED;
    e.publishedAt = new Date();
    const unsent = e.invites.filter((i) => !i.sentAt);
    await this.dispatch(tenantId, e, unsent);
    await e.save();
    return e.toObject();
  }

  async cancel(tenantId: string, id: string) {
    const e = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!e) throw new NotFoundException('Event not found');
    if (e.status === EventStatus.COMPLETED) {
      throw new BadRequestException('A completed event cannot be cancelled');
    }
    e.status = EventStatus.CANCELLED;
    await e.save();
    return e.toObject();
  }

  async complete(tenantId: string, id: string) {
    const e = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!e) throw new NotFoundException('Event not found');
    if (e.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException('Only a published event can be marked completed');
    }
    e.status = EventStatus.COMPLETED;
    await e.save();
    return e.toObject();
  }

  // ── Public, token-gated registration — the one real path an
  // External invite's personal link leads to. No tenantId scoping:
  // the token itself (20 random bytes) is the real identity, same
  // reasoning as the Contract module's public signing tokens. ──────

  private async findByToken(token: string) {
    const e = await this.model.findOne({ 'invites.token': token });
    if (!e) return null;
    const invite = e.invites.find((i) => i.token === token);
    if (!invite) return null;
    return { event: e, invite };
  }

  // Read-only, sanitized — only this invite's own status, never the
  // rest of the guest list.
  async getPublicEventByToken(token: string) {
    const found = await this.findByToken(token);
    if (!found) throw new NotFoundException('This link is not valid');
    const { event: e, invite } = found;
    const activeRegistered = e.invites.filter(
      (i) => i.status === EventInviteStatus.REGISTERED,
    ).length;
    return {
      title: e.title,
      type: e.type,
      description: e.description,
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
      location: e.location,
      virtual: e.virtual,
      meetingLink: e.meetingLink,
      agenda: e.agenda,
      host: e.host,
      capacity: e.capacity,
      registrationDeadline: e.registrationDeadline,
      status: e.status,
      registeredCount: activeRegistered,
      invite: {
        name: invite.name,
        email: invite.email,
        organisation: invite.organisation,
        status: invite.status,
      },
    };
  }

  async registerForEvent(token: string, dto: RegisterForEventDto) {
    const found = await this.findByToken(token);
    if (!found) throw new NotFoundException('This link is not valid');
    const { event: e, invite } = found;

    if (e.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException('Registration is not open for this event');
    }
    if (
      e.registrationDeadline &&
      e.registrationDeadline.getTime() < Date.now()
    ) {
      throw new BadRequestException('The registration deadline has passed');
    }
    if (invite.status === EventInviteStatus.REGISTERED) {
      throw new BadRequestException('This invitation has already been used to register');
    }
    if (invite.status === EventInviteStatus.DECLINED) {
      throw new BadRequestException('This invitation was declined');
    }
    if (e.capacity > 0) {
      const registered = e.invites.filter(
        (i) => i.status === EventInviteStatus.REGISTERED,
      ).length;
      if (registered >= e.capacity) {
        throw new BadRequestException('This event has reached full capacity');
      }
    }

    // A submitted registration IS the attendance signal — see the
    // class docstring and EventInviteStatus.REGISTERED.
    invite.name = dto.name.trim() || invite.name;
    invite.email = dto.email.trim().toLowerCase() || invite.email;
    invite.organisation = dto.organisation?.trim() ?? invite.organisation;
    invite.phone = dto.phone?.trim() ?? '';
    invite.notes = dto.notes?.trim() ?? '';
    invite.status = EventInviteStatus.REGISTERED;
    invite.respondedAt = new Date();
    await e.save();
    return { ok: true };
  }

  // ── InHouse portal acknowledgement — one real attendance path per
  // audience, scoped so each portal can only ever acknowledge its
  // own real invite, never another invitee's. ──────────────────────

  private async acknowledge(
    tenantId: string,
    audienceType: EventAudienceType,
    sourceId: string,
    eventId: string,
  ) {
    const e = await this.model.findOne({
      _id: eventId,
      tenantId: new Types.ObjectId(tenantId),
      mode: EventMode.IN_HOUSE,
      status: EventStatus.PUBLISHED,
    });
    if (!e) throw new NotFoundException('Event not found');
    const invite = e.invites.find(
      (i) => i.audienceType === audienceType && String(i.sourceId) === sourceId,
    );
    if (!invite) {
      throw new ForbiddenException('You were not invited to this event');
    }
    if (invite.status !== EventInviteStatus.ACKNOWLEDGED) {
      invite.status = EventInviteStatus.ACKNOWLEDGED;
      invite.respondedAt = new Date();
      await e.save();
    }
    return { acknowledged: true };
  }

  private sanitizeForPortal(e: any, audienceType: EventAudienceType, sourceId: string) {
    const mine = (e.invites as any[]).find(
      (i) => i.audienceType === audienceType && String(i.sourceId) === sourceId,
    );
    return {
      _id: e._id,
      title: e.title,
      type: e.type,
      description: e.description,
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
      location: e.location,
      virtual: e.virtual,
      meetingLink: e.meetingLink,
      agenda: e.agenda,
      host: e.host,
      status: e.status,
      myStatus: mine?.status ?? null,
    };
  }

  private async getPortalEvents(
    tenantId: string,
    audienceType: EventAudienceType,
    sourceId: string,
  ) {
    const events = await this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        mode: EventMode.IN_HOUSE,
        status: { $in: [EventStatus.PUBLISHED, EventStatus.COMPLETED] },
        invites: {
          $elemMatch: { audienceType, sourceId: new Types.ObjectId(sourceId) },
        },
      })
      .sort({ date: -1 })
      .lean();
    return events.map((e) => this.sanitizeForPortal(e, audienceType, sourceId));
  }

  // Client portal
  async getMyClientEvents(tenantId: string, clientUserId: string) {
    return this.getPortalEvents(tenantId, EventAudienceType.CLIENT, clientUserId);
  }
  async acknowledgeAsClient(tenantId: string, clientUserId: string, eventId: string) {
    return this.acknowledge(tenantId, EventAudienceType.CLIENT, clientUserId, eventId);
  }

  // Board portal — sourceId is the real BoardMember._id, resolved by
  // the controller the same way BoardPortalNewsletterController does.
  async getMyBoardEvents(tenantId: string, boardMemberId: string) {
    return this.getPortalEvents(tenantId, EventAudienceType.BOARD_MEMBER, boardMemberId);
  }
  async acknowledgeAsBoardMember(tenantId: string, boardMemberId: string, eventId: string) {
    return this.acknowledge(
      tenantId,
      EventAudienceType.BOARD_MEMBER,
      boardMemberId,
      eventId,
    );
  }

  // Employee self-service — sourceId is the real Employee._id,
  // resolved by the controller from the caller's own userId.
  async getMyEmployeeEvents(tenantId: string, employeeId: string) {
    return this.getPortalEvents(tenantId, EventAudienceType.EMPLOYEE, employeeId);
  }
  async acknowledgeAsEmployee(tenantId: string, employeeId: string, eventId: string) {
    return this.acknowledge(
      tenantId,
      EventAudienceType.EMPLOYEE,
      employeeId,
      eventId,
    );
  }

  async resolveBoardMemberId(userId: string) {
    const member = await this.boardMemberModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .select('_id tenantId')
      .lean();
    if (!member) {
      throw new NotFoundException('No board member record for this account');
    }
    return member;
  }

  async resolveEmployeeId(tenantId: string, userId: string) {
    const employee = await this.employeeModel
      .findOne({ tenantId: new Types.ObjectId(tenantId), userId: new Types.ObjectId(userId) })
      .select('_id')
      .lean();
    if (!employee) {
      throw new NotFoundException('No employee record is linked to this account');
    }
    return employee;
  }
}
