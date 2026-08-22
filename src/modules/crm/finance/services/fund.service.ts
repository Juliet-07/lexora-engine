import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Fund,
  FundDocument,
  FundStatus,
  CapitalCommitment,
  CapitalCommitmentDocument,
  CapitalCall,
  CapitalCallDocument,
  CapitalCallAllocationStatus,
  CapitalAccountEntry,
  CapitalAccountEntryDocument,
  CapitalAccountEntryType,
  Distribution,
  DistributionDocument,
  DistributionSource,
  PortfolioHolding,
  PortfolioHoldingDocument,
  HoldingStatus,
  HoldingValuation,
  HoldingValuationDocument,
  HoldingValuationStatus,
  FundExpense,
  FundExpenseDocument,
  ExpenseBorneBy,
  ManagementFeeCharge,
  ManagementFeeChargeDocument,
  FeeChargeStatus,
  KeyPerson,
  KeyPersonDocument,
  KeyPersonStatus,
  ComplianceCalendarItem,
  ComplianceCalendarItemDocument,
  ComplianceFrequency,
  FxRate,
  FxRateDocument,
  BankAccount,
  BankAccountDocument,
  BankAccountType,
} from '../schemas';
import {
  CreateFundDto,
  UpdateFundTermsDto,
  CreateCapitalCommitmentDto,
  CreateCapitalCallDto,
  RecordCallFundingDto,
  CureDefaultDto,
  RecordDistributionDto,
  CreatePortfolioHoldingDto,
  RecordExitDto,
  ProposeValuationDto,
  ReviewValuationDto,
  ApproveValuationDto,
  RecordFundExpenseDto,
  ChargeManagementFeeDto,
  AddKeyPersonDto,
  AddComplianceCalendarItemDto,
  MarkComplianceCompleteDto,
  RecordFxRateDto,
  RunScenarioDto,
} from '../dtos';
import { GlPostingService, GL_ACCOUNTS } from './gl-posting.service';
import { GlSource } from '../schemas';
import { BankAccountService } from './banking.service';

@Injectable()
export class FundService {
  constructor(
    @InjectModel(Fund.name)
    private readonly model: Model<FundDocument>,
    @InjectModel(BankAccount.name)
    private readonly bankAccountModel: Model<BankAccountDocument>,
    @InjectModel(CapitalCommitment.name)
    private readonly commitmentModel: Model<CapitalCommitmentDocument>,
    @InjectModel(CapitalCall.name)
    private readonly callModel: Model<CapitalCallDocument>,
  ) {}

  async getAll(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const funds = await this.model
      .find({ tenantId: tId })
      .sort({ createdAt: -1 })
      .lean();
    return Promise.all(funds.map((f) => this.withRealTotals(tenantId, f)));
  }

  async getById(tenantId: string, id: string) {
    const f = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!f) throw new NotFoundException('Fund not found');
    return this.withRealTotals(tenantId, f);
  }

  private async withRealTotals(tenantId: string, fund: any) {
    const tId = new Types.ObjectId(tenantId);
    const fId = fund._id;
    const [commitments, calls] = await Promise.all([
      this.commitmentModel.find({ tenantId: tId, fundId: fId }).lean(),
      this.callModel.find({ tenantId: tId, fundId: fId }).lean(),
    ]);
    const committed = commitments.reduce((s, c) => s + c.commitment, 0);
    const called = calls.reduce(
      (s, c) => s + c.allocations.reduce((s2, a) => s2 + a.fundedAmount, 0),
      0,
    );
    return {
      ...fund,
      committed,
      called,
      unfunded: committed - called,
      lpCount: commitments.length,
    };
  }

  async create(tenantId: string, dto: CreateFundDto) {
    if (dto.bankAccountId) {
      const bankAccount = await this.bankAccountModel
        .findOne({
          _id: dto.bankAccountId,
          tenantId: new Types.ObjectId(tenantId),
        })
        .lean();
      if (!bankAccount) throw new NotFoundException('Bank account not found');
      if (bankAccount.type !== BankAccountType.FUND) {
        throw new BadRequestException(
          'A fund can only be linked to a Fund-type bank account',
        );
      }
    }
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      structure: dto.structure ?? '',
      jurisdiction: dto.jurisdiction ?? '',
      strategy: dto.strategy ?? '',
      targetSize: dto.targetSize ?? 0,
      vintage: dto.vintage ?? new Date().getFullYear(),
      currency: dto.currency ?? 'USD',
      bankAccountId: dto.bankAccountId
        ? new Types.ObjectId(dto.bankAccountId)
        : null,
      mgmtFeePct: dto.mgmtFeePct ?? 0,
      carryPct: dto.carryPct ?? 0,
      hurdlePct: dto.hurdlePct ?? 0,
      waterfallType: dto.waterfallType,
      defaultInterestPct: dto.defaultInterestPct,
      curePeriodDays: dto.curePeriodDays,
      forfeiturePct: dto.forfeiturePct,
      equalisationInterestPct: dto.equalisationInterestPct,
      carryEscrowPct: dto.carryEscrowPct,
      investmentPeriodEndDate: dto.investmentPeriodEndDate
        ? new Date(dto.investmentPeriodEndDate)
        : null,
      orgCostsCapAmount: dto.orgCostsCapAmount ?? 0,
      recyclingPermitted: dto.recyclingPermitted ?? false,
      recyclingCapPct: dto.recyclingCapPct ?? 0,
    });
    return this.withRealTotals(tenantId, created.toObject());
  }

  async setStatus(tenantId: string, id: string, status: FundStatus) {
    const f = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!f) throw new NotFoundException('Fund not found');
    f.status = status;
    await f.save();
    return this.withRealTotals(tenantId, f.toObject());
  }

  async updateTerms(tenantId: string, id: string, dto: UpdateFundTermsDto) {
    const f = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!f) throw new NotFoundException('Fund not found');
    Object.assign(f, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.structure !== undefined && { structure: dto.structure }),
      ...(dto.jurisdiction !== undefined && { jurisdiction: dto.jurisdiction }),
      ...(dto.strategy !== undefined && { strategy: dto.strategy }),
      ...(dto.targetSize !== undefined && { targetSize: dto.targetSize }),
      ...(dto.vintage !== undefined && { vintage: dto.vintage }),
      ...(dto.currency !== undefined && { currency: dto.currency }),
      ...(dto.mgmtFeePct !== undefined && { mgmtFeePct: dto.mgmtFeePct }),
      ...(dto.carryPct !== undefined && { carryPct: dto.carryPct }),
      ...(dto.hurdlePct !== undefined && { hurdlePct: dto.hurdlePct }),
      ...(dto.waterfallType !== undefined && {
        waterfallType: dto.waterfallType,
      }),
      ...(dto.defaultInterestPct !== undefined && {
        defaultInterestPct: dto.defaultInterestPct,
      }),
      ...(dto.curePeriodDays !== undefined && {
        curePeriodDays: dto.curePeriodDays,
      }),
      ...(dto.forfeiturePct !== undefined && {
        forfeiturePct: dto.forfeiturePct,
      }),
      ...(dto.equalisationInterestPct !== undefined && {
        equalisationInterestPct: dto.equalisationInterestPct,
      }),
      ...(dto.carryEscrowPct !== undefined && {
        carryEscrowPct: dto.carryEscrowPct,
      }),
      ...(dto.investmentPeriodEndDate !== undefined && {
        investmentPeriodEndDate: new Date(dto.investmentPeriodEndDate),
      }),
      ...(dto.orgCostsCapAmount !== undefined && {
        orgCostsCapAmount: dto.orgCostsCapAmount,
      }),
      ...(dto.recyclingPermitted !== undefined && {
        recyclingPermitted: dto.recyclingPermitted,
      }),
      ...(dto.recyclingCapPct !== undefined && {
        recyclingCapPct: dto.recyclingCapPct,
      }),
    });
    await f.save();
    return this.withRealTotals(tenantId, f.toObject());
  }
}

@Injectable()
export class CapitalAccountService {
  constructor(
    @InjectModel(CapitalAccountEntry.name)
    private readonly entryModel: Model<CapitalAccountEntryDocument>,
    @InjectModel(CapitalCommitment.name)
    private readonly commitmentModel: Model<CapitalCommitmentDocument>,
    @InjectModel(CapitalCall.name)
    private readonly callModel: Model<CapitalCallDocument>,
  ) {}

  async computeBalance(
    tenantId: string,
    commitmentId: string,
  ): Promise<number> {
    const agg = await this.entryModel.aggregate([
      {
        $match: {
          tenantId: new Types.ObjectId(tenantId),
          commitmentId: new Types.ObjectId(commitmentId),
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return agg[0]?.total ?? 0;
  }

  async getAll(tenantId: string, fundId: string) {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const [commitments, calls, entries] = await Promise.all([
      this.commitmentModel
        .find({ tenantId: tId, fundId: fId })
        .sort({ createdAt: 1 })
        .lean(),
      this.callModel.find({ tenantId: tId, fundId: fId }).lean(),
      this.entryModel.find({ tenantId: tId, fundId: fId }).lean(),
    ]);

    const totalCommitment = commitments.reduce((s, c) => s + c.commitment, 0);

    const rows = commitments.map((c) => {
      const cId = String(c._id);
      let called = 0;
      for (const call of calls) {
        const alloc = (call.allocations as any[]).find(
          (a) => String(a.commitmentId) === cId,
        );
        if (alloc) called += alloc.fundedAmount;
      }
      const myEntries = entries.filter((e) => String(e.commitmentId) === cId);
      const sumType = (type: CapitalAccountEntryType) =>
        myEntries
          .filter((e) => e.type === type)
          .reduce((s, e) => s + e.amount, 0);

      return {
        commitmentId: c._id,
        lpName: c.lpName,
        type: c.type,
        closeLabel: c.closeLabel,
        isGpCommitment: c.isGpCommitment,
        hasSideLetter: c.hasSideLetter,
        equalisationApplied: c.equalisationApplied,
        commitment: c.commitment,
        commitmentPct: totalCommitment > 0 ? c.commitment / totalCommitment : 0,
        called,
        incomeAlloc: sumType(CapitalAccountEntryType.INCOME),
        expenseAlloc: sumType(CapitalAccountEntryType.EXPENSE),
        gainLoss: sumType(CapitalAccountEntryType.GAIN_LOSS),
        distributions: sumType(CapitalAccountEntryType.DISTRIBUTION),
        balance: myEntries.reduce((s, e) => s + e.amount, 0),
      };
    });

    return {
      rows,
      totalCommitment,
      totalCalled: rows.reduce((s, r) => s + r.called, 0),
      totalBalance: rows.reduce((s, r) => s + r.balance, 0),
    };
  }

  async getEntries(tenantId: string, commitmentId: string) {
    return this.entryModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        commitmentId: new Types.ObjectId(commitmentId),
      })
      .sort({ date: -1 })
      .lean();
  }

  async postEntry(
    tenantId: string,
    fundId: string,
    commitmentId: string | Types.ObjectId,
    type: CapitalAccountEntryType,
    amount: number,
    description: string,
    sourceId?: Types.ObjectId | string,
  ) {
    await this.entryModel.create({
      tenantId: new Types.ObjectId(tenantId),
      fundId: new Types.ObjectId(fundId),
      commitmentId: new Types.ObjectId(String(commitmentId)),
      type,
      amount,
      date: new Date(),
      description,
      sourceId: sourceId ? new Types.ObjectId(String(sourceId)) : null,
    });
  }
}

@Injectable()
export class CapitalCommitmentService {
  constructor(
    @InjectModel(CapitalCommitment.name)
    private readonly model: Model<CapitalCommitmentDocument>,
    @InjectModel(Fund.name)
    private readonly fundModel: Model<FundDocument>,
    @InjectModel(CapitalCall.name)
    private readonly callModel: Model<CapitalCallDocument>,
    private readonly capitalAccountService: CapitalAccountService,
  ) {}

  async getAll(tenantId: string, fundId: string) {
    const commitments = await this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        fundId: new Types.ObjectId(fundId),
      })
      .sort({ createdAt: -1 })
      .lean();
    return commitments;
  }

