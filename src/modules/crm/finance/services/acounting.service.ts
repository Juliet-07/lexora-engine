import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LedgerAccount,
  LedgerAccountDocument,
  AccountType,
  GlEntry,
  GlEntryDocument,
  GlSource,
  Journal,
  JournalDocument,
  JournalStatus,
  AccountingPeriod,
  AccountingPeriodDocument,
  PERIOD_CLOSE_STEPS,
  Asset,
  AssetDocument,
  AssetKind,
  AssetStatus,
  MaintenanceLogEntry,
  MaintenanceLogEntryDocument,
} from '../schemas';
import { BankTransaction, BankTransactionDocument } from '../schemas';
import {
  CreateAccountDto,
  CreateJournalDto,
  RecodeTransactionDto,
  CreateAssetDto,
  CreateMaintenanceLogDto,
} from '../dtos';
import { GlPostingService, GL_ACCOUNTS } from './gl-posting.service';
import { InvoiceService } from './invoice.service';
import { BillService } from './purchases.service';

@Injectable()
export class LedgerAccountService {
  constructor(
    @InjectModel(LedgerAccount.name)
    private readonly model: Model<LedgerAccountDocument>,
    @InjectModel(GlEntry.name)
    private readonly glModel: Model<GlEntryDocument>,
  ) {}

  private async computeBalances(
    tenantId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.glModel.aggregate([
      { $match: { tenantId: new Types.ObjectId(tenantId) } },
      {
        $group: {
          _id: '$accountCode',
          debit: { $sum: '$debit' },
          credit: { $sum: '$credit' },
        },
      },
    ]);
    return new Map(rows.map((r) => [r._id, r.debit - r.credit]));
  }

  async getAll(tenantId: string) {
    const [accounts, balances] = await Promise.all([
      this.model
        .find({ tenantId: new Types.ObjectId(tenantId) })
        .sort({ code: 1 })
        .lean(),
      this.computeBalances(tenantId),
    ]);
    return accounts.map((a) => ({ ...a, balance: balances.get(a.code) ?? 0 }));
  }

