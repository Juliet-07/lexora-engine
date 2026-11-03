import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import {
  BcpIncident,
  BcpIncidentDocument,
  BcpIncidentStatus,
  CommsContact,
  CommsContactDocument,
  CommsDelivery,
  CommsGroup,
  CommsGroupDocument,
  CommsGroupSource,
  CommsMessage,
  CommsMessageDocument,
  CommsMessageKind,
  CommsMessageStatus,
  CommsRecipientKind,
  CommsSettings,
  CommsSettingsDocument,
  CommsTemplate,
  CommsTemplateDocument,
} from '../schemas';
import {
  ComposeCommsDto,
  CreateCommsContactDto,
  CreateCommsGroupDto,
  CreateCommsTemplateDto,
  LogCommsReceiptDto,
  ReturnCommsMessageDto,
  SaveCommsMessageDto,
  UpdateCommsContactDto,
  UpdateCommsGroupDto,
  UpdateCommsTemplateDto,
} from '../dtos';
import {
  LEVEL_LABELS,
  MERGE_FIELDS,
  SEED_GROUPS,
  SEED_TEMPLATES,
} from './bcp-comms.constants';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import {
  Employee,
  EmployeeDocument,
} from 'src/modules/hr/schemas/employee.schema';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';
import { UserType } from 'src/common/interfaces/user-role.enum';

const HOUR = 3_600_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BRACKET_RE = /\[[^\]]+\]/;
const SEND_CHUNK = 8;

// The signed-in user, as the controller hands it over.
export interface CommsUser {
  sub: string;
  userType?: string;
  roles?: string[];
}

const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));
const levelOf = (severity: string) => Number(String(severity).slice(1)) || 1;

type Incident = BcpIncident & { _id: Types.ObjectId };

@Injectable()
export class BcpCommsService {
  private readonly logger = new Logger(BcpCommsService.name);