  async create(
    tenantId: string,
    fundId: string,
    dto: CreateCapitalCommitmentDto,
  ) {
    const fund = await this.fundModel.findOne({
      _id: fundId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!fund) throw new NotFoundException('Fund not found');
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      fundId: new Types.ObjectId(fundId),
      lpUserId: new Types.ObjectId(dto.lpUserId),
      lpName: dto.lpName,
      commitment: dto.commitment,
      type: dto.type,
      closeLabel: dto.closeLabel ?? '1st',
      closeDate: dto.closeDate ? new Date(dto.closeDate) : null,
      isGpCommitment: dto.isGpCommitment ?? false,
      hasSideLetter: dto.hasSideLetter ?? false,
      mgmtFeePctOverride: dto.mgmtFeePctOverride ?? null,
      sideLetterNotes: dto.sideLetterNotes ?? '',
    });
    return created.toObject();
  }

  async computeEqualisation(
    tenantId: string,
    fundId: string,
    commitmentId: string,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const [fund, commitment, allCommitments, calls] = await Promise.all([
      this.fundModel.findOne({ _id: fId, tenantId: tId }).lean(),
      this.model
        .findOne({ _id: commitmentId, tenantId: tId, fundId: fId })
        .lean(),
      this.model.find({ tenantId: tId, fundId: fId }).lean(),
      this.callModel.find({ tenantId: tId, fundId: fId }).lean(),
    ]);
    if (!fund) throw new NotFoundException('Fund not found');
    if (!commitment) throw new NotFoundException('Commitment not found');
    if (!commitment.closeDate) {
      throw new BadRequestException(
        'This commitment has no close date set — cannot compute equalisation',
      );
    }

    const earlierCommitments = allCommitments.filter(
      (c) =>
        String(c._id) !== String(commitment._id) &&
        c.closeDate &&
        c.closeDate < commitment.closeDate,
    );
    if (!earlierCommitments.length) {
      throw new BadRequestException(
        'No earlier-close LPs found to equalise against',
      );
    }
    const firstCloseDate = earlierCommitments.reduce(
      (min, c) => (c.closeDate! < min ? c.closeDate! : min),
      earlierCommitments[0].closeDate!,
    );

    const callsBeforeClose = calls.filter(
      (c) => c.issuedOn <= commitment.closeDate!,
    );
    const earlierTotalCommitment = earlierCommitments.reduce(
      (s, c) => s + c.commitment,
      0,
    );
    let earlierTotalCalledAtClose = 0;
    for (const call of callsBeforeClose) {
      for (const alloc of call.allocations as any[]) {
        if (
          earlierCommitments.some(
            (c) => String(c._id) === String(alloc.commitmentId),
          )
        ) {
          earlierTotalCalledAtClose += alloc.amount;
        }
      }
    }
    const calledPctAtClose =
      earlierTotalCommitment > 0
        ? earlierTotalCalledAtClose / earlierTotalCommitment
        : 0;

    const catchUpCall =
      Math.round(commitment.commitment * calledPctAtClose * 100) / 100;
    const daysAfterFirstClose = Math.max(
      0,
      Math.round(
        (commitment.closeDate.getTime() - firstCloseDate.getTime()) / 86400000,
      ),
    );
    const eqInterest =
      Math.round(
        catchUpCall *
          (fund.equalisationInterestPct / 100) *
          (daysAfterFirstClose / 365) *
          100,
      ) / 100;

    return {
      commitmentId: commitment._id,
      lpName: commitment.lpName,
      closeDate: commitment.closeDate,
      firstCloseDate,
      daysAfterFirstClose,
      calledPctAtClose,
      catchUpCall,
      eqInterest,
      totalEqualisationPaid: catchUpCall + eqInterest,
      earlierLpCount: earlierCommitments.length,
    };
  }

  async applyEqualisation(
    tenantId: string,
    fundId: string,
    commitmentId: string,
  ) {
    const commitment = await this.model.findOne({
      _id: commitmentId,
      tenantId: new Types.ObjectId(tenantId),
      fundId: new Types.ObjectId(fundId),
    });
    if (!commitment) throw new NotFoundException('Commitment not found');
    if (commitment.equalisationApplied) {
      throw new BadRequestException(
        'Equalisation has already been applied to this commitment',
      );
    }

    const calc = await this.computeEqualisation(tenantId, fundId, commitmentId);

    await this.capitalAccountService.postEntry(
      tenantId,
      fundId,
      commitmentId,
      CapitalAccountEntryType.EQUALISATION_CATCH_UP,
      calc.catchUpCall,
      `Equalisation catch-up — ${calc.daysAfterFirstClose} days after first close`,
    );
    await this.capitalAccountService.postEntry(
      tenantId,
      fundId,
      commitmentId,
      CapitalAccountEntryType.EQUALISATION_INTEREST_PAID,
      -calc.eqInterest,
      `Equalisation interest paid to earlier-close LPs`,
    );

    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const earlierCommitments = await this.model
      .find({
        tenantId: tId,
        fundId: fId,
        closeDate: { $lt: commitment.closeDate, $ne: null },
      })
      .lean();
    const earlierTotal = earlierCommitments.reduce(
      (s, c) => s + c.commitment,
      0,
    );
    for (const early of earlierCommitments) {
      const share = earlierTotal > 0 ? early.commitment / earlierTotal : 0;
      const amount = Math.round(calc.eqInterest * share * 100) / 100;
      if (amount > 0) {
        await this.capitalAccountService.postEntry(
          tenantId,
          fundId,
          String(early._id),
          CapitalAccountEntryType.EQUALISATION_INTEREST_RECEIVED,
          amount,
          `Equalisation interest received — ${commitment.lpName}'s subsequent close`,
        );
      }
    }

    commitment.equalisationApplied = true;
    await commitment.save();
    return calc;
  }
}

@Injectable()
export class CapitalCallService {
  constructor(
    @InjectModel(CapitalCall.name)
    private readonly model: Model<CapitalCallDocument>,
    @InjectModel(Fund.name)
    private readonly fundModel: Model<FundDocument>,
    @InjectModel(CapitalCommitment.name)
    private readonly commitmentModel: Model<CapitalCommitmentDocument>,
    private readonly glPostingService: GlPostingService,
    private readonly capitalAccountService: CapitalAccountService,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const count = await this.model.countDocuments({ tenantId });
    return `CC-${String(count + 101)}`;
  }

