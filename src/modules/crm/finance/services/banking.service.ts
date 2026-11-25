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
  TxLinkType,
  BillStatus,
} from '../schemas';
import {
  CreateBankAccountDto,
  CreateBankTransactionDto,
  UpdateBankAccountDto,
  UpdateBankTransactionDto,
  MatchTransactionDto,
  CreateBankRuleDto,
  UpdateBankRuleDto,
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

  // A rule is editable after creation — the description it matches
  // on and the ledger account it posts to can both change.
  async update(tenantId: string, id: string, dto: UpdateBankRuleDto) {
    const rule = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!rule) throw new NotFoundException('Bank rule not found');
    if (dto.matchText !== undefined) rule.matchText = dto.matchText;
    if (dto.account !== undefined) rule.account = dto.account;
    if (dto.auto !== undefined) rule.auto = dto.auto;
    await rule.save();
    return rule.toObject();
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
    private readonly glPostingService: GlPostingService,
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

  // A nonzero opening balance is real money the tenant is telling us
  // is already sitting in this account — same principle as every
  // other real cash movement in this app, it gets a real journal
  // entry (Dr the bank's GL account / Cr Partners' capital, the
  // standard "opening balance equity" treatment) rather than only
  // ever showing up in this account's own live-computed balance.
  // Without this, a tenant who starts using Lexora mid-year with
  // existing bank balances would see their bank tiles and their
  // books (Chart of accounts / Financials) permanently disagree by
  // exactly that opening amount.
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

    if (dto.openingBalance) {
      const bankGlAccount =
        dto.type === 'Trust'
          ? GL_ACCOUNTS.BANK_TRUST
          : dto.type === 'Fund'
            ? GL_ACCOUNTS.BANK_FUND
            : GL_ACCOUNTS.BANK_OPERATING;
      const isPositive = dto.openingBalance > 0;
      const magnitude = Math.abs(dto.openingBalance);
      await this.glPostingService.post(
        tenantId,
        [
          {
            date: new Date(),
            ref: `${dto.name} — opening balance`,
            description: `${dto.name} — opening balance`,
            accountCode: bankGlAccount.code,
            accountName: bankGlAccount.name,
            source: GlSource.BANKING,
            debit: isPositive ? magnitude : 0,
            credit: isPositive ? 0 : magnitude,
            sourceId: created._id,
          },
          {
            date: new Date(),
            ref: `${dto.name} — opening balance`,
            description: `${dto.name} — opening balance`,
            accountCode: '3000',
            accountName: "Partners' capital",
            source: GlSource.BANKING,
            debit: isPositive ? 0 : magnitude,
            credit: isPositive ? magnitude : 0,
            sourceId: created._id,
          },
        ],
        dto.currency ?? 'USD',
      );
    }

    return { ...created.toObject(), balance: dto.openingBalance ?? 0 };
  }

  private glAccountFor(type?: string) {
    return type === 'Trust'
      ? GL_ACCOUNTS.BANK_TRUST
      : type === 'Fund'
        ? GL_ACCOUNTS.BANK_FUND
        : GL_ACCOUNTS.BANK_OPERATING;
  }

  // Fix a mistake made when the account was added. Descriptive fields
  // (name, bank, last 4) can always change. Type and currency decide
  // which ledger code and currency every posted movement used, so they
  // can only change while the account has no transactions or transfers
  // against it. The opening balance can be corrected at any time — it
  // is re-posted to the ledger so Banking and the books keep agreeing.
  async update(tenantId: string, id: string, dto: UpdateBankAccountDto) {
    const tId = new Types.ObjectId(tenantId);
    const account = await this.model.findOne({ _id: id, tenantId: tId });
    if (!account) throw new NotFoundException('Bank account not found');

    const typeChanging = dto.type !== undefined && dto.type !== account.type;
    const currencyChanging =
      dto.currency !== undefined &&
      dto.currency.toUpperCase() !== (account.currency ?? '').toUpperCase();
    if (typeChanging || currencyChanging) {
      const aId = new Types.ObjectId(id);
      const [txCount, transferCount] = await Promise.all([
        this.txModel.countDocuments({ tenantId: tId, accountId: aId }),
        this.transferModel.countDocuments({
          tenantId: tId,
          $or: [{ fromAccountId: aId }, { toAccountId: aId }],
        }),
      ]);
      if (txCount + transferCount > 0) {
        throw new BadRequestException(
          'The account type and currency can no longer be changed because transactions are already recorded against this account. Edit the entries first, or add a new account.',
        );
      }
    }

    const openingChanging =
      dto.openingBalance !== undefined &&
      dto.openingBalance !== account.openingBalance;

    if (dto.name !== undefined) account.name = dto.name;
    if (dto.bank !== undefined) account.bank = dto.bank;
    if (dto.last4 !== undefined) account.last4 = dto.last4;
    if (dto.type !== undefined) account.type = dto.type;
    if (dto.currency !== undefined) account.currency = dto.currency;
    if (dto.openingBalance !== undefined) {
      account.openingBalance = dto.openingBalance;
    }
    await account.save();

    // The opening-balance journal is the only ledger entry whose source
    // is the account itself, so it is the one to rebuild — also when
    // the name or type changed, since both are written into it.
    if (openingChanging || typeChanging || dto.name !== undefined) {
      await this.glPostingService.removeForSource(tenantId, account._id);
      if (account.openingBalance) {
        const bankGl = this.glAccountFor(account.type);
        const isPositive = account.openingBalance > 0;
        const magnitude = Math.abs(account.openingBalance);
        const label = `${account.name} — opening balance`;
        await this.glPostingService.post(
          tenantId,
          [
            {
              date: new Date(),
              ref: label,
              description: label,
              accountCode: bankGl.code,
              accountName: bankGl.name,
              source: GlSource.BANKING,
              debit: isPositive ? magnitude : 0,
              credit: isPositive ? 0 : magnitude,
              sourceId: account._id,
            },
            {
              date: new Date(),
              ref: label,
              description: label,
              accountCode: '3000',
              accountName: "Partners' capital",
              source: GlSource.BANKING,
              debit: isPositive ? 0 : magnitude,
              credit: isPositive ? magnitude : 0,
              sourceId: account._id,
            },
          ],
          account.currency ?? 'USD',
        );
      }
    }

    return {
      ...account.toObject(),
      balance: await this.computeBalance(tenantId, id),
    };
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
    @InjectModel(Reconciliation.name)
    private readonly reconModel: Model<ReconciliationDocument>,
    private readonly ruleService: BankRuleService,
    private readonly glPostingService: GlPostingService,
    private readonly billService: BillService,
    private readonly invoiceService: InvoiceService,
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
      currency: account?.currency ?? 'USD',
      suggestedAccount: rule?.account ?? '',
    });

    await this.postToGl(tenantId, created, account, rule?.account ?? '');

    return created.toObject();
  }

  // Which real bank GL account the transaction hits — Trust and Fund
  // both need their own ring-fenced code, same reasoning both are
  // excluded from Cash Forecast's operating-only view. Anything else
  // (including Special purpose, which has no dedicated code yet) falls
  // back to Operating rather than silently picking a code that doesn't
  // represent it. The contra side is the rule's account, or General
  // expenses when nothing matched.
  private async postToGl(
    tenantId: string,
    tx: { _id: any; date: Date; description: string; amount: number },
    account: { type?: string; currency?: string } | null | undefined,
    contraAccount: string,
  ) {
    const bankGlAccount =
      account?.type === 'Trust'
        ? GL_ACCOUNTS.BANK_TRUST
        : account?.type === 'Fund'
          ? GL_ACCOUNTS.BANK_FUND
          : GL_ACCOUNTS.BANK_OPERATING;
    const contraCode = contraAccount?.split(' · ')[0]?.trim();
    const contra = contraCode
      ? {
          code: contraCode,
          name: contraAccount.split(' · ')[1]?.trim() ?? contraAccount,
        }
      : GL_ACCOUNTS.GENERAL_EXPENSE;
    const magnitude = Math.abs(tx.amount);
    const isInflow = tx.amount >= 0;

    await this.glPostingService.post(
      tenantId,
      [
        {
          date: tx.date,
          ref: String(tx._id),
          description: tx.description,
          accountCode: bankGlAccount.code,
          accountName: bankGlAccount.name,
          source: GlSource.BANKING,
          debit: isInflow ? magnitude : 0,
          credit: isInflow ? 0 : magnitude,
          sourceId: String(tx._id),
        },
        {
          date: tx.date,
          ref: String(tx._id),
          description: tx.description,
          accountCode: contra.code,
          accountName: contra.name,
          source: GlSource.BANKING,
          debit: isInflow ? 0 : magnitude,
          credit: isInflow ? magnitude : 0,
          sourceId: String(tx._id),
        },
      ],
      account?.currency ?? 'USD',
    );
  }

  // A reconciled month is closed: once an account's statement for a
  // period has been signed off, nothing dated inside it may move.
  private async assertPeriodOpen(
    tenantId: string,
    accountId: Types.ObjectId | string,
    date: Date,
  ) {
    const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const signed = await this.reconModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        accountId: new Types.ObjectId(String(accountId)),
        period,
        signedOffBy: { $ne: null },
      })
      .lean();
    if (signed) {
      throw new BadRequestException(
        `${period} has been reconciled and signed off for this account, so entries in it can no longer be changed.`,
      );
    }
  }

  // Correct a mistaken entry. Until an entry is matched to a real
  // invoice, bill or payroll run, every field can change — the ledger
  // lines it posted are rebuilt from the corrected values, so the books
  // never carry both the mistake and the fix. Once matched, the amount,
  // date and account are part of what settled that document, so only
  // the description can be edited.
  async update(tenantId: string, id: string, dto: UpdateBankTransactionDto) {
    const tId = new Types.ObjectId(tenantId);
    const tx = await this.model.findOne({ _id: id, tenantId: tId });
    if (!tx) throw new NotFoundException('Transaction not found');

    const financial =
      dto.accountId !== undefined ||
      dto.date !== undefined ||
      dto.amount !== undefined;

    if (tx.status === TxStatus.MATCHED && financial) {
      throw new BadRequestException(
        `This entry is matched to ${tx.linkLabel || 'a record'}, so its amount, date and account are locked. You can still edit the description.`,
      );
    }

    if (financial) {
      await this.assertPeriodOpen(tenantId, tx.accountId, tx.date);
    }

    let account = await this.accountModel
      .findOne({ _id: tx.accountId, tenantId: tId })
      .lean();
    if (dto.accountId !== undefined) {
      account = await this.accountModel
        .findOne({ _id: dto.accountId, tenantId: tId })
        .lean();
      if (!account) throw new BadRequestException('Bank account not found');
      tx.accountId = new Types.ObjectId(dto.accountId);
      tx.currency = account.currency ?? 'USD';
    }
    if (dto.date !== undefined) tx.date = new Date(dto.date);
    if (dto.amount !== undefined) tx.amount = dto.amount;
    if (financial) {
      await this.assertPeriodOpen(tenantId, tx.accountId, tx.date);
    }

    const descriptionChanged =
      dto.description !== undefined && dto.description !== tx.description;
    if (dto.description !== undefined) tx.description = dto.description;

    // A new description may now match a different bank rule.
    if (descriptionChanged && tx.status !== TxStatus.MATCHED) {
      const rule = await this.ruleService.findMatch(tenantId, tx.description);
      tx.suggestedAccount = rule?.account ?? '';
    }
    await tx.save();

    // Rebuild the ledger lines of an unmatched entry — its contra side
    // is only ever the rule's suggestion. A matched entry (description-
    // only edit) keeps its ledger lines untouched.
    if (tx.status !== TxStatus.MATCHED) {
      await this.glPostingService.removeForSource(tenantId, tx._id);
      await this.postToGl(tenantId, tx, account, tx.suggestedAccount);
    }

    return tx.toObject();
  }

  async match(tenantId: string, id: string, dto: MatchTransactionDto) {
    const tx = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!tx) throw new NotFoundException('Transaction not found');

    // Direction has to agree with what is being settled. A bill is paid
    // OUT of an account and a client invoice is paid INTO one — matching
    // a transaction the wrong way round would settle the document while
    // moving the balance the wrong way.
    if (dto.linkType === TxLinkType.BILL && tx.amount >= 0) {
      throw new BadRequestException(
        'A bill is paid out of the account. This transaction is money in — record the payment as money out, or match it to a client invoice instead.',
      );
    }
    if (dto.linkType === TxLinkType.INVOICE_PAYMENT && tx.amount <= 0) {
      throw new BadRequestException(
        'A client invoice is paid into the account. This transaction is money out — match it to a bill instead.',
      );
    }
    // Whether the bill was already approved decides how the ledger entry
    // is corrected below: approval is what booked the expense and the
    // payable, so only then does this payment clear the payable.
    let billWasApproved = false;
    if (dto.linkType === TxLinkType.BILL && dto.linkId) {
      const bill: any = await this.billService.getById(tenantId, dto.linkId);
      if (bill.status === BillStatus.PAID) {
        throw new BadRequestException('That bill is already paid.');
      }
      billWasApproved =
        bill.status === BillStatus.APPROVED ||
        bill.status === BillStatus.SCHEDULED;
    }

    if (dto.linkType === TxLinkType.MANUAL) {
      // A manual match is a free-text note, not a real record —
      // there's nothing to hold an ObjectId reference to.
      tx.linkId = null;
    } else {
      if (!dto.linkId) {
        throw new BadRequestException(
          `Select a real ${dto.linkType.toLowerCase()} to match to`,
        );
      }
      tx.linkId = new Types.ObjectId(dto.linkId);
    }
    tx.status = TxStatus.MATCHED;
    tx.linkType = dto.linkType;
    tx.linkLabel = dto.linkLabel;
    await tx.save();

    // A transaction matched to a Bill is the real settlement — this
    // is what actually marks the bill Paid now, not a bypass button
    // that could fall out of sync with what the bank feed shows.
    if (dto.linkType === TxLinkType.BILL && dto.linkId) {
      await this.billService.markPaidViaBankMatch(tenantId, dto.linkId);
      if (billWasApproved) {
        // The payment came out of the bank (credit), so its other side
        // clears what we owe the vendor — not a second expense.
        const account = await this.accountModel
          .findOne({
            _id: tx.accountId,
            tenantId: new Types.ObjectId(tenantId),
          })
          .lean();
        const bankGlAccount =
          account?.type === 'Trust'
            ? GL_ACCOUNTS.BANK_TRUST
            : account?.type === 'Fund'
              ? GL_ACCOUNTS.BANK_FUND
              : GL_ACCOUNTS.BANK_OPERATING;
        await this.glPostingService.reclassifyContra(
          tenantId,
          tx._id,
          bankGlAccount.code,
          GL_ACCOUNTS.ACCOUNTS_PAYABLE,
          tx.date,
          dto.linkLabel || tx.description,
          `${tx.description} — matched to ${dto.linkLabel || 'bill'}`,
        );
      }
    }

    // Same real settlement for the money-in side: a bank line matched
    // to an Invoice marks it paid, then corrects the GL entry this
    // transaction already posted at create() time — its cash side
    // (the bank account) was always right, but its contra side was
    // only ever a guess (a Bank Rule's suggestion, or General
    // expenses by default) until now, when we actually know it was
    // this invoice's receivable clearing.
    if (dto.linkType === TxLinkType.INVOICE_PAYMENT && dto.linkId) {
      await this.invoiceService.markPaidViaBankMatch(
        tenantId,
        dto.linkId,
        Math.abs(tx.amount),
      );
      const account = await this.accountModel
        .findOne({ _id: tx.accountId, tenantId: new Types.ObjectId(tenantId) })
        .lean();
      const bankGlAccount =
        account?.type === 'Trust'
          ? GL_ACCOUNTS.BANK_TRUST
          : account?.type === 'Fund'
            ? GL_ACCOUNTS.BANK_FUND
            : GL_ACCOUNTS.BANK_OPERATING;
      await this.glPostingService.reclassifyContra(
        tenantId,
        tx._id,
        bankGlAccount.code,
        GL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
        tx.date,
        dto.linkLabel || tx.description,
        `${tx.description} — matched to ${dto.linkLabel || 'invoice'}`,
      );
    }

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
    private readonly glPostingService: GlPostingService,
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
  //
  // A transfer is real money moving, so it posts to the GL like
  // every other cash movement — Dr the receiving account's GL code /
  // Cr the sending one's. When both accounts are the same type (two
  // Office accounts, say), both legs land on the same pooled GL code
  // (1110) and net to zero, which is correct: nothing left the firm.
  // Between different types (Office → Trust), it correctly moves
  // value from 1110 to 1120. Without this, every transfer would move
  // each account's own live balance while leaving the general ledger
  // completely unaware anything happened — another permanent gap
  // between "Banking" and "Accounting".
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

    const glAccountFor = (account: { type?: string }) =>
      account.type === 'Trust'
        ? GL_ACCOUNTS.BANK_TRUST
        : account.type === 'Fund'
          ? GL_ACCOUNTS.BANK_FUND
          : GL_ACCOUNTS.BANK_OPERATING;
    const fromGl = glAccountFor(fromAccount);
    const toGl = glAccountFor(toAccount);

    await this.glPostingService.post(
      tenantId,
      [
        {
          date: created.date,
          ref,
          description: `Transfer to ${toAccount.name}`,
          accountCode: toGl.code,
          accountName: toGl.name,
          source: GlSource.BANKING,
          debit: dto.amount,
          sourceId: created._id,
        },
        {
          date: created.date,
          ref,
          description: `Transfer from ${fromAccount.name}`,
          accountCode: fromGl.code,
          accountName: fromGl.name,
          source: GlSource.BANKING,
          credit: dto.amount,
          sourceId: created._id,
        },
      ],
      fromAccount.currency,
    );

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
    // A Cancelled invoice (see InvoiceService.cancel) was voided
    // outright, so it's never a real future cash inflow to forecast —
    // same reasoning it's excluded from every other receivables total.
    const outstandingInvoices = invoices.filter(
      (i: any) =>
        !['Paid', 'Draft', 'Written Off', 'Cancelled'].includes(i.stage),
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
