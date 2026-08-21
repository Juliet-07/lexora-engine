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
  BankAccount,
  BankAccountDocument,
  BankAccountType,
} from '../schemas';
import {
  CreateFundDto,
  CreateCapitalCommitmentDto,
  CreateCapitalCallDto,
  RecordCallFundingDto,
} from '../dtos';
import { GlPostingService, GL_ACCOUNTS } from './gl-posting.service';
import { GlSource } from '../schemas';

// ── Fund — the entity itself. Real setup fields only; no fee,
// carry, or NAV calculation lives here yet. ─────────────────────

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

  // Committed and called are real, computed live from actual
  // commitment and capital-call-funding records — never stored.
  // Distributed and NAV are deliberately absent: both depend on a
  // confirmed distribution waterfall methodology that hasn't been
  // agreed yet, so showing a number here would be inventing one.
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
}

// ── Capital commitments — one per LP per fund. ───────────────────

@Injectable()
export class CapitalCommitmentService {
  constructor(
    @InjectModel(CapitalCommitment.name)
    private readonly model: Model<CapitalCommitmentDocument>,
    @InjectModel(Fund.name)
    private readonly fundModel: Model<FundDocument>,
  ) {}

  async getAll(tenantId: string, fundId: string) {
    const commitments = await this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        fundId: new Types.ObjectId(fundId),
      })
      .sort({ createdAt: -1 })
      .lean();
    // Called/distributed/NAV per LP intentionally aren't attached
    // here — called requires cross-referencing real capital call
    // funding, distributed and NAV depend on the not-yet-built
    // waterfall. The capital account view in the frontend composes
    // called from CapitalCallService's own real data instead of
    // this service inventing a parallel figure.
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
    });
    return created.toObject();
  }
}

// ── Capital calls — a real, documented per-LP obligation, pro-rata
// to each LP's commitment, frozen at issuance the same way an
// invoice's lines are frozen rather than silently recalculated. ──

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
        // Pro-rata to each LP's real commitment share of the total
        // — frozen here, not recomputed if commitments change later.
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

  // Records an LP actually funding their allocation — the real
  // event capital-called and capital-funded genuinely differ on,
  // same reasoning an invoice being sent and being paid are two
  // different real events.
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

    // Real double-entry — LP capital arriving in the fund's real
    // bank account, matched by an equal increase in what the fund
    // owes that LP in called (paid-in) capital. Only posts if the
    // fund actually has a real Fund-type bank account linked —
    // without one there's no real cash movement to record yet.
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

    return call.toObject();
  }
}