  async create(tenantId: string, dto: CreateAccountDto) {
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      code: dto.code,
      name: dto.name,
      type: dto.type,
      subGroup: dto.subGroup ?? '',
    });
    return { ...created.toObject(), balance: 0 };
  }

  async seedDefaults(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const defaults: {
      code: string;
      name: string;
      type: AccountType;
      subGroup: string;
    }[] = [
      {
        code: '1110',
        name: 'Bank - operating',
        type: AccountType.ASSET,
        subGroup: 'Current assets',
      },
      {
        code: '1120',
        name: 'Bank - trust (ring-fenced)',
        type: AccountType.ASSET,
        subGroup: 'Current assets',
      },
      {
        code: '1130',
        name: 'Petty cash',
        type: AccountType.ASSET,
        subGroup: 'Current assets',
      },
      {
        code: '1200',
        name: 'Accounts receivable',
        type: AccountType.ASSET,
        subGroup: 'Current assets',
      },
      {
        code: '1210',
        name: 'Unbilled WIP',
        type: AccountType.ASSET,
        subGroup: 'Current assets',
      },
      {
        code: '1220',
        name: 'Unbilled disbursements',
        type: AccountType.ASSET,
        subGroup: 'Current assets',
      },
      {
        code: '1230',
        name: 'Prepayments',
        type: AccountType.ASSET,
        subGroup: 'Current assets',
      },
      {
        code: '1240',
        name: 'Staff advances',
        type: AccountType.ASSET,
        subGroup: 'Current assets',
      },
      {
        code: '1250',
        name: 'VAT receivable',
        type: AccountType.ASSET,
        subGroup: 'Current assets',
      },
      {
        code: '1410',
        name: 'Office furniture & equipment',
        type: AccountType.ASSET,
        subGroup: 'Non-current assets',
      },
      {
        code: '1420',
        name: 'Computer equipment',
        type: AccountType.ASSET,
        subGroup: 'Non-current assets',
      },
      {
        code: '1490',
        name: 'Accumulated depreciation',
        type: AccountType.ASSET,
        subGroup: 'Non-current assets',
      },
      {
        code: '2110',
        name: 'Accounts payable',
        type: AccountType.LIABILITY,
        subGroup: 'Current liabilities',
      },
      {
        code: '2120',
        name: 'Accrued expenses',
        type: AccountType.LIABILITY,
        subGroup: 'Current liabilities',
      },
      {
        code: '2130',
        name: 'PAYE payable',
        type: AccountType.LIABILITY,
        subGroup: 'Current liabilities',
      },
      {
        code: '2140',
        name: 'RSSB payable',
        type: AccountType.LIABILITY,
        subGroup: 'Current liabilities',
      },
      {
        code: '2150',
        name: 'VAT payable',
        type: AccountType.LIABILITY,
        subGroup: 'Current liabilities',
      },
      {
        code: '2160',
        name: 'CIT provision',
        type: AccountType.LIABILITY,
        subGroup: 'Current liabilities',
      },
      {
        code: '2170',
        name: 'Deferred revenue',
        type: AccountType.LIABILITY,
        subGroup: 'Current liabilities',
      },
      {
        code: '2180',
        name: 'Staff reimbursements payable',
        type: AccountType.LIABILITY,
        subGroup: 'Current liabilities',
      },
      {
        code: '2190',
        name: 'WHT payable',
        type: AccountType.LIABILITY,
        subGroup: 'Current liabilities',
      },
      {
        code: '3000',
        name: "Partners' capital",
        type: AccountType.EQUITY,
        subGroup: 'Equity',
      },
      {
        code: '4200',
        name: 'Fee income',
        type: AccountType.REVENUE,
        subGroup: 'Revenue',
      },
      {
        code: '5000',
        name: 'General expenses',
        type: AccountType.EXPENSE,
        subGroup: 'Operating expenses',
      },
      {
        code: '5100',
        name: 'Rent',
        type: AccountType.EXPENSE,
        subGroup: 'Operating expenses',
      },
      {
        code: '5800',
        name: 'Staff costs',
        type: AccountType.EXPENSE,
        subGroup: 'Payroll',
      },
      {
        code: '5900',
        name: 'Depreciation expense',
        type: AccountType.EXPENSE,
        subGroup: 'Operating expenses',
      },
      {
        code: '6900',
        name: 'Bad debt expense',
        type: AccountType.EXPENSE,
        subGroup: 'Operating expenses',
      },
    ];
    const existing = await this.model
      .find({ tenantId: tId })
      .select('code')
      .lean();
    const existingCodes = new Set(existing.map((a) => a.code));
    const toCreate = defaults.filter((d) => !existingCodes.has(d.code));
    if (toCreate.length) {
      await this.model.insertMany(
        toCreate.map((d) => ({ ...d, tenantId: tId })),
      );
    }
    return this.getAll(tenantId);
  }
}

@Injectable()
export class JournalService {
  constructor(
    @InjectModel(Journal.name)
    private readonly model: Model<JournalDocument>,
    private readonly glPostingService: GlPostingService,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.model.countDocuments({
      tenantId,
      ref: new RegExp(`^JE-${year}-`),
    });
    return `JE-${year}-${String(count + 1).padStart(3, '0')}`;
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ date: -1 })
      .lean();
  }

  async create(
    tenantId: string,
    dto: CreateJournalDto,
    isAutoGenerated = false,
  ) {
    const totalDebit = dto.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = dto.lines.reduce((s, l) => s + (l.credit ?? 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException(
        `Journal doesn't balance — debits ${totalDebit} vs credits ${totalCredit}`,
      );
    }
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      title: dto.title,
      date: new Date(dto.date),
      type: dto.type,
      narration: dto.narration,
      lines: dto.lines.map((l) => ({
        accountCode: l.accountCode,
        accountName: l.accountName,
        debit: l.debit ?? 0,
        credit: l.credit ?? 0,
      })),
      preparedBy: dto.preparedBy,
      isAutoGenerated,
    });
    return created.toObject();
  }

  async post(tenantId: string, id: string, postedBy: string) {
    const j = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!j) throw new NotFoundException('Journal not found');
    if (j.status !== JournalStatus.UNPOSTED) {
      throw new BadRequestException('Only an unposted journal can be posted');
    }
    await this.glPostingService.post(
      tenantId,
      j.lines.map((l) => ({
        date: j.date,
        ref: j.ref,
        description: `${j.title} — ${l.accountName}`,
        accountCode: l.accountCode,
        accountName: l.accountName,
        source: GlSource.MANUAL,
        debit: l.debit,
        credit: l.credit,
        sourceId: String(j._id),
      })),
    );
    j.status = JournalStatus.POSTED;
    j.postedBy = postedBy;
    j.postedAt = new Date();
    await j.save();
    return j.toObject();
  }

  async reject(tenantId: string, id: string) {
    const j = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!j) throw new NotFoundException('Journal not found');
    j.status = JournalStatus.REVERSED;
    await j.save();
    return j.toObject();
  }
}