  async getAll(tenantId: string, fundId: string) {
    return this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        fundId: new Types.ObjectId(fundId),
      })
      .sort({ issuedOn: -1 })
      .lean();
  }

  async create(tenantId: string, fundId: string, dto: CreateCapitalCallDto) {
    const fund = await this.fundModel.findOne({
      _id: fundId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!fund) throw new NotFoundException('Fund not found');

    const commitments = await this.commitmentModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        fundId: new Types.ObjectId(fundId),
      })
      .lean();
    if (!commitments.length) {
      throw new BadRequestException(
        'Add at least one LP capital commitment before issuing a call',
      );
    }
    const totalCommitments = commitments.reduce((s, c) => s + c.commitment, 0);

    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      fundId: new Types.ObjectId(fundId),
      ref,
      purpose: dto.purpose,
      totalAmount: dto.totalAmount,
      issuedOn: new Date(dto.issuedOn),
      dueOn: new Date(dto.dueOn),
      allocations: commitments.map((c) => ({
        commitmentId: c._id,
        lpName: c.lpName,
        amount:
          Math.round(
            dto.totalAmount * (c.commitment / totalCommitments) * 100,
          ) / 100,
        fundedAmount: 0,
        status: CapitalCallAllocationStatus.UNFUNDED,
      })),
    });
    return created.toObject();
  }

  async recordFunding(
    tenantId: string,
    callId: string,
    allocationId: string,
    dto: RecordCallFundingDto,
  ) {
    const call = await this.model.findOne({
      _id: callId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!call) throw new NotFoundException('Capital call not found');
    const allocation = (call.allocations as any).id(allocationId);
    if (!allocation) throw new NotFoundException('Allocation not found');

    const remaining = allocation.amount - allocation.fundedAmount;
    if (dto.amount > remaining) {
      throw new BadRequestException(
        `Funding of ${dto.amount} exceeds the remaining ${remaining} owed on this allocation`,
      );
    }

    allocation.fundedAmount += dto.amount;
    allocation.status =
      allocation.fundedAmount >= allocation.amount
        ? CapitalCallAllocationStatus.FUNDED
        : CapitalCallAllocationStatus.PARTIALLY_FUNDED;
    allocation.fundedAt = new Date();
    await call.save();

    const fund = await this.fundModel
      .findOne({ _id: call.fundId, tenantId: new Types.ObjectId(tenantId) })
      .lean();

    if (fund?.bankAccountId) {
      await this.glPostingService.post(tenantId, [
        {
          date: new Date(),
          ref: call.ref,
          description: `${allocation.lpName} — capital call funding`,
          accountCode: GL_ACCOUNTS.BANK_FUND.code,
          accountName: GL_ACCOUNTS.BANK_FUND.name,
          source: GlSource.FUND,
          debit: dto.amount,
          sourceId: call._id,
        },
        {
          date: new Date(),
          ref: call.ref,
          description: `${allocation.lpName} — capital call funding`,
          accountCode: GL_ACCOUNTS.LP_PAID_IN_CAPITAL.code,
          accountName: GL_ACCOUNTS.LP_PAID_IN_CAPITAL.name,
          source: GlSource.FUND,
          credit: dto.amount,
          sourceId: call._id,
        },
      ]);
    }

    await this.capitalAccountService.postEntry(
      tenantId,
      String(call.fundId),
      String(allocation.commitmentId),
      CapitalAccountEntryType.CONTRIBUTION,
      dto.amount,
      `Capital call ${call.ref} funded`,
      call._id,
    );

    return call.toObject();
  }

  async declareDefault(tenantId: string, callId: string, allocationId: string) {
    const call = await this.model.findOne({
      _id: callId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!call) throw new NotFoundException('Capital call not found');
    const allocation = (call.allocations as any).id(allocationId);
    if (!allocation) throw new NotFoundException('Allocation not found');
    if (allocation.status === CapitalCallAllocationStatus.FUNDED) {
      throw new BadRequestException('This allocation is already fully funded');
    }

    const fund = await this.fundModel
      .findOne({ _id: call.fundId, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!fund) throw new NotFoundException('Fund not found');

    allocation.status = CapitalCallAllocationStatus.DEFAULTED;
    allocation.defaultDeclaredAt = new Date();
    allocation.cureDeadline = new Date(
      Date.now() + fund.curePeriodDays * 86400000,
    );
    await call.save();
    return call.toObject();
  }

  async cureDefault(
    tenantId: string,
    callId: string,
    allocationId: string,
    dto: CureDefaultDto,
  ) {
    const call = await this.model.findOne({
      _id: callId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!call) throw new NotFoundException('Capital call not found');
    const allocation = (call.allocations as any).id(allocationId);
    if (!allocation) throw new NotFoundException('Allocation not found');
    if (allocation.status !== CapitalCallAllocationStatus.DEFAULTED) {
      throw new BadRequestException('This allocation is not in default');
    }
    if (allocation.cureDeadline && new Date() > allocation.cureDeadline) {
      throw new BadRequestException(
        'The cure period has passed — this allocation must be forfeited, not cured',
      );
    }

    const fund = await this.fundModel
      .findOne({ _id: call.fundId, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!fund) throw new NotFoundException('Fund not found');

    const daysOverdue = Math.max(
      0,
      Math.round(
        (Date.now() - (allocation.defaultDeclaredAt?.getTime() ?? Date.now())) /
          86400000,
      ),
    );
    const defaultInterest =
      Math.round(
        dto.amount *
          (fund.defaultInterestPct / 100) *
          (daysOverdue / 365) *
          100,
      ) / 100;

    await this.recordFunding(tenantId, callId, allocationId, {
      amount: dto.amount,
    });

    if (defaultInterest > 0) {
      await this.capitalAccountService.postEntry(
        tenantId,
        String(call.fundId),
        String(allocation.commitmentId),
        CapitalAccountEntryType.DEFAULT_INTEREST,
        -defaultInterest,
        `Default interest — ${daysOverdue} days overdue on ${call.ref}`,
      );
    }

    const refreshed = await this.model.findOne({
      _id: callId,
      tenantId: new Types.ObjectId(tenantId),
    });
    const curedAllocation = (refreshed!.allocations as any).id(allocationId);
    curedAllocation.cured = true;
    if (curedAllocation.status !== CapitalCallAllocationStatus.FUNDED) {
      curedAllocation.status = CapitalCallAllocationStatus.PARTIALLY_FUNDED;
    }
    await refreshed!.save();

    return {
      call: refreshed!.toObject(),
      defaultInterestCharged: defaultInterest,
    };
  }

  async forfeitDefault(tenantId: string, callId: string, allocationId: string) {
    const call = await this.model.findOne({
      _id: callId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!call) throw new NotFoundException('Capital call not found');
    const allocation = (call.allocations as any).id(allocationId);
    if (!allocation) throw new NotFoundException('Allocation not found');
    if (allocation.status !== CapitalCallAllocationStatus.DEFAULTED) {
      throw new BadRequestException('This allocation is not in default');
    }

    const fund = await this.fundModel
      .findOne({ _id: call.fundId, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!fund) throw new NotFoundException('Fund not found');

    const currentBalance = await this.capitalAccountService.computeBalance(
      tenantId,
      String(allocation.commitmentId),
    );
    const forfeited =
      Math.round(currentBalance * (fund.forfeiturePct / 100) * 100) / 100;

    if (forfeited > 0) {
      await this.capitalAccountService.postEntry(
        tenantId,
        String(call.fundId),
        String(allocation.commitmentId),
        CapitalAccountEntryType.FORFEITURE,
        -forfeited,
        `Forfeiture — ${fund.forfeiturePct}% of interest on uncured default (${call.ref})`,
        call._id,
      );

      const nonDefaulting = await this.commitmentModel
        .find({
          tenantId: new Types.ObjectId(tenantId),
          fundId: call.fundId,
          _id: { $ne: allocation.commitmentId },
        })
        .lean();
      const totalNonDefaulting = nonDefaulting.reduce(
        (s, c) => s + c.commitment,
        0,
      );
      for (const c of nonDefaulting) {
        const share =
          totalNonDefaulting > 0 ? c.commitment / totalNonDefaulting : 0;
        const amount = Math.round(forfeited * share * 100) / 100;
        if (amount > 0) {
          await this.capitalAccountService.postEntry(
            tenantId,
            String(call.fundId),
            String(c._id),
            CapitalAccountEntryType.FORFEITURE_REALLOCATION,
            amount,
            `Forfeiture reallocation from defaulting LP (${call.ref})`,
            call._id,
          );
        }
      }
    }

    allocation.forfeitedAmount = forfeited;
    await call.save();

    return { call: call.toObject(), forfeited };
  }
}

@Injectable()
export class NavService {
  constructor(
    @InjectModel(Fund.name)
    private readonly fundModel: Model<FundDocument>,
    @InjectModel(PortfolioHolding.name)
    private readonly holdingModel: Model<PortfolioHoldingDocument>,
    @InjectModel(HoldingValuation.name)
    private readonly valuationModel: Model<HoldingValuationDocument>,
    @InjectModel(CapitalCall.name)
    private readonly callModel: Model<CapitalCallDocument>,
    @InjectModel(Distribution.name)
    private readonly distributionModel: Model<DistributionDocument>,
    @InjectModel(FundExpense.name)
    private readonly expenseModel: Model<FundExpenseDocument>,
    @InjectModel(ManagementFeeCharge.name)
    private readonly feeChargeModel: Model<ManagementFeeChargeDocument>,
    private readonly bankAccountService: BankAccountService,
  ) {}

  async getNav(tenantId: string, fundId: string) {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const fund = await this.fundModel
      .findOne({ _id: fId, tenantId: tId })
      .lean();
    if (!fund) throw new NotFoundException('Fund not found');

    const holdings = await this.holdingModel
      .find({ tenantId: tId, fundId: fId })
      .lean();
    const rows = await Promise.all(
      holdings
        .filter((h) => h.status === HoldingStatus.ACTIVE)
        .map(async (h) => {
          const latest = await this.valuationModel
            .findOne({
              tenantId: tId,
              fundId: fId,
              holdingId: h._id,
              status: HoldingValuationStatus.APPROVED,
            })
            .sort({ period: -1 })
            .lean();
          return {
            holdingId: h._id,
            companyName: h.companyName,
            costBasis: h.costBasis,
            fairValue: latest?.approvedValue ?? h.costBasis,
            period: latest?.period ?? null,
          };
        }),
    );
    const portfolioTotal = rows.reduce((s, r) => s + r.fairValue, 0);

    const cashHeld = fund.bankAccountId
      ? await this.bankAccountService.computeBalance(
          tenantId,
          String(fund.bankAccountId),
        )
      : 0;

    // Real accrued liabilities — fee charges and fund expenses that
    // have been recorded but not yet paid. Once FeesCarryService
    // marks a charge as paid, it stops appearing here, the same
    // reasoning a paid invoice stops appearing in AR ageing.
    const [accruedFees, unpaidExpenses] = await Promise.all([
      this.feeChargeModel
        .find({ tenantId: tId, fundId: fId, status: FeeChargeStatus.ACCRUED })
        .lean(),
      this.expenseModel
        .find({ tenantId: tId, fundId: fId, borneBy: ExpenseBorneBy.FUND })
        .lean(),
    ]);
    const accruedManagementFeePayable = accruedFees.reduce(
      (s, f) => s + f.totalFeeAmount,
      0,
    );
    // All real fund expenses are treated as payable here until a
    // real "paid" concept exists for them — currently they're
    // recorded and allocated to LPs at the moment they're incurred,
    // so this reflects genuine cumulative fund-borne cost.
    const fundExpensesPayable = unpaidExpenses.reduce(
      (s, e) => s + e.amount,
      0,
    );

    const nav =
      portfolioTotal +
      cashHeld -
      accruedManagementFeePayable -
      fundExpensesPayable;

    return {
      fundId,
      portfolioInvestments: rows,
      portfolioTotal,
      cashHeld,
      accruedManagementFeePayable,
      fundExpensesPayable,
      nav,
    };
  }

  private computeXirr(
    cashFlows: { date: Date; amount: number }[],
  ): number | null {
    if (cashFlows.length < 2) return null;
    const sorted = [...cashFlows].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
    const t0 = sorted[0].date.getTime();
    const years = (d: Date) => (d.getTime() - t0) / (365 * 86400000);

    const npv = (rate: number) =>
      sorted.reduce(
        (sum, cf) => sum + cf.amount / Math.pow(1 + rate, years(cf.date)),
        0,
      );
    const dnpv = (rate: number) =>
      sorted.reduce((sum, cf) => {
        const y = years(cf.date);
        return y === 0
          ? sum
          : sum - (y * cf.amount) / Math.pow(1 + rate, y + 1);
      }, 0);

    let rate = 0.15;
    for (let i = 0; i < 100; i++) {
      const f = npv(rate);
      const df = dnpv(rate);
      if (Math.abs(df) < 1e-9) break;
      const next = rate - f / df;
      if (Math.abs(next - rate) < 1e-7) {
        return Math.abs(npv(next)) < 1 ? next : null;
      }
      rate = Math.max(next, -0.999);
    }
    return Math.abs(npv(rate)) < 1 ? rate : null;
  }

  async getPerformanceMetrics(tenantId: string, fundId: string) {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const [calls, distributions, navResult] = await Promise.all([
      this.callModel.find({ tenantId: tId, fundId: fId }).lean(),
      this.distributionModel.find({ tenantId: tId, fundId: fId }).lean(),
      this.getNav(tenantId, fundId),
    ]);

    const called = calls.reduce(
      (s, c) => s + c.allocations.reduce((s2, a) => s2 + a.fundedAmount, 0),
      0,
    );
    const distributed = distributions.reduce((s, d) => s + d.totalToLps, 0);

    const dpi = called > 0 ? distributed / called : 0;
    const rvpi = called > 0 ? navResult.nav / called : 0;
    const tvpi = dpi + rvpi;

    const cashFlows: { date: Date; amount: number }[] = [];
    for (const call of calls) {
      for (const alloc of call.allocations as any[]) {
        if (alloc.fundedAmount > 0 && alloc.fundedAt) {
          cashFlows.push({
            date: new Date(alloc.fundedAt),
            amount: -alloc.fundedAmount,
          });
        }
      }
    }
    for (const d of distributions) {
      if (d.totalToLps > 0) {
        cashFlows.push({ date: new Date(d.date), amount: d.totalToLps });
      }
    }
    if (navResult.nav > 0) {
      cashFlows.push({ date: new Date(), amount: navResult.nav });
    }
    const netIrr = this.computeXirr(cashFlows);

    return {
      fundId,
      called,
      distributed,
      nav: navResult.nav,
      dpi,
      rvpi,
      tvpi,
      netIrr,
      netIrrNote:
        netIrr === null
          ? 'Not enough dated cash flow history yet to compute a stable IRR.'
          : 'Uses current NAV as a terminal cash flow; does not net out unrealised accrued carry on that NAV.',
      pmeNote:
        'PME is not computed — it requires a connected public benchmark index data source, which does not exist yet.',
    };
  }
}

@Injectable()
export class DistributionService {
  constructor(
    @InjectModel(Distribution.name)
    private readonly model: Model<DistributionDocument>,
    @InjectModel(Fund.name)
    private readonly fundModel: Model<FundDocument>,
    @InjectModel(CapitalCommitment.name)
    private readonly commitmentModel: Model<CapitalCommitmentDocument>,
    @InjectModel(CapitalCall.name)
    private readonly callModel: Model<CapitalCallDocument>,
    private readonly glPostingService: GlPostingService,
    private readonly capitalAccountService: CapitalAccountService,
    private readonly navService: NavService,
  ) {}

  // Shared by recordDistribution (real, persisted) and
  // getAccruedCarryOnNav (hypothetical, read-only) — the same real
  // tier-filling math either way, so the two can never quietly
  // diverge from each other.
  // Public — shared with ScenarioService's real what-if calculator,
  // so scenario modelling runs the exact same real tier logic as an
  // actual distribution, not a second parallel calculation.
  waterfallFill(
    amount: number,
    tier1Room: number,
    tier2Room: number,
    tier3Room: number,
    carryPct: number,
  ) {
    let remaining = amount;
    const tier1 = Math.min(remaining, Math.max(0, tier1Room));
    remaining = Math.round((remaining - tier1) * 100) / 100;
    const tier2 = Math.min(remaining, Math.max(0, tier2Room));
    remaining = Math.round((remaining - tier2) * 100) / 100;
    const tier3 = Math.min(remaining, Math.max(0, tier3Room));
    remaining = Math.round((remaining - tier3) * 100) / 100;
    const tier4Gp = Math.round(remaining * (carryPct / 100) * 100) / 100;
    const tier4Lp = Math.round((remaining - tier4Gp) * 100) / 100;
    return { tier1, tier2, tier3, tier4Lp, tier4Gp };
  }

  async getAll(tenantId: string, fundId: string) {
    return this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        fundId: new Types.ObjectId(fundId),
      })
      .sort({ date: -1 })
      .lean();
  }

  // Public — same reasoning as waterfallFill above.
  async computePreferredReturnTarget(
    tenantId: string,
    fundId: string,
    fund: any,
    asOfDate: Date,
  ): Promise<number> {
    const calls = await this.callModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        fundId: new Types.ObjectId(fundId),
      })
      .lean();
    let target = 0;
    for (const call of calls) {
      for (const alloc of call.allocations as any[]) {
        if (alloc.fundedAmount > 0 && alloc.fundedAt) {
          const years = Math.max(
            0,
            (asOfDate.getTime() - new Date(alloc.fundedAt).getTime()) /
              (365 * 86400000),
          );
          target +=
            alloc.fundedAmount *
            (Math.pow(1 + fund.hurdlePct / 100, years) - 1);
        }
      }
    }
    return Math.round(target * 100) / 100;
  }

  async getWaterfallState(tenantId: string, fundId: string) {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const [fund, calls, distributions] = await Promise.all([
      this.fundModel.findOne({ _id: fId, tenantId: tId }).lean(),
      this.callModel.find({ tenantId: tId, fundId: fId }).lean(),
      this.model.find({ tenantId: tId, fundId: fId }).lean(),
    ]);
    if (!fund) throw new NotFoundException('Fund not found');

    const totalCalled = calls.reduce(
      (s, c) => s + c.allocations.reduce((s2, a) => s2 + a.fundedAmount, 0),
      0,
    );
    const tier2Target = await this.computePreferredReturnTarget(
      tenantId,
      fundId,
      fund,
      new Date(),
    );
    const tier3Target =
      tier2Target > 0
        ? (tier2Target * (fund.carryPct / 100)) / (1 - fund.carryPct / 100)
        : 0;

    const sum = (fn: (d: any) => number) =>
      distributions.reduce((s, d) => s + fn(d), 0);
    const tier1Paid = sum((d) => d.tier1Amount);
    const tier2Paid = sum((d) => d.tier2Amount);
    const tier3Paid = sum((d) => d.tier3Amount);
    const tier4LpPaid = sum((d) => d.tier4LpAmount);
    const tier4GpPaid = sum((d) => d.tier4GpAmount);

    return {
      fundId,
      waterfallType: fund.waterfallType,
      totalDistributed: sum((d) => d.totalAmount),
      totalToLps: sum((d) => d.totalToLps),
      totalToGpGross: sum((d) => d.totalToGpGross),
      carryHeldInEscrow: sum((d) => d.carryHeldInEscrow),
      carryPaidNet: sum((d) => d.carryPaidToGp),
      tier1: {
        target: totalCalled,
        paid: tier1Paid,
        remaining: Math.max(0, totalCalled - tier1Paid),
        complete: tier1Paid >= totalCalled - 0.01 && totalCalled > 0,
      },
      tier2: {
        target: tier2Target,
        paid: tier2Paid,
        remaining: Math.max(0, tier2Target - tier2Paid),
        complete: tier2Paid >= tier2Target - 0.01 && tier2Target > 0,
      },
      tier3: {
        target: tier3Target,
        paid: tier3Paid,
        remaining: Math.max(0, tier3Target - tier3Paid),
        complete: tier3Paid >= tier3Target - 0.01 && tier3Target > 0,
      },
      tier4: { lpPaid: tier4LpPaid, gpPaid: tier4GpPaid },
      hurdleStatusPct: tier2Target > 0 ? (tier2Paid / tier2Target) * 100 : 0,
      distributionEventCount: distributions.length,
    };
  }

  async recordDistribution(
    tenantId: string,
    fundId: string,
    dto: RecordDistributionDto,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const fund = await this.fundModel
      .findOne({ _id: fId, tenantId: tId })
      .lean();
    if (!fund) throw new NotFoundException('Fund not found');

    const [commitments, calls, priorDistributions] = await Promise.all([
      this.commitmentModel.find({ tenantId: tId, fundId: fId }).lean(),
      this.callModel.find({ tenantId: tId, fundId: fId }).lean(),
      this.model.find({ tenantId: tId, fundId: fId }).lean(),
    ]);
    if (!commitments.length) {
      throw new BadRequestException('No LP commitments to distribute to');
    }
    if (dto.totalAmount <= 0) {
      throw new BadRequestException('Distribution amount must be positive');
    }

    const distributionDate = new Date(dto.date);
    const totalCalled = calls.reduce(
      (s, c) => s + c.allocations.reduce((s2, a) => s2 + a.fundedAmount, 0),
      0,
    );
    const tier2TargetNow = await this.computePreferredReturnTarget(
      tenantId,
      fundId,
      fund,
      distributionDate,
    );
    const tier3Target =
      tier2TargetNow > 0
        ? (tier2TargetNow * (fund.carryPct / 100)) / (1 - fund.carryPct / 100)
        : 0;

    const tier1PaidSoFar = priorDistributions.reduce(
      (s, d) => s + d.tier1Amount,
      0,
    );
    const tier2PaidSoFar = priorDistributions.reduce(
      (s, d) => s + d.tier2Amount,
      0,
    );
    const tier3PaidSoFar = priorDistributions.reduce(
      (s, d) => s + d.tier3Amount,
      0,
    );

    const {
      tier1: tier1Amount,
      tier2: tier2Amount,
      tier3: tier3Amount,
      tier4Lp: tier4LpAmount,
      tier4Gp: tier4GpAmount,
    } = this.waterfallFill(
      dto.totalAmount,
      totalCalled - tier1PaidSoFar,
      tier2TargetNow - tier2PaidSoFar,
      tier3Target - tier3PaidSoFar,
      fund.carryPct,
    );

    const totalToLps =
      Math.round((tier1Amount + tier2Amount + tier4LpAmount) * 100) / 100;
    const totalToGpGross =
      Math.round((tier3Amount + tier4GpAmount) * 100) / 100;
    const carryHeldInEscrow =
      Math.round(totalToGpGross * (fund.carryEscrowPct / 100) * 100) / 100;
    const carryPaidToGp =
      Math.round((totalToGpGross - carryHeldInEscrow) * 100) / 100;

    const calledByLp = new Map<string, number>();
    for (const call of calls) {
      for (const alloc of call.allocations as any[]) {
        const key = String(alloc.commitmentId);
        calledByLp.set(key, (calledByLp.get(key) ?? 0) + alloc.fundedAmount);
      }
    }
    const lpCommitments = commitments.filter((c) => !c.isGpCommitment);
    const gpCommitment = commitments.find((c) => c.isGpCommitment);
    const totalCalledAcrossLps = lpCommitments.reduce(
      (s, c) => s + (calledByLp.get(String(c._id)) ?? 0),
      0,
    );

    const allocations: { commitmentId: any; lpName: string; amount: number }[] =
      [];
    if (totalToLps > 0 && totalCalledAcrossLps > 0) {
      for (const c of lpCommitments) {
        const called = calledByLp.get(String(c._id)) ?? 0;
        const amount =
          Math.round(totalToLps * (called / totalCalledAcrossLps) * 100) / 100;
        if (amount > 0)
          allocations.push({ commitmentId: c._id, lpName: c.lpName, amount });
      }
    }

    const ref = `DIST-${String(priorDistributions.length + 101)}`;
    const created = await this.model.create({
      tenantId: tId,
      fundId: fId,
      ref,
      date: distributionDate,
      source: dto.source ?? DistributionSource.EXIT,
      sourceDescription: dto.sourceDescription ?? '',
      totalAmount: dto.totalAmount,
      tier1Amount,
      tier2Amount,
      tier3Amount,
      tier4LpAmount,
      tier4GpAmount,
      totalToLps,
      totalToGpGross,
      carryHeldInEscrow,
      carryPaidToGp,
      allocations,
    });

    for (const alloc of allocations) {
      await this.capitalAccountService.postEntry(
        tenantId,
        fundId,
        String(alloc.commitmentId),
        CapitalAccountEntryType.DISTRIBUTION,
        -alloc.amount,
        `Distribution ${ref}`,
        created._id,
      );
    }
    if (gpCommitment && totalToGpGross > 0) {
      await this.capitalAccountService.postEntry(
        tenantId,
        fundId,
        String(gpCommitment._id),
        CapitalAccountEntryType.DISTRIBUTION,
        -totalToGpGross,
        `Carry distribution ${ref} (gross, before escrow holdback)`,
        created._id,
      );
    }

    if (fund.bankAccountId) {
      await this.glPostingService.post(tenantId, [
        {
          date: distributionDate,
          ref,
          description: `Distribution ${ref} — ${dto.source ?? DistributionSource.EXIT}`,
          accountCode: GL_ACCOUNTS.LP_PAID_IN_CAPITAL.code,
          accountName: GL_ACCOUNTS.LP_PAID_IN_CAPITAL.name,
          source: GlSource.FUND,
          debit: dto.totalAmount,
          sourceId: created._id,
        },
        {
          date: distributionDate,
          ref,
          description: `Distribution ${ref} — ${dto.source ?? DistributionSource.EXIT}`,
          accountCode: GL_ACCOUNTS.BANK_FUND.code,
          accountName: GL_ACCOUNTS.BANK_FUND.name,
          source: GlSource.FUND,
          credit: dto.totalAmount,
          sourceId: created._id,
        },
      ]);
    }

    return created.toObject();
  }

  async getGpCarryPosition(tenantId: string, fundId: string) {
    const state = await this.getWaterfallState(tenantId, fundId);
    const carryEntitled =
      Math.round((state.tier3.paid + state.tier4.gpPaid) * 100) / 100;
    const carryReceived = state.totalToGpGross;
    const clawbackObligation = Math.max(
      0,
      Math.round((carryReceived - carryEntitled) * 100) / 100,
    );
    return {
      carryReceivedToDate: carryReceived,
      carryEntitled,
      carryPaidNet: state.carryPaidNet,
      carryHeldInEscrow: state.carryHeldInEscrow,
      clawbackObligation,
      noClawback: clawbackObligation === 0,
    };
  }

  // The piece deliberately deferred when Distributions was first
  // built: what carry would the GP be entitled to if the fund's
  // current real NAV were hypothetically distributed today, on top
  // of everything already really distributed. Read-only — runs the
  // same real waterfall math as recordDistribution against the
  // real cumulative state, but never persists a Distribution or
  // posts anything. This is the fund's real unrealised carry
  // liability, payable only if and when an actual distribution
  // happens — not money that's moved yet.
  async getAccruedCarryOnNav(tenantId: string, fundId: string) {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const fund = await this.fundModel
      .findOne({ _id: fId, tenantId: tId })
      .lean();
    if (!fund) throw new NotFoundException('Fund not found');

    const [calls, priorDistributions, navResult] = await Promise.all([
      this.callModel.find({ tenantId: tId, fundId: fId }).lean(),
      this.model.find({ tenantId: tId, fundId: fId }).lean(),
      this.navService.getNav(tenantId, fundId),
    ]);

    if (navResult.nav <= 0) {
      return {
        hypotheticalNav: navResult.nav,
        accruedCarryGross: 0,
        accruedCarryNote:
          'NAV is not positive — no hypothetical carry to accrue.',
      };
    }

    const totalCalled = calls.reduce(
      (s, c) => s + c.allocations.reduce((s2, a) => s2 + a.fundedAmount, 0),
      0,
    );
    const tier2TargetNow = await this.computePreferredReturnTarget(
      tenantId,
      fundId,
      fund,
      new Date(),
    );
    const tier3Target =
      tier2TargetNow > 0
        ? (tier2TargetNow * (fund.carryPct / 100)) / (1 - fund.carryPct / 100)
        : 0;

    const tier1PaidSoFar = priorDistributions.reduce(
      (s, d) => s + d.tier1Amount,
      0,
    );
    const tier2PaidSoFar = priorDistributions.reduce(
      (s, d) => s + d.tier2Amount,
      0,
    );
    const tier3PaidSoFar = priorDistributions.reduce(
      (s, d) => s + d.tier3Amount,
      0,
    );

    const { tier3: hypotheticalTier3, tier4Gp: hypotheticalTier4Gp } =
      this.waterfallFill(
        navResult.nav,
        totalCalled - tier1PaidSoFar,
        tier2TargetNow - tier2PaidSoFar,
        tier3Target - tier3PaidSoFar,
        fund.carryPct,
      );
    const accruedCarryGross =
      Math.round((hypotheticalTier3 + hypotheticalTier4Gp) * 100) / 100;

    return {
      hypotheticalNav: navResult.nav,
      accruedCarryGross,
      accruedCarryNote:
        'Based on current NAV — treats it as if distributed today through the real cumulative waterfall. Payable only on an actual distribution, not money that has moved.',
    };
  }
}

// ── Fund expenses — real costs the fund itself bears, allocated
// pro-rata to LP capital accounts. Organisational costs specifically
// respect the fund's real cap: whatever pushes cumulative org costs
// above it is the GP's own responsibility, excluded from LP
// allocation entirely. ────────────────────────────────────────────

@Injectable()
export class FundExpenseService {
  constructor(
    @InjectModel(FundExpense.name)
    private readonly model: Model<FundExpenseDocument>,
    @InjectModel(Fund.name)
    private readonly fundModel: Model<FundDocument>,
    @InjectModel(CapitalCommitment.name)
    private readonly commitmentModel: Model<CapitalCommitmentDocument>,
    private readonly capitalAccountService: CapitalAccountService,
    private readonly glPostingService: GlPostingService,
  ) {}

  async getAll(tenantId: string, fundId: string) {
    return this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        fundId: new Types.ObjectId(fundId),
      })
      .sort({ date: -1 })
      .lean();
  }

  async recordExpense(
    tenantId: string,
    fundId: string,
    dto: RecordFundExpenseDto,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const fund = await this.fundModel
      .findOne({ _id: fId, tenantId: tId })
      .lean();
    if (!fund) throw new NotFoundException('Fund not found');

    let fundBorneAmount = dto.amount;
    let gpBorneAmount = 0;

    if (dto.isOrganisationalCost && fund.orgCostsCapAmount > 0) {
      const priorOrgCosts = await this.model.aggregate([
        {
          $match: {
            tenantId: tId,
            fundId: fId,
            isOrganisationalCost: true,
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]);
      const alreadyIncurred = priorOrgCosts[0]?.total ?? 0;
      const roomUnderCap = Math.max(
        0,
        fund.orgCostsCapAmount - alreadyIncurred,
      );
      fundBorneAmount = Math.min(dto.amount, roomUnderCap);
      gpBorneAmount = Math.round((dto.amount - fundBorneAmount) * 100) / 100;
    }

    const created = await this.model.create({
      tenantId: tId,
      fundId: fId,
      category: dto.category,
      amount: dto.amount,
      date: new Date(dto.date),
      isOrganisationalCost: dto.isOrganisationalCost ?? false,
      borneBy:
        gpBorneAmount > 0 && fundBorneAmount === 0
          ? ExpenseBorneBy.GP
          : ExpenseBorneBy.FUND,
      gpBorneAmount,
    });

    // Only the fund-borne portion is real cost to LPs — allocated
    // pro-rata to commitment, reducing each LP's real capital
    // account balance.
    if (fundBorneAmount > 0) {
      const commitments = await this.commitmentModel
        .find({ tenantId: tId, fundId: fId })
        .lean();
      const totalCommitment = commitments.reduce((s, c) => s + c.commitment, 0);
      for (const c of commitments) {
        const share = totalCommitment > 0 ? c.commitment / totalCommitment : 0;
        const allocated = Math.round(fundBorneAmount * share * 100) / 100;
        if (allocated > 0) {
          await this.capitalAccountService.postEntry(
            tenantId,
            fundId,
            String(c._id),
            CapitalAccountEntryType.EXPENSE,
            -allocated,
            `${dto.category} — pro-rata fund expense`,
            created._id,
          );
        }
      }

      if (fund.bankAccountId) {
        const ref = `EXP-${String(created._id).slice(-6)}`;
        await this.glPostingService.post(tenantId, [
          {
            date: new Date(dto.date),
            ref,
            description: dto.category,
            accountCode: GL_ACCOUNTS.GENERAL_EXPENSE.code,
            accountName: GL_ACCOUNTS.GENERAL_EXPENSE.name,
            source: GlSource.FUND,
            debit: fundBorneAmount,
            sourceId: created._id,
          },
          {
            date: new Date(dto.date),
            ref,
            description: dto.category,
            accountCode: GL_ACCOUNTS.BANK_FUND.code,
            accountName: GL_ACCOUNTS.BANK_FUND.name,
            source: GlSource.FUND,
            credit: fundBorneAmount,
            sourceId: created._id,
          },
        ]);
      }
    }

    return created.toObject();
  }
}

// ── Management fee — real per-LP calculation with a genuine basis
// switch (committed capital during the investment period, real
// called/invested capital after it — from the fund's own real
// investmentPeriodEndDate, not assumed) and real per-LP side-letter
// rate overrides. Charging and paying are two separate real events:
// a charge accrues (reduces NAV, reduces each LP's capital account)
// before any cash actually moves; paying is the real cash leaving
// the fund's bank account to the manager. ─────────────────────────

@Injectable()
export class ManagementFeeService {
  constructor(
    @InjectModel(ManagementFeeCharge.name)
    private readonly model: Model<ManagementFeeChargeDocument>,
    @InjectModel(Fund.name)
    private readonly fundModel: Model<FundDocument>,
    @InjectModel(CapitalCommitment.name)
    private readonly commitmentModel: Model<CapitalCommitmentDocument>,
    @InjectModel(CapitalCall.name)
    private readonly callModel: Model<CapitalCallDocument>,
    private readonly capitalAccountService: CapitalAccountService,
    private readonly glPostingService: GlPostingService,
  ) {}

  async getAll(tenantId: string, fundId: string) {
    return this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        fundId: new Types.ObjectId(fundId),
      })
      .sort({ period: -1 })
      .lean();
  }

  private async computeFeeAllocations(
    tenantId: string,
    fundId: string,
    asOfDate: Date,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const [fund, commitments, calls] = await Promise.all([
      this.fundModel.findOne({ _id: fId, tenantId: tId }).lean(),
      this.commitmentModel.find({ tenantId: tId, fundId: fId }).lean(),
      this.callModel.find({ tenantId: tId, fundId: fId }).lean(),
    ]);
    if (!fund) throw new NotFoundException('Fund not found');

    const postInvestmentPeriod =
      !!fund.investmentPeriodEndDate &&
      asOfDate >= fund.investmentPeriodEndDate;
    const basis = postInvestmentPeriod
      ? 'Invested capital'
      : 'Committed capital';

    const calledByLp = new Map<string, number>();
    for (const call of calls) {
      for (const alloc of call.allocations as any[]) {
        const key = String(alloc.commitmentId);
        calledByLp.set(key, (calledByLp.get(key) ?? 0) + alloc.fundedAmount);
      }
    }

    // Quarterly charge — the fund's annual rate divided across four
    // real periods, matching the mockup's own Q1/Q2 cadence.
    const allocations = commitments.map((c) => {
      const baseAmount = postInvestmentPeriod
        ? (calledByLp.get(String(c._id)) ?? 0)
        : c.commitment;
      const ratePct = c.mgmtFeePctOverride ?? fund.mgmtFeePct;
      const feeAmount =
        Math.round(((baseAmount * (ratePct / 100)) / 4) * 100) / 100;
      return {
        commitmentId: c._id,
        lpName: c.lpName,
        baseAmount,
        ratePct,
        feeAmount,
      };
    });

    return {
      basis,
      allocations,
      totalBaseAmount: allocations.reduce((s, a) => s + a.baseAmount, 0),
      totalFeeAmount: allocations.reduce((s, a) => s + a.feeAmount, 0),
    };
  }

  // Read-only preview — what a charge would look like right now,
  // without persisting anything.
  async previewFee(tenantId: string, fundId: string) {
    return this.computeFeeAllocations(tenantId, fundId, new Date());
  }

  async chargeFee(
    tenantId: string,
    fundId: string,
    period: string,
    dto: ChargeManagementFeeDto,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const existing = await this.model.findOne({
      tenantId: tId,
      fundId: fId,
      period,
    });
    if (existing) {
      throw new BadRequestException(
        `Management fee for ${period} has already been charged`,
      );
    }

    const { basis, allocations, totalBaseAmount, totalFeeAmount } =
      await this.computeFeeAllocations(
        tenantId,
        fundId,
        new Date(dto.asOfDate),
      );

    const created = await this.model.create({
      tenantId: tId,
      fundId: fId,
      period,
      basis,
      totalBaseAmount,
      totalFeeAmount,
      allocations,
      status: FeeChargeStatus.ACCRUED,
    });

    for (const a of allocations) {
      if (a.feeAmount > 0) {
        await this.capitalAccountService.postEntry(
          tenantId,
          fundId,
          String(a.commitmentId),
          CapitalAccountEntryType.EXPENSE,
          -a.feeAmount,
          `Management fee — ${period}`,
          created._id,
        );
      }
    }

    return created.toObject();
  }

  async payFee(tenantId: string, chargeId: string) {
    const charge = await this.model.findOne({
      _id: chargeId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!charge) throw new NotFoundException('Fee charge not found');
    if (charge.status === FeeChargeStatus.PAID) {
      throw new BadRequestException('This fee charge has already been paid');
    }

    const fund = await this.fundModel
      .findOne({ _id: charge.fundId, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (fund?.bankAccountId && charge.totalFeeAmount > 0) {
      const ref = `MF-${charge.period}`;
      await this.glPostingService.post(tenantId, [
        {
          date: new Date(),
          ref,
          description: `Management fee ${charge.period} paid`,
          accountCode: GL_ACCOUNTS.GENERAL_EXPENSE.code,
          accountName: GL_ACCOUNTS.GENERAL_EXPENSE.name,
          source: GlSource.FUND,
          debit: charge.totalFeeAmount,
          sourceId: charge._id,
        },
        {
          date: new Date(),
          ref,
          description: `Management fee ${charge.period} paid`,
          accountCode: GL_ACCOUNTS.BANK_FUND.code,
          accountName: GL_ACCOUNTS.BANK_FUND.name,
          source: GlSource.FUND,
          credit: charge.totalFeeAmount,
          sourceId: charge._id,
        },
      ]);
    }

    charge.status = FeeChargeStatus.PAID;
    charge.paidAt = new Date();
    await charge.save();
    return charge.toObject();
  }
}

@Injectable()
export class PortfolioHoldingService {
  constructor(
    @InjectModel(PortfolioHolding.name)
    private readonly model: Model<PortfolioHoldingDocument>,
    @InjectModel(HoldingValuation.name)
    private readonly valuationModel: Model<HoldingValuationDocument>,
    @InjectModel(Fund.name)
    private readonly fundModel: Model<FundDocument>,
    @InjectModel(CapitalCommitment.name)
    private readonly commitmentModel: Model<CapitalCommitmentDocument>,
  ) {}

  private async getLatestApprovedValue(
    tenantId: string,
    holdingId: string,
  ): Promise<{ value: number; period: string } | null> {
    const latest = await this.valuationModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        holdingId: new Types.ObjectId(holdingId),
        status: HoldingValuationStatus.APPROVED,
      })
      .sort({ period: -1 })
      .lean();
    if (!latest || latest.approvedValue === null) return null;
    return { value: latest.approvedValue, period: latest.period };
  }

  async getAll(tenantId: string, fundId: string) {
    const holdings = await this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        fundId: new Types.ObjectId(fundId),
      })
      .sort({ entryDate: 1 })
      .lean();
    return Promise.all(
      holdings.map(async (h) => {
        const latest = await this.getLatestApprovedValue(
          tenantId,
          String(h._id),
        );
        const fairValue =
          h.status === HoldingStatus.EXITED
            ? (h.exitProceeds ?? 0)
            : (latest?.value ?? null);
        return {
          ...h,
          fairValue,
          fairValuePeriod: latest?.period ?? null,
          moic:
            fairValue !== null && h.costBasis > 0
              ? fairValue / h.costBasis
              : null,
        };
      }),
    );
  }

  async create(
    tenantId: string,
    fundId: string,
    dto: CreatePortfolioHoldingDto,
  ) {
    const fund = await this.fundModel.findOne({
      _id: fundId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!fund) throw new NotFoundException('Fund not found');
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      fundId: new Types.ObjectId(fundId),
      companyName: dto.companyName,
      sector: dto.sector ?? '',
      country: dto.country ?? '',
      entryDate: new Date(dto.entryDate),
      costBasis: dto.costBasis,
    });
    return created.toObject();
  }

  // A real exit — the holding stops being valued quarterly and its
  // fair value becomes the actual real proceeds received. Recording
  // the exit does not itself distribute cash to LPs; that's a
  // separate, explicit action via DistributionService, since the GP
  // may choose to recycle proceeds instead per the fund's real
  // recycling terms rather than always distributing. If a recycled
  // amount is given, it's validated against the fund's real
  // recycling cap (a % of total commitments) — recycling beyond
  // what the LPA actually permits isn't allowed.
  async recordExit(
    tenantId: string,
    fundId: string,
    holdingId: string,
    dto: RecordExitDto,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const holding = await this.model.findOne({
      _id: holdingId,
      tenantId: tId,
      fundId: fId,
    });
    if (!holding) throw new NotFoundException('Holding not found');
    if (holding.status === HoldingStatus.EXITED) {
      throw new BadRequestException('This holding has already been exited');
    }

    const recycled = dto.recycledAmount ?? 0;
    if (recycled > dto.exitProceeds) {
      throw new BadRequestException(
        'Recycled amount cannot exceed exit proceeds',
      );
    }
    if (recycled > 0) {
      const fund = await this.fundModel
        .findOne({ _id: fId, tenantId: tId })
        .lean();
      if (!fund) throw new NotFoundException('Fund not found');
      if (!fund.recyclingPermitted) {
        throw new BadRequestException(
          "This fund's LPA does not permit recycling",
        );
      }
      const [commitments, priorHoldings] = await Promise.all([
        this.commitmentModel.find({ tenantId: tId, fundId: fId }).lean(),
        this.model
          .find({ tenantId: tId, fundId: fId, status: HoldingStatus.EXITED })
          .lean(),
      ]);
      const totalCommitments = commitments.reduce(
        (s, c) => s + c.commitment,
        0,
      );
      const recyclingCap = totalCommitments * (fund.recyclingCapPct / 100);
      const alreadyRecycled = priorHoldings.reduce(
        (s, h) => s + (h.recycledAmount ?? 0),
        0,
      );
      if (alreadyRecycled + recycled > recyclingCap) {
        throw new BadRequestException(
          `Recycling ${recycled} would exceed the fund's real recycling cap of ${recyclingCap} (${alreadyRecycled} already recycled)`,
        );
      }
    }

    holding.status = HoldingStatus.EXITED;
    holding.exitedAt = new Date(dto.exitedAt);
    holding.exitProceeds = dto.exitProceeds;
    holding.recycledAmount = recycled;
    await holding.save();
    return holding.toObject();
  }
}

