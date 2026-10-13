import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Segment,
  SegmentDocument,
  SegmentMode,
  SegmentRuleField,
  SegmentAudience,
  Campaign,
  CampaignDocument,
  CampaignStatus,
  NewsletterDraft,
  NewsletterDraftDocument,
} from '../schemas';
import {
  CreateSegmentDto,
  UpdateSegmentDto,
  CreateCampaignDto,
  UpdateCampaignDto,
  ScheduleCampaignDto,
  SendTestDto,
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
import { EmailService } from 'src/common/utils/mailing/email.service';
import { RegulatoryChangeService } from 'src/modules/grc/compliance/services/regulatory-change.service';

type ResolvedMember = {
  _id: string;
  name: string;
  email: string;
  sourceType: SegmentAudience;
};

// ── Segments — real client targeting. Membership is always resolved
// live against real User + ClientProfileRecord data, never stored,
// so a rule-based segment can never drift from what clients actually
// look like right now. ─────────────────────────────────────────────

@Injectable()
export class SegmentService {
  constructor(
    @InjectModel(Segment.name)
    private readonly model: Model<SegmentDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(ClientProfileRecord.name)
    private readonly profileModel: Model<ClientProfileDocument>,
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    @InjectModel(BoardMember.name)
    private readonly boardMemberModel: Model<BoardMemberDocument>,
  ) {}

  async getAll(tenantId: string) {
    const segments = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
    return Promise.all(
      segments.map(async (s) => ({
        ...s,
        memberCount: (await this.resolveMembers(tenantId, s as any)).length,
      })),
    );
  }

  private validateSegmentDto(dto: CreateSegmentDto | UpdateSegmentDto) {
    if (dto.mode === SegmentMode.RULE && !dto.rule) {
      throw new BadRequestException('A rule-based segment needs a real rule');
    }
    // Rule-based resolution only exists for Client (User fields) —
    // see resolveMembers. Contact/BoardMember segments must be manual.
    if (
      dto.mode === SegmentMode.RULE &&
      dto.audience !== SegmentAudience.CLIENT
    ) {
      throw new BadRequestException(
        'Rule-based segments are only supported for the Client audience — use a manual segment for Contacts or Board Members',
      );
    }
  }

  async create(tenantId: string, dto: CreateSegmentDto) {
    this.validateSegmentDto(dto);
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      description: dto.description ?? '',
      mode: dto.mode,
      audience: dto.audience,
      memberIds: (dto.memberIds ?? []).map((id) => new Types.ObjectId(id)),
      rule: dto.mode === SegmentMode.RULE ? dto.rule : null,
    });
    return created.toObject();
  }

  async update(tenantId: string, id: string, dto: UpdateSegmentDto) {
    this.validateSegmentDto(dto);
    const s = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!s) throw new NotFoundException('Segment not found');
    s.name = dto.name;
    s.description = dto.description ?? '';
    s.mode = dto.mode;
    s.audience = dto.audience;
    s.memberIds = (dto.memberIds ?? []).map((id) => new Types.ObjectId(id));
    s.rule = dto.mode === SegmentMode.RULE ? (dto.rule as any) : null;
    await s.save();
    return s.toObject();
  }

  async delete(tenantId: string, id: string) {
    const res = await this.model.deleteOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!res.deletedCount) throw new NotFoundException('Segment not found');
    return { deleted: true };
  }

  // Real display name — firstName/lastName first, falling back to
  // the client's real company name (nested under
  // clientProfile.companyName — there's no top-level businessName
  // field on User), then email as a last resort.
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

  // Real resolution — manual segments return their real specified
  // members; Client rule segments query real User + ClientProfileRecord
  // fields live, so results always reflect current reality. Contact
  // and BoardMember audiences are manual-only (see
  // validateSegmentDto) — there's no confirmed rule-field equivalent
  // for those two collections yet.
  async resolveMembers(
    tenantId: string,
    segment: {
      mode: SegmentMode;
      audience?: SegmentAudience;
      memberIds: Types.ObjectId[];
      rule: { field: SegmentRuleField; value: string } | null;
    },
  ): Promise<ResolvedMember[]> {
    const tId = new Types.ObjectId(tenantId);
    // Segments created before `audience` existed have none stored —
    // treat them as Client, their only possible audience at the time.
    const audience = segment.audience ?? SegmentAudience.CLIENT;

    if (audience === SegmentAudience.CONTACT) {
      if (!segment.memberIds.length) return [];
      const contacts = await this.contactModel
        .find({ _id: { $in: segment.memberIds }, tenantId: tId })
        .lean();
      return contacts
        .filter((c) => !!c.email)
        .map((c) => ({
          _id: String(c._id),
          name: c.name,
          email: c.email,
          sourceType: SegmentAudience.CONTACT,
        }));
    }

    if (audience === SegmentAudience.BOARD_MEMBER) {
      if (!segment.memberIds.length) return [];
      const members = await this.boardMemberModel
        .find({ _id: { $in: segment.memberIds }, tenantId: tId })
        .lean();
      return members
        .filter(
          (m) =>
            !!m.email &&
            m.lifecycleStatus !== BoardMemberLifecycleStatus.OFFBOARDED,
        )
        .map((m) => ({
          _id: String(m._id),
          name: m.name,
          email: m.email,
          sourceType: SegmentAudience.BOARD_MEMBER,
        }));
    }

    // ── Client audience — unchanged from before this field existed ──

    if (segment.mode === SegmentMode.MANUAL) {
      if (!segment.memberIds.length) return [];
      const users = await this.userModel
        .find({ _id: { $in: segment.memberIds }, tenantId: tId })
        .lean();
      return users.map((u) => ({
        _id: String(u._id),
        name: this.displayName(u),
        email: u.email,
        sourceType: SegmentAudience.CLIENT,
      }));
    }

    if (!segment.rule) return [];
    const { field, value } = segment.rule;

    if (field === SegmentRuleField.CLASSIFICATION) {
      const users = await this.userModel
        .find({ tenantId: tId, classifications: value })
        .lean();
      return users.map((u) => ({
        _id: String(u._id),
        name: this.displayName(u),
        email: u.email,
        sourceType: SegmentAudience.CLIENT,
      }));
    }

    if (field === SegmentRuleField.STATUS) {
      const users = await this.userModel
        .find({ tenantId: tId, status: value })
        .lean();
      return users.map((u) => ({
        _id: String(u._id),
        name: this.displayName(u),
        email: u.email,
        sourceType: SegmentAudience.CLIENT,
      }));
    }

    // riskLevel lives on ClientProfileRecord, not User — a real
    // second lookup, not a guess at a field that doesn't exist there.
    if (field === SegmentRuleField.RISK_LEVEL) {
      const profiles = await this.profileModel
        .find({ riskLevel: value })
        .select('userId')
        .lean();
      const userIds = profiles.map((p) => p.userId);
      if (!userIds.length) return [];
      const users = await this.userModel
        .find({ _id: { $in: userIds }, tenantId: tId })
        .lean();
      return users.map((u) => ({
        _id: String(u._id),
        name: this.displayName(u),
        email: u.email,
        sourceType: SegmentAudience.CLIENT,
      }));
    }

    return [];
  }

  async getResolvedMembers(tenantId: string, id: string) {
    const s = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!s) throw new NotFoundException('Segment not found');
    return this.resolveMembers(tenantId, s as any);
  }

  async getById(tenantId: string, id: string) {
    const s = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!s) throw new NotFoundException('Segment not found');
    return s;
  }
}

