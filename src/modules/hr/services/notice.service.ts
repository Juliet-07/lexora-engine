import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import { createHash } from 'crypto';
import {
  Employee,
  EmployeeDocument,
  EmploymentStatus,
  EmploymentType,
  HrLocation,
  HrLocationDocument,
  HrTeam,
  HrTeamDocument,
  NOTICE_CATEGORIES,
  Notice,
  NoticeActivity,
  NoticeActivityDocument,
  NoticeAckMethod,
  NoticeAudience,
  NoticeAudienceType,
  NoticeChannel,
  NoticeDocument,
  NoticeGroup,
  NoticeGroupDocument,
  NoticePriority,
  NoticeRecipient,
  NoticeRecipientDocument,
  NoticeReminderCadence,
  NoticeSettings,
  NoticeSettingsDocument,
  NoticeStatus,
  NoticeTemplate,
  NoticeTemplateDocument,
} from '../schemas';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import { EmailService } from '../../../common/utils/mailing/email.service';
import { resolveBusinessName } from '../../../common/utils/resolve-business-name.util';
import {
  AudiencePreviewDto,
  NoticeAudienceDto,
  PublishNoticeDto,
  RecordOfflineAckDto,
  ReplyQuestionDto,
  SaveNoticeDto,
  SaveNoticeGroupDto,
  SaveNoticeTemplateDto,
  UpdateNoticeSettingsDto,
} from '../dtos';
import {
  BUILT_IN_NOTICE_TEMPLATES,
  DEFAULT_NOTICE_SETTINGS,
  NEW_JOINER_DAYS,
} from './notice.constants';

const DAY = 86_400_000;

// Staff who can be sent a notice. Suspended, resigned and terminated
// people are deliberately outside every audience.
const REACHABLE_STATUSES = [
  EmploymentStatus.ACTIVE,
  EmploymentStatus.ON_LEAVE,
  EmploymentStatus.PROBATION,
];

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  [EmploymentType.FULL_TIME]: 'Full-time',
  [EmploymentType.PART_TIME]: 'Part-time',
  [EmploymentType.CONTRACT]: 'Contract',
  [EmploymentType.INTERN]: 'Intern',
  [EmploymentType.CONSULTANT]: 'Consultant',
};