@Injectable()
export class HoldingValuationService {
  constructor(
    @InjectModel(HoldingValuation.name)
    private readonly model: Model<HoldingValuationDocument>,
    @InjectModel(PortfolioHolding.name)
    private readonly holdingModel: Model<PortfolioHoldingDocument>,
  ) {}

  async getWorkflowForPeriod(tenantId: string, fundId: string, period: string) {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const [holdings, valuations, priorValuations] = await Promise.all([
      this.holdingModel
        .find({ tenantId: tId, fundId: fId, status: HoldingStatus.ACTIVE })
        .lean(),
      this.model.find({ tenantId: tId, fundId: fId, period }).lean(),
      this.model
        .find({ tenantId: tId, fundId: fId, period: { $lt: period } })
        .sort({ period: -1 })
        .lean(),
    ]);

    return holdings.map((h) => {
      const current =
        valuations.find((v) => String(v.holdingId) === String(h._id)) ?? null;
      const prior =
        priorValuations.find(
          (v) =>
            String(v.holdingId) === String(h._id) &&
            v.status === HoldingValuationStatus.APPROVED,
        ) ?? null;
      return {
        holdingId: h._id,
        companyName: h.companyName,
        sector: h.sector,
        country: h.country,
        costBasis: h.costBasis,
        valuation: current,
        priorApprovedValue: prior?.approvedValue ?? null,
        priorPeriod: prior?.period ?? null,
      };
    });
  }

