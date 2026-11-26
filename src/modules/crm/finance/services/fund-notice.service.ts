import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Fund,
  FundDocument,
  CapitalCommitment,
  CapitalCommitmentDocument,
  CapitalCall,
  CapitalCallDocument,
  CapitalCallStatus,
  NoticeSendStatus,
  BankAccount,
  BankAccountDocument,
} from '../schemas';
import { SendCallNoticesDto } from '../dtos';
import {
  buildCapitalCallNoticesPdf,
  CallNoticeData,
} from 'src/common/utils/pdf/fund-pdf.util';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { ClientNotificationType } from 'src/modules/clients/schemas/client-notification.schema';
import { FundStatementService } from './fund-statement.service';

const money = (n: number, cur: string) =>
  `${cur} ${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const slug = (s: string) =>
  s
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase();

export const NOTICE_METHODS = [
  'Email with PDF attachment',
  'Email with link to portal',
  'Email + portal notification',
];

// ── Capital call notices — the formal, per-LP document that asks an
// investor to honour their commitment, and the record of who it went
// to. A notice is always built from the issued call (its frozen
// allocation), the LP's commitment and the fund's own terms — never
// typed in, so it cannot disagree with the books. ───────────────────

@Injectable()
export class FundNoticeService {
  private readonly logger = new Logger(FundNoticeService.name);

  constructor(
    @InjectModel(Fund.name) private readonly fundModel: Model<FundDocument>,
    @InjectModel(CapitalCommitment.name)
    private readonly commitmentModel: Model<CapitalCommitmentDocument>,
    @InjectModel(CapitalCall.name)
    private readonly callModel: Model<CapitalCallDocument>,
    @InjectModel(BankAccount.name)
    private readonly bankAccountModel: Model<BankAccountDocument>,
    private readonly email: EmailService,
    private readonly events: EventEmitter2,
    private readonly statements: FundStatementService,
  ) {}

  private async load(tenantId: string, fundId: string, callId: string) {
    const tId = new Types.ObjectId(tenantId);
    const [fund, call] = await Promise.all([
      this.fundModel.findOne({ _id: fundId, tenantId: tId }).lean(),
      this.callModel
        .findOne({
          _id: callId,
          fundId: new Types.ObjectId(fundId),
          tenantId: tId,
        })
        .lean(),
    ]);
    if (!fund) throw new NotFoundException('Fund not found');
    if (!call) throw new NotFoundException('Capital call not found');
    if (call.status === CapitalCallStatus.DRAFT) {
      throw new BadRequestException(
        'Issue the call first — notices are generated from the frozen pro-rata split',
      );
    }
    const commitments = await this.commitmentModel
      .find({ tenantId: tId, fundId: new Types.ObjectId(fundId) })
      .lean();
    const earlier = await this.callModel
      .find({
        tenantId: tId,
        fundId: new Types.ObjectId(fundId),
        _id: { $ne: call._id },
        status: { $ne: CapitalCallStatus.DRAFT },
        createdAt: { $lt: (call as any).createdAt },
      })
      .lean();
    return { fund, call, commitments, earlier };
  }

  private async wireFor(fund: any, reference: string) {
    let bank = fund.wireBankName;
    let account = fund.wireAccountNumber;
    if ((!bank || !account) && fund.bankAccountId) {
      const b = await this.bankAccountModel.findById(fund.bankAccountId).lean();
      if (b) {
        bank = bank || b.bank;
        account = account || `•••• ${b.last4}`;
      }
    }
    return {
      beneficiary: fund.wireBeneficiary || fund.name,
      bank: bank || '',
      accountNumber: account || '',
      swift: fund.wireSwift || '',
      branch: fund.wireBranch || '',
      currency: fund.currency,
      reference,
    };
  }

  private buildData(
    ctx: { fund: any; call: any; commitments: any[]; earlier: any[] },
    commitment: any,
    wire: CallNoticeData['wire'],
  ): CallNoticeData {
    const { fund, call, earlier } = ctx;
    const alloc = (call.allocations as any[]).find(
      (a) => String(a.commitmentId) === String(commitment._id),
    );
    if (!alloc) {
      throw new NotFoundException('No allocation for this LP on this call');
    }
    const total = ctx.commitments.reduce((s, c) => s + c.commitment, 0);
    const pct =
      alloc.pct || (total ? r2((commitment.commitment / total) * 100) : 0);
    const previouslyCalled = r2(
      earlier.reduce((s, c) => {
        const a = (c.allocations as any[]).find(
          (x) => String(x.commitmentId) === String(commitment._id),
        );
        return s + (a?.amount ?? 0);
      }, 0),
    );
    const totalCalledAfter = r2(previouslyCalled + alloc.amount);
    const fundRate = fund.mgmtFeePct ?? 0;
    const lpRate = commitment.mgmtFeePctOverride ?? fundRate;

    // Each fund-level line becomes this LP's share. A management-fee
    // line follows the LP's own rate — a side letter that lowers it
    // lowers this line, and the difference falls into the balance.
    const lines = (call.useOfProceeds as any[]).map((l) => {
      const isFee = l.kind === 'fee';
      const scale = isFee && fundRate > 0 ? lpRate / fundRate : 1;
      return {
        label: l.label,
        amount: r2(l.amount * (pct / 100) * scale),
        note: isFee ? `${lpRate}% p.a.` : `${pct.toFixed(2)}%`,
      };
    });
    const listed = r2(lines.reduce((s, l) => s + l.amount, 0));
    if (lines.length && alloc.amount - listed > 0.01) {
      lines.push({
        label: 'Working capital / balance',
        amount: r2(alloc.amount - listed),
        note: 'Balance',
      });
    }

    return {
      fundName: fund.name,
      fundDescriptor: `A ${fund.structure || 'fund'}${fund.jurisdiction ? ` established under the laws of ${fund.jurisdiction}` : ''}`,
      gpName: fund.gpEntityName || '',
      noticeDate: call.noticeDate ?? call.issuedOn,
      callRef: call.ref,
      lpaDate: fund.lpaDate ?? null,
      lpName: commitment.lpName,
      lpType: commitment.type,
      closeLabel: commitment.closeLabel,
      currency: fund.currency,
      totalCall: call.totalAmount,
      pct,
      lpAmount: alloc.amount,
      dueDate: call.dueOn,
      cureDays: fund.curePeriodDays,
      defaultInterestPct: fund.defaultInterestPct,
      forfeiturePct: fund.forfeiturePct,
      lpaCallClause: fund.lpaCallClause || '4.1',
      lpaDefaultInterestClause: fund.lpaDefaultInterestClause || '4.3',
      lpaDefaultClause: fund.lpaDefaultClause || '4.4',
      commitment: commitment.commitment,
      previouslyCalled,
      totalCalledAfter,
      pctCalledAfter: commitment.commitment
        ? (totalCalledAfter / commitment.commitment) * 100
        : 0,
      remainingUnfunded: r2(commitment.commitment - totalCalledAfter),
      purpose: call.purpose,
      narrative: call.narrative,
      wire: { ...wire, reference: `${call.ref} / ${slug(commitment.lpName)}` },
      useOfProceeds: lines,
      signatory: fund.noticeSignatory || '',
      signatoryTitle: fund.noticeSignatoryTitle || '',
    };
  }

  // Everything the preview modal needs: one notice per LP, with who it
  // would go to and whether there is an address to send it to.
  async preview(tenantId: string, fundId: string, callId: string) {
    const ctx = await this.load(tenantId, fundId, callId);
    const wire = await this.wireFor(ctx.fund, '');
    const notices = (ctx.call.allocations as any[]).map((a) => {
      const c = ctx.commitments.find(
        (x) => String(x._id) === String(a.commitmentId),
      );
      if (!c) return null;
      const log = [...((ctx.call.noticeLog as any[]) ?? [])]
        .reverse()
        .find((l) => String(l.commitmentId) === String(c._id));
      return {
        commitmentId: String(c._id),
        lpName: c.lpName,
        lpEmail: c.lpEmail || '',
        amount: a.amount,
        lastSend: log
          ? { status: log.status, sentAt: log.sentAt, method: log.method }
          : null,
        data: this.buildData(ctx, c, wire),
      };
    });
    return {
      callRef: ctx.call.ref,
      currency: ctx.fund.currency,
      scheduledSendAt: ctx.call.scheduledSendAt,
      noticesSentAt: ctx.call.noticesSentAt,
      notices: notices.filter(Boolean),
      wireConfigured: !!(wire.bank && wire.accountNumber),
      administratorEmail: ctx.fund.administratorEmail || '',
    };
  }

  // One LP's notice, or every LP's in one PDF.
  async pdf(
    tenantId: string,
    fundId: string,
    callId: string,
    commitmentId?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const ctx = await this.load(tenantId, fundId, callId);
    const wire = await this.wireFor(ctx.fund, '');
    const targets = commitmentId
      ? ctx.commitments.filter((c) => String(c._id) === commitmentId)
      : ctx.commitments.filter((c) =>
          (ctx.call.allocations as any[]).some(
            (a) => String(a.commitmentId) === String(c._id),
          ),
        );
    if (!targets.length) throw new NotFoundException('No notices to generate');
    const buffer = await buildCapitalCallNoticesPdf(
      targets.map((c) => this.buildData(ctx, c, wire)),
    );
    return {
      buffer,
      filename: commitmentId
        ? `Capital-call-notice-${ctx.call.ref}-${slug(targets[0].lpName)}.pdf`
        : `Capital-call-notices-${ctx.call.ref}.pdf`,
    };
  }

  // ── Sending ────────────────────────────────────────────────────

  async send(
    tenantId: string,
    fundId: string,
    callId: string,
    dto: SendCallNoticesDto,
    actorName: string,
  ) {
    const ctx = await this.load(tenantId, fundId, callId);
    const ids = (
      dto.commitmentIds?.length
        ? dto.commitmentIds
        : (ctx.call.allocations as any[]).map((a) => String(a.commitmentId))
    ).filter((id) =>
      (ctx.call.allocations as any[]).some(
        (a) => String(a.commitmentId) === id,
      ),
    );
    if (!ids.length) {
      throw new BadRequestException('Choose at least one LP to notify');
    }
    const method = dto.method ?? NOTICE_METHODS[0];
    if (!NOTICE_METHODS.includes(method)) {
      throw new BadRequestException('Unknown delivery method');
    }

    const sendAt = dto.sendAt ? new Date(dto.sendAt) : null;
    if (sendAt && sendAt.getTime() > Date.now() + 60 * 1000) {
      const call = await this.callModel.findById(callId);
      if (!call) throw new NotFoundException('Capital call not found');
      call.scheduledSendAt = sendAt;
      call.scheduledSend = { ...dto, commitmentIds: ids, method, actorName };
      for (const id of ids) {
        const c = ctx.commitments.find((x) => String(x._id) === id);
        call.noticeLog.push({
          commitmentId: new Types.ObjectId(id),
          lpName: c?.lpName ?? '',
          email: c?.lpEmail ?? '',
          method,
          status: NoticeSendStatus.SCHEDULED,
          sentAt: sendAt,
          error: '',
          sentBy: actorName,
        } as any);
      }
      await call.save();
      return { scheduled: true, sendAt, count: ids.length };
    }
    return this.dispatch(
      tenantId,
      fundId,
      callId,
      { ...dto, commitmentIds: ids, method },
      actorName,
    );
  }

  private async dispatch(
    tenantId: string,
    fundId: string,
    callId: string,
    dto: SendCallNoticesDto,
    actorName: string,
  ) {
    const ctx = await this.load(tenantId, fundId, callId);
    const wire = await this.wireFor(ctx.fund, '');
    const method = dto.method ?? NOTICE_METHODS[0];
    const withPdf = method !== 'Email with link to portal';
    const withPortal = method !== 'Email with PDF attachment';
    const appUrl = process.env.CLIENT_APP_URL || process.env.APP_URL || '';
    const subject =
      dto.subject?.trim() ||
      `Capital Call Notice ${ctx.call.ref} — ${ctx.fund.name}`;
    const cc =
      dto.ccAdministrator && ctx.fund.administratorEmail
        ? ctx.fund.administratorEmail
        : undefined;

    const results: any[] = [];
    for (const id of dto.commitmentIds ?? []) {
      const c = ctx.commitments.find((x) => String(x._id) === id);
      if (!c) continue;
      const entry: any = {
        commitmentId: c._id,
        lpName: c.lpName,
        email: c.lpEmail || '',
        method,
        status: NoticeSendStatus.SENT,
        sentAt: new Date(),
        error: '',
        sentBy: actorName,
      };
      try {
        const data = this.buildData(ctx, c, wire);
        if (!c.lpEmail && !withPortal) {
          throw new Error('No email address on file for this LP');
        }
        if (c.lpEmail) {
          const attachments: { filename: string; content: Buffer }[] = [];
          if (withPdf) {
            attachments.push({
              filename: `Capital-call-notice-${ctx.call.ref}-${slug(c.lpName)}.pdf`,
              content: await buildCapitalCallNoticesPdf([data]),
            });
          }
          if (dto.attachStatement) {
            const st = await this.statements.statementPdf(
              tenantId,
              fundId,
              String(c._id),
            );
            attachments.push({ filename: st.filename, content: st.buffer });
          }
          await this.email.sendFundNotice(
            {
              to: c.lpEmail,
              cc,
              recipientName: c.lpName,
              fundName: ctx.fund.name,
              subject,
              message:
                (dto.message?.trim() ? dto.message.trim() + '\n\n' : '') +
                `A capital call has been issued for ${ctx.fund.name} under the Limited Partnership Agreement. Your share, ${money(data.lpAmount, data.currency)}, is due on ${new Date(ctx.call.dueOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
              highlight: `${money(data.lpAmount, data.currency)} due by ${new Date(ctx.call.dueOn).toLocaleDateString('en-GB')} — reference ${data.wire.reference}`,
              attachmentNote: attachments.length
                ? 'The formal notice is attached as a PDF.'
                : undefined,
              appUrl: withPdf && !withPortal ? undefined : appUrl || undefined,
              linkLabel: 'View in your portal',
            },
            attachments,
          );
        }
        if (withPortal) {
          this.events.emit('client.general.notice', {
            tenantId,
            clientUserId: String(c.lpUserId),
            title: `Capital call ${ctx.call.ref} — ${ctx.fund.name}`,
            description: `${money(this.buildData(ctx, c, wire).lpAmount, ctx.fund.currency)} is due on ${new Date(ctx.call.dueOn).toLocaleDateString('en-GB')}.`,
            type: ClientNotificationType.PAYMENT,
          });
        }
      } catch (e: any) {
        entry.status = NoticeSendStatus.FAILED;
        entry.error = String(e?.message ?? e).slice(0, 300);
        this.logger.warn(`Call notice to ${c.lpName} failed: ${entry.error}`);
      }
      results.push(entry);
    }

    const call = await this.callModel.findById(callId);
    if (call) {
      // A scheduled entry that has now gone out is replaced by its result.
      const sentIds = new Set(results.map((r) => String(r.commitmentId)));
      call.noticeLog = call.noticeLog.filter(
        (l: any) =>
          !(
            l.status === NoticeSendStatus.SCHEDULED &&
            sentIds.has(String(l.commitmentId))
          ),
      ) as any;
      call.noticeLog.push(...results);
      if (results.some((r) => r.status === NoticeSendStatus.SENT)) {
        call.noticesSentAt = new Date();
      }
      call.scheduledSendAt = null;
      call.scheduledSend = null;
      await call.save();
    }
    return {
      scheduled: false,
      sent: results.filter((r) => r.status === NoticeSendStatus.SENT).length,
      failed: results
        .filter((r) => r.status === NoticeSendStatus.FAILED)
        .map((r) => ({ lpName: r.lpName, error: r.error })),
    };
  }

  // Notices scheduled for later go out on the next minute after their
  // time.
  @Cron(CronExpression.EVERY_MINUTE)
  async sendScheduled() {
    const due = await this.callModel
      .find({ scheduledSendAt: { $lte: new Date(), $ne: null } })
      .lean();
    for (const c of due) {
      try {
        const cfg: any = c.scheduledSend ?? {};
        await this.dispatch(
          String(c.tenantId),
          String(c.fundId),
          String(c._id),
          { ...cfg, sendAt: undefined },
          cfg.actorName ?? 'Scheduled send',
        );
      } catch (e: any) {
        this.logger.error(
          `Scheduled notices for ${c.ref} failed: ${e?.message ?? e}`,
        );
        await this.callModel.updateOne(
          { _id: c._id },
          { $set: { scheduledSendAt: null, scheduledSend: null } },
        );
      }
    }
  }
}