// ── Campaigns — real email sends via EmailService's real SMTP
// transport. Recipients are a real snapshot of a segment's real
// members at creation time. Delivered reflects a genuine SMTP
// accept/reject; clicked/RSVP'd are honestly never set true — no
// tracking-capable email provider is connected. Opened does get a
// real, second source of truth: the client portal marks it when the
// client actually views their own copy — see markOpenedByClient. ──

@Injectable()
export class CampaignService {
  constructor(
    @InjectModel(Campaign.name)
    private readonly model: Model<CampaignDocument>,
    @InjectModel(BoardMember.name)
    private readonly boardMemberModel: Model<BoardMemberDocument>,
    private readonly segmentService: SegmentService,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Real union across every selected segment's real, live-resolved
  // members — a campaign can target a Client segment AND a
  // BoardMember segment (etc.) in the same send. De-duplicated by
  // email (case-insensitive) so the same address is never sent to
  // twice just because it showed up in two segments.
  private async resolveRecipients(tenantId: string, segmentIds: string[]) {
    const segments = await Promise.all(
      segmentIds.map((id) => this.segmentService.getById(tenantId, id)),
    );
    const resolvedPerSegment = await Promise.all(
      segments.map((s) =>
        this.segmentService.resolveMembers(tenantId, s as any),
      ),
    );

    const byEmail = new Map<string, ResolvedMember>();
    for (const members of resolvedPerSegment) {
      for (const m of members) {
        const key = m.email.toLowerCase();
        if (!byEmail.has(key)) byEmail.set(key, m);
      }
    }

    return {
      segmentNames: segments.map((s) => s.name),
      members: Array.from(byEmail.values()),
    };
  }

  private toRecipientDocs(members: ResolvedMember[]) {
    return members.map((m) => ({
      sourceType: m.sourceType,
      sourceId: new Types.ObjectId(m._id),
      clientId:
        m.sourceType === SegmentAudience.CLIENT
          ? new Types.ObjectId(m._id)
          : null,
      clientName: m.name,
      email: m.email,
      delivered: false,
      deliveryError: null,
      opened: false,
      clicked: false,
      rsvped: false,
    }));
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getById(tenantId: string, id: string) {
    const c = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!c) throw new NotFoundException('Campaign not found');
    return c;
  }

  async create(tenantId: string, dto: CreateCampaignDto) {
    const tId = new Types.ObjectId(tenantId);
    const { segmentNames, members } = await this.resolveRecipients(
      tenantId,
      dto.segmentIds,
    );

    const created = await this.model.create({
      tenantId: tId,
      name: dto.name,
      type: dto.type,
      segmentIds: dto.segmentIds.map((id) => new Types.ObjectId(id)),
      segmentNames,
      subject: dto.subject ?? '',
      body: dto.body ?? '',
      event: dto.type === 'Event invite' ? (dto.event ?? {}) : null,
      recipients: this.toRecipientDocs(members),
    });
    return created.toObject();
  }

  async duplicate(tenantId: string, id: string) {
    const original = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!original) throw new NotFoundException('Campaign not found');
    const created = await this.model.create({
      tenantId: original.tenantId,
      name: `${original.name} (copy)`,
      type: original.type,
      segmentIds: original.segmentIds,
      segmentNames: original.segmentNames,
      subject: original.subject,
      body: original.body,
      event: original.event,
      status: CampaignStatus.DRAFT,
      recipients: original.recipients.map((r) => ({
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        clientId: r.clientId,
        clientName: r.clientName,
        email: r.email,
        delivered: false,
        deliveryError: null,
        opened: false,
        clicked: false,
        rsvped: false,
      })),
    });
    return created.toObject();
  }

