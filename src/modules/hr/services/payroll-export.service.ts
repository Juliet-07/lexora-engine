import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
import {
  Payslip,
  PayslipDocument,
  PayrollRun,
  PayrollRunDocument,
} from '../schemas';

@Injectable()
export class PayrollExportService {
  constructor(
    @InjectModel(Payslip.name)
    private readonly payslipModel: Model<PayslipDocument>,
    @InjectModel(PayrollRun.name)
    private readonly runModel: Model<PayrollRunDocument>,
  ) {}

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