  constructor(
    @InjectModel(CommsGroup.name)
    private readonly groupModel: Model<CommsGroupDocument>,
    @InjectModel(CommsContact.name)
    private readonly contactModel: Model<CommsContactDocument>,
    @InjectModel(CommsTemplate.name)
    private readonly templateModel: Model<CommsTemplateDocument>,
    @InjectModel(CommsMessage.name)
    private readonly messageModel: Model<CommsMessageDocument>,
    @InjectModel(CommsSettings.name)
    private readonly settingsModel: Model<CommsSettingsDocument>,
    @InjectModel(BcpIncident.name)
    private readonly incidentModel: Model<BcpIncidentDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Formatting helpers ──────────────────────────────────────

  private tz() {
    return process.env.NOTICE_TZ || 'Africa/Kigali';
  }

  private fmt(d: Date | string | null | undefined): string {
    if (!d) return '';
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.tz(),
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(d));
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${g('day')} ${g('month')} ${g('year')}, ${g('hour')}:${g('minute')}`;
  }

  // ── People ───────────────────────────────────────────────────

  private async actor(userId: string) {
    const u = await this.userModel
      .findById(userId)
      .select('firstName lastName email tenantProfile.businessName')
      .lean();
    const name =
      [u?.firstName, u?.lastName].filter(Boolean).join(' ') ||
      (u as any)?.tenantProfile?.businessName ||
      u?.email ||
      'Unknown';
    return { userId: oid(userId), name };
  }

  // Approving a notice is for the account owner and tenant
  // administrators/managers. Everyone else with access can draft and
  // submit for approval.
  private isApprover(user: CommsUser): boolean {
    if (user.userType === UserType.TENANT) return true;
    const roles = user.roles ?? [];
    return ['tenant_owner', 'tenant_admin', 'tenant_manager'].some((r) =>
      roles.includes(r),
    );
  }

  private async employeeRef(tenantId: string, id?: string | null) {
    if (!id) return { id: null as Types.ObjectId | null, name: '' };
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Choose a valid person');
    }
    const emp = await this.employeeModel
      .findOne({ _id: id, tenantId: oid(tenantId) })
      .select('firstName lastName')
      .lean();
    if (!emp) throw new BadRequestException('That person was not found');
    return { id: oid(id), name: `${emp.firstName} ${emp.lastName}`.trim() };
  }

  private clientName(u: any): string {
    return (
      [u.firstName, u.lastName].filter(Boolean).join(' ') ||
      u.clientProfile?.companyName ||
      u.email
    );
  }

  // ── Seeding ──────────────────────────────────────────────────

  // First visit puts the default groups and templates in place. The
  // settings row is claimed atomically so two simultaneous first
  // requests cannot seed twice.
  async ensureSeeded(tenantId: string) {
    const tId = oid(tenantId);
    try {
      await this.settingsModel.updateOne(
        { tenantId: tId },
        { $setOnInsert: { tenantId: tId, seeded: false } },
        { upsert: true },
      );
    } catch {
      /* a concurrent first request created it — fine */
    }
    const claimed = await this.settingsModel.updateOne(
      { tenantId: tId, seeded: false },
      { $set: { seeded: true } },
    );
    if (claimed.modifiedCount !== 1) {
      await this.retireRegulatorDefaults(tId);
      return;
    }

    const idByKey = new Map<string, Types.ObjectId>();
    let order = 0;
    for (const g of SEED_GROUPS) {
      const doc = await this.groupModel.create({
        tenantId: tId,
        name: g.name,
        icon: g.icon,
        color: g.color,
        order: order++,
        slaHours: g.slaHours,
        reactive: !!g.reactive,
        channel: g.channel,
        statutory: g.statutory ?? '',
        trigger: {
          minLevel: g.trigger.minLevel ?? null,
          types: g.trigger.types ?? [],
          flags: g.trigger.flags ?? [],
        },
        approvalMinLevel: g.approvalMinLevel,
        source: g.source ?? CommsGroupSource.CONTACTS,
        custom: false,
        key: g.key,
      });
      idByKey.set(g.key, doc._id as Types.ObjectId);
      for (const c of g.contacts) {
        await this.contactModel.create({
          tenantId: tId,
          groupId: doc._id,
          name: c.name,
          role: c.role,
          email: c.email,
          phone: c.phone ?? '',
        });
      }
    }
    for (const t of SEED_TEMPLATES) {
      await this.templateModel.create({
        tenantId: tId,
        name: t.name,
        groupId: t.groupKey ? (idByKey.get(t.groupKey) ?? null) : null,
        description: t.description,
        subject: t.subject,
        body: t.body,
        custom: false,
        key: t.key,
        edited: false,
      });
    }
    await this.retireRegulatorDefaults(tId);
  }

  // Early builds seeded two country-specific regulator groups (NCSA and
  // BNR) for every tenant. Remove them once per tenant. A group the
  // tenant has actually used or filled in is kept as one of their own
  // groups, so no communication record or contact is lost.
  private async retireRegulatorDefaults(tId: Types.ObjectId) {
    const claimed = await this.settingsModel.updateOne(
      { tenantId: tId, retiredRegulators: { $ne: true } },
      { $set: { retiredRegulators: true } },
    );
    if (claimed.modifiedCount !== 1) return;

    const legacy: any[] = await this.groupModel
      .find({ tenantId: tId, custom: false, key: { $in: ['ncsa', 'bnr'] } })
      .lean();
    for (const g of legacy) {
      const [used, contacts] = await Promise.all([
        this.messageModel.exists({ tenantId: tId, groupId: g._id }),
        this.contactModel.find({ tenantId: tId, groupId: g._id }).lean(),
      ]);
      const onlyDefaults = contacts.every((c: any) =>
        ['Data Protection and Privacy Office', 'Assigned supervisor'].includes(
          c.name,
        ),
      );
      if (used || !onlyDefaults) {
        await this.groupModel.updateOne(
          { _id: g._id },
          { $set: { custom: true, key: '' } },
        );
        continue;
      }
      await this.contactModel.deleteMany({ tenantId: tId, groupId: g._id });
      await this.templateModel.deleteMany({
        tenantId: tId,
        groupId: g._id,
        edited: false,
      });
      // Anything the tenant edited stays, available for any stakeholder.
      await this.templateModel.updateMany(
        { tenantId: tId, groupId: g._id },
        { $set: { groupId: null, custom: true } },
      );
      await this.groupModel.deleteOne({ _id: g._id });
    }
  }

  // ── Plan logic ───────────────────────────────────────────────

  private triggered(g: any, inc: any): boolean {
    const t = g.trigger ?? {};
    const level = levelOf(inc.severity);
    if (t.minLevel != null && level >= t.minLevel) return true;
    if ((t.types ?? []).length && t.types.includes(inc.type)) return true;
    return (t.flags ?? []).some((f: string) => !!inc[f]);
  }

  private triggerText(g: any): string {
    const t = g.trigger ?? {};
    const a: string[] = [];
    if (t.minLevel != null) a.push(`Level ${t.minLevel} and above`);
    if ((t.types ?? []).length)
      a.push(`${t.types.join(' or ').toLowerCase()} incidents`);
    for (const f of t.flags ?? [])
      a.push(
        f === 'clientImpact'
          ? 'client services or client data affected'
          : 'media interest',
      );
    return a.join(', or ') || 'manual only, from Notify anyway';
  }

  private needsApproval(g: any, inc: any): boolean {
    const min = g.approvalMinLevel ?? 1;
    return min > 0 && levelOf(inc.severity) >= min;
  }

  private lead(msgs: any[], groupId: any) {
    return msgs
      .filter(
        (m) =>
          String(m.groupId) === String(groupId) &&
          m.kind === CommsMessageKind.INITIAL,
      )
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      .slice(-1)[0];
  }

  private groupStatus(msgs: any[], g: any): string {
    const m = this.lead(msgs, g._id);
    if (!m) return g.reactive ? 'standby' : 'none';
    if (m.status === CommsMessageStatus.SENT)
      return m.confirm ? 'confirmed' : 'sent';
    return m.status;
  }

  private deadline(g: any, inc: any): Date | null {
    return g.slaHours
      ? new Date(new Date(inc.declaredAt).getTime() + g.slaHours * HOUR)
      : null;
  }

  private async getIncident(tenantId: string, id: string): Promise<Incident> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Incident not found');
    const inc = await this.incidentModel
      .findOne({ _id: id, tenantId: oid(tenantId) })
      .lean();
    if (!inc) throw new NotFoundException('Incident not found');
    return inc as unknown as Incident;
  }

  private assertActive(inc: any) {
    if (inc.status !== BcpIncidentStatus.ACTIVE) {
      throw new BadRequestException(
        'This incident is closed, so its communications can no longer be changed.',
      );
    }
  }

  private async groupsWithContacts(tenantId: string) {
    const tId = oid(tenantId);
    const [groups, contacts] = await Promise.all([
      this.groupModel
        .find({ tenantId: tId })
        .sort({ order: 1, createdAt: 1 })
        .lean(),
      this.contactModel.find({ tenantId: tId }).sort({ createdAt: 1 }).lean(),
    ]);
    return { groups, contacts };
  }

  async getPlan(tenantId: string, incidentId: string, user: CommsUser) {
    await this.ensureSeeded(tenantId);
    const inc = await this.getIncident(tenantId, incidentId);
    const [{ groups }, msgs] = await Promise.all([
      this.groupsWithContacts(tenantId),
      this.messageModel
        .find({ tenantId: oid(tenantId), incidentId: inc._id })
        .select('-body')
        .lean(),
    ]);

    const required = groups.filter((g) => this.triggered(g, inc));
    const plan = required.map((g, i) => {
      const m: any = this.lead(msgs, g._id);
      return {
        order: i + 1,
        group: g,
        status: this.groupStatus(msgs, g),
        needsApproval: this.needsApproval(g, inc),
        deadlineAt: this.deadline(g, inc),
        lead: m
          ? {
              _id: m._id,
              status: m.status,
              createdAt: m.createdAt,
              submittedAt: m.submittedAt,
              sentAt: m.sentAt,
              createdBy: m.createdBy,
              confirm: m.confirm,
            }
          : null,
      };
    });
    const notTriggered = groups
      .filter((g) => !this.triggered(g, inc))
      .map((g) => ({
        group: g,
        needsApproval: this.needsApproval(g, inc),
        triggerText: this.triggerText(g),
      }));

    const due = plan.filter((p) => !p.group.reactive).length;
    const sent = plan.filter(
      (p) => !p.group.reactive && ['sent', 'confirmed'].includes(p.status),
    ).length;

    return {
      incident: { ...inc, level: levelOf(inc.severity) },
      plan,
      notTriggered,
      summary: { required: due, sent, messages: msgs.length },
      canApprove: this.isApprover(user),
      serverTime: new Date(),
    };
  }

  // ── Groups & contacts ────────────────────────────────────────

  async listGroups(tenantId: string) {
    await this.ensureSeeded(tenantId);
    const { groups, contacts } = await this.groupsWithContacts(tenantId);
    const clientCount = groups.some(
      (g) => g.source === CommsGroupSource.CRM_CLIENTS,
    )
      ? await this.userModel.countDocuments({
          tenantId: oid(tenantId),
          userType: UserType.CLIENT,
          email: { $exists: true, $ne: '' },
        })
      : 0;
    return groups.map((g) => ({
      ...g,
      triggerText: this.triggerText(g),
      contacts: contacts.filter((c) => String(c.groupId) === String(g._id)),
      clientCount:
        g.source === CommsGroupSource.CRM_CLIENTS ? clientCount : undefined,
    }));
  }

  private async findGroup(tenantId: string, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Stakeholder group not found');
    const g = await this.groupModel.findOne({
      _id: id,
      tenantId: oid(tenantId),
    });
    if (!g) throw new NotFoundException('Stakeholder group not found');
    return g;
  }

  private cleanTrigger(t?: CreateCommsGroupDto['trigger']) {
    return {
      minLevel: t?.minLevel ?? null,
      types: t?.types ?? [],
      flags: t?.flags ?? [],
    };
  }

  private checkSla(dto: { reactive?: boolean; slaHours?: number | null }) {
    if (!dto.reactive && !(dto.slaHours && dto.slaHours > 0)) {
      throw new BadRequestException(
        'Enter the number of hours, or mark the group as reactive',
      );
    }
  }

  async createGroup(tenantId: string, dto: CreateCommsGroupDto) {
    await this.ensureSeeded(tenantId);
    this.checkSla(dto);
    const owner = await this.employeeRef(tenantId, dto.ownerEmployeeId);
    const last = await this.groupModel
      .findOne({ tenantId: oid(tenantId) })
      .sort({ order: -1 })
      .select('order')
      .lean();
    return this.groupModel.create({
      tenantId: oid(tenantId),
      name: dto.name.trim(),
      icon: dto.icon || 'handshake',
      color: dto.color || '#3b36db',
      order: (last?.order ?? -1) + 1,
      slaHours: dto.reactive ? null : (dto.slaHours ?? null),
      reactive: !!dto.reactive,
      channel: dto.channel?.trim() || 'Email',
      statutory: dto.statutory?.trim() ?? '',
      ownerEmployeeId: owner.id,
      ownerName: owner.name,
      trigger: this.cleanTrigger(dto.trigger),
      approvalMinLevel: dto.approvalMinLevel ?? 1,
      source: dto.source ?? CommsGroupSource.CONTACTS,
      custom: true,
    });
  }

  async updateGroup(tenantId: string, id: string, dto: UpdateCommsGroupDto) {
    const g = await this.findGroup(tenantId, id);
    const reactive = dto.reactive ?? g.reactive;
    const slaHours = dto.slaHours === undefined ? g.slaHours : dto.slaHours;
    this.checkSla({ reactive, slaHours });

    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('Add a group name');
      g.name = dto.name.trim();
    }
    if (dto.icon !== undefined) g.icon = dto.icon;
    if (dto.color !== undefined) g.color = dto.color;
    if (dto.channel !== undefined) g.channel = dto.channel.trim() || 'Email';
    if (dto.statutory !== undefined) g.statutory = dto.statutory.trim();
    if (dto.ownerEmployeeId !== undefined) {
      const owner = await this.employeeRef(
        tenantId,
        dto.ownerEmployeeId || null,
      );
      g.ownerEmployeeId = owner.id;
      g.ownerName = owner.name;
    }
    if (dto.trigger !== undefined) g.trigger = this.cleanTrigger(dto.trigger);
    if (dto.approvalMinLevel !== undefined)
      g.approvalMinLevel = dto.approvalMinLevel;
    if (dto.source !== undefined) g.source = dto.source;
    g.reactive = reactive;
    g.slaHours = reactive ? null : slaHours;
    await g.save();

    // Keep the channel/name snapshot on notices that are not sent yet.
    await this.messageModel.updateMany(
      {
        tenantId: oid(tenantId),
        groupId: g._id,
        status: { $ne: CommsMessageStatus.SENT },
      },
      { groupName: g.name, channel: g.channel },
    );
    return g;
  }

  async reorderGroups(tenantId: string, ids: string[]) {
    const tId = oid(tenantId);
    const existing = await this.groupModel
      .find({ tenantId: tId })
      .select('_id')
      .lean();
    const have = new Set(existing.map((g) => String(g._id)));
    if (ids.length !== have.size || ids.some((i) => !have.has(i))) {
      throw new BadRequestException(
        'The list of groups is out of date. Refresh and try again.',
      );
    }
    await this.groupModel.bulkWrite(
      ids.map((id, i) => ({
        updateOne: {
          filter: { _id: oid(id), tenantId: tId },
          update: { order: i },
        },
      })),
    );
    return this.listGroups(tenantId);
  }

  async deleteGroup(tenantId: string, id: string) {
    const g = await this.findGroup(tenantId, id);
    const used = await this.messageModel.exists({
      tenantId: oid(tenantId),
      groupId: g._id,
    });
    if (used) {
      throw new BadRequestException(
        'This group has communications on record, so it cannot be deleted. Remove its conditions instead so it is no longer added to plans.',
      );
    }
    await this.contactModel.deleteMany({
      tenantId: oid(tenantId),
      groupId: g._id,
    });
    await this.templateModel.updateMany(
      { tenantId: oid(tenantId), groupId: g._id },
      { groupId: null },
    );
    await g.deleteOne();
    return { deleted: true };
  }

  async addContact(
    tenantId: string,
    groupId: string,
    dto: CreateCommsContactDto,
  ) {
    const g = await this.findGroup(tenantId, groupId);
    return this.contactModel.create({
      tenantId: oid(tenantId),
      groupId: g._id,
      name: dto.name.trim(),
      role: dto.role?.trim() ?? '',
      email: dto.email?.trim() ?? '',
      phone: dto.phone?.trim() ?? '',
    });
  }

  async updateContact(
    tenantId: string,
    id: string,
    dto: UpdateCommsContactDto,
  ) {
    const update: Record<string, string> = {};
    for (const k of ['name', 'role', 'email', 'phone'] as const) {
      if (dto[k] !== undefined) update[k] = dto[k]!.trim();
    }
    if ('name' in update && !update.name)
      throw new BadRequestException('Add a name');
    const c = await this.contactModel.findOneAndUpdate(
      { _id: id, tenantId: oid(tenantId) },
      update,
      { new: true },
    );
    if (!c) throw new NotFoundException('Contact not found');
    return c;
  }

  async deleteContact(tenantId: string, id: string) {
    const c = await this.contactModel.findOneAndDelete({
      _id: id,
      tenantId: oid(tenantId),
    });
    if (!c) throw new NotFoundException('Contact not found');
    return { deleted: true };
  }

  // The tenant's real clients, for choosing who an "affected clients"
  // notice goes to. Only clients with an email address can be emailed.
  async listClients(tenantId: string, search?: string) {
    const q: Record<string, unknown> = {
      tenantId: oid(tenantId),
      userType: UserType.CLIENT,
      email: { $exists: true, $ne: '' },
    };
    if (search?.trim()) {
      const rx = new RegExp(
        search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      q.$or = [
        { firstName: rx },
        { lastName: rx },
        { email: rx },
        { 'clientProfile.companyName': rx },
      ];
    }
    const users = await this.userModel
      .find(q)
      .select('firstName lastName email clientProfile.companyName')
      .sort({ firstName: 1 })
      .limit(1000)
      .lean();
    return users.map((u: any) => ({
      _id: String(u._id),
      name: this.clientName(u),
      email: u.email,
    }));
  }

  // ── Templates ────────────────────────────────────────────────

  async listTemplates(tenantId: string) {
    await this.ensureSeeded(tenantId);
    const [templates, groups] = await Promise.all([
      this.templateModel
        .find({ tenantId: oid(tenantId) })
        .sort({ createdAt: 1 })
        .lean(),
      this.groupModel
        .find({ tenantId: oid(tenantId) })
        .select('name')
        .lean(),
    ]);
    const names = new Map(groups.map((g) => [String(g._id), g.name]));
    return {
      templates: templates.map((t) => ({
        ...t,
        groupName: t.groupId ? (names.get(String(t.groupId)) ?? '') : '',
      })),
      mergeFields: MERGE_FIELDS.map(([key, label]) => ({ key, label })),
    };
  }

  private async templateGroupId(tenantId: string, id?: string | null) {
    if (!id || id === 'any') return null;
    const g = await this.findGroup(tenantId, id);
    return g._id as Types.ObjectId;
  }

  async createTemplate(tenantId: string, dto: CreateCommsTemplateDto) {
    await this.ensureSeeded(tenantId);
    return this.templateModel.create({
      tenantId: oid(tenantId),
      name: dto.name.trim(),
      groupId: await this.templateGroupId(tenantId, dto.groupId),
      description: dto.description?.trim() || 'Custom template',
      subject: dto.subject.trim(),
      body: dto.body.replace(/\s+$/, ''),
      custom: true,
      edited: true,
    });
  }

  async updateTemplate(
    tenantId: string,
    id: string,
    dto: UpdateCommsTemplateDto,
  ) {
    const t = await this.templateModel.findOne({
      _id: id,
      tenantId: oid(tenantId),
    });
    if (!t) throw new NotFoundException('Template not found');
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('Add a name');
      t.name = dto.name.trim();
    }
    if (dto.groupId !== undefined)
      t.groupId = await this.templateGroupId(tenantId, dto.groupId);
    if (dto.description !== undefined) t.description = dto.description.trim();
    if (dto.subject !== undefined) {
      if (!dto.subject.trim()) throw new BadRequestException('Add a subject');
      t.subject = dto.subject.trim();
    }
    if (dto.body !== undefined) {
      if (!dto.body.trim()) throw new BadRequestException('Add a message');
      t.body = dto.body.replace(/\s+$/, '');
    }
    t.edited = true;
    await t.save();
    return t;
  }

  async deleteTemplate(tenantId: string, id: string) {
    const t = await this.templateModel.findOneAndDelete({
      _id: id,
      tenantId: oid(tenantId),
    });
    if (!t) throw new NotFoundException('Template not found');
    return { deleted: true };
  }

  // ── Merge ────────────────────────────────────────────────────

  private incidentTitle(inc: any): string {
    return (
      inc.title?.trim() ||
      (inc.description?.length > 80
        ? `${inc.description.slice(0, 80)}...`
        : inc.description)
    );
  }

  private fill(text: string, inc: any, g: any, business: string): string {
    const lv = levelOf(inc.severity);
    const desc = String(inc.description ?? '')
      .trim()
      .replace(/\.+$/, '');
    const map: Record<string, string> = {
      incident_ref: inc.code,
      incident_title: this.incidentTitle(inc),
      declared_at: this.fmt(inc.declaredAt),
      impact_summary: desc.charAt(0).toUpperCase() + desc.slice(1) + '.',
      impact_summary_short: `an incident affecting ${this.incidentTitle(inc).toLowerCase()}`,
      next_update: inc.nextUpdateAt
        ? this.fmt(inc.nextUpdateAt)
        : '[next update time]',
      company: business,
      spokesperson: inc.spokespersonName || '[spokesperson]',
      level: `Level ${lv}, ${LEVEL_LABELS[lv]?.label ?? ''}`,
      // Client notices are personalised per client when sent, so the
      // field stays as it is until then.
      client_name:
        g?.source === CommsGroupSource.CRM_CLIENTS
          ? '{{client_name}}'
          : '[recipient]',
    };
    return text.replace(/\{\{(\w+)\}\}/g, (a, k) => map[k] ?? a);
  }

  private defaultRecipients(g: any, contacts: any[], clients: any[]) {
    const refs = contacts
      .filter((c) => String(c.groupId) === String(g._id))
      .map((c) => ({ kind: CommsRecipientKind.CONTACT, refId: String(c._id) }));
    if (g.source === CommsGroupSource.CRM_CLIENTS) {
      for (const c of clients)
        refs.push({ kind: CommsRecipientKind.CLIENT, refId: c._id });
    }
    return refs;
  }

  // Wording for a new notice: the chosen template (or the best default
  // for the group), merged with the incident record. Nothing is saved.
  async compose(tenantId: string, incidentId: string, dto: ComposeCommsDto) {
    await this.ensureSeeded(tenantId);
    const inc = await this.getIncident(tenantId, incidentId);
    const g: any = (await this.findGroup(tenantId, dto.groupId)).toObject();
    const kind = dto.kind ?? CommsMessageKind.INITIAL;
    const tId = oid(tenantId);

    let tpl: any = null;
    if (dto.templateId) {
      tpl = await this.templateModel
        .findOne({ _id: dto.templateId, tenantId: tId })
        .lean();
    } else if (kind === CommsMessageKind.UPDATE) {
      tpl = await this.templateModel
        .findOne({ tenantId: tId, key: 'progress-update' })
        .lean();
    } else {
      const own: any[] = await this.templateModel
        .find({ tenantId: tId, groupId: g._id })
        .sort({ createdAt: 1 })
        .lean();
      // A data breach starts from the breach wording; any other
      // incident skips the breach notice to clients.
      const breach = inc.type === 'Data breach';
      tpl =
        own.find((t) =>
          breach ? /^breach/.test(t.key) : t.key !== 'breach-clients',
        ) ??
        own[0] ??
        (await this.templateModel
          .findOne({ tenantId: tId, groupId: null })
          .lean());
    }

    const [{ contacts }, clients, business] = await Promise.all([
      this.groupsWithContacts(tenantId),
      g.source === CommsGroupSource.CRM_CLIENTS
        ? this.listClients(tenantId)
        : Promise.resolve([] as any[]),
      resolveBusinessName(this.userModel, tenantId),
    ]);

    return {
      templateId: tpl ? String(tpl._id) : '',
      subject: tpl ? this.fill(tpl.subject, inc, g, business) : '',
      body: tpl ? this.fill(tpl.body, inc, g, business) : '',
      channel: g.channel,
      recipients: this.defaultRecipients(g, contacts, clients),
    };
  }

  // ── Messages ─────────────────────────────────────────────────

  async listMessages(tenantId: string, incidentId: string) {
    const inc = await this.getIncident(tenantId, incidentId);
    const msgs = await this.messageModel
      .find({ tenantId: oid(tenantId), incidentId: inc._id })
      .sort({ createdAt: -1 })
      .lean();
    return msgs;
  }

  async getMessage(tenantId: string, incidentId: string, id: string) {
    const m = await this.messageModel
      .findOne({
        _id: id,
        incidentId: oid(incidentId),
        tenantId: oid(tenantId),
      })
      .lean();
    if (!m) throw new NotFoundException('Communication not found');
    return m;
  }

  private async resolveRecipients(
    tenantId: string,
    g: any,
    refs: SaveCommsMessageDto['recipients'],
  ) {
    const tId = oid(tenantId);
    const out: any[] = [];
    const seen = new Set<string>();
    const contactIds: Types.ObjectId[] = [];
    const clientIds: Types.ObjectId[] = [];
    for (const r of refs) {
      if (!Types.ObjectId.isValid(r.refId)) continue;
      const key = `${r.kind}:${r.refId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      (r.kind === CommsRecipientKind.CLIENT ? clientIds : contactIds).push(
        oid(r.refId),
      );
    }
    if (clientIds.length && g.source !== CommsGroupSource.CRM_CLIENTS) {
      throw new BadRequestException(
        'Client records can only be chosen for a group that draws on clients.',
      );
    }
    if (contactIds.length) {
      const cs = await this.contactModel
        .find({ _id: { $in: contactIds }, tenantId: tId, groupId: g._id })
        .lean();
      for (const c of cs)
        out.push({
          kind: CommsRecipientKind.CONTACT,
          refId: c._id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          role: c.role,
        });
    }
    if (clientIds.length) {
      const us = await this.userModel
        .find({
          _id: { $in: clientIds },
          tenantId: tId,
          userType: UserType.CLIENT,
        })
        .select('firstName lastName email clientProfile.companyName')
        .lean();
      for (const u of us as any[])
        out.push({
          kind: CommsRecipientKind.CLIENT,
          refId: u._id,
          name: this.clientName(u),
          email: u.email,
          phone: '',
          role: 'Client',
        });
    }
    return out;
  }

