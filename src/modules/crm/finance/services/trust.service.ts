import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TrustLedger,
  TrustLedgerDocument,
  TrustMovement,
  TrustMovementDocument,
  TrustMovementType,
  TrustMovementStatus,
  BankAccount,
  BankAccountDocument,
  BankAccountType,
} from '../schemas';
import {
  CreateTrustLedgerDto,
  RecordTrustDepositDto,
  RequestTrustDrawdownDto,
} from '../dtos';
import { GlPostingService, GL_ACCOUNTS } from './gl-posting.service';
import { GlSource } from '../schemas';
import { BankAccountService } from './banking.service';

// ── Trust ledgers — a per-client sub-ledger within the firm's real
// Trust-type bank account. Balance is never stored — always
// computed live from real movements, the exact discipline
// BankAccount's own balance already follows. ─────────────────────

@Injectable()
export class TrustLedgerService {
  constructor(
    @InjectModel(TrustLedger.name)
    private readonly model: Model<TrustLedgerDocument>,
    @InjectModel(TrustMovement.name)
    private readonly movementModel: Model<TrustMovementDocument>,
    @InjectModel(BankAccount.name)
    private readonly bankAccountModel: Model<BankAccountDocument>,
    private readonly bankAccountService: BankAccountService,
  ) {}

