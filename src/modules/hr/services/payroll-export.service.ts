import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
import {
  Employee,
  EmployeeDocument,
  Payslip,
  PayslipDocument,
  PayrollRun,
  PayrollRunDocument,
  PayrollRunStatus,
} from '../schemas';

@Injectable()
export class PayrollExportService {
  constructor(
    @InjectModel(Payslip.name)
    private readonly payslipModel: Model<PayslipDocument>,
    @InjectModel(PayrollRun.name)
    private readonly runModel: Model<PayrollRunDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  // Bank details live on the employee record, not the payslip, so both
  // exports look them up by employee id.
  private async bankDetailsFor(payslips: PayslipDocument[]) {
    const ids = payslips.map((p) => p.employeeId);
    const employees = await this.employeeModel
      .find({ _id: { $in: ids } })
      .select('bankName bankAccountNumber')
      .lean();
    return new Map(
      employees.map((e: any) => [
        String(e._id),
        { bank: e.bankName ?? '', account: e.bankAccountNumber ?? '' },
      ]),
    );
  }

  // The file Finance uploads to the bank to pay a processed run: one line
  // per employee with their net pay. Anyone without bank details on file
  // is still listed, marked MISSING, so nobody silently drops out of the
  // payment run.
  async exportRunBankFile(tenantId: string, runId: string) {
    const run = await this.runModel.findOne({
      _id: runId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status === PayrollRunStatus.DRAFT) {
      throw new BadRequestException(
        'Process the payroll run before generating the bank file.',
      );
    }
    const payslips = await this.payslipModel
      .find({ payrollRunId: run._id })
      .sort({ employeeName: 1 });
    const bank = await this.bankDetailsFor(payslips);

    // Spreadsheet apps run text that starts with = + - @ as a formula.
    const cell = (v: unknown) => {
      let t = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
      return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const header = [
      'Employee Number',
      'Employee Name',
      'Bank Name',
      'Account Number',
      'Currency',
      'Net Pay',
      'Payment Reference',
    ];
    let missing = 0;
    const lines = payslips.map((p) => {
      const b = bank.get(String(p.employeeId));
      const hasBank = !!(b?.bank && b?.account);
      if (!hasBank) missing += 1;
      return [
        p.employeeNumber ?? '',
        p.employeeName,
        b?.bank || 'MISSING',
        b?.account || 'MISSING',
        p.payCurrency,
        p.netSalary.toFixed(2),
        `Salary ${run.periodLabel}`,
      ]
        .map(cell)
        .join(',');
    });
    const csv = '\uFEFF' + [header.join(','), ...lines].join('\r\n') + '\r\n';
    const safePeriod = String(run.periodLabel).replace(/[^A-Za-z0-9]+/g, '-');
    return {
      csv,
      filename: `payroll-bank-file-${safePeriod}.csv`,
      count: payslips.length,
      missing,
    };
  }

  async exportRunToExcel(tenantId: string, runId: string): Promise<Buffer> {
    const run = await this.runModel.findOne({
      _id: runId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!run) throw new Error('Payroll run not found');

    const payslips = await this.payslipModel
      .find({ payrollRunId: run._id })
      .sort({ employeeName: 1 });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(run.periodLabel);
    const bank = await this.bankDetailsFor(payslips);

    // Collect every distinct deduction key across all payslips so
    // columns stay consistent even if different employees have
    // different deduction sets (e.g. one has a loan, another doesn't).
    const deductionKeys = new Set<string>();
    const loanLabels = new Set<string>();
    for (const p of payslips) {
      p.deductions.forEach((d) => deductionKeys.add(d.label));
      p.loanDeductions.forEach((l) => loanLabels.add(l.label));
    }
    const deductionCols = Array.from(deductionKeys);
    const loanCols = Array.from(loanLabels);

    sheet.columns = [
      { header: 'Employee Number', key: 'empNo', width: 16 },
      { header: 'Employee Name', key: 'name', width: 24 },
      { header: 'Job Title', key: 'title', width: 22 },
      { header: 'Basic Salary', key: 'basic', width: 16 },
      { header: 'Gross Salary', key: 'gross', width: 16 },
      ...deductionCols.map((label) => ({
        header: label,
        key: label,
        width: 18,
      })),
      ...loanCols.map((label) => ({
        header: label,
        key: `loan_${label}`,
        width: 18,
      })),
      { header: 'Total Deductions', key: 'totalDed', width: 18 },
      { header: 'Net Pay', key: 'net', width: 16 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Bank Name', key: 'bankName', width: 20 },
      { header: 'Account Number', key: 'bankAccount', width: 20 },
    ];

    sheet.getRow(1).font = { bold: true };

    for (const p of payslips) {
      const row: Record<string, any> = {
        empNo: p.employeeNumber ?? '',
        name: p.employeeName,
        title: p.jobTitle ?? '',
        basic: p.basicSalary,
        gross: p.grossSalary,
        totalDed: p.totalEmployeeDeductions,
        net: p.netSalary,
        currency: p.payCurrency,
        bankName: bank.get(String(p.employeeId))?.bank ?? '',
        bankAccount: bank.get(String(p.employeeId))?.account ?? '',
      };
      for (const label of deductionCols) {
        const d = p.deductions.find((x) => x.label === label);
        row[label] = d ? d.employeeAmount : 0;
      }
      for (const label of loanCols) {
        const l = p.loanDeductions.find((x) => x.label === label);
        row[`loan_${label}`] = l ? l.amountDeducted : 0;
      }
      sheet.addRow(row);
    }

    // Totals row
    const totalsRow: Record<string, any> = {
      name: 'TOTAL',
      basic: payslips.reduce((s, p) => s + p.basicSalary, 0),
      gross: payslips.reduce((s, p) => s + p.grossSalary, 0),
      totalDed: payslips.reduce((s, p) => s + p.totalEmployeeDeductions, 0),
      net: payslips.reduce((s, p) => s + p.netSalary, 0),
    };
    for (const label of deductionCols) {
      totalsRow[label] = payslips.reduce(
        (s, p) =>
          s +
          (p.deductions.find((x) => x.label === label)?.employeeAmount ?? 0),
        0,
      );
    }
    const totalsRowRef = sheet.addRow(totalsRow);
    totalsRowRef.font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