  async saveMessage(
    tenantId: string,
    user: CommsUser,
    incidentId: string,
    dto: SaveCommsMessageDto,
    messageId?: string,
  ) {
    const inc = await this.getIncident(tenantId, incidentId);
    this.assertActive(inc);
    const g: any = (await this.findGroup(tenantId, dto.groupId)).toObject();
    const tId = oid(tenantId);

    if (!dto.subject.trim() || !dto.body.trim()) {
      throw new BadRequestException('Add a subject and message first');
    }
    const completing = dto.action === 'send' || dto.action === 'hold';
    if (
      completing &&
      (BRACKET_RE.test(dto.body) || BRACKET_RE.test(dto.subject))
    ) {
      throw new BadRequestException(
        'Complete the text in square brackets before approving',
      );
    }

    let msg: CommsMessageDocument | null = null;
    if (messageId) {
      msg = await this.messageModel.findOne({
        _id: messageId,
        incidentId: inc._id,
        tenantId: tId,
      });
      if (!msg) throw new NotFoundException('Communication not found');
      if (msg.status === CommsMessageStatus.SENT) {
        throw new BadRequestException('This notice has already been sent');
      }
    }

    const needs = this.needsApproval(g, inc);
    const approver = this.isApprover(user);
    if (dto.action === 'submit' && !needs) {
      throw new BadRequestException(
        'This notice does not need approval. Send it directly.',
      );
    }
    if (dto.action === 'hold') {
      if (!g.reactive)
        throw new BadRequestException(
          'Only a reactive statement can be held on standby',
        );
      if (needs && !approver)
        throw new ForbiddenException(
          'Only an approver can approve a statement',
        );
    }
    if (dto.action === 'send' && needs && !approver) {
      throw new ForbiddenException(
        'This notice must be approved before it is sent. Submit it for approval.',
      );
    }

    const recipients = await this.resolveRecipients(
      tenantId,
      g,
      dto.recipients,
    );
    if (dto.action === 'send' && !recipients.length) {
      throw new BadRequestException('Choose at least one recipient');
    }

    const kind = dto.kind ?? msg?.kind ?? CommsMessageKind.INITIAL;
    const templateId =
      dto.templateId && Types.ObjectId.isValid(dto.templateId)
        ? oid(dto.templateId)
        : null;
    const me = await this.actor(user.sub);
    const now = new Date();

    const fields: Record<string, unknown> = {
      groupId: g._id,
      groupName: g.name,
      channel: g.channel,
      kind,
      templateId,
      subject: dto.subject.trim(),
      body: dto.body.replace(/\s+$/, ''),
      recipients,
      returnedNote: '',
    };

    if (dto.action === 'draft') {
      fields.status = CommsMessageStatus.DRAFT;
      fields.approvedBy = null;
      fields.approvedAt = null;
    } else if (dto.action === 'submit') {
      fields.status = CommsMessageStatus.PENDING;
      fields.submittedAt = now;
      fields.approvedBy = null;
      fields.approvedAt = null;
    } else if (dto.action === 'hold') {
      fields.status = CommsMessageStatus.READY;
      fields.approvedBy = me;
      fields.approvedAt = now;
    } else {
      // Saved first so the wording is never lost if delivery fails.
      fields.status =
        msg?.status === CommsMessageStatus.PENDING
          ? CommsMessageStatus.PENDING
          : CommsMessageStatus.DRAFT;
      if (needs) {
        fields.approvedBy = me;
        fields.approvedAt = now;
      }
    }

    if (msg) {
      msg.set(fields);
      await msg.save();
    } else {
      msg = await this.messageModel.create({
        ...fields,
        tenantId: tId,
        incidentId: inc._id,
        createdBy: me,
      });
    }

    if (dto.action === 'send') {
      return this.deliver(tenantId, msg, inc);
    }
    return msg;
  }