  // Only Recorded deposits/interest and Approved drawdowns affect
  // the real balance — a drawdown merely awaiting authorisation
  // must never touch what the client actually has, since it hasn't
  // genuinely happened yet.
  async computeBalance(tenantId: string, ledgerId: string): Promise<number> {
    const tId = new Types.ObjectId(tenantId);
    const lId = new Types.ObjectId(ledgerId);
    const [inAgg, outAgg] = await Promise.all([
      this.movementModel.aggregate([
        {
          $match: {
            tenantId: tId,
            ledgerId: lId,
            type: {
              $in: [TrustMovementType.DEPOSIT, TrustMovementType.INTEREST],
            },
            status: TrustMovementStatus.RECORDED,
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.movementModel.aggregate([
        {
          $match: {
            tenantId: tId,
            ledgerId: lId,
            type: TrustMovementType.DRAWDOWN,
            status: TrustMovementStatus.APPROVED,
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);
    return (inAgg[0]?.total ?? 0) - (outAgg[0]?.total ?? 0);
  }

  async getAll(tenantId: string) {
    const ledgers = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
    return Promise.all(
      ledgers.map(async (l) => ({
        ...l,
        balance: await this.computeBalance(tenantId, String(l._id)),
      })),
    );
  }

  async getById(tenantId: string, id: string) {
    const l = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!l) throw new NotFoundException('Trust ledger not found');
    const balance = await this.computeBalance(tenantId, id);
    return { ...l, balance };
  }

  // A ledger can only ever be linked to a real Trust-type bank
  // account — never Office. Getting this wrong at creation is the
  // one mistake that would let trust and office money commingle
  // from day one.
  async create(tenantId: string, dto: CreateTrustLedgerDto) {
    const bankAccount = await this.bankAccountModel
      .findOne({
        _id: dto.bankAccountId,
        tenantId: new Types.ObjectId(tenantId),
      })
      .lean();
    if (!bankAccount) throw new NotFoundException('Bank account not found');
    if (bankAccount.type !== BankAccountType.TRUST) {
      throw new BadRequestException(
        'Trust ledgers can only be linked to a Trust-type bank account',
      );
    }
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      bankAccountId: new Types.ObjectId(dto.bankAccountId),
      clientUserId: new Types.ObjectId(dto.clientUserId),
      clientName: dto.clientName,
      mandateId: dto.mandateId ? new Types.ObjectId(dto.mandateId) : null,
      mandateName: dto.mandateName ?? '',
      currency: dto.currency ?? 'USD',
      interestTreatment: dto.interestTreatment,
    });
    return { ...created.toObject(), balance: 0 };
  }

  // The real "no commingling" check — the trust bank account's own
  // real balance (Banking's computeBalance) must equal the sum of
  // every client ledger's real balance. Any gap means money has
  // moved that isn't accounted for at the client level.
  async getIntegrityCheck(tenantId: string, bankAccountId: string) {
    const ledgers = await this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        bankAccountId: new Types.ObjectId(bankAccountId),
      })
      .lean();
    const ledgerBalances = await Promise.all(
      ledgers.map((l) => this.computeBalance(tenantId, String(l._id))),
    );
    const ledgerTotal = ledgerBalances.reduce((s, b) => s + b, 0);
    const bankBalance = await this.bankAccountService.computeBalance(
      tenantId,
      bankAccountId,
    );
    return {
      bankBalance,
      ledgerTotal,
      ledgerCount: ledgers.length,
      variance: bankBalance - ledgerTotal,
      matched: Math.abs(bankBalance - ledgerTotal) < 0.01,
    };
  }

  async markReconciled(tenantId: string, id: string) {
    const l = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!l) throw new NotFoundException('Trust ledger not found');
    l.lastReconciledAt = new Date();
    await l.save();
    return this.getById(tenantId, id);
  }
}

// ── Trust movements — deposits post immediately; drawdowns require
// the same preparer-then-different-authoriser pattern
// Reconciliation and Period-close already use, and the no-overdraw
// rule is enforced twice: once at request, once at authorisation,
// since the balance can genuinely change between the two. ────────

@Injectable()
export class TrustMovementService {
  constructor(
    @InjectModel(TrustMovement.name)
    private readonly model: Model<TrustMovementDocument>,
    private readonly ledgerService: TrustLedgerService,
    private readonly glPostingService: GlPostingService,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const count = await this.model.countDocuments({ tenantId });
    return `TM-${String(count + 101)}`;
  }

  async getAll(tenantId: string, ledgerId?: string) {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (ledgerId) query.ledgerId = new Types.ObjectId(ledgerId);
    return this.model.find(query).sort({ date: -1 }).lean();
  }

  async recordDeposit(tenantId: string, dto: RecordTrustDepositDto) {
    const ledger = await this.ledgerService.getById(tenantId, dto.ledgerId);
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      ledgerId: new Types.ObjectId(dto.ledgerId),
      type: TrustMovementType.DEPOSIT,
      amount: dto.amount,
      reference: dto.reference ?? 'Client receipt',
      date: new Date(dto.date),
      status: TrustMovementStatus.RECORDED,
      preparedBy: dto.preparedBy,
    });

    // Real double-entry — money arriving in the ring-fenced trust
    // bank account, matched by an equal increase in what the firm
    // owes this client. Dr Bank-trust, Cr Client trust liability.
    await this.glPostingService.post(tenantId, [
      {
        date: new Date(dto.date),
        ref,
        description: `${ledger.clientName} — trust deposit`,
        accountCode: GL_ACCOUNTS.BANK_TRUST.code,
        accountName: GL_ACCOUNTS.BANK_TRUST.name,
        source: GlSource.TRUST,
        debit: dto.amount,
        sourceId: created._id,
      },
      {
        date: new Date(dto.date),
        ref,
        description: `${ledger.clientName} — trust deposit`,
        accountCode: GL_ACCOUNTS.CLIENT_TRUST_LIABILITY.code,
        accountName: GL_ACCOUNTS.CLIENT_TRUST_LIABILITY.name,
        source: GlSource.TRUST,
        credit: dto.amount,
        sourceId: created._id,
      },
    ]);

    return created.toObject();
  }

  // No-overdraw enforcement at request time — a client can never
  // even be asked to draw down more than they genuinely have,
  // before an authoriser ever sees it.
  async requestDrawdown(tenantId: string, dto: RequestTrustDrawdownDto) {
    const ledger = await this.ledgerService.getById(tenantId, dto.ledgerId);
    if (dto.amount > ledger.balance) {
      throw new BadRequestException(
        `Drawdown of ${dto.amount} exceeds the client's real trust balance of ${ledger.balance}`,
      );
    }
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      ledgerId: new Types.ObjectId(dto.ledgerId),
      type: TrustMovementType.DRAWDOWN,
      amount: dto.amount,
      reference: dto.linkedInvoiceId
        ? `Invoice ${dto.linkedInvoiceId}`
        : 'Trust-to-office transfer',
      date: new Date(),
      status: TrustMovementStatus.AWAITING_AUTHORISATION,
      preparedBy: dto.preparedBy,
      linkedInvoiceId: dto.linkedInvoiceId
        ? new Types.ObjectId(dto.linkedInvoiceId)
        : null,
    });
    return created.toObject();
  }

  // The real dual-control checkpoint. Re-checks the balance again
  // here, not just at request time — another drawdown could have
  // been approved in between, changing what's genuinely still
  // available to draw down.
  async authoriseDrawdown(
    tenantId: string,
    movementId: string,
    authorisedBy: string,
  ) {
    const m = await this.model.findOne({
      _id: movementId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!m) throw new NotFoundException('Movement not found');
    if (m.status !== TrustMovementStatus.AWAITING_AUTHORISATION) {
      throw new BadRequestException(
        'This movement is not awaiting authorisation',
      );
    }
    if (m.preparedBy === authorisedBy) {
      throw new BadRequestException(
        'The authoriser must be different from the preparer',
      );
    }
    const ledger = await this.ledgerService.getById(
      tenantId,
      String(m.ledgerId),
    );
    if (m.amount > ledger.balance) {
      throw new BadRequestException(
        `Cannot authorise — this would overdraw the client's trust balance (available: ${ledger.balance})`,
      );
    }

    m.status = TrustMovementStatus.APPROVED;
    m.authorisedBy = authorisedBy;
    m.authorisedAt = new Date();
    await m.save();

    // Real double-entry — money genuinely leaving the trust
    // account, matched by an equal decrease in what the firm owes
    // this client. Dr Client trust liability, Cr Bank-trust.
    await this.glPostingService.post(tenantId, [
      {
        date: new Date(),
        ref: m.ref,
        description: `${ledger.clientName} — trust drawdown`,
        accountCode: GL_ACCOUNTS.CLIENT_TRUST_LIABILITY.code,
        accountName: GL_ACCOUNTS.CLIENT_TRUST_LIABILITY.name,
        source: GlSource.TRUST,
        debit: m.amount,
        sourceId: m._id,
      },
      {
        date: new Date(),
        ref: m.ref,
        description: `${ledger.clientName} — trust drawdown`,
        accountCode: GL_ACCOUNTS.BANK_TRUST.code,
        accountName: GL_ACCOUNTS.BANK_TRUST.name,
        source: GlSource.TRUST,
        credit: m.amount,
        sourceId: m._id,
      },
    ]);

    return m.toObject();
  }

  async rejectDrawdown(tenantId: string, movementId: string, reason?: string) {
    const m = await this.model.findOne({
      _id: movementId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!m) throw new NotFoundException('Movement not found');
    if (m.status !== TrustMovementStatus.AWAITING_AUTHORISATION) {
      throw new BadRequestException(
        'This movement is not awaiting authorisation',
      );
    }
    m.status = TrustMovementStatus.REJECTED;
    m.rejectedReason = reason ?? null;
    await m.save();
    return m.toObject();
  }
}
