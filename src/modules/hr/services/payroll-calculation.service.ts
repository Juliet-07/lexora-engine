import { Injectable, BadRequestException } from '@nestjs/common';
import {
  PayrollPolicy,
  PayrollDeductionRule,
  DeductionKind,
  DeductionCalculationBase,
} from '../schemas';

export interface AllowanceInput {
  key: string;
  label: string;
  amount: number;
  isTransportAllowance?: boolean;
}

export interface LoanDeductionInput {
  loanId: string;
  label: string;
  amount: number;
}

export interface PayrollCalculationInput {
  basicSalary: number;
  allowances: AllowanceInput[];
  policy: PayrollPolicy;
  loanDeductions?: LoanDeductionInput[];
}

export interface DeductionResultLine {
  key: string;
  label: string;
  employeeAmount: number;
  employerAmount: number;
  visibleToEmployee: boolean;
}

export interface PayrollCalculationResult {
  basicSalary: number;
  allowances: { key: string; label: string; amount: number }[];
  grossSalary: number;
  deductions: DeductionResultLine[];
  loanDeductions: { loanId: string; label: string; amountDeducted: number }[];
  totalEmployeeDeductions: number;
  totalEmployerContributions: number;
  netSalary: number;
}

@Injectable()
export class PayrollCalculationService {
  calculate(input: PayrollCalculationInput): PayrollCalculationResult {
    const { basicSalary, allowances, policy } = input;

    if (basicSalary < 0) {
      throw new BadRequestException('Basic salary cannot be negative.');
    }

    const allowanceTotal = allowances.reduce((sum, a) => sum + a.amount, 0);
    const grossSalary = basicSalary + allowanceTotal;

    const transportTotal = allowances
      .filter((a) => a.isTransportAllowance)
      .reduce((sum, a) => sum + a.amount, 0);
    const grossMinusTransport = grossSalary - transportTotal;

    let runningNet = grossSalary;
    let pensionEmployeeAmount = 0;

    const activeDeductions = (policy.deductions ?? [])
      .filter((d) => d.isActive)
      .sort(
        (a, b) => this.deductionOrderWeight(a) - this.deductionOrderWeight(b),
      );

    const resultLines: DeductionResultLine[] = [];

    for (const rule of activeDeductions) {
      const base = this.resolveBase(
        rule.calculationBase,
        grossSalary,
        grossMinusTransport,
        runningNet,
        grossMinusTransport - pensionEmployeeAmount,
      );

      const { employeeAmount, employerAmount } = this.computeDeductionAmount(
        rule,
        base,
      );

      resultLines.push({
        key: rule.key,
        label: rule.label,
        employeeAmount: round2(employeeAmount),
        employerAmount: round2(employerAmount),
        visibleToEmployee: rule.visibleToEmployee,
      });

      runningNet -= employeeAmount;
      if (rule.key === 'pension') pensionEmployeeAmount = employeeAmount;
    }

    const statutoryEmployeeTotal = resultLines.reduce(
      (s, l) => s + l.employeeAmount,
      0,
    );
    const employerContributionTotal = resultLines.reduce(
      (s, l) => s + l.employerAmount,
      0,
    );

    const loanLines = (input.loanDeductions ?? []).map((l) => ({
      loanId: l.loanId,
      label: l.label,
      amountDeducted: round2(l.amount),
    }));
    const loanTotal = loanLines.reduce((s, l) => s + l.amountDeducted, 0);

    const totalEmployeeDeductions = round2(statutoryEmployeeTotal + loanTotal);
    const netSalary = round2(grossSalary - totalEmployeeDeductions);

    if (netSalary < 0) {
      throw new BadRequestException(
        'Calculated net salary is negative — deductions and loan installments exceed gross salary. Review loan installment amounts.',
      );
    }

    return {
      basicSalary: round2(basicSalary),
      allowances: allowances.map((a) => ({
        key: a.key,
        label: a.label,
        amount: round2(a.amount),
      })),
      grossSalary: round2(grossSalary),
      deductions: resultLines,
      loanDeductions: loanLines,
      totalEmployeeDeductions,
      totalEmployerContributions: round2(employerContributionTotal),
      netSalary,
    };
  }