  // Emails every recipient that has an address, in small batches, and
  // records what happened to each. A recipient whose "address" is a
  // route (a regulator portal, a letter) is marked manual: Lexora logs
  // the notice as issued, but the firm delivers it through that route.
  private async deliver(
    tenantId: string,
    msg: CommsMessageDocument,
    inc: any,
    onlyFailed = false,
  ) {
    const business = await resolveBusinessName(this.userModel, tenantId);
    const targets = msg.recipients.filter((r) =>
      onlyFailed ? r.delivery === CommsDelivery.FAILED : true,
    );

    const one = async (r: (typeof msg.recipients)[number]) => {
      if (!EMAIL_RE.test(r.email ?? '')) {
        r.delivery = CommsDelivery.MANUAL;
        r.error = '';
        return;
      }
      const personalise = (s: string) =>
        s.replace(/\{\{client_name\}\}/g, r.name);
      try {
        await this.emailService.sendBcpStakeholderNotice({
          to: r.email,
          businessName: business,
          subject: personalise(msg.subject),
          body: personalise(msg.body),
          incidentRef: inc.code,
          spokesperson: inc.spokespersonName || '',
        });
        r.delivery = CommsDelivery.EMAILED;
        r.error = '';
        r.deliveredAt = new Date();
      } catch (err: any) {
        r.delivery = CommsDelivery.FAILED;
        r.error = String(err?.message ?? 'Delivery failed').slice(0, 300);
        this.logger.error(
          `Stakeholder notice ${msg._id} to ${r.email} failed: ${r.error}`,
        );
      }
    };
    for (let i = 0; i < targets.length; i += SEND_CHUNK) {
      await Promise.all(targets.slice(i, i + SEND_CHUNK).map(one));
    }

    const emailed = msg.recipients.filter(
      (r) => r.delivery === CommsDelivery.EMAILED,
    ).length;
    const manual = msg.recipients.filter(
      (r) => r.delivery === CommsDelivery.MANUAL,
    ).length;
    const failed = msg.recipients.filter(
      (r) => r.delivery === CommsDelivery.FAILED,
    ).length;

    msg.markModified('recipients');
    if (emailed + manual === 0 && failed > 0) {
      // Nothing reached anyone: keep it unsent so it can be retried.
      await msg.save();
      throw new BadGatewayException(
        'The notice could not be emailed to any recipient. It has been kept so you can try again.',
      );
    }
    if (!onlyFailed) {
      msg.status = CommsMessageStatus.SENT;
      msg.sentAt = new Date();
    }
    await msg.save();
    return msg;
  }