@Injectable()
export class RecodeService {
  constructor(
    @InjectModel(BankTransaction.name)
    private readonly txModel: Model<BankTransactionDocument>,
  ) {}

  async getCandidates(tenantId: string) {
    return this.txModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        suggestedAccount: { $ne: '' },
        $expr: { $ne: ['$suggestedAccount', '$ledgerAccount'] },
      })
      .sort({ date: -1 })
      .lean();
  }

  async recode(
    tenantId: string,
    transactionId: string,
    dto: RecodeTransactionDto,
  ) {
    const tx = await this.txModel.findOne({
      _id: transactionId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    tx.ledgerAccount = dto.ledgerAccount;
    await tx.save();
    return tx.toObject();
  }
}

@Injectable()
export class GeneralLedgerService {
  constructor(
    @InjectModel(GlEntry.name)
    private readonly model: Model<GlEntryDocument>,
  ) {}

  async getEntries(
    tenantId: string,
    filters: {
      source?: GlSource;
      from?: string;
      to?: string;
      search?: string;
    } = {},
  ) {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (filters.source) query.source = filters.source;
    if (filters.from || filters.to) {
      query.date = {};
      if (filters.from) query.date.$gte = new Date(filters.from);
      if (filters.to) query.date.$lte = new Date(filters.to);
    }
    if (filters.search) {
      const re = new RegExp(filters.search, 'i');
      query.$or = [{ accountName: re }, { ref: re }, { description: re }];
    }
    const rows = await this.model.find(query).sort({ date: 1, _id: 1 }).lean();

    const runningByAccount = new Map<string, number>();
    const withBalance = rows.map((r) => {
      const prior = runningByAccount.get(r.accountCode) ?? 0;
      const next = prior + r.debit - r.credit;
      runningByAccount.set(r.accountCode, next);
      return { ...r, balance: next };
    });
    return withBalance.reverse();
  }
}

@Injectable()
export class TrialBalanceService {
  constructor(
    @InjectModel(GlEntry.name)
    private readonly glModel: Model<GlEntryDocument>,
    @InjectModel(LedgerAccount.name)
    private readonly accountModel: Model<LedgerAccountDocument>,
  ) {}

  async getTrialBalance(tenantId: string, asOf?: string) {
    const tId = new Types.ObjectId(tenantId);
    const match: any = { tenantId: tId };
    if (asOf) match.date = { $lte: new Date(asOf) };

    const [accounts, balances] = await Promise.all([
      this.accountModel.find({ tenantId: tId }).sort({ code: 1 }).lean(),
      this.glModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$accountCode',
            debit: { $sum: '$debit' },
            credit: { $sum: '$credit' },
          },
        },
      ]),
    ]);
    const balanceMap = new Map(
      balances.map((b) => [b._id, b.debit - b.credit]),
    );

    // Assets and Expenses normally carry a debit balance; Liabilities,
    // Equity and Revenue normally carry a credit balance. Net > 0 on
    // a debit-normal account is a real debit; net > 0 on a credit-
    // normal account is a real credit — and the reverse for either
    // sitting the "wrong" way (an overdrawn bank, a credit memo).
    const rows = accounts
      .map((a) => {
        const net = balanceMap.get(a.code) ?? 0;
        if (Math.abs(net) < 0.01) return null;
        const isDebitNormal =
          a.type === AccountType.ASSET || a.type === AccountType.EXPENSE;
        const debit = isDebitNormal ? Math.max(0, net) : Math.max(0, -net);
        const credit = isDebitNormal ? Math.max(0, -net) : Math.max(0, net);
        return { code: a.code, name: a.name, type: a.type, debit, credit };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

    return {
      asOf: asOf ?? new Date().toISOString().slice(0, 10),
      rows,
      totalDebit,
      totalCredit,
      balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    };
  }
}

