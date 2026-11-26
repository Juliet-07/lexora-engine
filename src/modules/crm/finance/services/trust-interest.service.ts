import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import {
  TrustLedger,
  TrustLedgerDocument,
  TrustMovement,
  TrustMovementDocument,
  TrustMovementType,
  TrustMovementStatus,
  TrustAuditAction,
  InterestTreatment,
  GlSource,
} from '../schemas';
import { GlPostingService, GL_ACCOUNTS } from './gl-posting.service';
import {
  TrustAuditService,
  TrustNotifierService,
} from './trust-support.service';
import type { TrustActor } from './trust-support.service';

const DAY = 86400000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
};
const monthKey = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const fmt = (n: number, cur: string) =>
  `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Interest on trust money ────────────────────────────────────────
// Interest is worked out from the ledger's real balance on each day
// and the rate in the trust account agreement — never typed in. A
// day's interest is earned on that day's opening balance (a deposit
// received today starts earning tomorrow), at rate ÷ 365.
//
// Nothing is stored per day: the accrual is derived on demand from the
// movements, and the only thing remembered is how far interest has
// been credited (ledger.interestCreditedThrough), so a run can never
// credit the same day twice.
//
//   Client retained → credited to the client's ledger
//   Firm retained / Pooled → recorded as firm income, never part of
//                            the client's balance
//   No interest → the ledger does not accrue

@Injectable()
export class TrustInterestService {
  private readonly logger = new Logger(TrustInterestService.name);

  constructor(
    @InjectModel(TrustLedger.name)
    private readonly ledgerModel: Model<TrustLedgerDocument>,
    @InjectModel(TrustMovement.name)
    private readonly movementModel: Model<TrustMovementDocument>,
    private readonly glPostingService: GlPostingService,
    private readonly audit: TrustAuditService,
    private readonly notifier: TrustNotifierService,
  ) {}

  private earns(l: any) {
    return (
      l.interestTreatment !== InterestTreatment.NO_INTEREST &&
      (l.interestRate ?? 0) > 0
    );
  }

  // The balance that counts for interest — what the client has, so
  // firm-retained interest (which is not theirs) is left out.
  private async effects(tenantId: Types.ObjectId, ledgerId: Types.ObjectId) {
    const rows = await this.movementModel
      .find({
        tenantId,
        ledgerId,
        $or: [
          {
            type: {
              $in: [TrustMovementType.DEPOSIT, TrustMovementType.INTEREST],
            },
            status: TrustMovementStatus.RECORDED,
            firmRetained: { $ne: true },
          },
          {
            type: TrustMovementType.DRAWDOWN,
            status: TrustMovementStatus.APPROVED,
          },
        ],
      })
      .select('type amount date authorisedAt')
      .lean();
    return rows
      .map((m: any) => ({
        at: startOfDay(
          m.type === TrustMovementType.DRAWDOWN && m.authorisedAt
            ? m.authorisedAt
            : m.date,
        ).getTime(),
        delta: m.type === TrustMovementType.DRAWDOWN ? -m.amount : m.amount,
      }))
      .sort((a, b) => a.at - b.at);
  }

  // Accrual over [from, to) — `to` exclusive — plus the average daily
  // balance across those days.
  private accrueOver(
    effects: { at: number; delta: number }[],
    rate: number,
    from: Date,
    to: Date,
  ) {
    const start = startOfDay(from).getTime();
    const end = startOfDay(to).getTime();
    if (end <= start) return { days: 0, accrued: 0, avgBalance: 0 };
    let i = 0;
    let bal = 0;
    // Balance carried in: everything dated before the first day counted.
    while (i < effects.length && effects[i].at < start)
      bal += effects[i++].delta;
    let accrued = 0;
    let sumBal = 0;
    let days = 0;
    for (let t = start; t < end; t += DAY) {
      // Opening balance of day t = everything dated before t.
      while (i < effects.length && effects[i].at < t) bal += effects[i++].delta;
      const b = Math.max(bal, 0);
      accrued += (b * rate) / 100 / 365;
      sumBal += b;
      days++;
    }
    return {
      days,
      accrued: round2(accrued),
      avgBalance: days ? round2(sumBal / days) : 0,
    };
  }

  private async rowFor(tenantId: string, l: any) {
    const tId = new Types.ObjectId(tenantId);
    const today = startOfDay(new Date());
    const rate = l.interestRate ?? 0;
    const treatment = l.interestTreatment as InterestTreatment;
    const earns = this.earns(l);
    const creditedThrough = l.interestCreditedThrough
      ? startOfDay(new Date(l.interestCreditedThrough))
      : today;
    const effects = earns
      ? await this.effects(tId, new Types.ObjectId(String(l._id)))
      : [];

    const monthStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
    );
    const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    const mtd = earns
      ? this.accrueOver(effects, rate, monthStart, today)
      : { days: 0, accrued: 0, avgBalance: 0 };
    const uncredited = earns
      ? this.accrueOver(effects, rate, creditedThrough, today)
      : { days: 0, accrued: 0, avgBalance: 0 };

    const credits = await this.movementModel
      .find({
        tenantId: tId,
        ledgerId: l._id,
        type: TrustMovementType.INTEREST,
        status: TrustMovementStatus.RECORDED,
      })
      .select('amount date firmRetained periodStart periodEnd ref')
      .sort({ date: -1 })
      .lean();
    const sum = (arr: any[]) => round2(arr.reduce((s, c) => s + c.amount, 0));
    const ytd = credits.filter((c: any) => c.date >= yearStart);

    // Six months of how the interest has actually come in, next to
    // what the balance earned in the same months.
    const history: { month: string; accrued: number; credited: number }[] = [];
    for (let k = 5; k >= 0; k--) {
      const ms = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - k, 1),
      );
      const me = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - k + 1, 1),
      );
      const upto = me.getTime() > today.getTime() ? today : me;
      history.push({
        month: monthKey(ms),
        accrued: earns ? this.accrueOver(effects, rate, ms, upto).accrued : 0,
        credited: sum(credits.filter((c: any) => c.date >= ms && c.date < me)),
      });
    }

    const nextCredit = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1),
    );
    return {
      ledgerId: String(l._id),
      clientName: l.clientName,
      mandateName: l.mandateName,
      currency: l.currency,
      treatment,
      rate,
      earns,
      avgDailyBalance: mtd.avgBalance,
      mtdAccrued: mtd.accrued,
      // Interest earned but not yet credited — what the next credit will post.
      uncreditedAccrued: uncredited.accrued,
      uncreditedDays: uncredited.days,
      creditedThrough: l.interestCreditedThrough ?? null,
      ytdCredited: sum(ytd.filter((c: any) => !c.firmRetained)),
      ytdFirmRetained: sum(ytd.filter((c: any) => c.firmRetained)),
      lifetimeCredited: sum(credits.filter((c: any) => !c.firmRetained)),
      // What this balance earns over a year at today's rate.
      projectedAnnual: earns ? round2((mtd.avgBalance * rate) / 100) : 0,
      nextCredit: earns ? nextCredit : null,
      lastCreditAt: credits[0]?.date ?? null,
      history,
    };
  }

  async getPerformance(tenantId: string, ledgerId?: string) {
    const ledgers = await this.ledgerModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        ...(ledgerId ? { _id: new Types.ObjectId(ledgerId) } : {}),
      })
      .sort({ clientName: 1 })
      .lean();
    const rows = [];
    for (const l of ledgers) rows.push(await this.rowFor(tenantId, l));
    const byCurrency: Record<
      string,
      {
        mtdAccrued: number;
        uncredited: number;
        ytdCredited: number;
        ytdFirmRetained: number;
      }
    > = {};
    for (const r of rows) {
      const t = (byCurrency[r.currency] ??= {
        mtdAccrued: 0,
        uncredited: 0,
        ytdCredited: 0,
        ytdFirmRetained: 0,
      });
      t.mtdAccrued = round2(t.mtdAccrued + r.mtdAccrued);
      t.uncredited = round2(t.uncredited + r.uncreditedAccrued);
      t.ytdCredited = round2(t.ytdCredited + r.ytdCredited);
      t.ytdFirmRetained = round2(t.ytdFirmRetained + r.ytdFirmRetained);
    }
    return { rows, byCurrency, asOf: new Date() };
  }

  // The "Run daily accrual" button: recomputes everything and puts the
  // result on the record.
  async runAccrual(tenantId: string, actor: TrustActor | null) {
    const perf = await this.getPerformance(tenantId);
    for (const [cur, t] of Object.entries(perf.byCurrency)) {
      await this.audit.log(tenantId, {
        action: TrustAuditAction.INTEREST_ACCRUAL,
        details: `Accrual run — ${fmt(t.mtdAccrued, cur)} month-to-date, ${fmt(t.uncredited, cur)} awaiting credit`,
        amount: t.mtdAccrued,
        currency: cur,
        actor,
      });
    }
    return perf;
  }

  // Credits the interest accrued since the last credit, up to and
  // including `through` (default: yesterday). Posts the money and moves
  // the ledger's credited-through date forward, so it cannot be
  // credited twice.
  async creditInterest(
    tenantId: string,
    ledgerId: string,
    through: string | undefined,
    actor: TrustActor | null,
  ) {
    const l: any = await this.ledgerModel
      .findOne({
        _id: ledgerId,
        tenantId: new Types.ObjectId(tenantId),
      })
      .lean();
    if (!l) throw new NotFoundException('Trust ledger not found');
    if (!this.earns(l)) {
      throw new BadRequestException(
        'This ledger does not earn interest — set a rate and a treatment first',
      );
    }
    const today = startOfDay(new Date());
    let to = today;
    if (through) {
      const t = new Date(startOfDay(new Date(through)).getTime() + DAY);
      if (t.getTime() > today.getTime()) {
        throw new BadRequestException(
          'Interest can only be credited up to yesterday',
        );
      }
      to = t;
    }
    const from = l.interestCreditedThrough
      ? startOfDay(new Date(l.interestCreditedThrough))
      : today;
    if (to.getTime() <= from.getTime()) {
      throw new BadRequestException('There is no new interest to credit yet');
    }

    const effects = await this.effects(new Types.ObjectId(tenantId), l._id);
    const { accrued } = this.accrueOver(effects, l.interestRate, from, to);
    const lastDay = new Date(to.getTime() - DAY);
    const clientOwned =
      l.interestTreatment === InterestTreatment.CLIENT_RETAINED;

    let movement: any = null;
    if (accrued >= 0.01) {
      const tId = new Types.ObjectId(tenantId);
      const count = await this.movementModel.countDocuments({ tenantId: tId });
      const ref = `TM-${String(count + 101)}`;
      movement = await this.movementModel.create({
        tenantId: tId,
        ref,
        ledgerId: l._id,
        type: TrustMovementType.INTEREST,
        amount: accrued,
        currency: l.currency,
        reference: `Interest ${from.toISOString().slice(0, 10)} to ${lastDay.toISOString().slice(0, 10)} @ ${l.interestRate}%`,
        date: new Date(),
        status: TrustMovementStatus.RECORDED,
        preparedBy: actor?.name ?? 'System',
        preparedById: actor?.id ?? null,
        periodStart: from,
        periodEnd: lastDay,
        firmRetained: !clientOwned,
        narrative: `${l.interestTreatment} interest`,
      });
      // Client's interest: the bank paid it into the trust account and
      // the firm now owes it to the client. The firm's: it is the
      // firm's income, swept to the office account.
      await this.glPostingService.post(
        tenantId,
        clientOwned
          ? [
              {
                date: new Date(),
                ref,
                description: `${l.clientName} — trust interest credited`,
                accountCode: GL_ACCOUNTS.BANK_TRUST.code,
                accountName: GL_ACCOUNTS.BANK_TRUST.name,
                source: GlSource.TRUST,
                debit: accrued,
                sourceId: movement._id,
              },
              {
                date: new Date(),
                ref,
                description: `${l.clientName} — trust interest credited`,
                accountCode: GL_ACCOUNTS.CLIENT_TRUST_LIABILITY.code,
                accountName: GL_ACCOUNTS.CLIENT_TRUST_LIABILITY.name,
                source: GlSource.TRUST,
                credit: accrued,
                sourceId: movement._id,
              },
            ]
          : [
              {
                date: new Date(),
                ref,
                description: `${l.clientName} — firm-retained trust interest`,
                accountCode: GL_ACCOUNTS.BANK_OPERATING.code,
                accountName: GL_ACCOUNTS.BANK_OPERATING.name,
                source: GlSource.TRUST,
                debit: accrued,
                sourceId: movement._id,
              },
              {
                date: new Date(),
                ref,
                description: `${l.clientName} — firm-retained trust interest`,
                accountCode: GL_ACCOUNTS.INTEREST_INCOME.code,
                accountName: GL_ACCOUNTS.INTEREST_INCOME.name,
                source: GlSource.TRUST,
                credit: accrued,
                sourceId: movement._id,
              },
            ],
        l.currency,
      );
    }

    await this.ledgerModel.updateOne(
      { _id: l._id },
      { $set: { interestCreditedThrough: to } },
    );
    await this.audit.log(tenantId, {
      action: TrustAuditAction.INTEREST_CREDITED,
      ledger: l,
      movementId: movement?._id,
      details:
        accrued >= 0.01
          ? `${from.toISOString().slice(0, 10)} → ${lastDay.toISOString().slice(0, 10)} @ ${l.interestRate}% p.a. · ${l.interestTreatment}${clientOwned ? ' · credited to client ledger' : ' · recognised as firm income'}`
          : `${from.toISOString().slice(0, 10)} → ${lastDay.toISOString().slice(0, 10)} — nothing earned (no balance)`,
      amount: accrued,
      currency: l.currency,
      actor,
    });
    if (movement && clientOwned) {
      await this.notifier.notify(
        tenantId,
        l,
        'interestCredits',
        'Interest credited',
        `${fmt(accrued, l.currency)} interest at ${l.interestRate}% p.a. was credited to your trust ledger for ${from.toISOString().slice(0, 10)} to ${lastDay.toISOString().slice(0, 10)}.`,
      );
    }
    return {
      ledgerId,
      credited: accrued,
      from,
      through: lastDay,
      clientOwned,
      movementRef: movement?.ref ?? null,
    };
  }

  async creditAllDue(tenantId: string, actor: TrustActor | null) {
    const ledgers = await this.ledgerModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .lean();
    const results: any[] = [];
    for (const l of ledgers) {
      if (!this.earns(l)) continue;
      try {
        results.push({
          clientName: l.clientName,
          currency: l.currency,
          ...(await this.creditInterest(
            tenantId,
            String(l._id),
            undefined,
            actor,
          )),
        });
      } catch {
        /* nothing new to credit for this ledger */
      }
    }
    return results;
  }

  // First of every month, just after midnight: credit last month's
  // interest on every ledger that earns it, for every tenant.
  @Cron('15 0 1 * *')
  async monthlyCredit() {
    const tenantIds: Types.ObjectId[] = await this.ledgerModel.distinct(
      'tenantId',
      {
        interestRate: { $gt: 0 },
      },
    );
    for (const t of tenantIds) {
      try {
        const done = await this.creditAllDue(String(t), null);
        this.logger.log(
          `Trust interest credited for ${t}: ${done.length} ledger(s)`,
        );
      } catch (e: any) {
        this.logger.error(
          `Trust interest run failed for ${t}: ${e?.message ?? e}`,
        );
      }
    }
  }
}