  async proposeValuation(
    tenantId: string,
    fundId: string,
    holdingId: string,
    period: string,
    dto: ProposeValuationDto,
  ) {
    const existing = await this.model.findOne({
      tenantId: new Types.ObjectId(tenantId),
      fundId: new Types.ObjectId(fundId),
      holdingId: new Types.ObjectId(holdingId),
      period,
    });
    if (existing) {
      throw new BadRequestException(
        `A valuation for this holding already exists for ${period}`,
      );
    }
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      fundId: new Types.ObjectId(fundId),
      holdingId: new Types.ObjectId(holdingId),
      period,
      method: dto.method,
      ifrsLevel: dto.ifrsLevel,
      keyInput: dto.keyInput ?? '',
      proposedValue: dto.proposedValue,
      proposedBy: dto.proposedBy,
      proposedAt: new Date(),
      status: HoldingValuationStatus.PROPOSED,
    });
    return created.toObject();
  }

  async reviewValuation(
    tenantId: string,
    valuationId: string,
    dto: ReviewValuationDto,
  ) {
    const v = await this.model.findOne({
      _id: valuationId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!v) throw new NotFoundException('Valuation not found');
    if (v.status !== HoldingValuationStatus.PROPOSED) {
      throw new BadRequestException(
        'Only a proposed valuation can be reviewed',
      );
    }
    v.reviewedValue = dto.reviewedValue;
    v.reviewNotes = dto.reviewNotes ?? '';
    v.reviewedBy = dto.reviewedBy;
    v.reviewedAt = new Date();
    v.methodologyChanged = dto.methodologyChanged ?? false;
    v.status = HoldingValuationStatus.REVIEWED;
    await v.save();
    return v.toObject();
  }

  async approveValuation(
    tenantId: string,
    valuationId: string,
    dto: ApproveValuationDto,
  ) {
    const v = await this.model.findOne({
      _id: valuationId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!v) throw new NotFoundException('Valuation not found');
    if (v.status !== HoldingValuationStatus.REVIEWED) {
      throw new BadRequestException(
        'Only a reviewed valuation can be approved',
      );
    }
    v.approvedValue = v.reviewedValue;
    v.approvedBy = dto.approvedBy;
    v.approvedAt = new Date();
    v.status = HoldingValuationStatus.APPROVED;
    await v.save();
    return v.toObject();
  }
}

// ── Compliance — key persons and real, LPA-set investment
// restrictions, checked against real portfolio holdings. AML status
// per LP is deliberately not included: it lives in the platform's
// own AML/KYC module, which this doesn't yet cross-reference —
// showing a fabricated status here would be worse than omitting it.

@Injectable()
export class ComplianceService {
  constructor(
    @InjectModel(KeyPerson.name)
    private readonly keyPersonModel: Model<KeyPersonDocument>,
    @InjectModel(ComplianceCalendarItem.name)
    private readonly calendarModel: Model<ComplianceCalendarItemDocument>,
    @InjectModel(Fund.name)
    private readonly fundModel: Model<FundDocument>,
    @InjectModel(PortfolioHolding.name)
    private readonly holdingModel: Model<PortfolioHoldingDocument>,
    @InjectModel(CapitalCommitment.name)
    private readonly commitmentModel: Model<CapitalCommitmentDocument>,
  ) {}

  async getKeyPersons(tenantId: string, fundId: string) {
    return this.keyPersonModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        fundId: new Types.ObjectId(fundId),
      })
      .sort({ createdAt: 1 })
      .lean();
  }

  async addKeyPerson(tenantId: string, fundId: string, dto: AddKeyPersonDto) {
    const created = await this.keyPersonModel.create({
      tenantId: new Types.ObjectId(tenantId),
      fundId: new Types.ObjectId(fundId),
      name: dto.name,
      role: dto.role,
      timeThresholdPct: dto.timeThresholdPct,
    });
    return created.toObject();
  }

  async confirmActive(tenantId: string, keyPersonId: string) {
    const kp = await this.keyPersonModel.findOne({
      _id: keyPersonId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!kp) throw new NotFoundException('Key person not found');
    kp.lastConfirmedAt = new Date();
    await kp.save();
    return kp.toObject();
  }

  // A real, automatic consequence — matching what a real key-person
  // clause does, not a display-only status change.
  async markDeparted(tenantId: string, fundId: string, keyPersonId: string) {
    const tId = new Types.ObjectId(tenantId);
    const kp = await this.keyPersonModel.findOne({
      _id: keyPersonId,
      tenantId: tId,
      fundId: new Types.ObjectId(fundId),
    });
    if (!kp) throw new NotFoundException('Key person not found');
    kp.status = KeyPersonStatus.DEPARTED;
    kp.departedAt = new Date();
    await kp.save();

    const fund = await this.fundModel.findOne({ _id: fundId, tenantId: tId });
    if (fund) {
      fund.investmentPeriodSuspended = true;
      await fund.save();
    }
    return kp.toObject();
  }

  async getCalendar(tenantId: string, fundId: string) {
    const items = await this.calendarModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        fundId: new Types.ObjectId(fundId),
      })
      .lean();
    // Real status, computed live from real dates — never stored,
    // since "overdue" or "upcoming" is only ever true relative to
    // right now.
    return items.map((item) => {
      let nextDueDate: Date | null = null;
      if (item.lastCompletedAt) {
        const daysInCycle =
          item.frequency === ComplianceFrequency.QUARTERLY
            ? 90
            : item.frequency === ComplianceFrequency.SEMI_ANNUAL
              ? 182
              : item.frequency === ComplianceFrequency.ANNUAL
                ? 365
                : null;
        if (daysInCycle) {
          nextDueDate = new Date(
            item.lastCompletedAt.getTime() +
              daysInCycle * 86400000 +
              item.daysAfterPeriodEnd * 86400000,
          );
        }
      }
      const daysUntilDue = nextDueDate
        ? Math.round((nextDueDate.getTime() - Date.now()) / 86400000)
        : null;
      const status =
        daysUntilDue === null
          ? 'Not yet scheduled'
          : daysUntilDue < 0
            ? 'Overdue'
            : daysUntilDue <= 14
              ? 'Due soon'
              : 'Upcoming';
      return { ...item, nextDueDate, daysUntilDue, status };
    });
  }

  async addCalendarItem(
    tenantId: string,
    fundId: string,
    dto: AddComplianceCalendarItemDto,
  ) {
    const created = await this.calendarModel.create({
      tenantId: new Types.ObjectId(tenantId),
      fundId: new Types.ObjectId(fundId),
      name: dto.name,
      frequency: dto.frequency,
      daysAfterPeriodEnd: dto.daysAfterPeriodEnd ?? 0,
    });
    return created.toObject();
  }

  async markComplete(
    tenantId: string,
    calendarItemId: string,
    dto: MarkComplianceCompleteDto,
  ) {
    const item = await this.calendarModel.findOne({
      _id: calendarItemId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!item)
      throw new NotFoundException('Compliance calendar item not found');
    item.lastCompletedAt = new Date();
    item.lastCompletedPeriod = dto.period;
    await item.save();
    return item.toObject();
  }

  // Real-time monitoring against the fund's own real LPA
  // restrictions — a restriction with no cap set (0) is simply not
  // checked, rather than treated as a 0% limit.
  async getRestrictionMonitoring(tenantId: string, fundId: string) {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const [fund, holdings, commitments] = await Promise.all([
      this.fundModel.findOne({ _id: fId, tenantId: tId }).lean(),
      this.holdingModel
        .find({ tenantId: tId, fundId: fId, status: HoldingStatus.ACTIVE })
        .lean(),
      this.commitmentModel.find({ tenantId: tId, fundId: fId }).lean(),
    ]);
    if (!fund) throw new NotFoundException('Fund not found');

    const totalCommitment = commitments.reduce((s, c) => s + c.commitment, 0);

    const singleInvestment =
      fund.maxSingleInvestmentPct > 0
        ? holdings.map((h) => {
            const pct =
              totalCommitment > 0 ? (h.costBasis / totalCommitment) * 100 : 0;
            return {
              companyName: h.companyName,
              amount: h.costBasis,
              capAmount: totalCommitment * (fund.maxSingleInvestmentPct / 100),
              pct,
              withinLimit: pct <= fund.maxSingleInvestmentPct,
            };
          })
        : [];

    const bySector = new Map<string, number>();
    for (const h of holdings) {
      bySector.set(h.sector, (bySector.get(h.sector) ?? 0) + h.costBasis);
    }
    const sectorConcentration =
      fund.maxSectorConcentrationPct > 0
        ? Array.from(bySector.entries()).map(([sector, amount]) => {
            const pct =
              totalCommitment > 0 ? (amount / totalCommitment) * 100 : 0;
            return {
              sector,
              amount,
              pct,
              withinLimit: pct <= fund.maxSectorConcentrationPct,
            };
          })
        : [];

    const byCountry = new Map<string, number>();
    for (const h of holdings) {
      byCountry.set(h.country, (byCountry.get(h.country) ?? 0) + h.costBasis);
    }
    const countryConcentration =
      fund.maxCountryConcentrationPct > 0
        ? Array.from(byCountry.entries()).map(([country, amount]) => {
            const pct =
              totalCommitment > 0 ? (amount / totalCommitment) * 100 : 0;
            return {
              country,
              amount,
              pct,
              withinLimit: pct <= fund.maxCountryConcentrationPct,
            };
          })
        : [];

    const excludedSectorViolations = fund.excludedSectors.length
      ? holdings.filter((h) => fund.excludedSectors.includes(h.sector))
      : [];
    const outOfGeographyHoldings = fund.allowedGeography.length
      ? holdings.filter((h) => !fund.allowedGeography.includes(h.country))
      : [];

    return {
      singleInvestment,
      sectorConcentration,
      countryConcentration,
      excludedSectorViolations,
      outOfGeographyHoldings,
      investmentPeriodSuspended: fund.investmentPeriodSuspended,
      amlNote:
        "AML status per LP isn't shown here — it lives in the platform's own AML/KYC module, not yet cross-referenced from Fund.",
    };
  }
}

