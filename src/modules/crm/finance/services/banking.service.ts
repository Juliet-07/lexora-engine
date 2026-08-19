import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BankAccount,
  BankAccountDocument,
  BankTransaction,
  BankTransactionDocument,
  BankRule,
  BankRuleDocument,
  Transfer,
  TransferDocument,
  Reconciliation,
  ReconciliationDocument,
  TxStatus,
} from '../schemas';
import {
  CreateBankAccountDto,
  CreateBankTransactionDto,
  MatchTransactionDto,
  CreateBankRuleDto,
  CreateTransferDto,
  SetStatementBalanceDto,
  SignOffReconciliationDto,
} from '../dtos';
import { InvoiceService } from './invoice.service';
import { BillService } from './purchases.service';
import { PayrollRunService } from 'src/modules/hr/services/payroll-run.service';
import { GlPostingService, GL_ACCOUNTS } from './gl-posting.service';
import { GlSource } from '../schemas';

// ── Bank rules — a leaf, matched against by BankTransactionService ──

@Injectable()
export class BankRuleService {
  constructor(
    @InjectModel(BankRule.name)
    private readonly model: Model<BankRuleDocument>,
  ) {}

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async create(tenantId: string, dto: CreateBankRuleDto) {
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      matchText: dto.matchText,
      account: dto.account,
      auto: dto.auto ?? true,
    });
    return created.toObject();
  }

  // Real, applied matching — first active rule whose matchText
  // appears in the transaction's description wins. Not a stored
  // description of a rule, an actual function every recorded
  // transaction is run through.
  async findMatch(tenantId: string, description: string) {
    const rules = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId), auto: true })
      .lean();
    const lower = description.toLowerCase();
    return rules.find((r) => lower.includes(r.matchText.toLowerCase())) ?? null;
  }
}

// ── Accounts — balance is always computed, never stored ──────

@Injectable()
export class BankAccountService {
  constructor(
    @InjectModel(BankAccount.name)
    private readonly model: Model<BankAccountDocument>,
    @InjectModel(BankTransaction.name)
    private readonly txModel: Model<BankTransactionDocument>,
    @InjectModel(Transfer.name)
    private readonly transferModel: Model<TransferDocument>,
  ) {}

