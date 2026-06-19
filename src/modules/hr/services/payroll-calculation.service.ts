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
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