// ── FX rates — real, tenant-entered rate snapshots. No live rate
// feed is connected here, so nothing is auto-fetched; every rate is
// a real figure the tenant recorded, with its own source and date.

@Injectable()
export class FxRateService {
  constructor(
    @InjectModel(FxRate.name)
    private readonly model: Model<FxRateDocument>,
    @InjectModel(Fund.name)
    private readonly fundModel: Model<FundDocument>,
    @InjectModel(PortfolioHolding.name)
    private readonly holdingModel: Model<PortfolioHoldingDocument>,
  ) {}

  async getAll(tenantId: string, fundId: string) {
    return this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        fundId: new Types.ObjectId(fundId),
      })
      .sort({ asOfDate: -1 })
      .lean();
  }

  async recordRate(tenantId: string, fundId: string, dto: RecordFxRateDto) {
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      fundId: new Types.ObjectId(fundId),
      fromCurrency: dto.fromCurrency,
      toCurrency: dto.toCurrency,
      rate: dto.rate,
      asOfDate: new Date(dto.asOfDate),
      source: dto.source ?? '',
    });
    return created.toObject();
  }

  private async getRateAsOf(
    tenantId: string,
    fundId: string,
    fromCcy: string,
    toCcy: string,
    asOfDate: Date,
  ): Promise<number | null> {
    if (fromCcy === toCcy) return 1;
    const rate = await this.model
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        fundId: new Types.ObjectId(fundId),
        fromCurrency: fromCcy,
        toCurrency: toCcy,
        asOfDate: { $lte: asOfDate },
      })
      .sort({ asOfDate: -1 })
      .lean();
    return rate?.rate ?? null;
  }

  // Real FX exposure — isolates currency movement from operating
  // performance by holding the local-currency amount fixed and
  // comparing its translation at entry-rate vs today's rate. This
  // is a real, defensible simplification (it uses cost basis, not
  // fair value, to isolate pure FX cleanly) — not a full FX P&L.
  async getFxExposure(tenantId: string, fundId: string) {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const [fund, holdings] = await Promise.all([
      this.fundModel.findOne({ _id: fId, tenantId: tId }).lean(),
      this.holdingModel
        .find({ tenantId: tId, fundId: fId, status: HoldingStatus.ACTIVE })
        .lean(),
    ]);
    if (!fund) throw new NotFoundException('Fund not found');

    const exposed = holdings.filter(
      (h) => h.currency && h.currency !== fund.currency,
    );
    const rows: any[] = [];
    for (const h of exposed) {
      const entryRate = await this.getRateAsOf(
        tenantId,
        fundId,
        h.currency,
        fund.currency,
        h.entryDate,
      );
      const currentRate = await this.getRateAsOf(
        tenantId,
        fundId,
        h.currency,
        fund.currency,
        new Date(),
      );
      if (entryRate === null || currentRate === null) {
        rows.push({
          companyName: h.companyName,
          currency: h.currency,
          note: 'Missing a recorded FX rate for entry or current date — cannot compute exposure for this holding.',
        });
        continue;
      }
      const localCostBasis = entryRate > 0 ? h.costBasis / entryRate : 0;
      const valueAtCurrentRate =
        Math.round(localCostBasis * currentRate * 100) / 100;
      const fxGainLoss =
        Math.round((valueAtCurrentRate - h.costBasis) * 100) / 100;
      rows.push({
        companyName: h.companyName,
        currency: h.currency,
        entryRate,
        currentRate,
        costBasisFundCcy: h.costBasis,
        fxGainLoss,
      });
    }
    return {
      fundCurrency: fund.currency,
      rows,
      totalFxGainLoss:
        Math.round(rows.reduce((s, r) => s + (r.fxGainLoss ?? 0), 0) * 100) /
        100,
      currencyCount: new Set(exposed.map((h) => h.currency)).size,
    };
  }
}