  async delete(tenantId: string, id: string) {
    const res = await this.model.deleteOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!res.deletedCount) throw new NotFoundException('Campaign not found');
    return { deleted: true };
  }

  async schedule(tenantId: string, id: string, dto: ScheduleCampaignDto) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Campaign not found');
    if (c.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Only a draft campaign can be scheduled');
    }
    c.status = CampaignStatus.SCHEDULED;
    c.scheduledAt = new Date(dto.scheduledAt);
    await c.save();
    return c.toObject();
  }

  // Real way back from Scheduled — clears scheduledAt and returns
  // to Draft, so a campaign scheduled by mistake (or one the sender
  // wants to hold and re-send-now instead) isn't stuck waiting for
  // its original time with no path except that one, fixed schedule.
  async unschedule(tenantId: string, id: string) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Campaign not found');
    if (c.status !== CampaignStatus.SCHEDULED) {
      throw new BadRequestException(
        'Only a scheduled campaign can be unscheduled',
      );
    }
    c.status = CampaignStatus.DRAFT;
    c.scheduledAt = null;
    await c.save();
    return c.toObject();
  }

  // Real content editing — allowed for Draft and Scheduled (nothing
  // has actually gone out yet in either state), refused once Sending
  // or Sent, since real recipients may already have real copies. If
  // the target segment changed, recipients are genuinely re-resolved
  // against it — the old snapshot would otherwise silently describe
  // the wrong audience.
  async update(tenantId: string, id: string, dto: UpdateCampaignDto) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Campaign not found');
    if (
      c.status !== CampaignStatus.DRAFT &&
      c.status !== CampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException(
        'This campaign has already been sent or is sending — it can no longer be edited',
      );
    }

    const currentSegmentIds = c.segmentIds.map((s) => String(s)).sort();
    const nextSegmentIds = [...dto.segmentIds].sort();
    const segmentsChanged =
      currentSegmentIds.length !== nextSegmentIds.length ||
      currentSegmentIds.some((id, i) => id !== nextSegmentIds[i]);

    if (segmentsChanged) {
      const { segmentNames, members } = await this.resolveRecipients(
        tenantId,
        dto.segmentIds,
      );
      c.segmentIds = dto.segmentIds.map((id) => new Types.ObjectId(id));
      c.segmentNames = segmentNames;
      c.recipients = this.toRecipientDocs(members) as any;
    }

    c.name = dto.name;
    c.type = dto.type;
    c.subject = dto.subject ?? '';
    c.body = dto.body ?? '';
    c.event = dto.type === 'Event invite' ? ((dto.event as any) ?? {}) : null;
    await c.save();
    return c.toObject();
  }

  private renderHtml(campaign: { subject: string; body: string; event: any }) {
    if (!campaign.event) return campaign.body;
    return `
      <div>
        <h3>${campaign.event.title ?? ''}</h3>
        <p>${campaign.event.dateTime ?? ''} — ${campaign.event.location ?? ''}</p>
        ${campaign.event.rsvp ? '<p><em>RSVP requested</em></p>' : ''}
        ${campaign.body}
      </div>
    `;
  }

  // Real sends, one per real recipient, via EmailService's real SMTP
  // transport. Each recipient's delivered flag reflects whether that
  // specific send actually succeeded — a partial failure doesn't
  // silently mark everyone delivered.
  async sendNow(tenantId: string, id: string) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Campaign not found');
    if (c.status === CampaignStatus.SENT) {
      throw new BadRequestException('This campaign has already been sent');
    }

    c.status = CampaignStatus.SENDING;
    await c.save();

    const html = this.renderHtml(c);
    for (const r of c.recipients as any[]) {
      try {
        await this.emailService.sendCampaign(
          r.email,
          c.subject || c.name,
          html,
        );
        r.delivered = true;
        r.deliveryError = null;
        this.eventEmitter.emit('client.newsletter.sent', {
          tenantId,
          clientUserId: String(r.clientId),
          campaignId: String(c._id),
          subject: c.subject || c.name,
        });
      } catch (err: any) {
        r.delivered = false;
        r.deliveryError = err?.message ?? 'Send failed';
      }
    }

    c.status = CampaignStatus.SENT;
    c.sentAt = new Date();
    await c.save();
    return c.toObject();
  }

  async sendTest(tenantId: string, id: string, dto: SendTestDto) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Campaign not found');
    const html = this.renderHtml(c);
    await this.emailService.sendCampaign(
      dto.to,
      `[TEST] ${c.subject || c.name}`,
      html,
    );
    return { sent: true };
  }

  // Real, in-portal "opened" — the one honest source of truth this
  // system has for engagement, set when a client actually views
  // their own copy of a sent campaign in their client portal. Not
  // email-open-pixel tracking (no provider for that is connected);
  // a genuine, direct signal instead of a proxy for one.
  async markOpenedByClient(
    tenantId: string,
    campaignId: string,
    clientUserId: string,
  ) {
    const c = await this.model.findOne({
      _id: campaignId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Campaign not found');
    const recipient = (c.recipients as any[]).find(
      (r) => String(r.clientId) === clientUserId,
    );
    if (!recipient) {
      throw new ForbiddenException('This campaign was not sent to you');
    }
    if (!recipient.opened) {
      recipient.opened = true;
      await c.save();
    }
    return c.toObject();
  }

  // ── Board Portal — "renders in the page for Newsletter" (PO, Oct
  // 2026). Same shape as ClientNewsletterService's sanitizeForClient
  // below, scoped to BoardMember recipients instead of Client ones.
  // No cross-module service DI into GovernanceModule here — same
  // direct-model-injection convention GovernanceModule itself already
  // uses for cross-module reads (see its own BoardMemberService
  // constructor comment), so `boardMemberModel` is injected directly
  // above rather than going through BoardMemberService. ─────────────

  private async resolveBoardMember(userId: string) {
    const member = await this.boardMemberModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .select('_id tenantId')
      .lean();
    if (!member) {
      throw new NotFoundException('No board member record for this account');
    }
    return member;
  }

  private sanitizeForBoardPortal(c: any, boardMemberId: string) {
    const mine = (c.recipients as any[]).find(
      (r) =>
        r.sourceType === SegmentAudience.BOARD_MEMBER &&
        String(r.sourceId) === boardMemberId,
    );
    return {
      _id: c._id,
      name: c.name,
      type: c.type,
      subject: c.subject,
      body: c.body,
      event: c.event,
      sentAt: c.sentAt,
      opened: mine?.opened ?? false,
    };
  }

  async getMyBoardPortalNewsletters(userId: string) {
    const member = await this.resolveBoardMember(userId);
    const campaigns = await this.model
      .find({
        tenantId: member.tenantId,
        status: CampaignStatus.SENT,
        recipients: {
          $elemMatch: {
            sourceType: SegmentAudience.BOARD_MEMBER,
            sourceId: member._id,
          },
        },
      })
      .sort({ sentAt: -1 })
      .lean();
    return campaigns.map((c) =>
      this.sanitizeForBoardPortal(c, String(member._id)),
    );
  }

  async getMyBoardPortalNewsletter(userId: string, id: string) {
    const member = await this.resolveBoardMember(userId);
    const c = await this.model.findOne({
      _id: id,
      tenantId: member.tenantId,
      status: CampaignStatus.SENT,
    });
    if (!c) throw new NotFoundException('Newsletter not found');
    const recipient = (c.recipients as any[]).find(
      (r) =>
        r.sourceType === SegmentAudience.BOARD_MEMBER &&
        String(r.sourceId) === String(member._id),
    );
    if (!recipient) {
      throw new ForbiddenException('This newsletter was not sent to you');
    }
    // Same real, in-portal "opened" signal as the client portal's
    // markOpenedByClient — set when this board member actually views
    // their own copy, not from any email-open-pixel tracking.
    if (!recipient.opened) {
      recipient.opened = true;
      await c.save();
    }
    return this.sanitizeForBoardPortal(c.toObject(), String(member._id));
  }
}

// ── Newsletter drafts — real, mechanical composition from actual
// regulatory change entries. No AI/LLM summarisation — this pulls
// real title/summary/regulator/published-date fields and assembles
// them into a real draft, nothing generated or invented. ───────────

@Injectable()
export class NewsletterDraftService {
  constructor(
    @InjectModel(NewsletterDraft.name)
    private readonly model: Model<NewsletterDraftDocument>,
    private readonly regulatoryChangeService: RegulatoryChangeService,
  ) {}

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ generatedAt: -1 })
      .lean();
  }

  async generateFromRegulatoryFeed(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const allChanges = await this.regulatoryChangeService.getAll(tenantId);

    const priorDrafts = await this.model.find({ tenantId: tId }).lean();
    const alreadyCovered = new Set(
      priorDrafts.flatMap((d) => d.sourceChangeIds.map((id) => String(id))),
    );
    const newChanges = (allChanges as any[]).filter(
      (c) => !alreadyCovered.has(String(c._id)),
    );
    if (!newChanges.length) {
      throw new BadRequestException(
        'No new regulatory changes since the last newsletter draft',
      );
    }

    const title = `Regulatory update — ${new Date().toLocaleDateString()}`;
    const body = newChanges
      .map(
        (c) => `
        <div>
          <h4>${c.title}</h4>
          <p><strong>${c.regulator}</strong> · ${new Date(c.publishedAt).toLocaleDateString()}</p>
          <p>${c.summary || ''}</p>
        </div>
      `,
      )
      .join('<hr/>');

    const created = await this.model.create({
      tenantId: tId,
      title,
      source: 'GRC regulatory feed',
      body,
      generatedAt: new Date(),
      sourceChangeIds: newChanges.map((c) => c._id),
    });
    return created.toObject();
  }

  async markConverted(tenantId: string, id: string, campaignId: string) {
    const d = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!d) throw new NotFoundException('Newsletter draft not found');
    d.convertedToCampaignId = new Types.ObjectId(campaignId);
    await d.save();
    return d.toObject();
  }
}