  // Issue a held statement (approved earlier, released on request).
  async issue(tenantId: string, incidentId: string, id: string) {
    const inc = await this.getIncident(tenantId, incidentId);
    this.assertActive(inc);
    const msg = await this.messageModel.findOne({
      _id: id,
      incidentId: inc._id,
      tenantId: oid(tenantId),
    });
    if (!msg) throw new NotFoundException('Communication not found');
    if (msg.status !== CommsMessageStatus.READY) {
      throw new BadRequestException(
        'Only an approved, held statement can be issued',
      );
    }
    return this.deliver(tenantId, msg, inc);
  }

  async resendFailed(tenantId: string, incidentId: string, id: string) {
    const inc = await this.getIncident(tenantId, incidentId);
    const msg = await this.messageModel.findOne({
      _id: id,
      incidentId: inc._id,
      tenantId: oid(tenantId),
    });
    if (!msg) throw new NotFoundException('Communication not found');
    if (msg.status !== CommsMessageStatus.SENT) {
      throw new BadRequestException('This notice has not been sent');
    }
    if (!msg.recipients.some((r) => r.delivery === CommsDelivery.FAILED)) {
      throw new BadRequestException('Nothing to retry');
    }
    return this.deliver(tenantId, msg, inc, true);
  }

  async returnMessage(
    tenantId: string,
    user: CommsUser,
    incidentId: string,
    id: string,
    dto: ReturnCommsMessageDto,
  ) {
    const inc = await this.getIncident(tenantId, incidentId);
    this.assertActive(inc);
    if (!this.isApprover(user)) {
      throw new ForbiddenException('Only an approver can return a notice');
    }
    const msg = await this.messageModel.findOne({
      _id: id,
      incidentId: inc._id,
      tenantId: oid(tenantId),
    });
    if (!msg) throw new NotFoundException('Communication not found');
    if (msg.status !== CommsMessageStatus.PENDING) {
      throw new BadRequestException(
        'Only a notice awaiting approval can be returned',
      );
    }
    if (dto.subject?.trim()) msg.subject = dto.subject.trim();
    if (dto.body?.trim()) msg.body = dto.body.replace(/\s+$/, '');
    msg.status = CommsMessageStatus.DRAFT;
    msg.returnedNote = dto.comment.trim();
    msg.approvedBy = null;
    msg.approvedAt = null;
    await msg.save();
    return msg;
  }