  solveGrossFromNet(targetNet: number, policy: PayrollPolicy): number {
    const activeDeductions = (policy.deductions ?? []).filter(
      (d) => d.isActive,
    );

    const unsupported = activeDeductions.find(
      (d) => d.calculationBase === DeductionCalculationBase.TAXABLE_INCOME,
    );
    if (unsupported) {
      throw new BadRequestException(
        `Cannot calculate gross from a net target while "${unsupported.label}" depends on taxable income ` +
          `(a value derived from another deduction). Switch this deduction's calculation base to Gross, ` +
          `or enter the basic salary directly instead of a net target.`,
      );
    }

    // Separate deductions into two tiers, same dependency order the
    // forward calculate() method already uses: GROSS/BASIC-based
    // deductions resolve first (call this "tier 1"), NET-based
    // deductions (CBHI-style) resolve last (call this "tier 2"),
    // since tier 2 needs tier 1's result as its own base.
    const tier1 = activeDeductions.filter(
      (d) =>
        d.calculationBase === DeductionCalculationBase.GROSS ||
        d.calculationBase === DeductionCalculationBase.BASIC,
    );
    const tier2 = activeDeductions.filter(
      (d) => d.calculationBase === DeductionCalculationBase.NET,
    );

    // For a candidate gross G, tier-1 deductions are each linear in G:
    // employeeAmount = rate * G (percentage) or a flat constant, or
    // (for progressive brackets) piecewise-linear in G. We find which
    // PAYE-style bracket the solution falls in by solving within each
    // bracket and checking the candidate is actually in range — same
    // approach as the verified Rwanda PAYE inversion.

    // Build a single combined "tier 1 total deduction as function of
    // gross" by summing all percentage/flat rules directly, and
    // handling at most one progressive-bracket rule (typical case —
    // PAYE). Multiple progressive-bracket rules in one policy would
    // need a more general piecewise solver; not needed for any
    // currently-configured preset.

    const flatPercentRules = tier1.filter(
      (d) => d.kind !== DeductionKind.PROGRESSIVE_BRACKETS,
    );
    const bracketRule = tier1.find(
      (d) => d.kind === DeductionKind.PROGRESSIVE_BRACKETS,
    );

    const flatRateSum = flatPercentRules.reduce(
      (sum, d) =>
        sum + (d.kind === DeductionKind.PERCENTAGE ? d.employeeRate : 0),
      0,
    );
    const flatAmountSum = flatPercentRules.reduce(
      (sum, d) =>
        sum + (d.kind === DeductionKind.FLAT ? d.employeeFlatAmount : 0),
      0,
    );

    // tier2 (CBHI-style) compounds as a single combined rate against
    // "net before tier 2", since CBHI's amount = netBeforeTier2 * rate,
    // and final net = netBeforeTier2 - sum(tier2 amounts).
    const tier2RateSum = tier2.reduce((sum, d) => sum + d.employeeRate, 0);
    // finalNet = netBeforeTier2 * (1 - tier2RateSum)
    // => netBeforeTier2 = finalNet / (1 - tier2RateSum)
    if (tier2RateSum >= 1) {
      throw new BadRequestException(
        'Configured deduction rates exceed 100% — cannot solve for a target net.',
      );
    }
    const netBeforeTier2Target = targetNet / (1 - tier2RateSum);

    // Now solve: netBeforeTier2Target = G - (flatRateSum * G) - flatAmountSum - PAYE(G)
    // If there's no bracket rule, this is straightforward linear algebra:
    if (!bracketRule) {
      // netBeforeTier2Target = G*(1 - flatRateSum) - flatAmountSum
      const gross = (netBeforeTier2Target + flatAmountSum) / (1 - flatRateSum);
      return round2(gross);
    }

    // With a bracket rule: solve within each bracket and verify range,
    // same exact technique verified against the real Rwanda payslip.
    const sortedBrackets = [...bracketRule.brackets].sort(
      (a, b) => a.minAmount - b.minAmount,
    );

    for (const bracket of sortedBrackets) {
      // Within this bracket, PAYE(G) = bracket.rate * G - bracket.rate * bracket.minAmount + cumulativeFromLowerBrackets
      // Easier: compute the bracket's effective (a, b) such that PAYE(G) = a*G + b for G in this bracket's range.
      const { a, b } = this.bracketLinearCoefficients(bracket, sortedBrackets);

      // netBeforeTier2Target = G*(1 - flatRateSum - a) - flatAmountSum - b
      const coef = 1 - flatRateSum - a;
      if (coef === 0) continue; // degenerate bracket, skip
      const candidateGross = (netBeforeTier2Target + flatAmountSum + b) / coef;

      const upper = bracket.maxAmount ?? Infinity;
      if (candidateGross >= bracket.minAmount && candidateGross <= upper) {
        return round2(candidateGross);
      }
    }

    throw new BadRequestException(
      'Could not solve for a gross salary matching this net target — check the target amount and policy configuration.',
    );
  }

