import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EmployeeLoan, EmployeeLoanDocument, LoanStatus } from '../schemas';
import { CreateLoanDto, UpdateLoanDto } from '../dtos';

@Injectable()
export class EmployeeLoanService {
  constructor(
    @InjectModel(EmployeeLoan.name)
    private readonly loanModel: Model<EmployeeLoanDocument>,
  ) {}

  async createLoan(
    tenantId: string,
    dto: CreateLoanDto,
  ): Promise<EmployeeLoanDocument> {
    if (dto.monthlyInstallment > dto.principalAmount) {
      throw new BadRequestException(
        'Monthly installment cannot exceed the principal amount.',
      );
    }

    return this.loanModel.create({
      employeeId: new Types.ObjectId(dto.employeeId),
      tenantId: new Types.ObjectId(tenantId),
      label: dto.label,
      principalAmount: dto.principalAmount,
      currency: dto.currency,
      monthlyInstallment: dto.monthlyInstallment,
      outstandingBalance: dto.principalAmount,
      startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
      note: dto.note ?? null,
      status: LoanStatus.ACTIVE,
    });
  }

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

  async updateLoan(
    tenantId: string,
    loanId: string,
    dto: UpdateLoanDto,
  ): Promise<EmployeeLoanDocument> {
    const update: any = { ...dto };
    const loan = await this.loanModel.findOneAndUpdate(
      { _id: loanId, tenantId: new Types.ObjectId(tenantId) },
      { $set: update },
      { new: true },
    );
    if (!loan) throw new NotFoundException('Loan not found');
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
  ): Promise<{ loanId: string; label: string; amount: number }[]> {
    const loans = await this.loanModel.find({
      employeeId: new Types.ObjectId(employeeId),
      tenantId: new Types.ObjectId(tenantId),
      status: LoanStatus.ACTIVE,
    });

    return loans.map((loan) => ({
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
}