  async deleteMessage(tenantId: string, incidentId: string, id: string) {
    const inc = await this.getIncident(tenantId, incidentId);
    this.assertActive(inc);
    const msg = await this.messageModel.findOne({
      _id: id,
      incidentId: inc._id,
      tenantId: oid(tenantId),
    });
    if (!msg) throw new NotFoundException('Communication not found');
    if (msg.status === CommsMessageStatus.SENT) {
      throw new BadRequestException(
        'A sent notice is part of the record and cannot be discarded.',
      );
    }
    await msg.deleteOne();
    return { deleted: true };
  }

  async logReceipt(
    tenantId: string,
    user: CommsUser,
    incidentId: string,
    id: string,
    dto: LogCommsReceiptDto,
  ) {
    const inc = await this.getIncident(tenantId, incidentId);
    const msg = await this.messageModel.findOne({
      _id: id,
      incidentId: inc._id,
      tenantId: oid(tenantId),
    });
    if (!msg) throw new NotFoundException('Communication not found');
    if (msg.status !== CommsMessageStatus.SENT) {
      throw new BadRequestException(
        'Only a sent notice can have a receipt logged',
      );
    }
    const at = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    if (msg.sentAt && at.getTime() < new Date(msg.sentAt).getTime() - 60_000) {
      throw new BadRequestException(
        'The receipt cannot be earlier than the time it was sent',
      );
    }
    msg.confirm = {
      at,
      ref: dto.reference?.trim() ?? '',
      note: dto.note?.trim() ?? '',
      loggedBy: await this.actor(user.sub),
    } as any;
    await msg.save();
    return msg;
  }