// ── Scenarios — a real, read-only what-if calculator. Runs
// hypothetical exit values through the exact same real waterfall
// tier logic a real distribution uses (via DistributionService's
// public waterfallFill and computePreferredReturnTarget), against
// the fund's real cumulative state. Nothing here is persisted. ────

@Injectable()
export class ScenarioService {
  constructor(
    @InjectModel(Fund.name)
    private readonly fundModel: Model<FundDocument>,
    @InjectModel(PortfolioHolding.name)
    private readonly holdingModel: Model<PortfolioHoldingDocument>,
    @InjectModel(HoldingValuation.name)
    private readonly valuationModel: Model<HoldingValuationDocument>,
    @InjectModel(CapitalCall.name)
    private readonly callModel: Model<CapitalCallDocument>,
    @InjectModel(Distribution.name)
    private readonly distributionModel: Model<DistributionDocument>,
    private readonly distributionService: DistributionService,
    private readonly bankAccountService: BankAccountService,
  ) {}

  async runScenario(tenantId: string, fundId: string, dto: RunScenarioDto) {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const fund = await this.fundModel
      .findOne({ _id: fId, tenantId: tId })
      .lean();
    if (!fund) throw new NotFoundException('Fund not found');

    const [holdings, calls, priorDistributions] = await Promise.all([
      this.holdingModel
        .find({ tenantId: tId, fundId: fId, status: HoldingStatus.ACTIVE })
        .lean(),
      this.callModel.find({ tenantId: tId, fundId: fId }).lean(),
      this.distributionModel.find({ tenantId: tId, fundId: fId }).lean(),
    ]);

    const overrideMap = new Map(
      (dto.holdingExitValues ?? []).map((h) => [h.holdingId, h.exitValue]),
    );

    // For holdings without a scenario override, fall back to their
    // real latest approved fair value.
    let hypotheticalTotal = 0;
    const perHolding: {
      holdingId: string;
      companyName: string;
      value: number;
      overridden: boolean;
    }[] = [];
    for (const h of holdings) {
      let value = overrideMap.get(String(h._id));
      const overridden = value !== undefined;
      if (value === undefined) {
        const latest = await this.valuationModel
          .findOne({
            tenantId: tId,
            fundId: fId,
            holdingId: h._id,
            status: HoldingValuationStatus.APPROVED,
          })
          .sort({ period: -1 })
          .lean();
        value = latest?.approvedValue ?? h.costBasis;
      }
      hypotheticalTotal += value;
      perHolding.push({
        holdingId: String(h._id),
        companyName: h.companyName,
        value,
        overridden,
      });
    }

    const cashHeld = fund.bankAccountId
      ? await this.bankAccountService.computeBalance(
          tenantId,
          String(fund.bankAccountId),
        )
      : 0;
    hypotheticalTotal += cashHeld;

    const totalCalled = calls.reduce(
      (s, c) => s + c.allocations.reduce((s2, a) => s2 + a.fundedAmount, 0),
      0,
    );
    const tier2TargetNow =
      await this.distributionService.computePreferredReturnTarget(
        tenantId,
        fundId,
        fund,
        new Date(),
      );
    const tier3Target =
      tier2TargetNow > 0
        ? (tier2TargetNow * (fund.carryPct / 100)) / (1 - fund.carryPct / 100)
        : 0;

    const tier1PaidSoFar = priorDistributions.reduce(
      (s, d) => s + d.tier1Amount,
      0,
    );
    const tier2PaidSoFar = priorDistributions.reduce(
      (s, d) => s + d.tier2Amount,
      0,
    );
    const tier3PaidSoFar = priorDistributions.reduce(
      (s, d) => s + d.tier3Amount,
      0,
    );

    const result = this.distributionService.waterfallFill(
      hypotheticalTotal,
      totalCalled - tier1PaidSoFar,
      tier2TargetNow - tier2PaidSoFar,
      tier3Target - tier3PaidSoFar,
      fund.carryPct,
    );

    const totalToLps =
      Math.round((result.tier1 + result.tier2 + result.tier4Lp) * 100) / 100;
    const totalToGpGross =
      Math.round((result.tier3 + result.tier4Gp) * 100) / 100;
    const hurdleCleared =
      tier2PaidSoFar + result.tier2 >= tier2TargetNow - 0.01;

    return {
      perHolding,
      cashHeld,
      hypotheticalTotal,
      tier1Amount: result.tier1,
      tier2Amount: result.tier2,
      tier3Amount: result.tier3,
      tier4LpAmount: result.tier4Lp,
      tier4GpAmount: result.tier4Gp,
      totalToLps,
      totalToGpGross,
      hurdleCleared,
      tier2Target: tier2TargetNow,
      tier3Target,
      note: 'Read-only — models a hypothetical distribution against the real cumulative waterfall state; nothing here is persisted.',
    };
  }
}

