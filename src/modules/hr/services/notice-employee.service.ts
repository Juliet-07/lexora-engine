import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NoticeAckMethod, NoticeStatus } from '../schemas';
import { AcknowledgeNoticeDto, AskNoticeQuestionDto } from '../dtos';
import { NoticeService } from './notice.service';

const oid = (v: string | Types.ObjectId) => new Types.ObjectId(String(v));
const normaliseName = (s: string) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The employee side of HR Notices: the inbox, reading a notice,
 * acknowledging it, asking HR a question. Everything is scoped to the
 * logged-in employee's own recipient rows — an employee can never see
 * a notice that was not sent to them, however they guess the id.
 */
@Injectable()
export class NoticeEmployeeService {
  constructor(
    private readonly notices: NoticeService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async employeeFor(userId: string): Promise<any | null> {
    if (!Types.ObjectId.isValid(userId)) return null;
    return this.notices.employeeModel.findOne({ userId: oid(userId) }).lean();
  }

  private async mustEmployee(userId: string) {
    const e = await this.employeeFor(userId);
    if (!e) throw new NotFoundException('Employee profile not found');
    return e;
  }

  /** Sent or archived notices addressed to this employee, not expired. */
  private async inbox(employee: any) {
    const recs: any[] = await this.notices.recipientModel
      .find({ employeeId: employee._id })
      .lean();
    if (!recs.length) return [];
    const notices: any[] = await this.notices.noticeModel
      .find({
        _id: { $in: recs.map((r) => r.noticeId) },
        tenantId: employee.tenantId,
        status: { $in: [NoticeStatus.SENT, NoticeStatus.ARCHIVED] },
      })
      .lean();
    const rMap = new Map(recs.map((r) => [String(r.noticeId), r]));
    const now = Date.now();
    return notices
      .filter((n) => !n.expiresAt || new Date(n.expiresAt).getTime() > now)
      .map((n) => ({ n, r: rMap.get(String(n._id)) }))
      .sort((a, b) => {
        const pin = (x: any) => (x.n.pinned && !x.r.ackAt ? 1 : 0);
        return (
          pin(b) - pin(a) ||
          new Date(b.n.sentAt).getTime() - new Date(a.n.sentAt).getTime()
        );
      });
  }

  private needsAction(x: { n: any; r: any }) {
    return x.n.requireAck && !x.r.ackAt && x.n.status === NoticeStatus.SENT;
  }

  private listItem(x: { n: any; r: any }) {
    const { n, r } = x;
    return {
      id: String(n._id),
      ref: n.ref,
      title: n.title,
      summary: n.summary,
      category: n.category,
      priority: n.priority,
      pinned: !!n.pinned,
      archived: n.status === NoticeStatus.ARCHIVED,
      sentAt: n.sentAt,
      requireAck: !!n.requireAck,
      ackMethod: n.ackMethod,
      deadline: n.deadline,
      seen: !!r.seenAt,
      acknowledgedAt: r.ackAt,
      needsAction: this.needsAction(x),
      overdue:
        this.needsAction(x) &&
        !!n.deadline &&
        new Date(n.deadline).getTime() < Date.now(),
    };
  }

  /**
   * Powers the line under the dashboard greeting. Safe to call for
   * anyone: a user with no employee record (an owner browsing the
   * employee workspace) simply gets hasProfile=false.
   */
  async summary(userId: string) {
    const employee = await this.employeeFor(userId);
    if (!employee) {
      return {
        hasProfile: false,
        needsAction: 0,
        overdue: 0,
        unread: 0,
        next: null,
      };
    }
    const all = await this.inbox(employee);
    const action = all.filter((x) => this.needsAction(x));
    const overdue = action.filter(
      (x) => x.n.deadline && new Date(x.n.deadline).getTime() < Date.now(),
    );
    const unread = all.filter(
      (x) => !x.r.seenAt && x.n.status === NoticeStatus.SENT,
    );
    const next = action
      .slice()
      .sort(
        (a, b) =>
          new Date(a.n.deadline).getTime() - new Date(b.n.deadline).getTime(),
      )[0];
    return {
      hasProfile: true,
      needsAction: action.length,
      overdue: overdue.length,
      unread: unread.length,
      next: next
        ? {
            id: String(next.n._id),
            title: next.n.title,
            deadline: next.n.deadline,
            overdue:
              !!next.n.deadline &&
              new Date(next.n.deadline).getTime() < Date.now(),
          }
        : null,
    };
  }

  async list(userId: string, filter: string) {
    const employee = await this.mustEmployee(userId);
    const all = await this.inbox(employee);
    const pred: Record<string, (x: any) => boolean> = {
      action: (x) => this.needsAction(x),
      unread: (x) => !x.r.seenAt,
      ack: (x) => !!x.r.ackAt,
      all: () => true,
    };
    const counts = {
      action: all.filter(pred.action).length,
      unread: all.filter(pred.unread).length,
      ack: all.filter(pred.ack).length,
      all: all.length,
    };
    const rows = all.filter(pred[filter] ?? pred.action);
    const settings = await this.notices.getSettings(String(employee.tenantId));
    return {
      counts,
      items: rows.map((x) => this.listItem(x)),
      questionsEnabled: settings.questions,
    };
  }

  private async mustMine(employee: any, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Notice not found');
    const r: any = await this.notices.recipientModel.findOne({
      noticeId: oid(id),
      employeeId: employee._id,
    });
    if (!r) throw new NotFoundException('Notice not found');
    const n: any = await this.notices.noticeModel.findOne({
      _id: oid(id),
      tenantId: employee.tenantId,
      status: { $in: [NoticeStatus.SENT, NoticeStatus.ARCHIVED] },
    });
    if (!n) throw new NotFoundException('Notice not found');
    return { n, r };
  }

  private async readerView(employee: any, n: any, r: any) {
    const settings = await this.notices.getSettings(String(employee.tenantId));
    const mine = (n.questions ?? []).filter(
      (q: any) => String(q.employeeId) === String(employee._id),
    );
    const author = n.authorName || settings.senderName;
    return {
      ...this.listItem({ n, r }),
      body: String(n.body ?? '').replace(
        /\{\{first_name\}\}/g,
        employee.firstName ?? '',
      ),
      attachments: n.attachments ?? [],
      version: n.versions?.length ?? 1,
      authorName: author,
      senderName: settings.senderName,
      footer: settings.footer,
      questionsEnabled: settings.questions,
      // The correct answer is never sent to the browser.
      quiz: n.quiz ? { q: n.quiz.q, options: n.quiz.options } : null,
      acknowledgement: r.ackAt
        ? {
            at: r.ackAt,
            method: r.ackMethod,
            signature: r.signature,
            offline: !!r.offline,
            offlineMethod: r.offlineMethod,
            receiptRef: this.notices.receiptRef(n, employee, r.ackAt),
          }
        : null,
      myQuestions: mine.map((q: any) => ({
        id: String(q._id),
        text: q.text,
        at: q.at,
        reply: q.reply,
        replyAt: q.replyAt,
        replyByName: q.replyByName,
      })),
    };
  }

  /** Open a notice. First open stamps the read receipt. */
  async open(userId: string, id: string) {
    const employee = await this.mustEmployee(userId);
    const { n, r } = await this.mustMine(employee, id);
    if (!r.seenAt) {
      const settings = await this.notices.getSettings(
        String(employee.tenantId),
      );
      const now = new Date();
      r.seenAt = now;
      if (settings.readReceipts && !r.openedAt) {
        r.openedAt = now;
        r.channel = 'inapp' as any;
      }
      await r.save();
    }
    return this.readerView(employee, n, r);
  }

  async acknowledge(
    userId: string,
    id: string,
    dto: AcknowledgeNoticeDto,
    meta: { userAgent?: string; ip?: string },
  ) {
    const employee = await this.mustEmployee(userId);
    const { n, r } = await this.mustMine(employee, id);

    if (n.status !== NoticeStatus.SENT) {
      throw new BadRequestException(
        'This notice is archived and can no longer be acknowledged.',
      );
    }
    if (!n.requireAck) {
      throw new BadRequestException(
        'This notice does not need to be acknowledged.',
      );
    }
    if (r.ackAt)
      throw new BadRequestException(
        'You have already acknowledged this notice.',
      );
    if (!dto.confirmed) {
      throw new BadRequestException(
        'Tick the confirmation box to acknowledge.',
      );
    }

    let signature: string | null = null;
    if (n.ackMethod === NoticeAckMethod.SIGNATURE) {
      const typed = normaliseName(dto.signature ?? '');
      const expected = normaliseName(
        `${employee.firstName} ${employee.lastName}`,
      );
      if (!typed || typed !== expected) {
        throw new BadRequestException(
          `Type your full name exactly as it appears in your profile: ${employee.firstName} ${employee.lastName}.`,
        );
      }
      signature = `${employee.firstName} ${employee.lastName}`;
    }
    if (n.ackMethod === NoticeAckMethod.QUIZ && n.quiz) {
      if (dto.quizAnswer === undefined || dto.quizAnswer === null) {
        throw new BadRequestException('Choose an answer.');
      }
      if (dto.quizAnswer !== n.quiz.answer) {
        throw new BadRequestException(
          'That answer is not correct. Review the notice and try again.',
        );
      }
    }

    const now = new Date();
    r.ackAt = now;
    r.ackMethod = n.ackMethod;
    r.signature = signature;
    r.device = this.deviceLabel(meta.userAgent);
    r.ipAddress = meta.ip ?? null;
    r.ackVersion = n.versions?.length ?? 1;
    r.seenAt = r.seenAt ?? now;
    r.openedAt = r.openedAt ?? now;
    await r.save();

    await this.notices.log(
      String(employee.tenantId),
      n._id,
      'ack',
      n.ackMethod === NoticeAckMethod.SIGNATURE
        ? 'Signed and acknowledged'
        : 'Acknowledged the notice',
      `${employee.firstName} ${employee.lastName}`,
    );
    return this.readerView(employee, n, r);
  }

  async ask(userId: string, id: string, dto: AskNoticeQuestionDto) {
    const employee = await this.mustEmployee(userId);
    const { n } = await this.mustMine(employee, id);
    const settings = await this.notices.getSettings(String(employee.tenantId));
    if (!settings.questions) {
      throw new ForbiddenException('Questions are turned off for notices.');
    }
    const text = dto.text.trim();
    if (!text) throw new BadRequestException('Write your question first.');
    n.questions.push({ employeeId: employee._id, text, at: new Date() });
    await n.save();

    const name = `${employee.firstName} ${employee.lastName}`;
    await this.notices.log(
      String(employee.tenantId),
      n._id,
      'question',
      `Asked: ${text.slice(0, 140)}`,
      name,
    );
    this.eventEmitter.emit('hr.notice.employee', {
      tenantId: String(employee.tenantId),
      userId: String(employee.tenantId),
      title: `${name} asked a question`,
      description: `${n.ref} "${n.title}": ${text.slice(0, 120)}`,
      link: `/hr/notices?notice=${n._id}&tab=questions`,
    });
    const fresh = await this.notices.noticeModel.findById(n._id);
    const r: any = await this.notices.recipientModel.findOne({
      noticeId: n._id,
      employeeId: employee._id,
    });
    return this.readerView(employee, fresh, r);
  }

  async receipt(userId: string, id: string) {
    const employee = await this.mustEmployee(userId);
    const { n, r } = await this.mustMine(employee, id);
    if (!r.ackAt)
      throw new NotFoundException('You have not acknowledged this notice.');
    return this.notices.buildReceipt(
      n,
      r,
      {
        id: String(employee._id),
        employeeNumber: employee.employeeNumber ?? '',
        name: `${employee.firstName} ${employee.lastName}`,
        firstName: employee.firstName,
        email: employee.email,
        role: employee.jobTitle ?? '',
        dept: '',
        deptId: null,
        location: '',
        locationId: null,
        employmentType: employee.employmentType ?? '',
        managerId: null,
        startDate: employee.startDate ?? null,
        userId: String(userId),
      },
      employee,
    );
  }

  private deviceLabel(ua?: string): string {
    if (!ua) return 'Web';
    const mobile = /Android|iPhone|iPad|Mobile/i.test(ua);
    const browser = /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'browser';
    return `${mobile ? 'Mobile' : 'Web'}, ${browser}`;
  }
}