  // Balance is never stored — it's openingBalance plus every real
  // transaction and transfer that's happened since, computed live.
  // A stored, separately-updated balance is exactly the kind of
  // number that drifts from reality the first time something is
  // missed.
  async computeBalance(tenantId: string, accountId: string): Promise<number> {
    const tId = new Types.ObjectId(tenantId);
    const aId = new Types.ObjectId(accountId);
    const account = await this.model
      .findOne({ _id: aId, tenantId: tId })
      .lean();
    if (!account) throw new NotFoundException('Bank account not found');

    const [txAgg, inAgg, outAgg] = await Promise.all([
      this.txModel.aggregate([
        { $match: { tenantId: tId, accountId: aId } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.transferModel.aggregate([
        { $match: { tenantId: tId, toAccountId: aId } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.transferModel.aggregate([
        { $match: { tenantId: tId, fromAccountId: aId } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    return (
      account.openingBalance +
      (txAgg[0]?.total ?? 0) +
      (inAgg[0]?.total ?? 0) -
      (outAgg[0]?.total ?? 0)
    );
  }

  async getAll(tenantId: string) {
    const rows = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .lean();
    return Promise.all(
      rows.map(async (a) => ({
        ...a,
        balance: await this.computeBalance(tenantId, String(a._id)),
      })),
    );
  }

  async create(tenantId: string, dto: CreateBankAccountDto) {
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      bank: dto.bank,
      last4: dto.last4,
      currency: dto.currency ?? 'USD',
      openingBalance: dto.openingBalance ?? 0,
      type: dto.type,
    });
    return { ...created.toObject(), balance: dto.openingBalance ?? 0 };
  }
}

// ── Bank feed / transactions ──────────────────────────────────

@Injectable()
export class BankTransactionService {
  constructor(
    @InjectModel(BankTransaction.name)
    private readonly model: Model<BankTransactionDocument>,
    @InjectModel(BankAccount.name)
    private readonly accountModel: Model<BankAccountDocument>,
    private readonly ruleService: BankRuleService,
    private readonly glPostingService: GlPostingService,
  ) {}

  async getAll(tenantId: string, accountId?: string) {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (accountId) query.accountId = new Types.ObjectId(accountId);
    return this.model.find(query).sort({ date: -1 }).lean();
  }

  // Recording a transaction is the real "feed import" moment — there's
  // no live external bank connection to sync from, so this is the
  // real entry point transactions actually come from. A matching
  // bank rule is applied automatically at this point, same as it
  // would be for an actual synced feed. It's also a real cash
  // movement, so it posts to the GL immediately — against the
  // bank's own account code (1110 operating, or 1120 for a real
  // Trust account) and the suggested/contra account, falling back
  // to General expenses if nothing matched. A transaction later
  // matched to a specific invoice or bill isn't re-posted — the
  // cash movement already happened here; matching just links it to
  // the business document for traceability.
  async create(tenantId: string, dto: CreateBankTransactionDto) {
    const [rule, account] = await Promise.all([
      this.ruleService.findMatch(tenantId, dto.description),
      this.accountModel
        .findOne({
          _id: dto.accountId,
          tenantId: new Types.ObjectId(tenantId),
        })
        .lean(),
    ]);
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      accountId: new Types.ObjectId(dto.accountId),
      date: new Date(dto.date),
      description: dto.description,
      amount: dto.amount,
      suggestedAccount: rule?.account ?? '',
    });

    const bankGlAccount =
      account?.type === 'Trust'
        ? { code: '1120', name: 'Bank - trust (ring-fenced)' }
        : GL_ACCOUNTS.BANK_OPERATING;
    const contraCode = rule?.account?.split(' · ')[0]?.trim();
    const contra = contraCode
      ? {
          code: contraCode,
          name: rule!.account.split(' · ')[1]?.trim() ?? rule!.account,
        }
      : GL_ACCOUNTS.GENERAL_EXPENSE;
    const magnitude = Math.abs(dto.amount);
    const isInflow = dto.amount >= 0;

    await this.glPostingService.post(tenantId, [
      {
        date: new Date(dto.date),
        ref: String(created._id),
        description: dto.description,
        accountCode: bankGlAccount.code,
        accountName: bankGlAccount.name,
        source: GlSource.BANKING,
        debit: isInflow ? magnitude : 0,
        credit: isInflow ? 0 : magnitude,
        sourceId: String(created._id),
      },
      {
        date: new Date(dto.date),
        ref: String(created._id),
        description: dto.description,
        accountCode: contra.code,
        accountName: contra.name,
        source: GlSource.BANKING,
        debit: isInflow ? 0 : magnitude,
        credit: isInflow ? magnitude : 0,
        sourceId: String(created._id),
      },
    ]);

    return created.toObject();
  }

  async match(tenantId: string, id: string, dto: MatchTransactionDto) {
    const tx = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    tx.status = TxStatus.MATCHED;
    tx.linkType = dto.linkType;
    tx.linkId = new Types.ObjectId(dto.linkId);
    tx.linkLabel = dto.linkLabel;
    await tx.save();
    return tx.toObject();
  }
}

// ── Transfers ─────────────────────────────────────────────────

@Injectable()
export class TransferService {
  constructor(
    @InjectModel(Transfer.name)
    private readonly model: Model<TransferDocument>,
    @InjectModel(BankAccount.name)
    private readonly accountModel: Model<BankAccountDocument>,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const count = await this.model.countDocuments({ tenantId });
    return `TRF-${String(count + 1).padStart(3, '0')}`;
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ date: -1 })
      .lean();
  }

  // Real accounts on both ends, resolved server-side — a transfer
  // between an account that doesn't exist isn't a transfer at all.
  async create(tenantId: string, dto: CreateTransferDto) {
    const tId = new Types.ObjectId(tenantId);
    const [fromAccount, toAccount] = await Promise.all([
      this.accountModel
        .findOne({ _id: dto.fromAccountId, tenantId: tId })
        .lean(),
      this.accountModel.findOne({ _id: dto.toAccountId, tenantId: tId }).lean(),
    ]);
    if (!fromAccount || !toAccount) {
      throw new BadRequestException(
        'Both accounts must be real accounts on this tenant',
      );
    }
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      date: new Date(),
      fromAccountId: new Types.ObjectId(dto.fromAccountId),
      fromAccountName: fromAccount.name,
      toAccountId: new Types.ObjectId(dto.toAccountId),
      toAccountName: toAccount.name,
      amount: dto.amount,
      reference: dto.reference ?? '',
      authoriser: dto.authoriser,
    });
    return created.toObject();
  }
}

// ── Reconciliation ────────────────────────────────────────────

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectModel(Reconciliation.name)
    private readonly model: Model<ReconciliationDocument>,
    @InjectModel(BankTransaction.name)
    private readonly txModel: Model<BankTransactionDocument>,
    private readonly accountService: BankAccountService,
  ) {}

  // The system side of a reconciliation is always the real, computed
  // account balance — never a separately-tracked number that could
  // disagree with what the account actually shows elsewhere.
  private async buildView(tenantId: string, accountId: string, period: string) {
    const tId = new Types.ObjectId(tenantId);
    const aId = new Types.ObjectId(accountId);
    const [systemBalance, record, unmatchedAgg] = await Promise.all([
      this.accountService.computeBalance(tenantId, accountId),
      this.model.findOne({ tenantId: tId, accountId: aId, period }).lean(),
      this.txModel.aggregate([
        {
          $match: { tenantId: tId, accountId: aId, status: TxStatus.UNMATCHED },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);
    const unreconciled = Math.abs(unmatchedAgg[0]?.total ?? 0);
    const statementBalance = record?.statementBalance ?? systemBalance;
    return {
      accountId,
      period,
      systemBalance,
      statementBalance,
      unreconciled,
      variance: Math.abs(statementBalance - systemBalance),
      preparedBy: record?.preparedBy ?? null,
      signedOffBy: record?.signedOffBy ?? null,
      signedOffAt: record?.signedOffAt ?? null,
    };
  }

  async getView(tenantId: string, accountId: string, period: string) {
    return this.buildView(tenantId, accountId, period);
  }

  async setStatementBalance(
    tenantId: string,
    accountId: string,
    period: string,
    dto: SetStatementBalanceDto,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const aId = new Types.ObjectId(accountId);
    await this.model.findOneAndUpdate(
      { tenantId: tId, accountId: aId, period },
      {
        $set: {
          statementBalance: dto.statementBalance,
          preparedBy: dto.preparedBy,
        },
        $setOnInsert: { tenantId: tId, accountId: aId, period },
      },
      { upsert: true },
    );
    return this.buildView(tenantId, accountId, period);
  }

  // Zero variance required, and sign-off must be a different person
  // from whoever prepared it — a real dual-control rule, not just a
  // disabled button in the UI.
  async signOff(
    tenantId: string,
    accountId: string,
    period: string,
    dto: SignOffReconciliationDto,
  ) {
    const view = await this.buildView(tenantId, accountId, period);
    if (view.variance > 0) {
      throw new BadRequestException(
        `Cannot sign off — unreconciled variance of ${view.variance.toFixed(2)} remains`,
      );
    }
    if (!view.preparedBy) {
      throw new BadRequestException(
        'Set the statement balance before signing off',
      );
    }
    if (dto.signedOffBy === view.preparedBy) {
      throw new BadRequestException(
        'Sign-off must be by someone other than the preparer',
      );
    }
    await this.model.findOneAndUpdate(
      {
        tenantId: new Types.ObjectId(tenantId),
        accountId: new Types.ObjectId(accountId),
        period,
      },
      { $set: { signedOffBy: dto.signedOffBy, signedOffAt: new Date() } },
    );
    return this.buildView(tenantId, accountId, period);
  }
}

// ── Cash forecast — entirely computed, no stored entity at all ──

@Injectable()
export class CashForecastService {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly billService: BillService,
    private readonly payrollRunService: PayrollRunService,
    private readonly accountService: BankAccountService,
  ) {}

  // 30/60/90-day inflow/outflow/closing, built from real unpaid
  // invoices (AR), real unpaid bills (AP), real processed-but-unpaid
  // payroll runs, and the real current balance of the firm's own
  // Office accounts — not a separate forecast a tenant maintains by
  // hand that could disagree with what Sales/Purchases/HR/Banking
  // actually show. Trust and special-purpose accounts are excluded
  // deliberately: that's client money, not cash available for the
  // firm's own operating outflows.
  async getForecast(tenantId: string) {
    const [invoices, bills, payrollRuns, accounts] = await Promise.all([
      this.invoiceService.getAll(tenantId),
      this.billService.getAll(tenantId),
      this.payrollRunService.getAllRuns(tenantId),
      this.accountService.getAll(tenantId),
    ]);

    const openingCash = accounts
      .filter((a: any) => a.type === 'Office')
      .reduce((s: number, a: any) => s + a.balance, 0);

    const now = Date.now();
    const outstandingInvoices = invoices.filter(
      (i: any) => !['Paid', 'Draft', 'Written Off'].includes(i.stage),
    );
    const outstandingBills = bills.filter(
      (b: any) => b.status !== 'Paid' && b.status !== 'Rejected',
    );
    const dueRuns = (payrollRuns as any[]).filter(
      (r) => r.status === 'processed',
    );

    const horizons = [30, 60, 90];
    return horizons.map((days) => {
      const cutoff = now + days * 86400000;
      const inflow = outstandingInvoices
        .filter((i: any) => new Date(i.dueOn).getTime() <= cutoff)
        .reduce((s: number, i: any) => s + (i.payable - i.paidAmount), 0);
      const outflowBills = outstandingBills
        .filter((b: any) => new Date(b.dueOn).getTime() <= cutoff)
        .reduce((s: number, b: any) => s + b.amount, 0);
      // A processed-but-unpaid run is treated as due within the
      // first horizon it appears in — payroll doesn't wait on an
      // explicit due date the way an invoice or bill does.
      const outflowPayroll =
        days === 30 ? dueRuns.reduce((s, r) => s + r.totalNet, 0) : 0;
      return {
        horizon: `${days} days`,
        inflow,
        outflow: outflowBills + outflowPayroll,
        closing: openingCash + inflow - outflowBills - outflowPayroll,
      };
    });
  }
}
