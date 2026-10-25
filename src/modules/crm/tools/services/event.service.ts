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
  CalendarLayer,
} from '../schemas';
import {
  CreateEventDto,
  UpdateEventDto,
  InviteToEventDto,
  RegisterForEventDto,
  SetOpenRegistrationDto,
  UpdateEventAutomationDto,
  MarkAttendanceDto,
  RecordEventOutcomeDto,
  CancelEventDto,
  SubmitEventFeedbackDto,
} from '../dtos';
import {
  DEFAULT_AUTOMATION,
  DEFAULT_TIMEZONE,
  attendanceOf,
  buildPipeline,
  buildSteps,
  computeStats,
  eventBadge,
  eventInstants,
  googleCalendarUrl,
  hasResponded,
  isValidTimeZone,
  parseAgenda,
  phaseOf,
  resolveAutomation,
  scheduleFor,
} from './event-lifecycle.util';
import {
  eventCancelledTemplate,
  eventRegistrationConfirmationTemplate,
} from 'src/common/utils/mailing/templates/event-lifecycle.template';
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
import type { FooterExtras } from 'src/common/utils/mailing/templates/footer-extras';
import { EmailFooterService } from './email-footer.service';

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
    private readonly footerService: EmailFooterService,
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
    const u = await this.userModel
      .findOne({ _id: sourceId, tenantId: tId })
      .lean();
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

  // ── Lifecycle presentation ─────────────────────────────────────
  // Every event the tenant sees carries a computed `lifecycle`: which
  // phase it's in, the real attendance numbers, the automation
  // schedule with what has/hasn't gone out, and the six-stage
  // pipeline. Computed from the stored record every time, never
  // stored, so it can't drift from the guest list.
  private present(raw: any) {
    const o = typeof raw.toObject === 'function' ? raw.toObject() : raw;
    const { startsAt, endsAt } = eventInstants(o);
    const phase = phaseOf(o, startsAt, endsAt);
    const stats = computeStats({ ...o, outcome: o.outcome ?? {} });
    const steps = buildSteps(o, startsAt, endsAt, o.completedAt);
    const schedule = scheduleFor(steps, o.automationLog, o.status);
    const attendanceRecorded = !!o.outcome?.attendanceRecordedAt;
    const resultsRecorded = !!o.outcome?.recordedAt;
    return {
      ...o,
      timezone: o.timezone || DEFAULT_TIMEZONE,
      openRegistration: {
        enabled:
          o.mode === EventMode.EXTERNAL &&
          !!o.openRegistration &&
          !!o.openToken,
        token: o.mode === EventMode.EXTERNAL ? (o.openToken ?? null) : null,
      },
      automation: resolveAutomation(o.automation),
      outcome: o.outcome ?? {},
      activity: [...(o.activity ?? [])].sort(
        (a: any, b: any) => +new Date(b.at) - +new Date(a.at),
      ),
      lifecycle: {
        phase,
        startsAt,
        endsAt,
        stats,
        schedule,
        attendanceRecorded,
        resultsRecorded,
        pipeline: buildPipeline({
          status: o.status,
          mode: o.mode,
          phase,
          stats,
          schedule,
          attendanceRecorded,
          resultsRecorded,
        }),
      },
    };
  }

  // The running record of everything that happens to the event.
  private log(e: EventDocument, kind: string, message: string) {
    e.activity.push({ at: new Date(), kind, message } as any);
    if (e.activity.length > 500) {
      e.activity.splice(0, e.activity.length - 500);
    }
  }

  private async getDoc(tenantId: string, id: string) {
    const e = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!e) throw new NotFoundException('Event not found');
    return e;
  }

  async getAll(tenantId: string) {
    const events = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
    return events.map((e) => this.present(e));
  }

  async getById(tenantId: string, id: string) {
    const e = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!e) throw new NotFoundException('Event not found');
    return this.present(e);
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
    doc.inviteMessage = (dto.inviteMessage ?? '').trim();
    doc.inviteCtaLabel = (dto.inviteCtaLabel ?? '').trim();
    const img = (dto.inviteImageUrl ?? '').trim();
    if (img && !/^https?:\/\/\S+$/i.test(img)) {
      throw new BadRequestException(
        'The invitation image must be a web address starting with http:// or https://',
      );
    }
    doc.inviteImageUrl = img;
    if (dto.timezone) {
      if (!isValidTimeZone(dto.timezone)) {
        throw new BadRequestException('Unknown time zone');
      }
      doc.timezone = dto.timezone;
    }
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
      // Automation is on by default for every new event — reminders
      // and follow-ups are part of running an event properly, and the
      // organiser can switch any of them off from the Automation tab.
      automation: { ...DEFAULT_AUTOMATION },
      // External events get a shareable registration link from the
      // start (the tenant can switch it off or rotate it).
      ...(dto.mode === EventMode.EXTERNAL
        ? { openToken: newToken(), openRegistration: true }
        : {}),
    });
    this.applyDto(created, dto);
    this.log(
      created,
      'created',
      `Event created as a ${created.mode === EventMode.EXTERNAL ? 'external' : 'in-house'} ${created.type.toLowerCase()} — added to your calendar`,
    );
    await created.save();
    return this.present(created);
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
    if (
      e.status === EventStatus.COMPLETED ||
      e.status === EventStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'This event is completed or cancelled — it can no longer be edited',
      );
    }
    this.applyDto(e, dto);
    this.log(e, 'updated', 'Event details updated');
    await e.save();
    return this.present(e);
  }

  async delete(tenantId: string, id: string) {
    const res = await this.model.deleteOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!res.deletedCount) throw new NotFoundException('Event not found');
    return { deleted: true };
  }

  // The invitation, drawn with the Event Invite design from the event
  // itself. An invite to a CRM contact also carries that person's own
  // unsubscribe link (contacts are the people an external event
  // reaches by email on the tenant's say-so); clients, board members
  // and employees are invited as part of the relationship, so they
  // get the social links but no unsubscribe line.
  private buildInviteEmail(
    businessName: string,
    e: EventDocument,
    invite: {
      name: string;
      email?: string;
      audienceType: EventAudienceType;
      token: string;
    },
    footer?: FooterExtras,
    preview = false,
  ) {
    const requiresRegistration = e.mode === EventMode.EXTERNAL;
    const ctaLink = this.ctaLinkFor(e, invite);
    const unsubscribeUrl =
      invite.audienceType === EventAudienceType.CONTACT
        ? preview || !invite.email
          ? this.footerService.previewUrl()
          : this.footerService.urlFor(String(e.tenantId), invite.email)
        : null;
    return eventInviteTemplate({
      ...this.emailBase(e, businessName, { ...footer, unsubscribeUrl }),
      recipientName: invite.name,
      description: e.description,
      message: e.inviteMessage,
      ctaLabel: e.inviteCtaLabel,
      virtual: e.virtual,
      requiresRegistration,
      registrationDeadlineLabel:
        requiresRegistration && e.registrationDeadline
          ? this.fmtDay(e.registrationDeadline)
          : undefined,
      ctaLink,
    });
  }

  // What the organiser sees under "Invitation email" — the exact
  // email, rendered for a sample guest, nothing sent.
  async previewInvitation(tenantId: string, id: string) {
    const e = await this.getDoc(tenantId, id);
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    const footer = await this.footerService.footerContext(tenantId);
    const audienceType =
      e.mode === EventMode.EXTERNAL
        ? EventAudienceType.CONTACT
        : EventAudienceType.CLIENT;
    const { subject, html } = this.buildInviteEmail(
      businessName,
      e,
      { name: 'Alex Example', audienceType, token: 'preview' },
      footer,
      true,
    );
    return { subject, html };
  }

  // Footer pieces (social links + address) for the emails that follow
  // the invitation. Transactional, so no unsubscribe line.
  async footerFor(tenantId: string): Promise<FooterExtras> {
    return this.footerService.footerContext(tenantId);
  }

  // Real, per-recipient sends via EmailService's real SMTP transport
  // — each invite's own sentAt/deliveryError reflects whether that
  // specific send actually succeeded, same partial-failure handling
  // as CampaignService.sendNow. A CRM contact who has unsubscribed
  // is not emailed (their row says why) and doesn't count as a
  // failure.
  private async dispatch(tenantId: string, e: EventDocument, invites: any[]) {
    if (!invites.length) return { skippedUnsubscribed: 0 };
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    const footer = await this.footerService.footerContext(tenantId);
    const suppressed = await this.footerService.suppressedSet(
      tenantId,
      invites
        .filter((i) => i.audienceType === EventAudienceType.CONTACT)
        .map((i) => i.email),
    );
    let skippedUnsubscribed = 0;
    for (const inv of invites) {
      if (
        inv.audienceType === EventAudienceType.CONTACT &&
        suppressed.has(String(inv.email).toLowerCase())
      ) {
        inv.deliveryError = 'Unsubscribed — not emailed';
        skippedUnsubscribed++;
        continue;
      }
      try {
        const { subject, html } = this.buildInviteEmail(
          businessName,
          e,
          inv,
          footer,
        );
        await this.emailService.sendCampaign(inv.email, subject, html);
        inv.sentAt = new Date();
        inv.deliveryError = null;
      } catch (err: any) {
        inv.deliveryError = err?.message ?? 'Send failed';
      }
    }
    return { skippedUnsubscribed };
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
    if (
      e.status === EventStatus.COMPLETED ||
      e.status === EventStatus.CANCELLED
    ) {
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
    let skipped = 0;
    if (e.status === EventStatus.PUBLISHED) {
      skipped = (await this.dispatch(tenantId, e, fresh)).skippedUnsubscribed;
    }
    this.log(
      e,
      'invited',
      e.status === EventStatus.PUBLISHED
        ? `${fresh.length} ${fresh.length === 1 ? 'person' : 'people'} invited and emailed${skipped ? ` (${skipped} not emailed — unsubscribed)` : ''}`
        : `${fresh.length} ${fresh.length === 1 ? 'person' : 'people'} added to the guest list (emailed on publish)`,
    );
    await e.save();
    return this.present(e);
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
    this.log(e, 'invite_removed', `${invite.name} removed from the guest list`);
    await e.save();
    return this.present(e);
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
    // A draft from before automation existed gets the standard setup
    // now, as a new event would.
    if (!e.automation) e.automation = { ...DEFAULT_AUTOMATION } as any;
    const unsent = e.invites.filter((i) => !i.sentAt);
    const { skippedUnsubscribed } = await this.dispatch(tenantId, e, unsent);
    const failed = unsent.filter((i) => !i.sentAt).length - skippedUnsubscribed;
    this.log(
      e,
      'published',
      `Published — ${unsent.length - failed - skippedUnsubscribed} of ${unsent.length} invitations sent${failed ? `, ${failed} failed` : ''}${skippedUnsubscribed ? `, ${skippedUnsubscribed} skipped (unsubscribed)` : ''}`,
    );
    await e.save();
    return this.present(e);
  }

  async cancel(tenantId: string, id: string, dto: CancelEventDto = {}) {
    const e = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!e) throw new NotFoundException('Event not found');
    if (e.status === EventStatus.COMPLETED) {
      throw new BadRequestException('A completed event cannot be cancelled');
    }
    if (e.status === EventStatus.CANCELLED) {
      throw new BadRequestException('This event is already cancelled');
    }
    const wasPublished = e.status === EventStatus.PUBLISHED;
    e.status = EventStatus.CANCELLED;

    // Everyone who already received the invitation is told — a
    // silently cancelled event leaves invitees turning up.
    let told = 0;
    let failed = 0;
    if (wasPublished && dto.notifyInvitees !== false) {
      const businessName = await resolveBusinessName(this.userModel, tenantId);
      const base = this.emailBase(
        e,
        businessName,
        await this.footerService.footerContext(tenantId),
      );
      for (const inv of e.invites.filter(
        (i) => !!i.sentAt || hasResponded(i.status),
      )) {
        try {
          const { subject, html } = eventCancelledTemplate({
            ...base,
            recipientName: inv.name,
            reason: dto.reason?.trim() || undefined,
          });
          await this.emailService.sendCampaign(inv.email, subject, html);
          told++;
        } catch {
          failed++;
        }
      }
    }
    this.log(
      e,
      'cancelled',
      `Event cancelled${told ? ` — ${told} invitee${told === 1 ? '' : 's'} notified` : ''}${failed ? `, ${failed} notice(s) failed` : ''}${dto.reason?.trim() ? `. Reason: ${dto.reason.trim()}` : ''}`,
    );
    await e.save();
    return this.present(e);
  }

  async complete(tenantId: string, id: string) {
    const e = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!e) throw new NotFoundException('Event not found');
    if (e.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException(
        'Only a published event can be marked completed',
      );
    }
    e.status = EventStatus.COMPLETED;
    e.completedAt = new Date();
    this.log(e, 'completed', 'Event marked completed');
    await e.save();
    return this.present(e);
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

  // ── Open registration link (External events) ──────────────────
  // One shareable public link per event, for people who aren't in the
  // tenant's CRM contacts. Whoever registers through it is added to
  // the invitee list (source 'OpenLink') and — so the post-event CRM
  // sync, reminders and follow-ups treat them like any other
  // attendee — to the tenant's contacts (matched by email first, so
  // nobody is duplicated).

  private static readonly MAX_OPEN_REGISTRATIONS = 3000;

  // Returns the link details, generating the token the first time
  // (events created before this feature have none).
  async getOpenLink(tenantId: string, id: string) {
    const e = await this.getDoc(tenantId, id);
    if (e.mode !== EventMode.EXTERNAL) {
      throw new BadRequestException(
        'Only external events have a public registration link — in-house guests acknowledge from their own portal',
      );
    }
    if (!e.openToken) {
      e.openToken = newToken();
      e.openRegistration = true;
      this.log(e, 'updated', 'Public registration link created');
      await e.save();
    }
    return this.present(e);
  }

  async setOpenRegistration(
    tenantId: string,
    id: string,
    dto: SetOpenRegistrationDto,
  ) {
    const e = await this.getDoc(tenantId, id);
    if (e.mode !== EventMode.EXTERNAL) {
      throw new BadRequestException(
        'Only external events have a public registration link',
      );
    }
    if (
      e.status === EventStatus.COMPLETED ||
      e.status === EventStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'This event is completed or cancelled — registration is closed',
      );
    }
    if (!e.openToken || dto.regenerate) {
      e.openToken = newToken();
      this.log(
        e,
        'updated',
        dto.regenerate
          ? 'Public registration link replaced — the previous link no longer works'
          : 'Public registration link created',
      );
      if (dto.enabled === undefined) e.openRegistration = true;
    }
    if (dto.enabled !== undefined && dto.enabled !== e.openRegistration) {
      e.openRegistration = dto.enabled;
      this.log(
        e,
        'updated',
        dto.enabled
          ? 'Public registration link switched on'
          : 'Public registration link switched off',
      );
    }
    await e.save();
    return this.present(e);
  }

  private async findByOpenToken(token: string) {
    if (!token) return null;
    const e = await this.model.findOne({ openToken: token });
    if (!e || e.mode !== EventMode.EXTERNAL || !e.openRegistration) return null;
    return e;
  }

  // Same sanitized shape as the personal-link page, with a blank
  // invite — nothing about anyone else on the list is exposed.
  async getPublicEventByOpenToken(token: string) {
    const e = await this.findByOpenToken(token);
    if (!e) throw new NotFoundException('This link is not valid');
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
      registeredCount: e.invites.filter(
        (i) => i.status === EventInviteStatus.REGISTERED,
      ).length,
      invite: { name: '', email: '', organisation: '', status: 'Invited' },
    };
  }

  async registerViaOpenLink(token: string, dto: RegisterForEventDto) {
    const e = await this.findByOpenToken(token);
    if (!e) throw new NotFoundException('This link is not valid');
    if (e.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException('Registration is not open for this event');
    }
    if (
      e.registrationDeadline &&
      e.registrationDeadline.getTime() < Date.now()
    ) {
      throw new BadRequestException('The registration deadline has passed');
    }
    const name = dto.name.trim();
    const email = dto.email.trim().toLowerCase();
    if (!name) throw new BadRequestException('Please provide your name');

    const registeredCount = e.invites.filter(
      (i) => i.status === EventInviteStatus.REGISTERED,
    ).length;

    // Already on the list under this email? Then this is the same
    // person — complete that entry instead of adding a second one.
    const existing = e.invites.find((i) => i.email === email);
    if (existing?.status === EventInviteStatus.REGISTERED) {
      throw new BadRequestException(
        'This email address is already registered for the event',
      );
    }
    if (e.capacity > 0 && registeredCount >= e.capacity) {
      throw new BadRequestException('This event has reached full capacity');
    }
    if (
      !existing &&
      e.invites.filter((i) => i.source === 'OpenLink').length >=
        EventService.MAX_OPEN_REGISTRATIONS
    ) {
      throw new BadRequestException('Registration for this event is closed');
    }

    const now = new Date();
    let invite = existing;
    if (invite) {
      invite.name = name;
      invite.organisation = dto.organisation?.trim() || invite.organisation;
      invite.phone = dto.phone?.trim() ?? '';
      invite.notes = dto.notes?.trim() ?? '';
      invite.status = EventInviteStatus.REGISTERED;
      invite.respondedAt = now;
    } else {
      const contactId = await this.contactForRegistrant(e, {
        name,
        email,
        organisation: dto.organisation?.trim() ?? '',
        phone: dto.phone?.trim() ?? '',
      });
      e.invites.push({
        id: newToken().slice(0, 24),
        audienceType: EventAudienceType.CONTACT,
        sourceId: contactId,
        name,
        email,
        organisation: dto.organisation?.trim() ?? '',
        status: EventInviteStatus.REGISTERED,
        token: newToken(),
        // They signed up themselves, so the "invitation" is the
        // registration itself — stamped now so the invitation counts
        // and cancellation notices include them.
        sentAt: now,
        deliveryError: null,
        respondedAt: now,
        phone: dto.phone?.trim() ?? '',
        notes: dto.notes?.trim() ?? '',
        source: 'OpenLink',
      } as any);
      invite = e.invites[e.invites.length - 1];
    }
    this.log(e, 'registered', `${name} registered through the public link`);
    await e.save();

    // Confirmation email — best effort; the registration stands even
    // if the mail server is down.
    try {
      const businessName = await resolveBusinessName(
        this.userModel,
        String(e.tenantId),
      );
      const { subject, html } = eventRegistrationConfirmationTemplate({
        ...this.emailBase(
          e,
          businessName,
          await this.footerService.footerContext(String(e.tenantId)),
          { meetingLinkInCalendar: true },
        ),
        recipientName: name,
        meetingLink: e.virtual ? e.meetingLink || null : null,
      });
      await this.emailService.sendCampaign(email, subject, html);
    } catch {
      /* logged nowhere on purpose: the page already told them they're in */
    }
    return { ok: true };
  }

  // The CRM contact behind an open-link registrant: an existing one
  // with the same email, otherwise a new one sourced "Event".
  private async contactForRegistrant(
    e: EventDocument,
    p: { name: string; email: string; organisation: string; phone: string },
  ): Promise<Types.ObjectId> {
    const escaped = p.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const found = await this.contactModel
      .findOne({
        tenantId: e.tenantId,
        email: { $regex: `^${escaped}$`, $options: 'i' },
      })
      .select('_id')
      .lean();
    if (found) return (found as any)._id;
    const created = await this.contactModel.create({
      tenantId: e.tenantId,
      name: p.name,
      organisation: p.organisation,
      email: p.email,
      phone: p.phone,
      source: 'Event',
      tags: [],
      notes: `Registered for "${e.title}" through the public registration link.`,
    } as any);
    return created._id as Types.ObjectId;
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
      throw new BadRequestException(
        'This invitation has already been used to register',
      );
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
    this.log(e, 'registered', `${invite.name} registered`);
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
      this.log(e, 'acknowledged', `${invite.name} confirmed attendance`);
      await e.save();
    }
    return { acknowledged: true };
  }

  private sanitizeForPortal(
    e: any,
    audienceType: EventAudienceType,
    sourceId: string,
  ) {
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
    return this.getPortalEvents(
      tenantId,
      EventAudienceType.CLIENT,
      clientUserId,
    );
  }
  async acknowledgeAsClient(
    tenantId: string,
    clientUserId: string,
    eventId: string,
  ) {
    return this.acknowledge(
      tenantId,
      EventAudienceType.CLIENT,
      clientUserId,
      eventId,
    );
  }

  // Board portal — sourceId is the real BoardMember._id, resolved by
  // the controller the same way BoardPortalNewsletterController does.
  async getMyBoardEvents(tenantId: string, boardMemberId: string) {
    return this.getPortalEvents(
      tenantId,
      EventAudienceType.BOARD_MEMBER,
      boardMemberId,
    );
  }
  async acknowledgeAsBoardMember(
    tenantId: string,
    boardMemberId: string,
    eventId: string,
  ) {
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
    return this.getPortalEvents(
      tenantId,
      EventAudienceType.EMPLOYEE,
      employeeId,
    );
  }
  async acknowledgeAsEmployee(
    tenantId: string,
    employeeId: string,
    eventId: string,
  ) {
    return this.acknowledge(
      tenantId,
      EventAudienceType.EMPLOYEE,
      employeeId,
      eventId,
    );
  }

  // ── Lifecycle: shared email context ───────────────────────────

  private fmtWhen(e: {
    date: Date;
    startTime?: string;
    endTime?: string;
    timezone?: string;
  }) {
    const tz = e.timezone || DEFAULT_TIMEZONE;
    const day = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC', // `date` is the calendar day itself, stored at UTC midnight
    }).format(new Date(e.date));
    const time = e.startTime
      ? `, ${e.startTime}${e.endTime ? ` – ${e.endTime}` : ''}`
      : '';
    return `${day}${time} (${tz})`;
  }

  private fmtDay(d: Date | string) {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(d));
  }

  // Everything the shared event layout draws, taken from the event.
  // `footer` carries the tenant's social links / address (and, for an
  // invitation to a contact, their unsubscribe link). The meeting
  // link only goes into the calendar entry once the person is
  // registered — an invitation must not reveal it.
  emailBase(
    e: EventDocument | any,
    businessName: string,
    footer?: FooterExtras | null,
    opts: { meetingLinkInCalendar?: boolean } = {},
  ) {
    const tz = e.timezone || DEFAULT_TIMEZONE;
    const time = e.startTime
      ? `${e.startTime}${e.endTime ? ` – ${e.endTime}` : ''} (${tz})`
      : '';
    return {
      businessName,
      recipientName: '',
      title: e.title,
      type: e.type,
      whenLabel: this.fmtWhen(e),
      where: e.virtual ? 'Virtual' : e.location || '',
      dateLabel: new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(e.date)),
      timeLabel: time || undefined,
      host: e.host || undefined,
      badge: eventBadge(e.date),
      agenda: parseAgenda(e.agenda),
      calendarUrl: googleCalendarUrl({
        ...(e.toObject?.() ?? e),
        meetingLink: opts.meetingLinkInCalendar ? e.meetingLink : '',
      }),
      imageUrl: e.inviteImageUrl || undefined,
      footer: footer ?? null,
    };
  }

  // The link an invitee uses to act on the event — same destinations
  // as the invitation email (personal registration page for external,
  // their own portal for in-house).
  ctaLinkFor(
    e: { mode: EventMode | string },
    invite: { audienceType: EventAudienceType; token: string },
  ) {
    return e.mode === EventMode.EXTERNAL
      ? `${process.env.TENANT_APP_URL}/event-register/${invite.token}`
      : invite.audienceType === EventAudienceType.CLIENT
        ? `${process.env.CLIENT_APP_URL}/events`
        : invite.audienceType === EventAudienceType.BOARD_MEMBER
          ? `${process.env.BOARD_APP_URL}/events`
          : `${process.env.TENANT_APP_URL}/my/events`;
  }

  // ── Lifecycle: automation settings ────────────────────────────

  async updateAutomation(
    tenantId: string,
    id: string,
    dto: UpdateEventAutomationDto,
  ) {
    const e = await this.getDoc(tenantId, id);
    if (e.status === EventStatus.CANCELLED) {
      throw new BadRequestException('A cancelled event has no automation');
    }
    const current = resolveAutomation(e.automation as any);
    const { configured: _configured, ...currentFields } = current;
    // A legacy event being configured for the first time starts from
    // the standard setup, then takes the changes on top.
    const base = e.automation ? currentFields : { ...DEFAULT_AUTOMATION };
    e.automation = { ...base, ...dto } as any;
    e.markModified('automation');
    this.log(e, 'updated', 'Automation settings updated');
    await e.save();
    return this.present(e);
  }

  // ── Lifecycle: attendance ─────────────────────────────────────

  private assertStarted(e: EventDocument, what: string) {
    if (
      e.status !== EventStatus.PUBLISHED &&
      e.status !== EventStatus.COMPLETED
    ) {
      throw new BadRequestException(`${what} once the event is published`);
    }
    const { startsAt } = eventInstants(e);
    if (e.status === EventStatus.PUBLISHED && Date.now() < startsAt.getTime()) {
      throw new BadRequestException(`${what} once the event has started`);
    }
  }

  // Writes attendees (External events) onto their CRM contact: a tag
  // with the event's name and an entry on the contact's activity
  // timeline. Idempotent per invite via syncedToContact.
  async syncAttendeesToContacts(e: EventDocument): Promise<number> {
    if (e.mode !== EventMode.EXTERNAL) return 0;
    let n = 0;
    const tag = `Event: ${e.title}`.slice(0, 60);
    const when = new Date(e.date).toISOString().slice(0, 10);
    for (const inv of e.invites) {
      if (
        inv.audienceType !== EventAudienceType.CONTACT ||
        inv.syncedToContact ||
        !attendanceOf(inv)
      )
        continue;
      const res = await this.contactModel.updateOne(
        { _id: inv.sourceId, tenantId: e.tenantId },
        {
          $addToSet: { tags: tag },
          $push: {
            activity: {
              type: 'Meeting',
              summary: `Attended ${e.title} (${when})`,
              by: 'Event Management',
              at: new Date(),
            },
          },
        },
      );
      if (res.matchedCount) {
        inv.syncedToContact = true;
        n++;
      }
    }
    return n;
  }

  async markAttendance(tenantId: string, id: string, dto: MarkAttendanceDto) {
    const e = await this.getDoc(tenantId, id);
    this.assertStarted(e, 'Attendance can be recorded');
    const now = new Date();
    let changed = 0;

    for (const entry of dto.entries ?? []) {
      const inv = e.invites.find((i) => i.id === entry.inviteId);
      if (!inv) throw new NotFoundException('Invite not found');
      inv.attended = entry.attended;
      inv.attendanceRecordedAt = entry.attended === null ? null : now;
      changed++;
    }
    if (dto.markAllRespondedAttended) {
      for (const inv of e.invites) {
        if (hasResponded(inv.status) && inv.attended == null) {
          inv.attended = true;
          inv.attendanceRecordedAt = now;
          changed++;
        }
      }
    }
    if (!changed) {
      throw new BadRequestException('Nothing to record');
    }

    e.outcome = e.outcome ?? ({} as any);
    e.outcome.attendanceRecordedAt = now;
    e.markModified('outcome');

    // Contact timeline stays in step with the corrected list once
    // the event is over (and the sync is switched on).
    const { endsAt } = eventInstants(e);
    const a = resolveAutomation(e.automation as any);
    let synced = 0;
    if (
      a.syncContacts &&
      (e.status === EventStatus.COMPLETED || now.getTime() >= endsAt.getTime())
    ) {
      synced = await this.syncAttendeesToContacts(e);
    }

    const stats = computeStats(e);
    this.log(
      e,
      'attendance',
      `Attendance recorded — ${stats.attendedInvites} of ${stats.responded || stats.invited} attended${stats.noShows ? `, ${stats.noShows} no-show${stats.noShows === 1 ? '' : 's'}` : ''}${synced ? `; ${synced} contact${synced === 1 ? '' : 's'} updated` : ''}`,
    );
    await e.save();
    return this.present(e);
  }

  async recordOutcome(
    tenantId: string,
    id: string,
    dto: RecordEventOutcomeDto,
  ) {
    const e = await this.getDoc(tenantId, id);
    this.assertStarted(e, 'Results can be recorded');
    const o: any = e.outcome ?? {};
    const set = <K extends keyof RecordEventOutcomeDto>(k: K) => {
      if (dto[k] !== undefined)
        o[k] = typeof dto[k] === 'string' ? (dto[k] as string).trim() : dto[k];
    };
    (
      [
        'walkIns',
        'avgSessionDuration',
        'leadsGenerated',
        'followUpCallsBooked',
        'newContacts',
        'recordingUrl',
        'materialsUrl',
        'notes',
      ] as const
    ).forEach(set);
    o.recordedAt = new Date();
    e.outcome = o;
    e.markModified('outcome');
    this.log(e, 'results', 'Post-event results saved');
    await e.save();
    return this.present(e);
  }

  // ── Lifecycle: public feedback (token-gated, like registration) ─

  async getFeedbackByToken(token: string) {
    const found = await this.findByToken(token);
    if (!found) throw new NotFoundException('This link is not valid');
    const { event: e, invite } = found;
    return {
      title: e.title,
      type: e.type,
      when: this.fmtWhen(e),
      host: e.host,
      open: this.feedbackOpen(e, invite),
      alreadySubmitted: invite.feedbackRating != null,
      invite: { name: invite.name },
    };
  }

  private feedbackOpen(
    e: EventDocument,
    invite: { attended?: boolean | null },
  ) {
    if (
      e.status !== EventStatus.PUBLISHED &&
      e.status !== EventStatus.COMPLETED
    )
      return false;
    if (invite.attended === false) return false;
    return Date.now() >= eventInstants(e).startsAt.getTime();
  }

  async submitFeedback(token: string, dto: SubmitEventFeedbackDto) {
    const found = await this.findByToken(token);
    if (!found) throw new NotFoundException('This link is not valid');
    const { event: e, invite } = found;
    if (!this.feedbackOpen(e, invite)) {
      throw new BadRequestException('Feedback is not open for this event');
    }
    if (invite.feedbackRating != null) {
      throw new BadRequestException(
        'Feedback has already been submitted — thank you',
      );
    }
    invite.feedbackRating = dto.rating;
    invite.feedbackComment = dto.comment?.trim() ?? '';
    invite.feedbackAt = new Date();
    this.log(e, 'feedback', `${invite.name} rated the event ${dto.rating}/5`);
    await e.save();
    return { ok: true };
  }

  // ── Calendar ──────────────────────────────────────────────────
  // Every event that exists (drafts included — it's on the calendar
  // the moment it's created) except cancelled ones, as calendar
  // entries. Computed live so a rescheduled or cancelled event can
  // never leave a stale entry behind.
  async getCalendarEntries(tenantId: string) {
    const events = await this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        status: { $ne: EventStatus.CANCELLED },
      })
      .select('title type mode status date startTime location virtual')
      .lean();
    return events.map((e: any) => ({
      id: `event-${e._id}`,
      title: `${e.title}${e.status === EventStatus.DRAFT ? ' (draft)' : ''}`,
      date: new Date(e.date).toISOString().slice(0, 10),
      time: e.startTime || '09:00',
      layer: CalendarLayer.EVENT,
      source: `${e.mode === EventMode.EXTERNAL ? 'External' : 'In-house'} ${String(e.type).toLowerCase()}`,
      location: e.virtual ? 'Virtual' : e.location || '—',
      editable: false,
    }));
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
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        userId: new Types.ObjectId(userId),
      })
      .select('_id')
      .lean();
    if (!employee) {
      throw new NotFoundException(
        'No employee record is linked to this account',
      );
    }
    return employee;
  }
}