// ── Client-facing — the tenant's own client viewing newsletters
// sent to them. Same crm/client-* URL convention client-invoices,
// client-projects and client-tickets already use. Wraps the real
// CampaignService rather than querying the model directly, so this
// can never drift from what CampaignService itself considers a real
// sent campaign. ────────────────────────────────────────────────

@Injectable()
export class ClientNewsletterService {
  constructor(
    @InjectModel(Campaign.name)
    private readonly model: Model<CampaignDocument>,
    private readonly campaignService: CampaignService,
  ) {}

  // Only real, sent campaigns where this client is a genuine
  // recipient — never a draft/scheduled campaign they haven't
  // actually received, and never another client's recipient data.
  private sanitizeForClient(c: any, clientUserId: string) {
    const mine = (c.recipients as any[]).find(
      (r) => String(r.clientId) === clientUserId,
    );
    return {
      _id: c._id,
      name: c.name,
      type: c.type,
      subject: c.subject,
      body: c.body,
      event: c.event,
      sentAt: c.sentAt,
      opened: mine?.opened ?? false,
    };
  }

  async getMyNewsletters(tenantId: string, clientUserId: string) {
    const campaigns = await this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        status: CampaignStatus.SENT,
        'recipients.clientId': new Types.ObjectId(clientUserId),
      })
      .sort({ sentAt: -1 })
      .lean();
    return campaigns.map((c) => this.sanitizeForClient(c, clientUserId));
  }

  async getMyNewsletter(tenantId: string, clientUserId: string, id: string) {
    const c = await this.model
      .findOne({
        _id: id,
        tenantId: new Types.ObjectId(tenantId),
        status: CampaignStatus.SENT,
      })
      .lean();
    if (!c) throw new NotFoundException('Newsletter not found');
    const isRecipient = (c.recipients as any[]).some(
      (r) => String(r.clientId) === clientUserId,
    );
    if (!isRecipient) {
      throw new ForbiddenException('This newsletter was not sent to you');
    }
    // Real signal, set the one place it's genuinely true: the
    // client actually opening their own copy.
    await this.campaignService.markOpenedByClient(tenantId, id, clientUserId);
    const updated = await this.model.findOne({ _id: id }).lean();
    return this.sanitizeForClient(updated, clientUserId);
  }
}

// ── The piece scheduling was missing — a real background job that
// actually sends a campaign once its scheduled time arrives, rather
// than "Scheduled" being a status nothing ever acts on. Runs every
// minute, which is precise enough for a firm-internal comms tool
// without being wasteful. Reuses CampaignService.sendNow for the
// actual send, so a scheduled send and a manual "Send now" can never
// diverge in behaviour — one real send path, two real triggers. ────

@Injectable()
export class CampaignSchedulerService {
  private readonly logger = new Logger(CampaignSchedulerService.name);

  constructor(
    @InjectModel(Campaign.name)
    private readonly model: Model<CampaignDocument>,
    private readonly campaignService: CampaignService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sendDueCampaigns(): Promise<void> {
    const due = await this.model
      .find({
        status: CampaignStatus.SCHEDULED,
        scheduledAt: { $lte: new Date() },
      })
      .select('_id tenantId')
      .lean();

    for (const c of due) {
      try {
        await this.campaignService.sendNow(String(c.tenantId), String(c._id));
        this.logger.log(`Sent scheduled campaign ${c._id}`);
      } catch (err: any) {
        this.logger.error(
          `Failed to send scheduled campaign ${c._id}: ${err?.message}`,
        );
      }
    }
  }
}