export type RecipientStatus =
  | 'acknowledged'
  | 'overdue'
  | 'pending'
  | 'read'
  | 'unread';

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const oid = (v: string | Types.ObjectId) => new Types.ObjectId(String(v));
const stripHtml = (h: string) =>
  String(h ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const fmtDate = (d: Date | string | null) => {
  if (!d) return '';
  const x = new Date(d);
  return x.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};
const csvCell = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const toCsv = (rows: any[][]) =>
  rows.map((r) => r.map(csvCell).join(',')).join('\n');

export interface EmployeeBrief {
  id: string;
  employeeNumber: string;
  name: string;
  firstName: string;
  email: string;
  role: string;
  dept: string;
  deptId: string | null;
  location: string;
  locationId: string | null;
  employmentType: string;
  managerId: string | null;
  startDate: Date | null;
  userId: string | null;
}

@Injectable()
export class NoticeService {
  private readonly logger = new Logger(NoticeService.name);

  constructor(
    @InjectModel(Notice.name) readonly noticeModel: Model<NoticeDocument>,
    @InjectModel(NoticeRecipient.name)
    readonly recipientModel: Model<NoticeRecipientDocument>,
    @InjectModel(NoticeActivity.name)
    private readonly activityModel: Model<NoticeActivityDocument>,
    @InjectModel(NoticeGroup.name)
    private readonly groupModel: Model<NoticeGroupDocument>,
    @InjectModel(NoticeTemplate.name)
    private readonly templateModel: Model<NoticeTemplateDocument>,
    @InjectModel(NoticeSettings.name)
    private readonly settingsModel: Model<NoticeSettingsDocument>,
    @InjectModel(Employee.name)
    readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(HrTeam.name) private readonly teamModel: Model<HrTeamDocument>,
    @InjectModel(HrLocation.name)
    private readonly locationModel: Model<HrLocationDocument>,
    @InjectModel(User.name) readonly userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // Shared helpers
  // ═══════════════════════════════════════════════════════════

  async actorName(userId: string): Promise<string> {
    const u: any = await this.userModel
      .findById(userId)
      .select('firstName lastName tenantProfile.businessName')
      .lean();
    if (!u) return 'HR';
    const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
    return name || u.tenantProfile?.businessName || 'HR';
  }

  async log(
    tenantId: string,
    noticeId: Types.ObjectId | string,
    act: string,
    text: string,
    actorName = 'Lexora',
    system = false,
  ) {
    await this.activityModel.create({
      tenantId: oid(tenantId),
      noticeId: oid(noticeId),
      act,
      text,
      actorName,
      system,
      at: new Date(),
    });
  }

  async getSettings(tenantId: string) {
    let s: any = await this.settingsModel
      .findOne({ tenantId: oid(tenantId) })
      .lean();
    if (!s) {
      const business = await resolveBusinessName(this.userModel, tenantId);
      try {
        const created = await this.settingsModel.create({
          tenantId: oid(tenantId),
          ...DEFAULT_NOTICE_SETTINGS,
          senderName: business,
        });
        s = created.toObject();
      } catch {
        // Lost a creation race with another request — read theirs.
        s = await this.settingsModel
          .findOne({ tenantId: oid(tenantId) })
          .lean();
      }
    }
    return {
      senderName: s.senderName,
      emailChannel: s.emailChannel !== false,
      reminders: s.reminders,
      escalateAfter: s.escalateAfter,
      quietFrom: s.quietFrom,
      quietTo: s.quietTo,
      reAck: s.reAck !== false,
      retention: s.retention,
      footer: s.footer ?? '',
      questions: s.questions !== false,
      readReceipts: s.readReceipts !== false,
    };
  }

  async updateSettings(tenantId: string, dto: UpdateNoticeSettingsDto) {
    await this.getSettings(tenantId);
    const patch: any = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined) patch[k] = v;
    }
    await this.settingsModel.updateOne(
      { tenantId: oid(tenantId) },
      { $set: patch },
    );
    return this.getSettings(tenantId);
  }

  private async directory(tenantId: string) {
    const [teams, locations] = await Promise.all([
      this.teamModel
        .find({ tenantId: oid(tenantId) })
        .select('name')
        .lean(),
      this.locationModel
        .find({ tenantId: oid(tenantId) })
        .select('name')
        .lean(),
    ]);
    return {
      teams: new Map<string, string>(
        teams.map((t: any) => [String(t._id), t.name]),
      ),
      locations: new Map<string, string>(
        locations.map((l: any) => [String(l._id), l.name]),
      ),
    };
  }

  private brief(
    e: any,
    dir: { teams: Map<string, string>; locations: Map<string, string> },
  ): EmployeeBrief {
    return {
      id: String(e._id),
      employeeNumber: e.employeeNumber ?? '',
      name: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim(),
      firstName: e.firstName ?? '',
      email: e.email ?? '',
      role: e.jobTitle ?? '',
      dept: e.teamId ? (dir.teams.get(String(e.teamId)) ?? '') : '',
      deptId: e.teamId ? String(e.teamId) : null,
      location: e.locationId
        ? (dir.locations.get(String(e.locationId)) ?? '')
        : '',
      locationId: e.locationId ? String(e.locationId) : null,
      employmentType: e.employmentType ?? '',
      managerId: e.reportsToManagerId ? String(e.reportsToManagerId) : null,
      startDate: e.startDate ?? null,
      userId: e.userId ? String(e.userId) : null,
    };
  }

  /** Everyone an audience rule currently matches. */
  async resolveAudience(
    tenantId: string,
    audience: { type: string; values?: string[] } | null | undefined,
    depth = 0,
  ): Promise<any[]> {
    if (!audience) return [];
    const base: any = {
      tenantId: oid(tenantId),
      employmentStatus: { $in: REACHABLE_STATUSES },
    };
    const values = audience.values ?? [];
    const validIds = (xs: string[]) =>
      xs.filter((x) => Types.ObjectId.isValid(x)).map(oid);

    switch (audience.type) {
      case NoticeAudienceType.ALL:
        break;
      case NoticeAudienceType.DEPARTMENTS:
        if (!values.length) return [];
        base.teamId = { $in: validIds(values) };
        break;
      case NoticeAudienceType.LOCATIONS:
        if (!values.length) return [];
        base.locationId = { $in: validIds(values) };
        break;
      case NoticeAudienceType.TYPES:
        if (!values.length) return [];
        base.employmentType = { $in: values };
        break;
      case NoticeAudienceType.INDIVIDUALS:
        if (!values.length) return [];
        base._id = { $in: validIds(values) };
        break;
      case NoticeAudienceType.NEW_JOINERS:
        base.startDate = { $gte: new Date(Date.now() - NEW_JOINER_DAYS * DAY) };
        break;
      case NoticeAudienceType.GROUP: {
        // A group is a saved rule; groups cannot nest.
        if (depth > 0 || !values[0] || !Types.ObjectId.isValid(values[0])) {
          return [];
        }
        const g: any = await this.groupModel
          .findOne({ _id: oid(values[0]), tenantId: oid(tenantId) })
          .lean();
        if (!g) return [];
        return this.resolveAudience(tenantId, g.audience, depth + 1);
      }
      default:
        return [];
    }
    return this.employeeModel.find(base).lean();
  }

  private audienceLabel(
    a: { type: string; values?: string[] },
    dir: { teams: Map<string, string>; locations: Map<string, string> },
    groups: Map<string, string>,
  ): string {
    const v = a?.values ?? [];
    switch (a?.type) {
      case 'all':
        return 'Everyone';
      case 'departments': {
        const names = v.map((x) => dir.teams.get(x)).filter(Boolean);
        return names.length > 2
          ? `${names.length} departments`
          : names.join(', ');
      }
      case 'locations':
        return v
          .map((x) => dir.locations.get(x))
          .filter(Boolean)
          .join(', ');
      case 'types':
        return v.map((x) => EMPLOYMENT_TYPE_LABEL[x] ?? x).join(', ');
      case 'individuals':
        return `${v.length} selected ${v.length === 1 ? 'person' : 'people'}`;
      case 'group':
        return groups.get(v[0]) ?? 'Saved group';
      case 'newjoiners':
        return `New joiners (${NEW_JOINER_DAYS} days)`;
      default:
        return '';
    }
  }

  private async groupNames(tenantId: string) {
    const gs = await this.groupModel
      .find({ tenantId: oid(tenantId) })
      .select('name')
      .lean();
    return new Map<string, string>(gs.map((g: any) => [String(g._id), g.name]));
  }

  recipientStatus(n: any, r: any): RecipientStatus {
    if (r.ackAt) return 'acknowledged';
    if (n.requireAck && n.deadline && new Date(n.deadline) < new Date()) {
      return 'overdue';
    }
    if (r.openedAt) return n.requireAck ? 'pending' : 'read';
    return 'unread';
  }

  private async statsFor(notices: any[]) {
    const ids = notices.map((n) => n._id);
    // Three plain grouped counts rather than one $cond-heavy pipeline:
    // identical result, and it runs on any MongoDB-compatible server.
    const count = async (extra: Record<string, any>) => {
      if (!ids.length) return new Map<string, number>();
      const rows = await this.recipientModel.aggregate([
        { $match: { noticeId: { $in: ids }, ...extra } },
        { $group: { _id: '$noticeId', n: { $sum: 1 } } },
      ]);
      return new Map<string, number>(rows.map((r) => [String(r._id), r.n]));
    };
    const [totals, openedBy, ackedBy] = await Promise.all([
      count({}),
      count({ openedAt: { $ne: null } }),
      count({ ackAt: { $ne: null } }),
    ]);
    const byId = new Map<string, any>(
      ids.map((id) => [
        String(id),
        {
          total: totals.get(String(id)) ?? 0,
          opened: openedBy.get(String(id)) ?? 0,
          acked: ackedBy.get(String(id)) ?? 0,
        },
      ]),
    );
    const out = new Map<string, any>();
    const now = Date.now();
    for (const n of notices) {
      const r = byId.get(String(n._id)) ?? { total: 0, opened: 0, acked: 0 };
      const overdue =
        n.requireAck && n.deadline && new Date(n.deadline).getTime() < now
          ? r.total - r.acked
          : 0;
      out.set(String(n._id), {
        total: r.total,
        opened: r.opened,
        acknowledged: r.acked,
        overdue,
        outstanding: n.requireAck ? r.total - r.acked : 0,
        openRate: pct(r.opened, r.total),
        ackRate: pct(r.acked, r.total),
      });
    }
    return out;
  }

  private personalise(html: string, firstName: string) {
    return String(html ?? '').replace(/\{\{first_name\}\}/g, firstName || '');
  }

  // ═══════════════════════════════════════════════════════════
  // Sending (email + in-app)
  // ═══════════════════════════════════════════════════════════

  private appLink(path: string) {
    return `${process.env.TENANT_APP_URL || ''}${path}`;
  }

  noticeLink(noticeId: string) {
    return this.appLink(`/my/announcements?notice=${noticeId}`);
  }

  /**
   * Email (when the notice uses that channel) + a portal notification
   * to each employee. Never throws — delivery failures must not undo a
   * notice that has already been recorded as sent.
   */
  async notifyEmployees(
    tenantId: string,
    notice: any,
    employees: any[],
    kind: 'issued' | 'reminder' | 'overdue',
  ) {
    const settings = await this.getSettings(tenantId);
    const business = await resolveBusinessName(this.userModel, tenantId);
    const useEmail =
      (notice.channels ?? []).includes(NoticeChannel.EMAIL) &&
      settings.emailChannel;
    const batch = 10;
    for (let i = 0; i < employees.length; i += batch) {
      await Promise.allSettled(
        employees.slice(i, i + batch).map(async (e) => {
          if (e.userId) {
            this.eventEmitter.emit('hr.notice.employee', {
              tenantId,
              userId: String(e.userId),
              title:
                kind === 'issued'
                  ? `New notice: ${notice.title}`
                  : kind === 'overdue'
                    ? `Overdue: ${notice.title}`
                    : `Reminder: ${notice.title}`,
              description:
                notice.summary ||
                (notice.requireAck
                  ? 'Please read and acknowledge this notice.'
                  : 'A new notice has been published.'),
              link: `/my/announcements?notice=${notice._id}`,
            });
          }
          if (!useEmail || !e.email) return;
          await this.emailService.sendHrNotice({
            to: e.email,
            kind,
            recipientName: e.firstName,
            businessName: business,
            senderName: settings.senderName || business,
            noticeRef: notice.ref,
            title: notice.title,
            summary: notice.summary,
            category: notice.category,
            priority: notice.priority,
            requireAck: !!notice.requireAck,
            deadline: notice.deadline ? fmtDate(notice.deadline) : null,
            link: this.noticeLink(String(notice._id)),
            footer: settings.footer,
          });
        }),
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Compose → draft / schedule / send
  // ═══════════════════════════════════════════════════════════

  private async nextRef(tenantId: string): Promise<string> {
    const last: any = await this.noticeModel
      .findOne({ tenantId: oid(tenantId) })
      .sort({ ref: -1 })
      .select('ref')
      .lean();
    const n = last ? parseInt(String(last.ref).replace(/\D/g, ''), 10) || 0 : 0;
    return `NTC-${String(n + 1).padStart(4, '0')}`;
  }

  private cleanAudience(a?: NoticeAudienceDto | NoticeAudience): any {
    const type = a?.type ?? NoticeAudienceType.ALL;
    const needsValues = type !== 'all' && type !== 'newjoiners';
    return {
      type,
      values: needsValues ? [...new Set((a?.values ?? []).map(String))] : [],
    };
  }

  private toDate(v?: string | null): Date | null {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  private fieldsFromDto(dto: SaveNoticeDto) {
    const requireAck = !!dto.requireAck;
    const ackMethod = dto.ackMethod ?? NoticeAckMethod.CLICK;
    const channels = new Set<NoticeChannel>([
      NoticeChannel.INAPP,
      ...(dto.channels ?? []),
    ]);
    const category = (NOTICE_CATEGORIES as readonly string[]).includes(
      dto.category ?? '',
    )
      ? dto.category
      : 'General';
    const body = dto.body ?? '';
    return {
      title: dto.title.trim(),
      category,
      priority: dto.priority ?? NoticePriority.NORMAL,
      summary: (dto.summary ?? '').trim() || stripHtml(body).slice(0, 140),
      body,
      audience: this.cleanAudience(dto.audience),
      channels: [...channels],
      requireAck,
      ackMethod,
      quiz:
        requireAck && ackMethod === NoticeAckMethod.QUIZ && dto.quiz
          ? {
              q: dto.quiz.q.trim(),
              options: dto.quiz.options.map((o) => o.trim()),
              answer: dto.quiz.answer,
            }
          : null,
      deadline: requireAck ? this.toDate(dto.deadline) : null,
      reminders: requireAck
        ? (dto.reminders ?? NoticeReminderCadence.NONE)
        : NoticeReminderCadence.NONE,
      escalate: requireAck ? !!dto.escalate : false,
      escalateAfter: dto.escalateAfter ?? 3,
      attachments: (dto.attachments ?? []).map((a) => ({
        name: a.name,
        size: a.size ?? '',
        url: a.url ?? null,
      })),
      pinned: !!dto.pinned,
      expiresAt: this.toDate(dto.expiresAt),
      revisionOf: dto.revisionOf ?? null,
      templateId: dto.templateId ?? null,
    };
  }

  /** Throws a readable error naming the first thing that blocks sending. */
  private async assertSendable(
    tenantId: string,
    f: ReturnType<NoticeService['fieldsFromDto']>,
    timing: 'now' | 'schedule',
    scheduleAt: Date | null,
  ) {
    if (!f.title) throw new BadRequestException('Add a title.');
    if (!stripHtml(f.body)) {
      throw new BadRequestException('Write the message before sending.');
    }
    const audience = await this.resolveAudience(tenantId, f.audience);
    if (!audience.length) {
      throw new BadRequestException(
        'This audience has no recipients. Choose at least one person.',
      );
    }
    if (f.requireAck) {
      if (!f.deadline) {
        throw new BadRequestException('Set a deadline for acknowledgement.');
      }
      if (f.deadline.getTime() < Date.now()) {
        throw new BadRequestException('The deadline must be in the future.');
      }
      if (f.ackMethod === NoticeAckMethod.QUIZ) {
        const q = f.quiz;
        if (
          !q ||
          !q.q ||
          q.options.length < 2 ||
          q.options.some((o) => !o) ||
          q.answer < 0 ||
          q.answer >= q.options.length
        ) {
          throw new BadRequestException(
            'Complete the comprehension question and mark the correct answer.',
          );
        }
      }
    }
    if (timing === 'schedule') {
      if (!scheduleAt || scheduleAt.getTime() <= Date.now()) {
        throw new BadRequestException('Choose a future date and time.');
      }
    }
    return audience;
  }

  private async createWithRef(tenantId: string, doc: any) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.noticeModel.create({
          ...doc,
          tenantId: oid(tenantId),
          ref: await this.nextRef(tenantId),
        });
      } catch (err: any) {
        if (err?.code !== 11000 || attempt === 3) throw err;
      }
    }
  }

  async saveDraft(
    tenantId: string,
    userId: string,
    dto: SaveNoticeDto,
    id?: string,
  ) {
    const f = this.fieldsFromDto(dto);
    const author = await this.actorName(userId);

    if (id) {
      const n = await this.mustFind(tenantId, id);
      if (
        n.status !== NoticeStatus.DRAFT &&
        n.status !== NoticeStatus.SCHEDULED
      ) {
        throw new BadRequestException(
          'Only drafts and scheduled notices can be edited. Use "Revise and reissue" for a sent notice.',
        );
      }
      Object.assign(n, f, {
        status: NoticeStatus.DRAFT,
        scheduledFor: null,
      });
      await n.save();
      await this.log(tenantId, n._id, 'edited', 'Saved as draft', author);
      return this.detail(tenantId, String(n._id));
    }

    const n: any = await this.createWithRef(tenantId, {
      ...f,
      status: NoticeStatus.DRAFT,
      authorUserId: oid(userId),
      authorName: author,
      versions: [
        {
          v: 1,
          at: new Date(),
          byName: author,
          note: 'Initial issue',
          ref: null,
        },
      ],
    });
    await this.log(tenantId, n._id, 'created', 'Created the notice', author);
    return this.detail(tenantId, String(n._id));
  }

  async publish(
    tenantId: string,
    userId: string,
    dto: PublishNoticeDto,
    id?: string,
  ) {
    const f = this.fieldsFromDto(dto);
    const scheduleAt = this.toDate(dto.scheduleAt);
    await this.assertSendable(tenantId, f, dto.timing, scheduleAt);
    const author = await this.actorName(userId);

    let n: any;
    if (id) {
      n = await this.mustFind(tenantId, id);
      if (
        n.status !== NoticeStatus.DRAFT &&
        n.status !== NoticeStatus.SCHEDULED
      ) {
        throw new BadRequestException('This notice has already been sent.');
      }
      Object.assign(n, f);
    } else {
      let versions: any[] = [
        {
          v: 1,
          at: new Date(),
          byName: author,
          note: 'Initial issue',
          ref: null,
        },
      ];
      if (f.revisionOf) {
        const old: any = await this.noticeModel.findOne({
          tenantId: oid(tenantId),
          ref: f.revisionOf,
        });
        if (old) {
          versions = [
            ...(old.versions ?? []).map((v: any) => ({
              ...(v.toObject ? v.toObject() : v),
              ref: v.ref ?? old.ref,
            })),
            {
              v: (old.versions?.length ?? 1) + 1,
              at: new Date(),
              byName: author,
              note: `Revised and reissued from ${old.ref}`,
              ref: null,
            },
          ];
        }
      }
      n = await this.createWithRef(tenantId, {
        ...f,
        status: NoticeStatus.DRAFT,
        authorUserId: oid(userId),
        authorName: author,
        versions,
      });
      await this.log(tenantId, n._id, 'created', 'Created the notice', author);
    }

    if (dto.timing === 'schedule') {
      n.status = NoticeStatus.SCHEDULED;
      n.scheduledFor = scheduleAt;
      await n.save();
      await this.log(
        tenantId,
        n._id,
        'scheduled',
        `Scheduled for ${scheduleAt!.toLocaleString('en-GB')}`,
        author,
      );
    } else {
      await n.save();
      await this.dispatch(tenantId, n, author);
    }

    if (f.templateId) {
      await this.templateModel
        .updateOne(
          {
            _id: Types.ObjectId.isValid(f.templateId)
              ? oid(f.templateId)
              : null,
          },
          { $inc: { uses: 1 } },
        )
        .catch(() => undefined);
    }

    // A reissue replaces what it revised.
    if (f.revisionOf && dto.timing === 'now') {
      await this.supersede(tenantId, f.revisionOf, n.ref, author);
    }
    return this.detail(tenantId, String(n._id));
  }

  private async supersede(
    tenantId: string,
    oldRef: string,
    newRef: string,
    actor: string,
  ) {
    const old: any = await this.noticeModel.findOne({
      tenantId: oid(tenantId),
      ref: oldRef,
      status: NoticeStatus.SENT,
    });
    if (!old) return;
    old.status = NoticeStatus.ARCHIVED;
    old.archivedAt = new Date();
    await old.save();
    await this.log(
      tenantId,
      old._id,
      'archived',
      `Superseded by ${newRef}`,
      actor,
    );
  }

  /**
   * Turn a notice into delivered mail: snapshot the audience into
   * recipient rows, mark it sent, then email and notify. The status
   * flip is conditional so a scheduler tick and a manual "send now"
   * racing each other can never deliver the same notice twice.
   */
  async dispatch(
    tenantId: string,
    notice: any,
    actor = 'Lexora',
    system = false,
  ) {
    const claimed: any = await this.noticeModel.findOneAndUpdate(
      {
        _id: notice._id,
        tenantId: oid(tenantId),
        status: { $in: [NoticeStatus.DRAFT, NoticeStatus.SCHEDULED] },
      },
      {
        $set: {
          status: NoticeStatus.SENT,
          sentAt: new Date(),
          scheduledFor: null,
        },
      },
      { new: true },
    );
    if (!claimed) return null;

    const audience = await this.resolveAudience(tenantId, claimed.audience);
    const now = new Date();
    const settings = await this.getSettings(tenantId);

    // Re-acknowledgement is optional on a reissue: when off, anyone who
    // had already acknowledged the notice being replaced keeps that.
    let carried = new Map<string, any>();
    if (claimed.revisionOf && !settings.reAck) {
      const old: any = await this.noticeModel
        .findOne({ tenantId: oid(tenantId), ref: claimed.revisionOf })
        .select('_id')
        .lean();
      if (old) {
        const prev = await this.recipientModel
          .find({ noticeId: old._id, ackAt: { $ne: null } })
          .lean();
        carried = new Map(prev.map((p: any) => [String(p.employeeId), p]));
      }
    }

    if (audience.length) {
      await this.recipientModel.insertMany(
        audience.map((e: any) => {
          const c = carried.get(String(e._id));
          return {
            tenantId: oid(tenantId),
            noticeId: claimed._id,
            employeeId: e._id,
            deliveredAt: now,
            ...(c
              ? {
                  openedAt: c.openedAt,
                  seenAt: c.openedAt,
                  ackAt: c.ackAt,
                  ackMethod: c.ackMethod,
                  signature: c.signature,
                  device: c.device,
                  offline: c.offline,
                  offlineMethod: c.offlineMethod,
                  offlineNote: c.offlineNote,
                }
              : {}),
          };
        }),
        { ordered: false },
      );
    }
    claimed.recipientCount = audience.length;
    await claimed.save();

    await this.log(
      tenantId,
      claimed._id,
      'sent',
      `Sent to ${audience.length} ${audience.length === 1 ? 'employee' : 'employees'} by ${claimed.channels
        .map((c: string) => (c === 'email' ? 'Email alert' : 'Employee portal'))
        .join(', ')}`,
      actor,
      system,
    );

    // Fire and forget: the notice is recorded; mail delivery follows.
    const toNotify = audience.filter((e: any) => !carried.has(String(e._id)));
    this.notifyEmployees(tenantId, claimed, toNotify, 'issued').catch((err) =>
      this.logger.error(
        `Notice ${claimed.ref} delivery failed: ${err?.message}`,
      ),
    );
    return claimed;
  }

  /** Called every minute by the scheduler. */
  async dispatchDueScheduled() {
    const due: any[] = await this.noticeModel
      .find({
        status: NoticeStatus.SCHEDULED,
        scheduledFor: { $lte: new Date() },
      })
      .limit(50);
    for (const n of due) {
      try {
        const sent = await this.dispatch(String(n.tenantId), n, 'Lexora', true);
        if (sent?.revisionOf) {
          await this.supersede(
            String(n.tenantId),
            sent.revisionOf,
            sent.ref,
            'Lexora',
          );
        }
      } catch (err: any) {
        this.logger.error(`Scheduled notice ${n.ref} failed: ${err?.message}`);
      }
    }
    return due.length;
  }

  // ═══════════════════════════════════════════════════════════
  // Lifecycle actions
  // ═══════════════════════════════════════════════════════════

  async mustFind(tenantId: string, id: string): Promise<any> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Notice not found');
    const n = await this.noticeModel.findOne({
      _id: oid(id),
      tenantId: oid(tenantId),
    });
    if (!n) throw new NotFoundException('Notice not found');
    return n;
  }

  async sendNow(tenantId: string, userId: string, id: string) {
    const n = await this.mustFind(tenantId, id);
    if (
      n.status !== NoticeStatus.SCHEDULED &&
      n.status !== NoticeStatus.DRAFT
    ) {
      throw new BadRequestException('This notice has already been sent.');
    }
    const asDto = { ...n.toObject() } as any;
    await this.assertSendable(
      tenantId,
      this.fieldsFromDto({
        ...asDto,
        deadline: asDto.deadline?.toISOString?.() ?? null,
        expiresAt: asDto.expiresAt?.toISOString?.() ?? null,
      }),
      'now',
      null,
    );
    const actor = await this.actorName(userId);
    await this.dispatch(tenantId, n, actor);
    if (n.revisionOf)
      await this.supersede(tenantId, n.revisionOf, n.ref, actor);
    return this.detail(tenantId, id);
  }

  async unschedule(tenantId: string, userId: string, id: string) {
    const n = await this.mustFind(tenantId, id);
    if (n.status !== NoticeStatus.SCHEDULED) {
      throw new BadRequestException(
        'Only scheduled notices can be unscheduled.',
      );
    }
    n.status = NoticeStatus.DRAFT;
    n.scheduledFor = null;
    await n.save();
    await this.log(
      tenantId,
      n._id,
      'edited',
      'Cancelled the schedule. Returned to drafts',
      await this.actorName(userId),
    );
    return this.detail(tenantId, id);
  }

  async archive(tenantId: string, userId: string, id: string) {
    const n = await this.mustFind(tenantId, id);
    if (n.status !== NoticeStatus.SENT) {
      throw new BadRequestException('Only sent notices can be archived.');
    }
    n.status = NoticeStatus.ARCHIVED;
    n.archivedAt = new Date();
    await n.save();
    await this.log(
      tenantId,
      n._id,
      'archived',
      'Archived the notice',
      await this.actorName(userId),
    );
    return this.detail(tenantId, id);
  }

  async restore(tenantId: string, userId: string, id: string) {
    const n = await this.mustFind(tenantId, id);
    if (n.status !== NoticeStatus.ARCHIVED) {
      throw new BadRequestException('This notice is not archived.');
    }
    n.status = n.sentAt ? NoticeStatus.SENT : NoticeStatus.DRAFT;
    n.archivedAt = null;
    await n.save();
    await this.log(
      tenantId,
      n._id,
      'restored',
      'Restored the notice',
      await this.actorName(userId),
    );
    return this.detail(tenantId, id);
  }

  async bulkArchive(tenantId: string, userId: string, ids: string[]) {
    let archived = 0;
    for (const id of ids) {
      try {
        const n = await this.mustFind(tenantId, id);
        if (n.status === NoticeStatus.SENT) {
          await this.archive(tenantId, userId, id);
          archived++;
        }
      } catch {
        /* skip */
      }
    }
    return { archived };
  }

  async remove(tenantId: string, id: string) {
    const n = await this.mustFind(tenantId, id);
    if (
      n.status !== NoticeStatus.DRAFT &&
      n.status !== NoticeStatus.SCHEDULED
    ) {
      throw new BadRequestException(
        'Only drafts and scheduled notices can be deleted. Sent notices are kept for the audit record — archive them instead.',
      );
    }
    await this.noticeModel.deleteOne({ _id: n._id });
    await this.activityModel.deleteMany({ noticeId: n._id });
    return { deleted: true };
  }

  async togglePin(tenantId: string, userId: string, id: string) {
    const n = await this.mustFind(tenantId, id);
    n.pinned = !n.pinned;
    await n.save();
    await this.log(
      tenantId,
      n._id,
      'edited',
      n.pinned ? 'Pinned the notice' : 'Unpinned the notice',
      await this.actorName(userId),
    );
    return this.detail(tenantId, id);
  }

  // ═══════════════════════════════════════════════════════════
  // Reading: register, detail, recipients
  // ═══════════════════════════════════════════════════════════

  private async toListItem(
    n: any,
    stats: any,
    dir: any,
    groups: Map<string, string>,
  ) {
    const sentLike =
      n.status === NoticeStatus.SENT || n.status === NoticeStatus.ARCHIVED;
    const planned = sentLike
      ? stats.total
      : (await this.resolveAudience(String(n.tenantId), n.audience)).length;
    return {
      id: String(n._id),
      ref: n.ref,
      title: n.title,
      category: n.category,
      priority: n.priority,
      summary: n.summary,
      status: n.status,
      pinned: !!n.pinned,
      audience: n.audience,
      audienceLabel: this.audienceLabel(n.audience, dir, groups),
      audienceCount: planned,
      sentAt: n.sentAt,
      scheduledFor: n.scheduledFor,
      createdAt: n.createdAt,
      requireAck: !!n.requireAck,
      ackMethod: n.ackMethod,
      deadline: n.deadline,
      attachmentCount: (n.attachments ?? []).length,
      unansweredQuestions: (n.questions ?? []).filter((q: any) => !q.reply)
        .length,
      stats,
    };
  }

  async list(
    tenantId: string,
    q: {
      status?: string;
      category?: string;
      priority?: string;
      search?: string;
      sort?: string;
    },
  ) {
    const all: any[] = await this.noticeModel
      .find({ tenantId: oid(tenantId) })
      .select('-body')
      .lean();

    const counts: Record<string, number> = {
      all: all.length,
      sent: 0,
      scheduled: 0,
      draft: 0,
      archived: 0,
    };
    all.forEach((n) => (counts[n.status] = (counts[n.status] ?? 0) + 1));

    const needle = (q.search ?? '').trim().toLowerCase();
    let rows = all.filter(
      (n) =>
        (!q.status || q.status === 'all' || n.status === q.status) &&
        (!q.category || q.category === 'all' || n.category === q.category) &&
        (!q.priority || q.priority === 'all' || n.priority === q.priority) &&
        (!needle ||
          `${n.title} ${n.ref} ${n.summary} ${n.category}`
            .toLowerCase()
            .includes(needle)),
    );

    const [stats, dir, groups] = await Promise.all([
      this.statsFor(rows),
      this.directory(tenantId),
      this.groupNames(tenantId),
    ]);

    const when = (n: any) =>
      new Date(n.sentAt ?? n.scheduledFor ?? n.createdAt).getTime();
    const sorts: Record<string, (a: any, b: any) => number> = {
      recent: (a, b) => when(b) - when(a),
      oldest: (a, b) => when(a) - when(b),
      title: (a, b) => a.title.localeCompare(b.title),
      ack: (a, b) =>
        stats.get(String(a._id)).ackRate - stats.get(String(b._id)).ackRate,
    };
    rows.sort(sorts[q.sort ?? 'recent'] ?? sorts.recent);
    rows.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    const items = await Promise.all(
      rows.map((n) =>
        this.toListItem(n, stats.get(String(n._id)), dir, groups),
      ),
    );
    return { items, counts };
  }

  async detail(tenantId: string, id: string) {
    const n: any = (await this.mustFind(tenantId, id)).toObject();
    const [stats, dir, groups, activity] = await Promise.all([
      this.statsFor([n]),
      this.directory(tenantId),
      this.groupNames(tenantId),
      this.activityModel
        .find({ noticeId: n._id })
        .sort({ at: -1 })
        .limit(200)
        .lean(),
    ]);

    const empIds = (n.questions ?? []).map((q: any) => q.employeeId);
    const emps = empIds.length
      ? await this.employeeModel.find({ _id: { $in: empIds } }).lean()
      : [];
    const empMap = new Map(
      emps.map((e: any) => [String(e._id), this.brief(e, dir)]),
    );

    const item = await this.toListItem(
      n,
      stats.get(String(n._id)),
      dir,
      groups,
    );
    return {
      ...item,
      body: n.body,
      channels: n.channels,
      quiz: n.quiz,
      reminders: n.reminders,
      escalate: !!n.escalate,
      escalateAfter: n.escalateAfter,
      expiresAt: n.expiresAt,
      attachments: n.attachments ?? [],
      authorName: n.authorName,
      revisionOf: n.revisionOf,
      templateId: n.templateId,
      versions: (n.versions ?? []).map((v: any) => ({
        v: v.v,
        at: v.at,
        byName: v.byName,
        note: v.note,
        ref: v.ref ?? null,
      })),
      questions: (n.questions ?? []).map((q: any) => ({
        id: String(q._id),
        text: q.text,
        at: q.at,
        reply: q.reply,
        replyAt: q.replyAt,
        replyByName: q.replyByName,
        shared: !!q.shared,
        employee: empMap.get(String(q.employeeId)) ?? null,
      })),
      activity: activity.map((a: any) => ({
        id: String(a._id),
        act: a.act,
        text: a.text,
        actorName: a.actorName,
        system: !!a.system,
        at: a.at,
      })),
    };
  }

  async recipients(
    tenantId: string,
    id: string,
    q: { status?: string; dept?: string; search?: string },
  ) {
    const n: any = await this.mustFind(tenantId, id);
    const [rows, dir] = await Promise.all([
      this.recipientModel.find({ noticeId: n._id }).lean(),
      this.directory(tenantId),
    ]);
    const emps = await this.employeeModel
      .find({ _id: { $in: rows.map((r: any) => r.employeeId) } })
      .lean();
    const empMap = new Map(
      emps.map((e: any) => [String(e._id), this.brief(e, dir)]),
    );
    const order: Record<string, number> = {
      overdue: 0,
      unread: 1,
      pending: 2,
      read: 3,
      acknowledged: 4,
    };
    const needle = (q.search ?? '').trim().toLowerCase();
    const out = rows
      .map((r: any) => ({
        r,
        e: empMap.get(String(r.employeeId)),
        status: this.recipientStatus(n, r),
      }))
      .filter(
        (x) =>
          x.e &&
          (!q.status || q.status === 'all' || x.status === q.status) &&
          (!q.dept || q.dept === 'all' || x.e.deptId === q.dept) &&
          (!needle || `${x.e.name} ${x.e.role}`.toLowerCase().includes(needle)),
      )
      .sort(
        (a, b) =>
          order[a.status] - order[b.status] || a.e.name.localeCompare(b.e.name),
      )
      .map(({ r, e, status }) => ({
        employee: e,
        status,
        deliveredAt: r.deliveredAt,
        openedAt: r.openedAt,
        channel: r.channel,
        ackAt: r.ackAt,
        ackMethod: r.ackMethod,
        signature: r.signature,
        offline: !!r.offline,
        offlineMethod: r.offlineMethod,
        reminders: r.reminders ?? 0,
        lastReminderAt: r.lastReminderAt,
        escalatedAt: r.escalatedAt,
      }));
    return { total: rows.length, items: out };
  }

  // ═══════════════════════════════════════════════════════════
  // Chasing: reminders, escalation, offline acknowledgement
  // ═══════════════════════════════════════════════════════════

  /** Send a reminder to outstanding recipients (all of them when ids omitted). */
  async remind(
    tenantId: string,
    noticeId: string,
    employeeIds: string[] | null,
    actor = 'Lexora',
    system = false,
  ) {
    const n: any = await this.mustFind(tenantId, noticeId);
    if (n.status !== NoticeStatus.SENT || !n.requireAck) return { reminded: 0 };
    const filter: any = { noticeId: n._id, ackAt: null };
    if (employeeIds) {
      filter.employeeId = {
        $in: employeeIds.filter((x) => Types.ObjectId.isValid(x)).map(oid),
      };
    }
    const recs: any[] = await this.recipientModel.find(filter).lean();
    if (!recs.length) return { reminded: 0 };

    await this.recipientModel.updateMany(
      { _id: { $in: recs.map((r) => r._id) } },
      { $inc: { reminders: 1 }, $set: { lastReminderAt: new Date() } },
    );
    const emps = await this.employeeModel
      .find({ _id: { $in: recs.map((r) => r.employeeId) } })
      .lean();
    const overdue = n.deadline && new Date(n.deadline) < new Date();
    this.notifyEmployees(
      tenantId,
      n,
      emps,
      overdue ? 'overdue' : 'reminder',
    ).catch((err) =>
      this.logger.error(`Reminder delivery failed: ${err?.message}`),
    );
    await this.log(
      tenantId,
      n._id,
      'reminder',
      system
        ? `Automatic reminder sent to ${recs.length} ${recs.length === 1 ? 'employee' : 'employees'}`
        : `Reminder sent to ${recs.length} ${recs.length === 1 ? 'employee' : 'employees'}`,
      actor,
      system,
    );
    return { reminded: recs.length };
  }

  /** Tell each outstanding employee's line manager. */
  async escalate(
    tenantId: string,
    noticeId: string,
    employeeIds: string[],
    actor = 'Lexora',
    system = false,
  ) {
    const n: any = await this.mustFind(tenantId, noticeId);
    if (n.status !== NoticeStatus.SENT || !n.requireAck) {
      return { escalated: 0, managers: 0 };
    }
    const recs: any[] = await this.recipientModel
      .find({
        noticeId: n._id,
        ackAt: null,
        employeeId: {
          $in: employeeIds.filter((x) => Types.ObjectId.isValid(x)).map(oid),
        },
      })
      .lean();
    if (!recs.length) return { escalated: 0, managers: 0 };

    const emps: any[] = await this.employeeModel
      .find({ _id: { $in: recs.map((r) => r.employeeId) } })
      .lean();
    const empMap = new Map(emps.map((e) => [String(e._id), e]));
    const managerIds = [
      ...new Set(
        emps.map((e) =>
          e.reportsToManagerId ? String(e.reportsToManagerId) : null,
        ),
      ),
    ].filter(Boolean) as string[];
    const managers: any[] = managerIds.length
      ? await this.employeeModel
          .find({ _id: { $in: managerIds.map(oid) } })
          .lean()
      : [];
    const managerMap = new Map(managers.map((m) => [String(m._id), m]));
    const owner: any = await this.userModel
      .findById(tenantId)
      .select('email firstName')
      .lean();

    const settings = await this.getSettings(tenantId);
    const business = await resolveBusinessName(this.userModel, tenantId);
    const notified = new Set<string>();

    for (const r of recs) {
      const e = empMap.get(String(r.employeeId));
      if (!e) continue;
      const mgr = e.reportsToManagerId
        ? managerMap.get(String(e.reportsToManagerId))
        : null;
      const toEmail = mgr?.email ?? owner?.email;
      const toName = mgr?.firstName ?? owner?.firstName ?? 'there';
      if (toEmail) {
        this.emailService
          .sendHrNotice({
            to: toEmail,
            kind: 'escalation',
            recipientName: toName,
            businessName: business,
            senderName: settings.senderName || business,
            noticeRef: n.ref,
            title: n.title,
            summary: n.summary,
            category: n.category,
            priority: n.priority,
            requireAck: true,
            deadline: n.deadline ? fmtDate(n.deadline) : null,
            link: this.appLink('/dashboard'),
            footer: settings.footer,
            subjectEmployee: `${e.firstName} ${e.lastName}`,
          })
          .catch((err) =>
            this.logger.error(`Escalation email failed: ${err?.message}`),
          );
      }
      const targetUser = mgr?.userId ? String(mgr.userId) : tenantId;
      this.eventEmitter.emit('hr.notice.employee', {
        tenantId,
        userId: targetUser,
        title: `Overdue acknowledgement: ${e.firstName} ${e.lastName}`,
        description: `${n.ref} "${n.title}" is overdue.`,
        link: mgr ? '/my/team' : `/hr/notices?notice=${n._id}`,
      });
      notified.add(mgr ? String(mgr._id) : 'owner');
    }

    await this.recipientModel.updateMany(
      { _id: { $in: recs.map((r) => r._id) } },
      { $set: { escalatedAt: new Date() } },
    );
    await this.log(
      tenantId,
      n._id,
      'escalated',
      `Escalated ${recs.length} outstanding ${recs.length === 1 ? 'acknowledgement' : 'acknowledgements'} to ${notified.size} line ${notified.size === 1 ? 'manager' : 'managers'}`,
      actor,
      system,
    );
    return { escalated: recs.length, managers: notified.size };
  }

  async recordOfflineAck(
    tenantId: string,
    userId: string,
    noticeId: string,
    employeeId: string,
    dto: RecordOfflineAckDto,
  ) {
    const n: any = await this.mustFind(tenantId, noticeId);
    if (!n.requireAck) {
      throw new BadRequestException(
        'This notice does not require acknowledgement.',
      );
    }
    const rec: any = await this.recipientModel.findOne({
      noticeId: n._id,
      employeeId: oid(employeeId),
    });
    if (!rec)
      throw new NotFoundException('That employee was not sent this notice.');
    if (rec.ackAt) throw new BadRequestException('Already acknowledged.');

    let at = dto.date ? new Date(`${dto.date}T12:00:00`) : new Date();
    if (isNaN(at.getTime()) || at.getTime() > Date.now()) at = new Date();

    const actor = await this.actorName(userId);
    rec.ackAt = at;
    rec.openedAt = rec.openedAt ?? at;
    rec.seenAt = rec.seenAt ?? at;
    rec.ackMethod = n.ackMethod;
    rec.offline = true;
    rec.offlineMethod = dto.method;
    rec.offlineNote = (dto.note ?? '').trim() || null;
    rec.offlineByName = actor;
    rec.ackVersion = n.versions?.length ?? 1;
    await rec.save();

    const emp: any = await this.employeeModel.findById(employeeId).lean();
    await this.log(
      tenantId,
      n._id,
      'offline',
      `Recorded an offline acknowledgement for ${emp?.firstName ?? ''} ${emp?.lastName ?? ''} (${dto.method})`.replace(
        /\s+/g,
        ' ',
      ),
      actor,
    );
    return { ok: true };
  }

  async replyToQuestion(
    tenantId: string,
    userId: string,
    noticeId: string,
    questionId: string,
    dto: ReplyQuestionDto,
  ) {
    const n: any = await this.mustFind(tenantId, noticeId);
    const q = n.questions.id(questionId);
    if (!q) throw new NotFoundException('Question not found');
    const actor = await this.actorName(userId);
    const reply = dto.reply.trim();
    q.reply = reply;
    q.replyAt = new Date();
    q.replyByName = actor;
    if (dto.shareWithAll) {
      q.shared = true;
      const esc = (s: string) =>
        s.replace(
          /[&<>"']/g,
          (c) =>
            ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#39;',
            })[c] as string,
        );
      n.body += `<h2>Question from staff</h2><p><b>${esc(q.text)}</b><br>${esc(reply)}</p>`;
    }
    n.markModified('questions');
    await n.save();

    await this.log(
      tenantId,
      n._id,
      'reply',
      dto.shareWithAll
        ? 'Replied and added the answer to the notice for all recipients'
        : 'Replied to a question',
      actor,
    );

    // Tell the person who asked.
    const asker: any = await this.employeeModel.findById(q.employeeId).lean();
    if (asker) {
      if (asker.userId) {
        this.eventEmitter.emit('hr.notice.employee', {
          tenantId,
          userId: String(asker.userId),
          title: `HR replied to your question: ${n.title}`,
          description: reply.slice(0, 160),
          link: `/my/announcements?notice=${n._id}`,
        });
      }
      if (asker.email) {
        const settings = await this.getSettings(tenantId);
        const business = await resolveBusinessName(this.userModel, tenantId);
        this.emailService
          .sendHrNotice({
            to: asker.email,
            kind: 'reply',
            recipientName: asker.firstName,
            businessName: business,
            senderName: actor,
            noticeRef: n.ref,
            title: n.title,
            summary: '',
            category: n.category,
            priority: n.priority,
            requireAck: false,
            deadline: null,
            link: this.noticeLink(String(n._id)),
            footer: settings.footer,
            replyText: reply,
          })
          .catch((err) =>
            this.logger.error(`Reply email failed: ${err?.message}`),
          );
      }
    }
    return this.detail(tenantId, noticeId);
  }

  // ═══════════════════════════════════════════════════════════
  // Receipts + CSV
  // ═══════════════════════════════════════════════════════════

  receiptRef(n: any, e: any, ackAt: Date) {
    return `ACK-${String(n.ref).slice(4)}-${e.employeeNumber || String(e._id).slice(-4)}-${String(
      new Date(ackAt).getTime(),
    ).slice(-5)}`;
  }

  integrityHash(n: any, r: any) {
    return createHash('sha256')
      .update(
        [
          n.ref,
          String(r.employeeId),
          new Date(r.ackAt).toISOString(),
          r.ackMethod ?? '',
          r.signature ?? '',
          String(r.ackVersion ?? 1),
        ].join('|'),
      )
      .digest('hex')
      .toUpperCase()
      .slice(0, 32);
  }

  async receipt(tenantId: string, noticeId: string, employeeId: string) {
    const n: any = await this.mustFind(tenantId, noticeId);
    const r: any = await this.recipientModel
      .findOne({ noticeId: n._id, employeeId: oid(employeeId) })
      .lean();
    if (!r?.ackAt) throw new NotFoundException('No acknowledgement recorded.');
    const e: any = await this.employeeModel.findById(employeeId).lean();
    const dir = await this.directory(tenantId);
    return this.buildReceipt(n, r, this.brief(e, dir), e);
  }

  buildReceipt(n: any, r: any, e: EmployeeBrief, rawEmployee: any) {
    return {
      reference: this.receiptRef(n, rawEmployee, r.ackAt),
      employee: {
        id: e.id,
        name: e.name,
        number: e.employeeNumber,
        dept: e.dept,
      },
      notice: {
        id: String(n._id),
        ref: n.ref,
        title: n.title,
        version: n.versions?.length ?? 1,
      },
      deliveredAt: r.deliveredAt,
      openedAt: r.openedAt,
      acknowledgedAt: r.ackAt,
      method: r.ackMethod ?? n.ackMethod,
      signature: r.signature,
      offline: !!r.offline,
      offlineMethod: r.offlineMethod,
      offlineNote: r.offlineNote,
      device: r.device ?? (r.offline ? 'Recorded by HR administrator' : ''),
      integrityHash: this.integrityHash(n, r),
    };
  }

  async recipientsCsv(tenantId: string, noticeId: string) {
    const n: any = await this.mustFind(tenantId, noticeId);
    const { items } = await this.recipients(tenantId, noticeId, {});
    const label: Record<string, string> = {
      acknowledged: 'Acknowledged',
      overdue: 'Overdue',
      pending: 'Read, not signed off',
      read: 'Read',
      unread: 'Not opened',
    };
    const method: Record<string, string> = {
      click: 'One-click confirmation',
      signature: 'Typed e-signature',
      quiz: 'Comprehension check',
    };
    const iso = (d: any) => (d ? new Date(d).toISOString() : '');
    const rows: any[][] = [
      [
        'Reference',
        'Notice',
        'Employee ID',
        'Name',
        'Department',
        'Location',
        'Delivered',
        'Opened',
        'Acknowledged',
        'Method',
        'Signature',
        'Reminders',
        'Status',
      ],
    ];
    items.forEach((x) =>
      rows.push([
        n.ref,
        n.title,
        x.employee.employeeNumber,
        x.employee.name,
        x.employee.dept,
        x.employee.location,
        iso(x.deliveredAt),
        iso(x.openedAt),
        iso(x.ackAt),
        x.offline ? `Offline: ${x.offlineMethod}` : (method[x.ackMethod] ?? ''),
        x.signature ?? '',
        x.reminders,
        label[x.status],
      ]),
    );
    return { filename: `${n.ref}-recipients.csv`, csv: toCsv(rows) };
  }

  async registerCsv(tenantId: string, q: any) {
    const { items } = await this.list(tenantId, q);
    const rows: any[][] = [
      [
        'Reference',
        'Title',
        'Category',
        'Priority',
        'Status',
        'Audience',
        'Sent',
        'Recipients',
        'Read %',
        'Acknowledged %',
        'Overdue',
      ],
    ];
    items.forEach((n) =>
      rows.push([
        n.ref,
        n.title,
        n.category,
        n.priority,
        n.status,
        n.audienceLabel,
        n.sentAt ? new Date(n.sentAt).toISOString() : '',
        n.stats.total,
        n.stats.openRate,
        n.requireAck ? n.stats.ackRate : '',
        n.stats.overdue,
      ]),
    );
    return { filename: 'notice-register.csv', csv: toCsv(rows) };
  }

  async employeeHistory(tenantId: string, employeeId: string) {
    const emp: any = await this.employeeModel
      .findOne({ _id: oid(employeeId), tenantId: oid(tenantId) })
      .lean();
    if (!emp) throw new NotFoundException('Employee not found');
    const dir = await this.directory(tenantId);
    const recs: any[] = await this.recipientModel
      .find({ tenantId: oid(tenantId), employeeId: emp._id })
      .lean();
    const notices: any[] = await this.noticeModel
      .find({ _id: { $in: recs.map((r) => r.noticeId) } })
      .select('-body')
      .lean();
    const nMap = new Map(notices.map((n) => [String(n._id), n]));
    return {
      employee: this.brief(emp, dir),
      items: recs
        .map((r) => ({ r, n: nMap.get(String(r.noticeId)) }))
        .filter((x) => x.n)
        .sort(
          (a, b) =>
            new Date(b.n.sentAt ?? 0).getTime() -
            new Date(a.n.sentAt ?? 0).getTime(),
        )
        .map(({ r, n }) => ({
          noticeId: String(n._id),
          ref: n.ref,
          title: n.title,
          sentAt: n.sentAt,
          ackAt: r.ackAt,
          status: this.recipientStatus(n, r),
        })),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Tracker
  // ═══════════════════════════════════════════════════════════

  private async trackerData(
    tenantId: string,
    q: { noticeId?: string; dept?: string; status?: string; search?: string },
  ) {
    const active: any[] = await this.noticeModel
      .find({
        tenantId: oid(tenantId),
        status: NoticeStatus.SENT,
        requireAck: true,
      })
      .select('-body')
      .lean();
    const inScope = active.filter(
      (n) =>
        !q.noticeId || q.noticeId === 'all' || String(n._id) === q.noticeId,
    );
    const stats = await this.statsFor(active);
    const dir = await this.directory(tenantId);

    const recs: any[] = inScope.length
      ? await this.recipientModel
          .find({ noticeId: { $in: inScope.map((n) => n._id) } })
          .lean()
      : [];
    const emps: any[] = await this.employeeModel
      .find({ _id: { $in: recs.map((r) => r.employeeId) } })
      .lean();
    const empMap = new Map(
      emps.map((e) => [String(e._id), this.brief(e, dir)]),
    );
    const nMap = new Map(inScope.map((n) => [String(n._id), n]));

    // KPIs + by-department are over everything in scope, before the
    // table's own filters narrow the list.
    let required = 0;
    let received = 0;
    let overdue = 0;
    const hrs: number[] = [];
    const byDept = new Map<
      string,
      { name: string; total: number; acked: number }
    >();
    for (const r of recs) {
      const n = nMap.get(String(r.noticeId));
      const e = empMap.get(String(r.employeeId));
      if (!n || !e) continue;
      required++;
      if (r.ackAt) {
        received++;
        hrs.push(
          (new Date(r.ackAt).getTime() - new Date(r.deliveredAt).getTime()) /
            36e5,
        );
      } else if (n.deadline && new Date(n.deadline) < new Date()) overdue++;
      const key = e.deptId ?? 'none';
      const d = byDept.get(key) ?? {
        name: e.dept || 'No department',
        total: 0,
        acked: 0,
      };
      d.total++;
      if (r.ackAt) d.acked++;
      byDept.set(key, d);
    }

    const needle = (q.search ?? '').trim().toLowerCase();
    const order: Record<string, number> = { overdue: 0, unread: 1, pending: 2 };
    const rows = recs
      .filter((r) => !r.ackAt)
      .map((r) => {
        const n = nMap.get(String(r.noticeId));
        const e = empMap.get(String(r.employeeId));
        return { r, n, e, status: this.recipientStatus(n, r) };
      })
      .filter(
        (x) =>
          x.n &&
          x.e &&
          (!q.dept || q.dept === 'all' || x.e.deptId === q.dept) &&
          (!q.status || q.status === 'all' || x.status === q.status) &&
          (!needle ||
            `${x.e.name} ${x.n.title}`.toLowerCase().includes(needle)),
      )
      .sort(
        (a, b) =>
          order[a.status] - order[b.status] ||
          new Date(a.n.deadline).getTime() - new Date(b.n.deadline).getTime(),
      );

    const mgrIds = [
      ...new Set(rows.map((x) => x.e.managerId).filter(Boolean)),
    ] as string[];
    const mgrs: any[] = mgrIds.length
      ? await this.employeeModel
          .find({ _id: { $in: mgrIds.map(oid) } })
          .select('firstName lastName')
          .lean()
      : [];
    const mgrName = new Map(
      mgrs.map((m) => [String(m._id), `${m.firstName} ${m.lastName}`]),
    );

    return {
      active,
      stats,
      inScope,
      required,
      received,
      overdue,
      hrs,
      byDept,
      rows,
      mgrName,
    };
  }

  async tracker(
    tenantId: string,
    q: { noticeId?: string; dept?: string; status?: string; search?: string },
  ) {
    const t = await this.trackerData(tenantId, q);
    const avgHours = t.hrs.length
      ? t.hrs.reduce((a, b) => a + b, 0) / t.hrs.length
      : 0;
    return {
      notices: t.active.map((n) => ({
        id: String(n._id),
        ref: n.ref,
        title: n.title,
        ackRate: t.stats.get(String(n._id)).ackRate,
      })),
      kpis: {
        required: t.required,
        received: t.received,
        completion: pct(t.received, t.required),
        overdue: t.overdue,
        withinDeadline: t.required - t.received - t.overdue,
        noticesInScope: t.inScope.length,
        avgHoursToAcknowledge: Math.round(avgHours * 10) / 10,
      },
      byDepartment: [...t.byDept.entries()]
        .map(([id, d]) => ({
          deptId: id === 'none' ? null : id,
          name: d.name,
          total: d.total,
          acknowledged: d.acked,
          rate: pct(d.acked, d.total),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      rows: t.rows.map(({ r, n, e, status }) => ({
        noticeId: String(n._id),
        noticeRef: n.ref,
        noticeTitle: n.title,
        ackMethod: n.ackMethod,
        deadline: n.deadline,
        employee: e,
        managerName: e.managerId ? (t.mgrName.get(e.managerId) ?? null) : null,
        reminders: r.reminders ?? 0,
        lastReminderAt: r.lastReminderAt,
        escalatedAt: r.escalatedAt,
        status,
      })),
    };
  }

  async trackerCsv(tenantId: string, q: any) {
    const t = await this.trackerData(tenantId, q);
    const label: Record<string, string> = {
      overdue: 'Overdue',
      unread: 'Not opened',
      pending: 'Read, not acknowledged',
    };
    const rows: any[][] = [
      [
        'Employee ID',
        'Name',
        'Department',
        'Line manager',
        'Notice',
        'Title',
        'Deadline',
        'Reminders',
        'Status',
      ],
    ];
    t.rows.forEach(({ r, n, e, status }) =>
      rows.push([
        e.employeeNumber,
        e.name,
        e.dept,
        e.managerId ? (t.mgrName.get(e.managerId) ?? '') : '',
        n.ref,
        n.title,
        n.deadline ? new Date(n.deadline).toISOString().slice(0, 10) : '',
        r.reminders ?? 0,
        label[status],
      ]),
    );
    return { filename: 'outstanding-acknowledgements.csv', csv: toCsv(rows) };
  }

  /** items → { noticeId: [employeeIds] } */
  private groupItems(items: { noticeId: string; employeeId: string }[]) {
    const by = new Map<string, string[]>();
    for (const i of items ?? []) {
      by.set(i.noticeId, [...(by.get(i.noticeId) ?? []), i.employeeId]);
    }
    return by;
  }

  async trackerRemind(
    tenantId: string,
    userId: string,
    items: { noticeId: string; employeeId: string }[],
  ) {
    const actor = await this.actorName(userId);
    let reminded = 0;
    for (const [noticeId, ids] of this.groupItems(items)) {
      reminded += (await this.remind(tenantId, noticeId, ids, actor)).reminded;
    }
    return { reminded };
  }

  async trackerEscalate(
    tenantId: string,
    userId: string,
    items: { noticeId: string; employeeId: string }[],
  ) {
    const actor = await this.actorName(userId);
    let escalated = 0;
    let managers = 0;
    for (const [noticeId, ids] of this.groupItems(items)) {
      const r = await this.escalate(tenantId, noticeId, ids, actor);
      escalated += r.escalated;
      managers += r.managers;
    }
    return { escalated, managers };
  }

  // ═══════════════════════════════════════════════════════════
  // Overview
  // ═══════════════════════════════════════════════════════════

  async overview(tenantId: string) {
    const all: any[] = await this.noticeModel
      .find({ tenantId: oid(tenantId) })
      .select('-body')
      .lean();
    const stats = await this.statsFor(all);
    const sent = all
      .filter((n) => n.status === NoticeStatus.SENT)
      .sort(
        (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
      );
    const active = sent.filter((n) => n.requireAck);

    let tR = 0;
    let tO = 0;
    sent.forEach((n) => {
      const s = stats.get(String(n._id));
      tR += s.total;
      tO += s.opened;
    });
    let req = 0;
    let done = 0;
    let od = 0;
    active.forEach((n) => {
      const s = stats.get(String(n._id));
      req += s.total;
      done += s.acknowledged;
      od += s.overdue;
    });

    const dayAgo30 = Date.now() - 30 * DAY;
    const sent30 = all.filter(
      (n) =>
        n.sentAt &&
        n.status !== NoticeStatus.DRAFT &&
        new Date(n.sentAt).getTime() > dayAgo30,
    ).length;

    const attention: any[] = [];
    active.forEach((n) => {
      const s = stats.get(String(n._id));
      if (s.overdue)
        attention.push({
          kind: 'overdue',
          noticeId: String(n._id),
          ref: n.ref,
          title: n.title,
          text: `${s.overdue} ${s.overdue === 1 ? 'employee is' : 'employees are'} overdue`,
        });
    });
    all.forEach((n) =>
      (n.questions ?? [])
        .filter((q: any) => !q.reply)
        .forEach(() =>
          attention.push({
            kind: 'question',
            noticeId: String(n._id),
            ref: n.ref,
            title: n.title,
            text: 'Unanswered question from staff',
          }),
        ),
    );
    all
      .filter((n) => n.status === NoticeStatus.SCHEDULED)
      .forEach((n) =>
        attention.push({
          kind: 'scheduled',
          noticeId: String(n._id),
          ref: n.ref,
          title: n.title,
          text: `Sends ${new Date(n.scheduledFor).toLocaleString('en-GB')}`,
        }),
      );
    all
      .filter((n) => n.status === NoticeStatus.DRAFT)
      .forEach((n) =>
        attention.push({
          kind: 'draft',
          noticeId: String(n._id),
          ref: n.ref,
          title: n.title,
          text: 'Draft not yet sent',
        }),
      );

    const mix = await this.recipientModel.aggregate([
      {
        $match: {
          noticeId: { $in: sent.map((n) => n._id) },
          openedAt: { $ne: null },
        },
      },
      { $group: { _id: '$channel', n: { $sum: 1 } } },
    ]);
    const channelMix = { inapp: 0, email: 0 } as Record<string, number>;
    mix.forEach((m) => (channelMix[m._id] = m.n));

    const feed = await this.activityModel
      .find({ tenantId: oid(tenantId) })
      .sort({ at: -1 })
      .limit(8)
      .lean();
    const refOf = new Map(all.map((n) => [String(n._id), n]));

    const mapActive = (n: any) => {
      const s = stats.get(String(n._id));
      return {
        id: String(n._id),
        ref: n.ref,
        title: n.title,
        priority: n.priority,
        deadline: n.deadline,
        acknowledged: s.acknowledged,
        total: s.total,
        rate: s.ackRate,
      };
    };

    return {
      kpis: {
        sentLast30Days: sent30,
        scheduled: all.filter((n) => n.status === NoticeStatus.SCHEDULED)
          .length,
        drafts: all.filter((n) => n.status === NoticeStatus.DRAFT).length,
        averageReadRate: pct(tO, tR),
        opened: tO,
        delivered: tR,
        acknowledgementRate: pct(done, req),
        stillOutstanding: req - done,
        overdue: od,
      },
      compliance: {
        required: req,
        received: done,
        activeNotices: active.length,
      },
      inProgress: active
        .filter((n) => stats.get(String(n._id)).outstanding > 0)
        .map(mapActive),
      attention,
      engagement: sent
        .slice(0, 8)
        .reverse()
        .map((n) => {
          const s = stats.get(String(n._id));
          return {
            id: String(n._id),
            ref: n.ref,
            title: n.title,
            readRate: s.openRate,
            ackRate: n.requireAck ? s.ackRate : null,
          };
        }),
      channelMix,
      recentActivity: feed.map((a: any) => ({
        id: String(a._id),
        noticeId: String(a.noticeId),
        noticeTitle: refOf.get(String(a.noticeId))?.title ?? '',
        act: a.act,
        text: a.text,
        actorName: a.actorName,
        system: !!a.system,
        at: a.at,
      })),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Compose helpers: meta, audience preview, employees
  // ═══════════════════════════════════════════════════════════

  async meta(tenantId: string) {
    const [teams, locations, groups, customTemplates, settings, headcount] =
      await Promise.all([
        this.teamModel
          .find({ tenantId: oid(tenantId) })
          .sort({ name: 1 })
          .lean(),
        this.locationModel
          .find({ tenantId: oid(tenantId) })
          .sort({ name: 1 })
          .lean(),
        this.listGroups(tenantId),
        this.templateModel
          .find({ tenantId: oid(tenantId) })
          .sort({ createdAt: 1 })
          .lean(),
        this.getSettings(tenantId),
        this.headcount(tenantId),
      ]);
    const h = headcount;
    const count = (arr: any[], id: any) =>
      arr.find((x) => String(x._id) === String(id))?.n ?? 0;

    return {
      categories: NOTICE_CATEGORIES,
      employeeCount: h.total,
      departments: teams.map((t: any) => ({
        id: String(t._id),
        name: t.name,
        count: count(h.teams, t._id),
      })),
      locations: locations.map((l: any) => ({
        id: String(l._id),
        name: l.name,
        count: count(h.locations, l._id),
      })),
      employmentTypes: Object.entries(EMPLOYMENT_TYPE_LABEL).map(
        ([value, label]) => ({
          value,
          label,
          count: count(h.types, value),
        }),
      ),
      groups,
      templates: await this.mergeTemplates(customTemplates),
      settings,
    };
  }

  private async headcount(tenantId: string) {
    const match = {
      tenantId: oid(tenantId),
      employmentStatus: { $in: REACHABLE_STATUSES },
    };
    const by = (field: string) =>
      this.employeeModel.aggregate([
        { $match: match },
        { $group: { _id: `$${field}`, n: { $sum: 1 } } },
      ]);
    const [total, teams, locations, types] = await Promise.all([
      this.employeeModel.countDocuments(match),
      by('teamId'),
      by('locationId'),
      by('employmentType'),
    ]);
    return { total, teams, locations, types };
  }

  async searchEmployees(tenantId: string, search?: string) {
    const dir = await this.directory(tenantId);
    const base: any = {
      tenantId: oid(tenantId),
      employmentStatus: { $in: REACHABLE_STATUSES },
    };
    const needle = (search ?? '').trim();
    if (needle) {
      const rx = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      base.$or = [
        { firstName: rx },
        { lastName: rx },
        { jobTitle: rx },
        { email: rx },
      ];
    }
    const list = await this.employeeModel
      .find(base)
      .sort({ firstName: 1, lastName: 1 })
      .limit(100)
      .lean();
    return list.map((e) => this.brief(e, dir));
  }

  async previewAudience(tenantId: string, dto: AudiencePreviewDto) {
    const dir = await this.directory(tenantId);
    const list = await this.resolveAudience(
      tenantId,
      this.cleanAudience(dto.audience),
    );
    const people = list.map((e) => this.brief(e, dir));
    return {
      count: people.length,
      departments: new Set(people.map((p) => p.deptId).filter(Boolean)).size,
      locations: new Set(people.map((p) => p.locationId).filter(Boolean)).size,
      people: people.slice(0, 500),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Groups
  // ═══════════════════════════════════════════════════════════

  async listGroups(tenantId: string) {
    const [groups, notices, dir] = await Promise.all([
      this.groupModel
        .find({ tenantId: oid(tenantId) })
        .sort({ createdAt: 1 })
        .lean(),
      this.noticeModel
        .find({ tenantId: oid(tenantId), 'audience.type': 'group' })
        .select('audience')
        .lean(),
      this.directory(tenantId),
    ]);
    const usedBy = new Map<string, number>();
    notices.forEach((n: any) => {
      const k = n.audience?.values?.[0];
      if (k) usedBy.set(k, (usedBy.get(k) ?? 0) + 1);
    });
    return Promise.all(
      groups.map(async (g: any) => {
        const members = await this.resolveAudience(tenantId, g.audience, 1);
        return {
          id: String(g._id),
          name: g.name,
          description: g.description,
          audience: g.audience,
          rule: this.audienceLabel(g.audience, dir, new Map()),
          memberCount: members.length,
          usedIn: usedBy.get(String(g._id)) ?? 0,
        };
      }),
    );
  }

  async createGroup(tenantId: string, dto: SaveNoticeGroupDto) {
    if (dto.audience.type === NoticeAudienceType.GROUP) {
      throw new BadRequestException(
        'A group cannot be built from another group.',
      );
    }
    const audience = this.cleanAudience(dto.audience);
    if (
      !['all', 'newjoiners'].includes(audience.type) &&
      !audience.values.length
    ) {
      throw new BadRequestException('Choose at least one value for the rule.');
    }
    const g: any = await this.groupModel.create({
      tenantId: oid(tenantId),
      name: dto.name.trim(),
      description: dto.description?.trim() || 'Custom group',
      audience,
    });
    return (await this.listGroups(tenantId)).find(
      (x) => x.id === String(g._id),
    );
  }

  async groupMembers(tenantId: string, id: string) {
    const g: any = await this.groupModel
      .findOne({ _id: oid(id), tenantId: oid(tenantId) })
      .lean();
    if (!g) throw new NotFoundException('Group not found');
    const dir = await this.directory(tenantId);
    const list = await this.resolveAudience(tenantId, g.audience, 1);
    return { name: g.name, members: list.map((e) => this.brief(e, dir)) };
  }

  async deleteGroup(tenantId: string, id: string) {
    const res = await this.groupModel.deleteOne({
      _id: oid(id),
      tenantId: oid(tenantId),
    });
    if (!res.deletedCount) throw new NotFoundException('Group not found');
    return { deleted: true };
  }

  // ═══════════════════════════════════════════════════════════
  // Templates
  // ═══════════════════════════════════════════════════════════

  private async mergeTemplates(custom: any[]) {
    return [
      ...BUILT_IN_NOTICE_TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        priority: t.priority,
        description: t.description,
        requireAck: t.requireAck,
        ackMethod: t.ackMethod,
        audienceHint: t.audienceHint ?? null,
        body: t.body,
        uses: 0,
        custom: false,
      })),
      ...custom.map((t: any) => ({
        id: String(t._id),
        name: t.name,
        category: t.category,
        priority: t.priority,
        description: t.description,
        requireAck: !!t.requireAck,
        ackMethod: t.ackMethod,
        audienceHint: null,
        body: t.body,
        uses: t.uses ?? 0,
        custom: true,
      })),
    ];
  }

  async listTemplates(tenantId: string) {
    const custom = await this.templateModel
      .find({ tenantId: oid(tenantId) })
      .sort({ createdAt: 1 })
      .lean();
    // Usage of built-ins is counted from notices that were started from them.
    const used = await this.noticeModel.aggregate([
      { $match: { tenantId: oid(tenantId), templateId: { $ne: null } } },
      { $group: { _id: '$templateId', n: { $sum: 1 } } },
    ]);
    const uses = new Map<string, number>(used.map((u) => [u._id, u.n]));
    return (await this.mergeTemplates(custom)).map((t) => ({
      ...t,
      uses: t.custom ? t.uses : (uses.get(t.id) ?? 0),
    }));
  }

  async createTemplate(tenantId: string, dto: SaveNoticeTemplateDto) {
    const category = (NOTICE_CATEGORIES as readonly string[]).includes(
      dto.category ?? '',
    )
      ? dto.category
      : 'General';
    await this.templateModel.create({
      tenantId: oid(tenantId),
      name: dto.name.trim(),
      category,
      priority: dto.priority ?? NoticePriority.NORMAL,
      description: dto.description?.trim() || 'Custom template',
      requireAck: !!dto.requireAck,
      ackMethod: dto.ackMethod ?? NoticeAckMethod.CLICK,
      body: dto.body,
    });
    return this.listTemplates(tenantId);
  }

  async deleteTemplate(tenantId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Built-in templates cannot be deleted.');
    }
    const res = await this.templateModel.deleteOne({
      _id: oid(id),
      tenantId: oid(tenantId),
    });
    if (!res.deletedCount) throw new NotFoundException('Template not found');
    return this.listTemplates(tenantId);
  }
}
