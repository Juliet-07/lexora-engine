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
import { BillService, ExpenseClaimService } from './purchases.service';
import {
  MandateService,
  TimeEntryService,
} from 'src/modules/crm/projects/services';
import { EmployeeService } from 'src/modules/hr/services/employee.service';
import { TrustLedgerService } from './trust.service';
import { FundService } from './fund.service';

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
    private readonly trustLedgerService: TrustLedgerService,
    private readonly fundService: FundService,
  ) {}

  // Real cross-module summary. Trust and Fund now contribute real
  // figures too — total trust balance is the same live-computed sum
  // the Trust register itself shows, total committed fund capital
  // is the same real figure Fund setup computes. Distributed/NAV
  // still aren't included here, same reasoning they're absent from
  // Fund's own totals — no confirmed waterfall to compute them from
  // honestly yet.
  async getOverview(tenantId: string) {
    const [invoices, bills, trustLedgers, funds] = await Promise.all([
      this.invoiceService.getAll(tenantId),
      this.billService.getAll(tenantId),
      this.trustLedgerService.getAll(tenantId),
      this.fundService.getAll(tenantId),
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

    const trustBalance = trustLedgers.reduce(
      (s: number, l: any) => s + l.balance,
      0,
    );
    const fundCommitted = funds.reduce(
      (s: number, f: any) => s + f.committed,
      0,
    );

    return {
      salesRevenueYtd,
      outstandingReceivables,
      purchasesExpensesYtd,
      trustBalance,
      fundCommitted,
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
    private readonly invoiceService: InvoiceService,
    private readonly mandateService: MandateService,
    private readonly expenseClaimService: ExpenseClaimService,
    private readonly timeEntryService: TimeEntryService,
    private readonly employeeService: EmployeeService,
  ) {}

  // Public — shared with BudgetService's real variance calculation,
  // so budget-vs-actual reads the exact same real GL aggregation
  // the P&L itself uses, not a separately maintained figure.
  async getAccountBalances(tenantId: string, from?: string, to?: string) {
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

  private async computeContributionByGroup(
    tenantId: string,
    from: string,
    to: string,
    groupKeyFor: (mandate: any) => string,
  ) {
    const [invoices, mandates, claims] = await Promise.all([
      this.invoiceService.getAll(tenantId),
      this.mandateService.getAll(tenantId),
      this.expenseClaimService.getAll(tenantId),
    ]);

    const groupByMandateId = new Map(
      (mandates as any[]).map((m) => [String(m._id), groupKeyFor(m)]),
    );

    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    const inRange = (d: string | Date) => {
      const t = new Date(d).getTime();
      return t >= fromMs && t <= toMs;
    };

    const revenueByGroup = new Map<string, number>();
    (invoices as any[])
      .filter((i) => i.stage !== 'Draft' && inRange(i.issuedOn))
      .forEach((i) => {
        const group = groupByMandateId.get(String(i.mandateId)) ?? 'Unassigned';
        revenueByGroup.set(group, (revenueByGroup.get(group) ?? 0) + i.net);
      });

    const disbByGroup = new Map<string, number>();
    (claims as any[])
      .filter(
        (c) =>
          c.rechargeable &&
          c.status !== 'Rejected' &&
          c.mandateId &&
          inRange(c.createdAt),
      )
      .forEach((c) => {
        const group = groupByMandateId.get(String(c.mandateId)) ?? 'Unassigned';
        disbByGroup.set(group, (disbByGroup.get(group) ?? 0) + c.amount);
      });

    const groups = new Set([...revenueByGroup.keys(), ...disbByGroup.keys()]);
    return Array.from(groups)
      .map((group) => {
        const revenue = revenueByGroup.get(group) ?? 0;
        const directExpenses = disbByGroup.get(group) ?? 0;
        return {
          group,
          revenue,
          directExpenses,
          contribution: revenue - directExpenses,
          contributionMargin:
            revenue > 0 ? (revenue - directExpenses) / revenue : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }

  async getServiceLineReport(tenantId: string, from: string, to: string) {
    const rows = await this.computeContributionByGroup(
      tenantId,
      from,
      to,
      (m) => m.type,
    );
    return {
      from,
      to,
      rows: rows.map((r) => ({ serviceLine: r.group, ...r })),
      note: 'Contribution = revenue minus direct rechargeable disbursements only. Excludes staff cost and shared overhead — there is no agreed allocation methodology for those yet.',
    };
  }

  async getClientProfitability(tenantId: string, from: string, to: string) {
    const rows = await this.computeContributionByGroup(
      tenantId,
      from,
      to,
      (m) => m.clientName,
    );
    return {
      from,
      to,
      rows: rows.map((r) => ({ clientName: r.group, ...r })),
      note: "Contribution = revenue minus direct rechargeable disbursements. Staff cost is excluded by design — confirmed with the product owner that time isn't charged hourly, so there is no real per-hour cost to attribute per client.",
    };
  }

  async getKpiDashboard(tenantId: string, from: string, to: string) {
    const [pl, invoices, wipEntries, employees, balances] = await Promise.all([
      this.getProfitAndLoss(tenantId, from, to),
      this.invoiceService.getAll(tenantId),
      this.timeEntryService.getWipRegister(tenantId),
      this.employeeService.getEmployeeDirectory(tenantId),
      this.getAccountBalances(tenantId, from, to),
    ]);

    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    const inRange = (d: string | Date) => {
      const t = new Date(d).getTime();
      return t >= fromMs && t <= toMs;
    };

    const payrollCost = balances.accounts
      .filter((a) => a.type === AccountType.EXPENSE && a.subGroup === 'Payroll')
      .reduce(
        (s, a) => s + Math.max(0, balances.balanceMap.get(a.code) ?? 0),
        0,
      );
    const grossProfit = pl.totalRevenue - payrollCost;
    const grossMargin = pl.totalRevenue > 0 ? grossProfit / pl.totalRevenue : 0;

    const netMargin =
      pl.totalRevenue > 0 ? pl.profitBeforeTax / pl.totalRevenue : 0;

    const activeEmployees = employees.length;
    const revenuePerEmployee =
      activeEmployees > 0 ? pl.totalRevenue / activeEmployees : 0;

    const days = Math.max(1, Math.round((toMs - fromMs) / 86400000));
    const dailyRevenue = pl.totalRevenue / days;

    const unbilledWipValue = (wipEntries as any[])
      .filter((w) =>
        ['Unbilled', 'Approved for billing', 'Written down'].includes(
          w.billingStatus,
        ),
      )
      .reduce(
        (s, w) =>
          s +
          (w.billingStatus === 'Written down'
            ? w.writtenDownAmount
            : w.hours * w.rate),
        0,
      );
    const wipDays = dailyRevenue > 0 ? unbilledWipValue / dailyRevenue : 0;

    const outstandingAr = (invoices as any[])
      .filter((i) => !['Paid', 'Draft', 'Written Off'].includes(i.stage))
      .reduce((s, i) => s + (i.payable - i.paidAmount), 0);
    const arDays = dailyRevenue > 0 ? outstandingAr / dailyRevenue : 0;

    const lockupDays = wipDays + arDays;

    const everBilled = (wipEntries as any[]).filter((w) =>
      ['Invoiced', 'Written down', 'Written off'].includes(w.billingStatus),
    );
    const standardValue = everBilled.reduce((s, w) => s + w.hours * w.rate, 0);
    const actualValue = everBilled.reduce((s, w) => {
      if (w.billingStatus === 'Written down') return s + w.writtenDownAmount;
      if (w.billingStatus === 'Written off') return s;
      return s + w.hours * w.rate;
    }, 0);
    const realizationRate = standardValue > 0 ? actualValue / standardValue : 1;

    const invoicesInRange = (invoices as any[]).filter(
      (i) => i.stage !== 'Draft' && inRange(i.issuedOn),
    );
    const totalInvoiced = invoicesInRange.reduce((s, i) => s + i.payable, 0);
    const totalCollected = invoicesInRange.reduce(
      (s, i) => s + i.paidAmount,
      0,
    );
    const collectionRate =
      totalInvoiced > 0 ? totalCollected / totalInvoiced : 1;

    return {
      from,
      to,
      totalRevenue: pl.totalRevenue,
      grossMargin,
      netMargin,
      activeEmployees,
      revenuePerEmployee,
      lockupDays,
      wipDays,
      arDays,
      realizationRate,
      collectionRate,
      grossMarginNote:
        'Treats Payroll-subgroup expenses as the direct cost of service delivery; all other expenses as overhead.',
    };
  }
}
