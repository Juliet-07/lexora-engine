import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Budget, BudgetDocument } from '../schemas';
import { AccountType } from '../schemas';
import { UpsertBudgetDto } from '../dtos';
import { FinancialStatementsService } from './acounting.service';

@Injectable()
export class BudgetService {
  constructor(
    @InjectModel(Budget.name)
    private readonly model: Model<BudgetDocument>,
    private readonly financialStatementsService: FinancialStatementsService,
  ) {}

  async getBudget(tenantId: string, period: string) {
    const b = await this.model
      .findOne({ tenantId: new Types.ObjectId(tenantId), period })
      .lean();
    return b ?? { tenantId, period, lines: [] };
  }

  async upsertBudget(tenantId: string, period: string, dto: UpsertBudgetDto) {
    const tId = new Types.ObjectId(tenantId);
    const updated = await this.model
      .findOneAndUpdate(
        { tenantId: tId, period },
        { $set: { tenantId: tId, period, lines: dto.lines } },
        { upsert: true, new: true },
      )
      .lean();
    return updated;
  }

  // A real, explicit action the tenant takes — not automatic
  // rollover. Copies a prior period's real lines as a starting
  // point for the new period, which the tenant can then edit.
  async copyFromPeriod(tenantId: string, fromPeriod: string, toPeriod: string) {
    const source = await this.getBudget(tenantId, fromPeriod);
    if (!source.lines.length) {
      throw new NotFoundException(
        `No budget found for ${fromPeriod} to copy from`,
      );
    }
    return this.upsertBudget(tenantId, toPeriod, { lines: source.lines });
  }

  // Real variance — actuals come from the exact same real GL
  // aggregation Financials' own P&L reads, not a separately
  // maintained figure that could quietly disagree with it.
  async getBudgetVsActual(tenantId: string, period: string) {
    const budget = await this.getBudget(tenantId, period);
    const [year, month] = period.split('-').map(Number);
    const from = `${period}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${period}-${String(lastDay).padStart(2, '0')}`;

    const { accounts, balanceMap } =
      await this.financialStatementsService.getAccountBalances(
        tenantId,
        from,
        to,
      );

    const rows = budget.lines.map((line) => {
      const account = accounts.find((a) => a.code === line.accountCode);
      const rawBalance = balanceMap.get(line.accountCode) ?? 0;
      // Revenue is credit-normal, Expense is debit-normal — same
      // sign convention the real P&L already uses for these accounts.
      const actual =
        account?.type === AccountType.REVENUE
          ? Math.max(0, -rawBalance)
          : Math.max(0, rawBalance);
      const variance = actual - line.budgetedAmount;
      const variancePct =
        line.budgetedAmount !== 0
          ? (variance / Math.abs(line.budgetedAmount)) * 100
          : 0;
      return {
        accountCode: line.accountCode,
        accountName: line.accountName,
        budgetedAmount: line.budgetedAmount,
        actual,
        variance,
        variancePct,
      };
    });

    return {
      period,
      from,
      to,
      rows,
      totalBudgeted: rows.reduce((s, r) => s + r.budgetedAmount, 0),
      totalActual: rows.reduce((s, r) => s + r.actual, 0),
      hasBudget: budget.lines.length > 0,
    };
  }
}