  // ── Record & post-incident review ────────────────────────────

  private recordText(inc: any, groups: any[], msgs: any[]): string {
    const lines = groups
      .filter((g) => this.triggered(g, inc))
      .map((g) => {
        const m: any = this.lead(msgs, g._id);
        const dl = this.deadline(g, inc);
        const st = this.groupStatus(msgs, g);
        const label =
          {
            none: 'Not started',
            draft: 'Drafted',
            pending: 'Awaiting approval',
            ready: 'Approved, on standby',
            sent: 'Sent',
            confirmed: 'Receipt confirmed',
            standby: 'On standby',
          }[st] ?? st;
        return `${g.name}: ${label}${m?.sentAt ? `, sent ${this.fmt(m.sentAt)}` : ''}${
          dl && m?.sentAt
            ? new Date(m.sentAt) <= dl
              ? ' (on time)'
              : ' (late)'
            : ''
        }${m?.confirm ? `, receipt ${this.fmt(m.confirm.at)}` : ''}`;
      });
    const updates = msgs
      .filter((m) => m.kind === CommsMessageKind.UPDATE && m.sentAt)
      .map((m) => `Update to ${m.groupName}, sent ${this.fmt(m.sentAt)}`);
    return [...lines, ...updates].join('\n');
  }

  async getRecord(tenantId: string, incidentId: string) {
    await this.ensureSeeded(tenantId);
    const inc: any = await this.getIncident(tenantId, incidentId);
    const [{ groups }, msgs, business, review] = await Promise.all([
      this.groupsWithContacts(tenantId),
      this.messageModel
        .find({ tenantId: oid(tenantId), incidentId: inc._id })
        .lean(),
      resolveBusinessName(this.userModel, tenantId),
      this.templateModel
        .findOne({ tenantId: oid(tenantId), key: 'post-incident-review' })
        .lean(),
    ]);
    const lv = levelOf(inc.severity);
    const record = `${inc.code}: ${this.incidentTitle(inc)}\nLevel ${lv}${inc.type ? `, ${inc.type}` : ''}\nDeclared ${this.fmt(inc.declaredAt)}${
      inc.resolvedAt ? `\nClosed ${this.fmt(inc.resolvedAt)}` : ''
    }\n\n${this.recordText(inc, groups, msgs)}`;

    let reviewBody = '';
    if (review) {
      reviewBody = this.fill(review.body, inc, null, business).replace(
        '[date and time]',
        inc.resolvedAt ? this.fmt(inc.resolvedAt) : '[date and time]',
      );
      if (inc.closureNote) reviewBody += `\n\nResolution: ${inc.closureNote}`;
      reviewBody += `\n\nStakeholder communications record:\n${this.recordText(inc, groups, msgs)}`;
    }
    return { record, review: reviewBody };
  }

  // ── Alerts ───────────────────────────────────────────────────

