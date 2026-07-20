import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EmployeeLoan,
  EmployeeLoanDocument,
  LoanStatus,
  LoanCreatedBy,
  EmployeeHierarchyRole,
  Employee,
  EmployeeDocument,
} from '../schemas';
import { RequestLoanDto, DecideLoanRequestDto, LogOwnerLoanDto } from '../dtos';

@Injectable()
export class EmployeeLoanService {
  constructor(
    @InjectModel(EmployeeLoan.name)
    private readonly loanModel: Model<EmployeeLoanDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  async getLoansForEmployee(
    employeeId: string,
    tenantId: string,
  ): Promise<EmployeeLoanDocument[]> {
    return this.loanModel
      .find({
        employeeId: new Types.ObjectId(employeeId),
        tenantId: new Types.ObjectId(tenantId),
      })
      .sort({ createdAt: -1 })
      .lean() as any;
  }

  async getAllLoans(
    tenantId: string,
    status?: string,
  ): Promise<EmployeeLoanDocument[]> {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (status) query.status = status;
    return this.loanModel
      .find(query)
      .populate('employeeId', 'firstName lastName employeeNumber')
      .sort({ createdAt: -1 })
      .lean() as any;
  }

  async decideLoanRequest(
    tenantId: string,
    loanId: string,
    decidedBy: string,
    dto: DecideLoanRequestDto,
  ): Promise<EmployeeLoanDocument> {
    const loan = await this.loanModel.findOne({
      _id: loanId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!loan) throw new NotFoundException('Loan request not found');

    if (loan.status !== LoanStatus.PENDING) {
      throw new ConflictException(
        'This loan request has already been decided.',
      );
    }

    if (dto.decision === 'approved') {
      if (!dto.monthlyInstallment || dto.monthlyInstallment <= 0) {
        throw new BadRequestException(
          'A monthly installment amount is required to approve a loan.',
        );
      }
      if (dto.monthlyInstallment > loan.principalAmount) {
        throw new BadRequestException(
          'Monthly installment cannot exceed the principal amount.',
        );
      }
      if (!dto.startDate || !dto.endDate) {
        throw new BadRequestException(
          'A deduction start and end date are required to approve a loan.',
        );
      }
      const start = new Date(dto.startDate);
      const end = new Date(dto.endDate);
      if (end <= start) {
        throw new BadRequestException(
          'The deduction end date must be after the start date.',
        );
      }
      loan.status = LoanStatus.ACTIVE;
      loan.monthlyInstallment = dto.monthlyInstallment;
      loan.startDate = start;
      loan.endDate = end;
    } else {
      if (!dto.rejectionReason?.trim()) {
        throw new BadRequestException(
          'A reason is required when rejecting a loan request.',
        );
      }
      loan.status = LoanStatus.REJECTED;
      loan.rejectionReason = dto.rejectionReason;
    }

    loan.decidedBy = new Types.ObjectId(decidedBy);
    loan.decidedAt = new Date();
    await loan.save();
    return loan;
  }

  async deleteLoan(tenantId: string, loanId: string): Promise<void> {
    const deleted = await this.loanModel.findOneAndDelete({
      _id: loanId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Loan not found');
  }

  async getActiveLoanDeductionsForEmployee(
    employeeId: string,
    tenantId: string,
    periodEnd: Date,
  ): Promise<{ loanId: string; label: string; amount: number }[]> {
    const loans = await this.loanModel.find({
      employeeId: new Types.ObjectId(employeeId),
      tenantId: new Types.ObjectId(tenantId),
      status: LoanStatus.ACTIVE,
    });

    return loans
      .filter((loan) => {
        if (!loan.startDate || !loan.endDate) return true;
        return periodEnd >= loan.startDate && periodEnd <= loan.endDate;
      })
      .map((loan) => ({
        loanId: (loan._id as any).toString(),
        label: loan.label,
        amount: Math.min(loan.monthlyInstallment, loan.outstandingBalance),
      }));
  }

  async applyLoanDeductions(
    payrollRunId: string,
    deductions: { loanId: string; amount: number }[],
  ): Promise<void> {
    for (const d of deductions) {
      const loan = await this.loanModel.findById(d.loanId);
      if (!loan) continue;

      loan.outstandingBalance = Math.max(0, loan.outstandingBalance - d.amount);
      loan.deductionHistory.push({
        payrollRunId: new Types.ObjectId(payrollRunId),
        amount: d.amount,
        deductedAt: new Date(),
      });
      if (loan.outstandingBalance === 0) {
        loan.status = LoanStatus.PAID_OFF;
      }
      await loan.save();
    }
  }

  // Employee-facing request flow ──

  async requestLoan(
    tenantId: string,
    employeeId: string,
    dto: RequestLoanDto,
  ): Promise<EmployeeLoanDocument> {
    return this.loanModel.create({
      employeeId: new Types.ObjectId(employeeId),
      tenantId: new Types.ObjectId(tenantId),
      label: dto.label,
      principalAmount: dto.amountRequested,
      currency: dto.currency ?? 'RWF',
      monthlyInstallment: 0,
      outstandingBalance: dto.amountRequested,
      requestedReason: dto.reason,
      createdBy: LoanCreatedBy.EMPLOYEE,
      status: LoanStatus.PENDING,
    });
  }

  async getMyLoans(employeeId: string): Promise<EmployeeLoanDocument[]> {
    return this.loanModel
      .find({ employeeId: new Types.ObjectId(employeeId) })
      .sort({ createdAt: -1 })
      .lean() as any;
  }

  async logOwnerLoan(
    tenantId: string,
    userId: string,
    dto: LogOwnerLoanDto,
  ): Promise<EmployeeLoanDocument> {
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) throw new NotFoundException('Employee profile not found');
    if (employee.hierarchyRole !== EmployeeHierarchyRole.OWNER) {
      throw new ForbiddenException(
        'Only the business owner can log a loan directly.',
      );
    }

    if (dto.monthlyInstallment > dto.principalAmount) {
      throw new BadRequestException(
        'Monthly installment cannot exceed the principal amount.',
      );
    }
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end <= start) {
      throw new BadRequestException(
        'The deduction end date must be after the start date.',
      );
    }

    return this.loanModel.create({
      tenantId: new Types.ObjectId(tenantId),
      employeeId: employee._id,
      label: dto.label,
      principalAmount: dto.principalAmount,
      currency: dto.currency ?? 'RWF',
      monthlyInstallment: dto.monthlyInstallment,
      outstandingBalance: dto.principalAmount,
      status: LoanStatus.ACTIVE,
      startDate: start,
      endDate: end,
      note: dto.note ?? null,
      createdBy: 'tenant',
      requestedReason: null,
      decidedBy: employee.userId,
      decidedAt: new Date(),
      rejectionReason: null,
      deductionHistory: [],
    });
  }
}