@Injectable()
export class PeriodCloseService {
  constructor(
    @InjectModel(AccountingPeriod.name)
    private readonly model: Model<AccountingPeriodDocument>,
  ) {}

  async getPeriod(tenantId: string, period: string) {
    const tId = new Types.ObjectId(tenantId);
    let doc = await this.model.findOne({ tenantId: tId, period }).lean();
    if (!doc) {
      const created = await this.model.create({
        tenantId: tId,
        period,
        steps: PERIOD_CLOSE_STEPS.map((s) => ({
          key: s.key,
          completedBy: null,
          completedAt: null,
        })),
      });
      doc = created.toObject();
    }
    return doc;
  }

  async completeStep(
    tenantId: string,
    period: string,
    key: string,
    completedBy: string,
  ) {
    await this.getPeriod(tenantId, period);
    const updated = await this.model.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId), period, 'steps.key': key },
      {
        $set: {
          'steps.$.completedBy': completedBy,
          'steps.$.completedAt': new Date(),
        },
      },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Period or step not found');
    return updated.toObject();
  }

  async lock(tenantId: string, period: string, lockedBy: string) {
    const doc = await this.getPeriod(tenantId, period);
    const incomplete = doc.steps.filter(
      (s) => s.key !== 'lock' && !s.completedBy,
    );
    if (incomplete.length) {
      throw new BadRequestException(
        `Cannot lock — ${incomplete.length} step(s) not yet complete`,
      );
    }
    const updated = await this.model.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId), period },
      {
        $set: {
          locked: true,
          lockedBy,
          lockedAt: new Date(),
          'steps.$[el].completedBy': lockedBy,
          'steps.$[el].completedAt': new Date(),
        },
      },
      { new: true, arrayFilters: [{ 'el.key': 'lock' }] },
    );
    return updated!.toObject();
  }

  async override(tenantId: string, period: string, by: string, reason: string) {
    const updated = await this.model.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId), period },
      {
        $push: {
          overrideLog: `${new Date().toISOString()} — ${by}: ${reason}`,
        },
      },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Period not found');
    return updated.toObject();
  }
}

@Injectable()
export class AssetService {
  constructor(
    @InjectModel(Asset.name)
    private readonly model: Model<AssetDocument>,
    private readonly journalService: JournalService,
  ) {}

  private async nextTag(
    tenantId: Types.ObjectId,
    kind: AssetKind,
  ): Promise<string> {
    const prefix = kind === AssetKind.FIXED ? 'FA' : 'MA';
    const count = await this.model.countDocuments({ tenantId, kind });
    return `${prefix}-${String(count + 1).padStart(3, '0')}`;
  }

  private computeNbv(asset: any): number {
    const asOf =
      asset.status === AssetStatus.DISPOSED && asset.disposedOn
        ? new Date(asset.disposedOn)
        : new Date();
    const monthsElapsed = Math.max(
      0,
      (asOf.getFullYear() - new Date(asset.acquiredOn).getFullYear()) * 12 +
        (asOf.getMonth() - new Date(asset.acquiredOn).getMonth()),
    );
    const totalMonths = asset.usefulLifeYears * 12;
    const depreciated = Math.min(monthsElapsed, totalMonths);
    const accumulatedDepreciation = (asset.cost / totalMonths) * depreciated;
    return Math.max(0, asset.cost - accumulatedDepreciation);
  }