  private deductionOrderWeight(rule: PayrollDeductionRule): number {
    switch (rule.calculationBase) {
      case DeductionCalculationBase.GROSS:
      case DeductionCalculationBase.GROSS_MINUS_TRANSPORT:
      case DeductionCalculationBase.BASIC:
        return 0;
      case DeductionCalculationBase.TAXABLE_INCOME:
        return 1;
      case DeductionCalculationBase.NET:
        return 2;
      default:
        return 0;
    }
  }

  private resolveBase(
    base: DeductionCalculationBase,
    gross: number,
    grossMinusTransport: number,
    runningNet: number,
    taxableIncome: number,
  ): number {
    switch (base) {
      case DeductionCalculationBase.GROSS:
        return gross;
      case DeductionCalculationBase.GROSS_MINUS_TRANSPORT:
        return grossMinusTransport;
      case DeductionCalculationBase.NET:
        return runningNet;
      case DeductionCalculationBase.TAXABLE_INCOME:
        return taxableIncome;
      case DeductionCalculationBase.BASIC:
        return gross;
      default:
        return gross;
    }
  }

  private computeDeductionAmount(
    rule: PayrollDeductionRule,
    base: number,
  ): { employeeAmount: number; employerAmount: number } {
    if (rule.kind === DeductionKind.PERCENTAGE) {
      return {
        employeeAmount: base * rule.employeeRate,
        employerAmount: base * rule.employerRate,
      };
    }
    if (rule.kind === DeductionKind.FLAT) {
      return {
        employeeAmount: rule.employeeFlatAmount,
        employerAmount: rule.employerFlatAmount,
      };
    }
    if (rule.kind === DeductionKind.PROGRESSIVE_BRACKETS) {
      const employeeAmount = this.applyProgressiveBrackets(base, rule.brackets);
      return { employeeAmount, employerAmount: 0 };
    }
    return { employeeAmount: 0, employerAmount: 0 };
  }

  private applyProgressiveBrackets(
    amount: number,
    brackets: { minAmount: number; maxAmount: number | null; rate: number }[],
  ): number {
    let tax = 0;
    const sorted = [...brackets].sort((a, b) => a.minAmount - b.minAmount);

    for (const bracket of sorted) {
      if (amount <= bracket.minAmount) break;
      const upper = bracket.maxAmount ?? Infinity;
      const sliceTop = Math.min(amount, upper);
      const sliceAmount = sliceTop - bracket.minAmount;
      if (sliceAmount > 0) {
        tax += sliceAmount * bracket.rate;
      }
    }
    return tax;
  }

  private bracketLinearCoefficients(
    bracket: { minAmount: number; maxAmount: number | null; rate: number },
    allBracketsSorted: {
      minAmount: number;
      maxAmount: number | null;
      rate: number;
    }[],
  ): { a: number; b: number } {
    // Cumulative tax from all brackets strictly below this one:
    let cumulative = 0;
    for (const b of allBracketsSorted) {
      if (b.minAmount >= bracket.minAmount) break;
      const upper = b.maxAmount ?? bracket.minAmount;
      cumulative += (upper - b.minAmount) * b.rate;
    }
    // PAYE(G) = cumulative + (G - bracket.minAmount) * bracket.rate
    //         = bracket.rate * G + (cumulative - bracket.rate * bracket.minAmount)
    return {
      a: bracket.rate,
      b: cumulative - bracket.rate * bracket.minAmount,
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