  // Who should be told about a stakeholder deadline: the account owner
  // plus the group owner when they have a portal login.
  private async alertRecipients(tenantId: string, ownerEmployeeId?: any) {
    const ids = new Set<string>([tenantId]);
    if (ownerEmployeeId) {
      const emp = await this.employeeModel
        .findById(ownerEmployeeId)
        .select('userId')
        .lean();
      if (emp?.userId) ids.add(String(emp.userId));
    }
    return [...ids];
  }

  private emitAlert(
    tenantId: string,
    userIds: string[],
    incidentId: string,
    title: string,
    description: string,
  ) {
    this.eventEmitter.emit('grc.bcp.comms_alert', {
      tenantId,
      userIds,
      title,
      description,
      link: `/grc/risk/bcp?tab=comms&incident=${incidentId}`,
    });
  }

  @OnEvent('grc.bcp.incident_declared')
  async onIncidentDeclared(e: { tenantId: string; incidentId: string }) {
    try {
      await this.ensureSeeded(e.tenantId);
      const inc: any = await this.getIncident(e.tenantId, e.incidentId);
      const { groups } = await this.groupsWithContacts(e.tenantId);
      const req = groups.filter((g) => this.triggered(g, inc) && !g.reactive);
      if (!req.length) return;
      const first = req
        .filter((g) => g.slaHours)
        .sort((a, b) => (a.slaHours ?? 0) - (b.slaHours ?? 0))[0];
      this.emitAlert(
        e.tenantId,
        [e.tenantId],
        e.incidentId,
        `${inc.code}: ${req.length} stakeholder group${req.length === 1 ? '' : 's'} to notify`,
        `${req.map((g) => g.name).join(', ')}.${
          first
            ? ` First deadline: ${first.name}, within ${first.slaHours}h.`
            : ''
        }`,
      );
    } catch (err: any) {
      this.logger.error(`Declared-incident alert failed: ${err?.message}`);
    }
  }

  // The level or classification changed: tell the owner when that
  // brings extra stakeholder groups into the plan.
  @OnEvent('grc.bcp.incident_updated')
  async onIncidentUpdated(e: {
    tenantId: string;
    incidentId: string;
    before: {
      severity: string;
      type: string;
      clientImpact: boolean;
      mediaInterest: boolean;
    };
  }) {
    try {
      await this.ensureSeeded(e.tenantId);
      const inc: any = await this.getIncident(e.tenantId, e.incidentId);
      const { groups } = await this.groupsWithContacts(e.tenantId);
      const added = groups.filter(
        (g) => this.triggered(g, inc) && !this.triggered(g, e.before),
      );
      if (!added.length) return;
      this.emitAlert(
        e.tenantId,
        [e.tenantId],
        e.incidentId,
        `${inc.code}: plan updated`,
        `${added.map((g) => g.name).join(', ')} must now be notified.`,
      );
    } catch (err: any) {
      this.logger.error(`Updated-incident alert failed: ${err?.message}`);
    }
  }

  // Every ten minutes: warn as a stakeholder deadline gets close (last
  // quarter of the window) and again when it is missed, and when a
  // promised update time passes without an update. Each alert is raised
  // once per incident.
  @Cron('*/10 * * * *')
  async checkDeadlines() {
    const active = await this.incidentModel
      .find({ status: BcpIncidentStatus.ACTIVE })
      .lean();
    for (const inc of active as any[]) {
      try {
        const tenantId = String(inc.tenantId);
        const { groups } = await this.groupsWithContacts(tenantId);
        if (!groups.length) continue; // never opened Stakeholder Communications
        const msgs = await this.messageModel
          .find({ tenantId: inc.tenantId, incidentId: inc._id })
          .select('groupId kind status sentAt')
          .lean();
        const raised = new Set<string>(inc.commsAlerts ?? []);
        const fresh: string[] = [];

        for (const g of groups) {
          if (!this.triggered(g, inc) || g.reactive || !g.slaHours) continue;
          const m: any = this.lead(msgs, g._id);
          if (m?.status === CommsMessageStatus.SENT) continue;
          const left =
            new Date(inc.declaredAt).getTime() + g.slaHours * HOUR - Date.now();
          const owners = await this.alertRecipients(
            tenantId,
            g.ownerEmployeeId,
          );
          if (left < 0 && !raised.has(`${g._id}:overdue`)) {
            fresh.push(`${g._id}:overdue`);
            this.emitAlert(
              tenantId,
              owners,
              String(inc._id),
              `Overdue: ${g.name} not yet notified`,
              `${inc.code}: the ${g.slaHours}h window has passed.`,
            );
          } else if (
            left >= 0 &&
            left < g.slaHours * HOUR * 0.25 &&
            !raised.has(`${g._id}:warning`)
          ) {
            fresh.push(`${g._id}:warning`);
            this.emitAlert(
              tenantId,
              owners,
              String(inc._id),
              `Due soon: ${g.name}`,
              `${inc.code}: about ${Math.max(1, Math.round(left / 60_000))} minutes left to notify.`,
            );
          }
        }

        if (
          inc.nextUpdateAt &&
          new Date(inc.nextUpdateAt).getTime() < Date.now()
        ) {
          const key = `update:${new Date(inc.nextUpdateAt).getTime()}`;
          const sentSince = msgs.some(
            (m: any) =>
              m.status === CommsMessageStatus.SENT &&
              m.sentAt &&
              new Date(m.sentAt) >= new Date(inc.declaredAt) &&
              new Date(m.sentAt).getTime() >=
                new Date(inc.nextUpdateAt).getTime() - 6 * HOUR,
          );
          if (!sentSince && !raised.has(key)) {
            fresh.push(key);
            this.emitAlert(
              tenantId,
              [tenantId],
              String(inc._id),
              `Stakeholder update overdue`,
              `${inc.code}: the promised update time has passed.`,
            );
          }
        }

        if (fresh.length) {
          await this.incidentModel.updateOne(
            { _id: inc._id },
            { $addToSet: { commsAlerts: { $each: fresh } } },
          );
        }
      } catch (err: any) {
        this.logger.error(
          `Deadline check failed for ${inc._id}: ${err?.message}`,
        );
      }
    }
  }
}