  private normalize(a: any) {
    return {
      ...a,
      nbv: this.computeNbv(a),
      annualDepreciation: a.cost / a.usefulLifeYears,
      monthlyDepreciation: a.cost / a.usefulLifeYears / 12,
    };
  }

  async getAll(tenantId: string) {
    const rows = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
    return rows.map((a) => this.normalize(a));
  }

  async create(tenantId: string, dto: CreateAssetDto) {
    const tId = new Types.ObjectId(tenantId);
    const tag = await this.nextTag(tId, dto.kind);
    const created = await this.model.create({
      tenantId: tId,
      tag,
      name: dto.name,
      category: dto.category,
      kind: dto.kind,
      cost: dto.cost,
      acquiredOn: new Date(dto.acquiredOn),
      usefulLifeYears: dto.usefulLifeYears,
      assignedTo: dto.assignedTo ?? null,
      condition: dto.condition ?? null,
      insurer: dto.insurer ?? null,
      renewalDate: dto.renewalDate ? new Date(dto.renewalDate) : null,
    });
    return this.normalize(created.toObject());
  }

  async dispose(tenantId: string, id: string, disposalValue: number) {
    const a = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!a) throw new NotFoundException('Asset not found');
    if (a.status === AssetStatus.DISPOSED) {
      throw new BadRequestException('This asset has already been disposed');
    }
    a.disposedOn = new Date();
    const nbvAtDisposal = this.computeNbv({
      ...a.toObject(),
      disposedOn: a.disposedOn,
      status: AssetStatus.DISPOSED,
    });
    a.disposalValue = disposalValue;
    a.disposalGainLoss = disposalValue - nbvAtDisposal;
    a.status = AssetStatus.DISPOSED;
    await a.save();
    return this.normalize(a.toObject());
  }

  // Generates one real, unposted depreciation journal for the whole
  // register for the given period — mirrors "Aug depreciation...
  // Auto from Asset Register" exactly. Skips assets already
  // depreciated for this period, disposed assets, and assets that
  // are fully depreciated.
  async generateDepreciationJournal(
    tenantId: string,
    period: string,
    preparedBy: string,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const assets = await this.model.find({
      tenantId: tId,
      status: { $ne: AssetStatus.DISPOSED },
      lastDepreciationPeriod: { $ne: period },
    });

    const due = assets.filter((a) => this.computeNbv(a.toObject()) > 0.01);
    if (!due.length) {
      throw new BadRequestException(
        'No assets due for depreciation this period',
      );
    }

    const totalMonthly = due.reduce(
      (s, a) => s + a.cost / a.usefulLifeYears / 12,
      0,
    );
    const narrationParts = due
      .map((a) => `${a.name} $${(a.cost / a.usefulLifeYears / 12).toFixed(0)}`)
      .join(', ');

    const journal = await this.journalService.create(
      tenantId,
      {
        title: `${period} depreciation`,
        date: new Date().toISOString().slice(0, 10),
        type: 'Depreciation' as any,
        narration: `Monthly depreciation. ${narrationParts}. Auto from Asset Register.`,
        preparedBy,
        lines: [
          {
            accountCode: GL_ACCOUNTS.DEPRECIATION_EXPENSE.code,
            accountName: GL_ACCOUNTS.DEPRECIATION_EXPENSE.name,
            debit: totalMonthly,
          },
          {
            accountCode: GL_ACCOUNTS.ACCUMULATED_DEPRECIATION.code,
            accountName: GL_ACCOUNTS.ACCUMULATED_DEPRECIATION.name,
            credit: totalMonthly,
          },
        ],
      },
      true,
    );

    await this.model.updateMany(
      { _id: { $in: due.map((a) => a._id) } },
      { $set: { lastDepreciationPeriod: period } },
    );

    return journal;
  }
}

