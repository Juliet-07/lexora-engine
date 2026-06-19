import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Employee,
  EmployeeDocument,
  PayrollRun,
  PayrollRunDocument,
  PayrollRunStatus,
  Payslip,
  PayslipDocument,
} from '../schemas';
import { PayrollPolicyService } from './payroll-policy.service';
import {
  PayrollCalculationService,
  AllowanceInput,
} from './payroll-calculation.service';
import { EmployeeLoanService } from './employee-loan.service';
import { ExchangeRateService } from './exchange-rate.service';
import { CreatePayrollRunDto } from '../dtos/payroll.dto';
import { PayslipTemplateService } from './payslip-template.service';
import { buildPayslipHtml } from 'src/common/utils/payslip-html.util';

@Injectable()
export class PayrollRunService {
  constructor(
    @InjectModel(PayrollRun.name)
    private readonly runModel: Model<PayrollRunDocument>,
    @InjectModel(Payslip.name)
    private readonly payslipModel: Model<PayslipDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly policyService: PayrollPolicyService,
    private readonly calcService: PayrollCalculationService,
    private readonly loanService: EmployeeLoanService,
    private readonly fxService: ExchangeRateService,
    private readonly templateService: PayslipTemplateService,
  ) {}

  async createRun(
    tenantId: string,
    dto: CreatePayrollRunDto,
  ): Promise<PayrollRunDocument> {
    const tId = new Types.ObjectId(tenantId);

    const employeeQuery: any = {
      tenantId: tId,
      employmentStatus: { $nin: ['terminated', 'resigned'] },
    };
    if (dto.employeeId) {
      employeeQuery._id = new Types.ObjectId(dto.employeeId);
    } else if (dto.locationId) {
      employeeQuery.locationId = new Types.ObjectId(dto.locationId);
    }

    const employees = await this.employeeModel.find(employeeQuery).lean();
    if (employees.length === 0) {
      throw new BadRequestException(
        dto.employeeId
          ? 'Employee not found or not eligible for payroll (check employment status)'
          : 'No active employees found for this scope.',
      );
    }

    if (dto.employeeId) {
      const existing = await this.payslipModel.findOne({
        tenantId: tId,
        employeeId: new Types.ObjectId(dto.employeeId),
        periodLabel: dto.periodLabel,
      });
      if (existing) {
        throw new ConflictException(
          `This employee already has a payslip for ${dto.periodLabel}. View the existing run instead of creating a new one.`,
        );
      }
    }

    const run = await this.runModel.create({
      tenantId: tId,
      locationId: dto.locationId ? new Types.ObjectId(dto.locationId) : null,
      periodLabel: dto.periodLabel,
      periodStart: new Date(dto.periodStart),
      periodEnd: new Date(dto.periodEnd),
      runCurrency: dto.runCurrency,
      status: PayrollRunStatus.DRAFT,
    });

    await this.generatePayslipsForRun(run, employees as any);
    return this.recalculateRunTotals(run._id.toString());
  }