// ── LP reporting — real, per-LP assembled views built entirely from
// data that already exists elsewhere in this file. Nothing new is
// calculated here beyond simple period-filtering and formatting.
// ESG/impact reporting and full annual financial statements are
// deliberately not built: ESG metrics aren't tracked anywhere in
// this system, and a real annual FS needs the fund run through a
// full chart of accounts / GL / trial balance the way the tenant's
// own accounting does — a materially different scope from what
// exists here, not something worth faking a version of. ──────────

@Injectable()
export class LpReportingService {
  constructor(
    @InjectModel(CapitalCommitment.name)
    private readonly commitmentModel: Model<CapitalCommitmentDocument>,
    @InjectModel(CapitalAccountEntry.name)
    private readonly entryModel: Model<CapitalAccountEntryDocument>,
    @InjectModel(CapitalCall.name)
    private readonly callModel: Model<CapitalCallDocument>,
    @InjectModel(Distribution.name)
    private readonly distributionModel: Model<DistributionDocument>,
    @InjectModel(ManagementFeeCharge.name)
    private readonly feeChargeModel: Model<ManagementFeeChargeDocument>,
    @InjectModel(FundExpense.name)
    private readonly expenseModel: Model<FundExpenseDocument>,
  ) {}

  // Real quarterly LP statement — opening/closing capital account
  // balance built from real CapitalAccountEntry records filtered by
  // date, plus this LP's own real DPI/RVPI/TVPI (not the fund
  // aggregate — their own called and distributed amounts).
  async getQuarterlyStatement(
    tenantId: string,
    fundId: string,
    commitmentId: string,
    periodStart: string,
    periodEnd: string,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const cId = new Types.ObjectId(commitmentId);
    const from = new Date(periodStart);
    const to = new Date(periodEnd);

    const commitment = await this.commitmentModel
      .findOne({ _id: cId, tenantId: tId, fundId: fId })
      .lean();
    if (!commitment) throw new NotFoundException('Commitment not found');

    const [entriesBefore, entriesInPeriod, calls] = await Promise.all([
      this.entryModel
        .find({
          tenantId: tId,
          fundId: fId,
          commitmentId: cId,
          date: { $lt: from },
        })
        .lean(),
      this.entryModel
        .find({
          tenantId: tId,
          fundId: fId,
          commitmentId: cId,
          date: { $gte: from, $lte: to },
        })
        .lean(),
      this.callModel.find({ tenantId: tId, fundId: fId }).lean(),
    ]);

    const openingBalance = entriesBefore.reduce((s, e) => s + e.amount, 0);
    const sumType = (entries: any[], type: CapitalAccountEntryType) =>
      entries.filter((e) => e.type === type).reduce((s, e) => s + e.amount, 0);
    const contributionsInPeriod = sumType(
      entriesInPeriod,
      CapitalAccountEntryType.CONTRIBUTION,
    );
    const incomeAlloc = sumType(
      entriesInPeriod,
      CapitalAccountEntryType.INCOME,
    );
    const expenseAlloc = sumType(
      entriesInPeriod,
      CapitalAccountEntryType.EXPENSE,
    );
    const gainLoss = sumType(
      entriesInPeriod,
      CapitalAccountEntryType.GAIN_LOSS,
    );
    const distributionsInPeriod = -sumType(
      entriesInPeriod,
      CapitalAccountEntryType.DISTRIBUTION,
    );
    const closingBalance =
      openingBalance + entriesInPeriod.reduce((s, e) => s + e.amount, 0);

    let theirCalled = 0;
    for (const call of calls) {
      const alloc = (call.allocations as any[]).find(
        (a) => String(a.commitmentId) === commitmentId,
      );
      if (alloc) theirCalled += alloc.fundedAmount;
    }
    const allEntries = await this.entryModel
      .find({ tenantId: tId, fundId: fId, commitmentId: cId })
      .lean();
    const theirDistributed = -sumType(
      allEntries,
      CapitalAccountEntryType.DISTRIBUTION,
    );
    const theirDpi = theirCalled > 0 ? theirDistributed / theirCalled : 0;
    const theirRvpi = theirCalled > 0 ? closingBalance / theirCalled : 0;
    const theirTvpi = theirDpi + theirRvpi;

    return {
      commitmentId,
      lpName: commitment.lpName,
      periodStart,
      periodEnd,
      commitment: commitment.commitment,
      calledToDate: theirCalled,
      uncalled: commitment.commitment - theirCalled,
      openingBalance,
      contributionsInPeriod,
      incomeAlloc,
      expenseAlloc,
      gainLoss,
      distributionsInPeriod,
      closingBalance,
      dpi: theirDpi,
      rvpi: theirRvpi,
      tvpi: theirTvpi,
    };
  }

  // Capital call / distribution notice — a real, per-LP formatted
  // view of an existing event, not new data.
  async getCallNotice(tenantId: string, callId: string, commitmentId: string) {
    const call = await this.callModel
      .findOne({ _id: callId, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!call) throw new NotFoundException('Capital call not found');
    const allocation = (call.allocations as any[]).find(
      (a) => String(a.commitmentId) === commitmentId,
    );
    if (!allocation)
      throw new NotFoundException('No allocation for this LP on this call');
    return {
      ref: call.ref,
      purpose: call.purpose,
      issuedOn: call.issuedOn,
      dueOn: call.dueOn,
      allocation,
    };
  }

  async getDistributionNotice(
    tenantId: string,
    distributionId: string,
    commitmentId: string,
  ) {
    const dist = await this.distributionModel
      .findOne({ _id: distributionId, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!dist) throw new NotFoundException('Distribution not found');
    const allocation = (dist.allocations as any[]).find(
      (a) => String(a.commitmentId) === commitmentId,
    );
    if (!allocation) {
      throw new NotFoundException(
        'No allocation for this LP on this distribution — likely the GP carry recipient, not an LP',
      );
    }
    return {
      ref: dist.ref,
      date: dist.date,
      source: dist.source,
      sourceDescription: dist.sourceDescription,
      allocation,
    };
  }

  // Fee & expense disclosure — this LP's real share of a real fee
  // charge and real fund expenses for a period.
  async getFeeExpenseDisclosure(
    tenantId: string,
    fundId: string,
    commitmentId: string,
    period: string,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const commitment = await this.commitmentModel
      .findOne({ _id: commitmentId, tenantId: tId, fundId: fId })
      .lean();
    if (!commitment) throw new NotFoundException('Commitment not found');

    const feeCharge = await this.feeChargeModel
      .findOne({ tenantId: tId, fundId: fId, period })
      .lean();
    const theirFeeAllocation = feeCharge
      ? ((feeCharge.allocations as any[]).find(
          (a) => String(a.commitmentId) === commitmentId,
        ) ?? null)
      : null;

    const allCommitments = await this.commitmentModel
      .find({ tenantId: tId, fundId: fId })
      .lean();
    const totalCommitment = allCommitments.reduce(
      (s, c) => s + c.commitment,
      0,
    );
    const share =
      totalCommitment > 0 ? commitment.commitment / totalCommitment : 0;

    const expenses = await this.expenseModel
      .find({ tenantId: tId, fundId: fId, borneBy: ExpenseBorneBy.FUND })
      .lean();
    const theirExpenseShare = expenses.map((e) => ({
      category: e.category,
      totalAmount: e.amount,
      theirShare: Math.round(e.amount * share * 100) / 100,
    }));

    return {
      lpName: commitment.lpName,
      period,
      managementFee: theirFeeAllocation,
      expenses: theirExpenseShare,
      totalExpenseShare:
        Math.round(
          theirExpenseShare.reduce((s, e) => s + e.theirShare, 0) * 100,
        ) / 100,
    };
  }
}