@Injectable()
export class MaintenanceLogService {
  constructor(
    @InjectModel(MaintenanceLogEntry.name)
    private readonly model: Model<MaintenanceLogEntryDocument>,
    @InjectModel(Asset.name)
    private readonly assetModel: Model<AssetDocument>,
  ) {}

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ date: -1 })
      .lean();
  }

  async create(tenantId: string, dto: CreateMaintenanceLogDto) {
    const asset = await this.assetModel.findOne({
      _id: dto.assetId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!asset) throw new NotFoundException('Asset not found');
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      assetId: asset._id,
      assetTag: asset.tag,
      date: new Date(dto.date),
      description: dto.description,
      vendor: dto.vendor ?? '',
      cost: dto.cost,
    });
    return created.toObject();
  }
}

@Injectable()
export class AccountingOverviewService {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly billService: BillService,
  ) {}

  // Real cross-module summary. Trust and Fund aren't built yet, so
  // the frontend simply doesn't render those cards rather than this
  // returning a faked zero for something that doesn't exist.
  async getOverview(tenantId: string) {
    const [invoices, bills] = await Promise.all([
      this.invoiceService.getAll(tenantId),
      this.billService.getAll(tenantId),
    ]);

    const salesRevenueYtd = invoices
      .filter((i: any) => i.stage !== 'Draft')
      .reduce((s: number, i: any) => s + i.net, 0);
    const outstandingReceivables = invoices
      .filter((i: any) => !['Paid', 'Draft', 'Written Off'].includes(i.stage))
      .reduce((s: number, i: any) => s + (i.payable - i.paidAmount), 0);
    const purchasesExpensesYtd = bills.reduce(
      (s: number, b: any) => s + b.amount,
      0,
    );

    return {
      salesRevenueYtd,
      outstandingReceivables,
      purchasesExpensesYtd,
    };
  }
}

// ── Financials — P&L, Balance Sheet, Cash Flow. All three read the
// same real GlEntry postings everything else in Accounting already
// writes to; nothing here is a separately maintained figure that
// could disagree with the ledger. ─────────────────────────────

@Injectable()
export class FinancialStatementsService {
  constructor(
    @InjectModel(GlEntry.name)
    private readonly glModel: Model<GlEntryDocument>,
    @InjectModel(LedgerAccount.name)
    private readonly accountModel: Model<LedgerAccountDocument>,
  ) {}