  async getEmployeePeriodStatus(
    tenantId: string,
    employeeId: string,
    periodLabel: string,
  ): Promise<{
    status: 'not_started' | 'draft' | 'processed' | 'paid';
    payslip: PayslipDocument | null;
    runId: string | null;
  }> {
    const payslip = await this.payslipModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      employeeId: new Types.ObjectId(employeeId),
      periodLabel,
    });

    if (!payslip) {
      return { status: 'not_started', payslip: null, runId: null };
    }

    const run = await this.runModel
      .findById(payslip.payrollRunId)
      .select('status')
      .lean();
    const runStatus = (run as any)?.status ?? PayrollRunStatus.DRAFT;

    return {
      status: runStatus as any,
      payslip,
      runId: payslip.payrollRunId.toString(),
    };
  }

  async getAllEmployeesPeriodStatus(
    tenantId: string,
    periodLabel: string,
  ): Promise<
    Record<
      string,
      {
        status: string;
        payslipId: string;
        runId: string;
        netSalary: number;
        payCurrency: string;
      }
    >
  > {
    const tId = new Types.ObjectId(tenantId);
    const payslips = await this.payslipModel
      .find({ tenantId: tId, periodLabel })
      .lean();

    if (payslips.length === 0) return {};

    const runIds = [...new Set(payslips.map((p) => p.payrollRunId.toString()))];
    const runs = await this.runModel
      .find({ _id: { $in: runIds.map((id) => new Types.ObjectId(id)) } })
      .select('status')
      .lean();
    const runStatusMap = new Map(
      runs.map((r) => [(r._id as any).toString(), (r as any).status]),
    );

    const result: Record<string, any> = {};
    for (const p of payslips) {
      result[p.employeeId.toString()] = {
        status: runStatusMap.get(p.payrollRunId.toString()) ?? 'draft',
        payslipId: (p._id as any).toString(),
        runId: p.payrollRunId.toString(),
        netSalary: p.netSalary,
        payCurrency: p.payCurrency,
      };
    }
    return result;
  }

  async recalculateRun(
    tenantId: string,
    runId: string,
  ): Promise<PayrollRunDocument> {
    const run = await this.getRunOrThrow(tenantId, runId);
    if (run.status !== PayrollRunStatus.DRAFT) {
      throw new ConflictException('Only draft runs can be recalculated.');
    }

    await this.payslipModel.deleteMany({ payrollRunId: run._id });

    const employeeQuery: any = {
      tenantId: run.tenantId,
      employmentStatus: { $nin: ['terminated', 'resigned'] },
    };
    if (run.locationId) employeeQuery.locationId = run.locationId;
    const employees = await this.employeeModel.find(employeeQuery).lean();

    await this.generatePayslipsForRun(run, employees as any);
    return this.recalculateRunTotals(runId);
  }

  async processRun(
    tenantId: string,
    runId: string,
    processedBy: string,
  ): Promise<PayrollRunDocument> {
    const run = await this.getRunOrThrow(tenantId, runId);
    if (run.status !== PayrollRunStatus.DRAFT) {
      throw new ConflictException('This run has already been processed.');
    }

    const payslips = await this.payslipModel.find({ payrollRunId: run._id });

    const allLoanDeductions: { loanId: string; amount: number }[] = [];
    for (const slip of payslips) {
      for (const loanLine of slip.loanDeductions) {
        allLoanDeductions.push({
          loanId: loanLine.loanId.toString(),
          amount: loanLine.amountDeducted,
        });
      }
    }
    await this.loanService.applyLoanDeductions(runId, allLoanDeductions);

    run.status = PayrollRunStatus.PROCESSED;
    run.processedBy = new Types.ObjectId(processedBy);
    run.processedAt = new Date();
    await run.save();
    return run;
  }

  async markPaid(tenantId: string, runId: string): Promise<PayrollRunDocument> {
    const run = await this.getRunOrThrow(tenantId, runId);
    if (run.status !== PayrollRunStatus.PROCESSED) {
      throw new ConflictException('Only processed runs can be marked as paid.');
    }
    run.status = PayrollRunStatus.PAID;
    run.paidAt = new Date();
    await run.save();
    return run;
  }

  async discardDraftRun(tenantId: string, runId: string): Promise<void> {
    const run = await this.getRunOrThrow(tenantId, runId);
    if (run.status !== PayrollRunStatus.DRAFT) {
      throw new ConflictException('Only draft runs can be discarded.');
    }
    await this.payslipModel.deleteMany({ payrollRunId: run._id });
    await this.runModel.deleteOne({ _id: run._id });
  }

  async getAllRuns(tenantId: string): Promise<PayrollRunDocument[]> {
    return this.runModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .populate('locationId', 'name country')
      .sort({ periodStart: -1 })
      .lean() as any;
  }

  async getRunDetail(tenantId: string, runId: string) {
    const run = await this.getRunOrThrow(tenantId, runId);
    const payslips = await this.payslipModel
      .find({ payrollRunId: run._id })
      .sort({ employeeName: 1 })
      .lean();
    return { run, payslips };
  }

  async getPayslip(
    tenantId: string,
    payslipId: string,
  ): Promise<PayslipDocument> {
    const slip = await this.payslipModel.findOne({
      _id: payslipId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!slip) throw new NotFoundException('Payslip not found');
    return slip;
  }

  async getMyPayslips(employeeId: string): Promise<PayslipDocument[]> {
    return this.payslipModel
      .find({ employeeId: new Types.ObjectId(employeeId) })
      .sort({ periodStart: -1 })
      .lean() as any;
  }

  async getPayslipForEmployee(
    payslipId: string,
    employeeId: string,
  ): Promise<PayslipDocument> {
    const slip = await this.payslipModel.findOne({
      _id: payslipId,
      employeeId: new Types.ObjectId(employeeId),
    });
    if (!slip) throw new NotFoundException('Payslip not found');
    return slip;
  }

  async renderPayslipHtml(
    tenantId: string,
    slip: PayslipDocument,
  ): Promise<string> {
    const template = await this.templateService.getOrCreateTemplate(tenantId);
    return buildPayslipHtml(slip, template);
  }

  private async getRunOrThrow(
    tenantId: string,
    runId: string,
  ): Promise<PayrollRunDocument> {
    const run = await this.runModel.findOne({
      _id: runId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  private async generatePayslipsForRun(
    run: PayrollRunDocument,
    employees: EmployeeDocument[],
  ): Promise<void> {
    for (const employee of employees) {
      try {
        await this.generatePayslipForEmployee(run, employee);
      } catch (err) {
        continue;
      }
    }
  }

  private async generatePayslipForEmployee(
    run: PayrollRunDocument,
    employee: EmployeeDocument,
  ): Promise<void> {
    if (employee.salary == null) {
      throw new BadRequestException(
        `Employee ${employee.firstName} ${employee.lastName} has no salary set.`,
      );
    }

    const policy = await this.policyService.getPolicyForLocation(
      run.tenantId.toString(),
      employee.locationId ? employee.locationId.toString() : null,
    );
    if (!policy) {
      throw new BadRequestException(
        `No payroll policy configured for this employee's location or tenant default.`,
      );
    }

    let basicSalary = employee.salary;
    let exchangeRateApplied: number | null = null;
    let exchangeRateDate: Date | null = null;
    const sourceCurrency = employee.salaryCurrency ?? policy.currency;

    if (sourceCurrency !== run.runCurrency) {
      const { rate, fetchedAt } = await this.fxService.getRate(
        sourceCurrency,
        run.runCurrency,
      );
      exchangeRateApplied = rate;
      exchangeRateDate = fetchedAt;
      basicSalary = basicSalary * rate;
    }

    const allowanceTypeMap = new Map(
      (policy.allowanceTypes ?? []).map((t) => [t.key, t]),
    );

    const allowances: AllowanceInput[] = (employee.allowances ?? []).map(
      (a) => {
        const policyType = allowanceTypeMap.get(a.key);
        return {
          key: a.key,
          label: a.label,
          amount: a.amount,
          isTransportAllowance: policyType?.isTransportAllowance ?? false,
        };
      },
    );

    const loanDeductions =
      await this.loanService.getActiveLoanDeductionsForEmployee(
        (employee._id as any).toString(),
        run.tenantId.toString(),
      );

    const result = this.calcService.calculate({
      basicSalary,
      allowances,
      policy: policy as any,
      loanDeductions,
    });

    await this.payslipModel.create({
      payrollRunId: run._id,
      employeeId: employee._id,
      tenantId: run.tenantId,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      jobTitle: employee.jobTitle ?? null,
      employeeNumber: employee.employeeNumber ?? null,
      periodLabel: run.periodLabel,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      payCurrency: run.runCurrency,
      sourceCurrency:
        sourceCurrency !== run.runCurrency ? sourceCurrency : null,
      exchangeRateApplied,
      exchangeRateDate,
      basicSalary: result.basicSalary,
      allowances: result.allowances,
      grossSalary: result.grossSalary,
      deductions: result.deductions,
      loanDeductions: result.loanDeductions.map((l) => ({
        loanId: new Types.ObjectId(l.loanId),
        label: l.label,
        amountDeducted: l.amountDeducted,
        remainingBalance: 0,
      })),
      totalEmployeeDeductions: result.totalEmployeeDeductions,
      totalEmployerContributions: result.totalEmployerContributions,
      netSalary: result.netSalary,
    });
  }

  private async recalculateRunTotals(
    runId: string,
  ): Promise<PayrollRunDocument> {
    const payslips = await this.payslipModel.find({
      payrollRunId: new Types.ObjectId(runId),
    });

    const totals = payslips.reduce(
      (acc, p) => ({
        employeeCount: acc.employeeCount + 1,
        totalGross: acc.totalGross + p.grossSalary,
        totalDeductions: acc.totalDeductions + p.totalEmployeeDeductions,
        totalNet: acc.totalNet + p.netSalary,
        totalEmployerContributions:
          acc.totalEmployerContributions + p.totalEmployerContributions,
      }),
      {
        employeeCount: 0,
        totalGross: 0,
        totalDeductions: 0,
        totalNet: 0,
        totalEmployerContributions: 0,
      },
    );

    const updated = await this.runModel.findByIdAndUpdate(
      runId,
      { $set: totals },
      { new: true },
    );
    return updated!;
  }
}