  private async getAccountBalances(
    tenantId: string,
    from?: string,
    to?: string,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const match: any = { tenantId: tId };
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to) match.date.$lte = new Date(to);
    }
    const [accounts, balances] = await Promise.all([
      this.accountModel.find({ tenantId: tId }).sort({ code: 1 }).lean(),
      this.glModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$accountCode',
            debit: { $sum: '$debit' },
            credit: { $sum: '$credit' },
          },
        },
      ]),
    ]);
    const balanceMap = new Map(
      balances.map((b) => [b._id, b.debit - b.credit]),
    );
    return { accounts, balanceMap };
  }

  // Real, accrual-basis P&L — revenue and expenses as GL entries
  // actually posted them for the period (an invoice sent counts,
  // regardless of whether it's been paid yet), not a cash-basis
  // figure. This will genuinely differ from CIT's own provision in
  // Tax, which is deliberately cash-basis and flagged as partial —
  // the two aren't meant to match, and forcing them to would make
  // one of them dishonest.
  async getProfitAndLoss(tenantId: string, from: string, to: string) {
    const { accounts, balanceMap } = await this.getAccountBalances(
      tenantId,
      from,
      to,
    );

    const revenueRows = accounts
      .filter((a) => a.type === AccountType.REVENUE)
      .map((a) => ({
        code: a.code,
        name: a.name,
        subGroup: a.subGroup,
        // Revenue is credit-normal — a positive real balance shows
        // as a negative net (credit), so this flips sign to read
        // as a normal positive revenue figure.
        amount: Math.max(0, -(balanceMap.get(a.code) ?? 0)),
      }))
      .filter((r) => r.amount > 0.01);

    const expenseRows = accounts
      .filter((a) => a.type === AccountType.EXPENSE)
      .map((a) => ({
        code: a.code,
        name: a.name,
        subGroup: a.subGroup,
        amount: Math.max(0, balanceMap.get(a.code) ?? 0),
      }))
      .filter((r) => r.amount > 0.01);

    const totalRevenue = revenueRows.reduce((s, r) => s + r.amount, 0);
    const totalExpenses = expenseRows.reduce((s, r) => s + r.amount, 0);

    return {
      from,
      to,
      revenueRows,
      expenseRows,
      totalRevenue,
      totalExpenses,
      profitBeforeTax: totalRevenue - totalExpenses,
    };
  }

  // Real balance sheet as of a date. Retained earnings is computed
  // live from the cumulative real P&L result up to that date — there's
  // no formal period-close journal zeroing Revenue/Expense accounts
  // into Equity each month, so this stands in for that closing entry
  // at read time. That's what makes Assets = Liabilities + Equity
  // genuinely hold, rather than the balance sheet quietly excluding
  // the year's trading result from equity.
  async getBalanceSheet(tenantId: string, asOf: string) {
    const { accounts, balanceMap } = await this.getAccountBalances(
      tenantId,
      undefined,
      asOf,
    );

    const rowsFor = (type: AccountType, isDebitNormal: boolean) =>
      accounts
        .filter((a) => a.type === type)
        .map((a) => {
          const net = balanceMap.get(a.code) ?? 0;
          const amount = isDebitNormal ? net : -net;
          return { code: a.code, name: a.name, subGroup: a.subGroup, amount };
        })
        .filter((r) => Math.abs(r.amount) > 0.01);

    const assets = rowsFor(AccountType.ASSET, true);
    const liabilities = rowsFor(AccountType.LIABILITY, false);
    const equity = rowsFor(AccountType.EQUITY, false);

    const revenueTotal = accounts
      .filter((a) => a.type === AccountType.REVENUE)
      .reduce((s, a) => s + -(balanceMap.get(a.code) ?? 0), 0);
    const expenseTotal = accounts
      .filter((a) => a.type === AccountType.EXPENSE)
      .reduce((s, a) => s + (balanceMap.get(a.code) ?? 0), 0);
    const retainedEarnings = revenueTotal - expenseTotal;

    const totalAssets = assets.reduce((s, r) => s + r.amount, 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + r.amount, 0);
    const totalEquity =
      equity.reduce((s, r) => s + r.amount, 0) + retainedEarnings;

    return {
      asOf,
      assets,
      liabilities,
      equity: [
        ...equity,
        {
          code: '3900',
          name: 'Retained earnings (current period)',
          subGroup: 'Equity',
          amount: retainedEarnings,
        },
      ],
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    };
  }

  // Real, direct-method cash flow — actual movements on the firm's
  // own operating bank account for the period, grouped by the real
  // GL source that caused them. Trust accounts are deliberately
  // excluded, same reasoning CashForecastService already uses —
  // that's client money, not the firm's own cash. Net movement here
  // should match the real change in the Bank - operating balance
  // over the same period; that's a built-in consistency check
  // against real data, not a separately maintained total.
  async getCashFlow(tenantId: string, from: string, to: string) {
    const tId = new Types.ObjectId(tenantId);
    const rows = await this.glModel.aggregate([
      {
        $match: {
          tenantId: tId,
          accountCode: GL_ACCOUNTS.BANK_OPERATING.code,
          date: { $gte: new Date(from), $lte: new Date(to) },
        },
      },
      {
        $group: {
          _id: '$source',
          inflow: { $sum: '$debit' },
          outflow: { $sum: '$credit' },
        },
      },
    ]);

    const lines = rows.map((r) => ({
      source: r._id as GlSource,
      inflow: r.inflow as number,
      outflow: r.outflow as number,
      netMovement: (r.inflow as number) - (r.outflow as number),
    }));
    const netMovement = lines.reduce((s, l) => s + l.netMovement, 0);

    return { from, to, lines, netMovement };
  }
}
