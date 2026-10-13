import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EmployeeOvertimeLog,
  EmployeeOvertimeLogDocument,
  OvertimeStatus,
  Employee,
  EmployeeDocument,
} from '../schemas';
import { LogOvertimeDto, DecideOvertimeDto } from '../dtos';

// Standard monthly-hours figure for a 40-hour work week, per the
// payroll engine's worked example: 40 hours * 52 weeks / 12 months.
// Used as the divisor for employees on a 40hr week; employees with a
// different contracted weekly hours figure scale proportionally.
const STANDARD_WEEKLY_HOURS = 40;
const STANDARD_MONTHLY_HOURS = (STANDARD_WEEKLY_HOURS * 52) / 12; // 173.33...

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class EmployeeOvertimeService {
  constructor(
    @InjectModel(EmployeeOvertimeLog.name)
    private readonly overtimeModel: Model<EmployeeOvertimeLogDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  // ── Employee-facing: log overtime for a month ──────────────────

  async logOvertime(
    tenantId: string,
    employeeId: string,
    dto: LogOvertimeDto,
  ): Promise<EmployeeOvertimeLogDocument> {
    const employee = await this.employeeModel.findOne({
      _id: new Types.ObjectId(employeeId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!employee) throw new NotFoundException('Employee profile not found');
    if (employee.salary == null) {
      throw new BadRequestException(
        'Your salary has not been set yet — ask your employer to set it before logging overtime.',
      );
    }

    const periodDate = new Date(dto.periodDate);
    const periodStart = new Date(
      periodDate.getFullYear(),
      periodDate.getMonth(),
      1,
    );
    const periodEnd = new Date(
      periodDate.getFullYear(),
      periodDate.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const periodLabel = periodStart.toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    const weeklyHours = employee.weeklyContractedHours ?? STANDARD_WEEKLY_HOURS;
    const monthlyHours = (weeklyHours * 52) / 12 || STANDARD_MONTHLY_HOURS;
    const hourlyRate = employee.salary / monthlyHours;
    const multiplier = employee.overtimeMultiplier ?? 1.5;
    const amount = round2(dto.hoursLogged * hourlyRate * multiplier);

    return this.overtimeModel.create({
      employeeId: employee._id,
      tenantId: new Types.ObjectId(tenantId),
      periodLabel,
      periodStart,
      periodEnd,
      hoursLogged: dto.hoursLogged,
      hourlyRate: round2(hourlyRate),
      multiplier,
      amount,
      currency: employee.salaryCurrency ?? 'RWF',
      note: dto.note ?? null,
      status: OvertimeStatus.PENDING,
    });
  }

  async getMyOvertimeLogs(
    employeeId: string,
  ): Promise<EmployeeOvertimeLogDocument[]> {
    return this.overtimeModel
      .find({ employeeId: new Types.ObjectId(employeeId) })
      .sort({ periodStart: -1, createdAt: -1 })
      .lean() as any;
  }

  async deleteMyOvertimeLog(employeeId: string, logId: string): Promise<void> {
    const log = await this.overtimeModel.findOne({
      _id: logId,
      employeeId: new Types.ObjectId(employeeId),
    });
    if (!log) throw new NotFoundException('Overtime log not found');
    if (log.status !== OvertimeStatus.PENDING) {
      throw new ConflictException(
        'Only a pending overtime entry can be removed.',
      );
    }
    await this.overtimeModel.deleteOne({ _id: logId });
  }

  // ── Tenant-facing: review and decide ───────────────────────────

  async getAllForTenant(
    tenantId: string,
    status?: string,
  ): Promise<EmployeeOvertimeLogDocument[]> {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (status) query.status = status;
    return this.overtimeModel
      .find(query)
      .populate('employeeId', 'firstName lastName employeeNumber')
      .sort({ createdAt: -1 })
      .lean() as any;
  }

  async getPendingForTenant(
    tenantId: string,
  ): Promise<EmployeeOvertimeLogDocument[]> {
    return this.getAllForTenant(tenantId, OvertimeStatus.PENDING);
  }

  async getForEmployee(
    employeeId: string,
    tenantId: string,
  ): Promise<EmployeeOvertimeLogDocument[]> {
    return this.overtimeModel
      .find({
        employeeId: new Types.ObjectId(employeeId),
        tenantId: new Types.ObjectId(tenantId),
      })
      .sort({ periodStart: -1 })
      .lean() as any;
  }

  async decideOvertimeRequest(
    tenantId: string,
    logId: string,
    decidedBy: string,
    dto: DecideOvertimeDto,
  ): Promise<EmployeeOvertimeLogDocument> {
    const log = await this.overtimeModel.findOne({
      _id: logId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!log) throw new NotFoundException('Overtime log not found');

    if (log.status !== OvertimeStatus.PENDING) {
      throw new ConflictException(
        'This overtime entry has already been decided.',
      );
    }

    if (dto.decision === 'approved') {
      log.status = OvertimeStatus.APPROVED;
      log.rejectionReason = null;
    } else {
      if (!dto.rejectionReason?.trim()) {
        throw new BadRequestException(
          'A reason is required when rejecting an overtime entry.',
        );
      }
      log.status = OvertimeStatus.REJECTED;
      log.rejectionReason = dto.rejectionReason;
    }

    log.decidedBy = new Types.ObjectId(decidedBy);
    log.decidedAt = new Date();
    await log.save();
    return log;
  }

  async deleteOvertimeLog(tenantId: string, logId: string): Promise<void> {
    const deleted = await this.overtimeModel.findOneAndDelete({
      _id: logId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Overtime log not found');
  }

  // ── Payroll integration ─────────────────────────────────────────
  // Any month the employee doesn't log overtime, or the tenant never
  // approves it, it counts as 0 — so this simply returns 0 when no
  // APPROVED entry overlaps the run's period, rather than needing a
  // separate "zero" record to exist.

  async getApprovedOvertimeForPeriod(
    employeeId: string,
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ hours: number; amount: number } | null> {
    const logs = await this.overtimeModel.find({
      employeeId: new Types.ObjectId(employeeId),
      tenantId: new Types.ObjectId(tenantId),
      status: OvertimeStatus.APPROVED,
      periodStart: { $lte: periodEnd },
      periodEnd: { $gte: periodStart },
    });

    if (logs.length === 0) return null;

    const hours = logs.reduce((sum, l) => sum + l.hoursLogged, 0);
    const amount = round2(logs.reduce((sum, l) => sum + l.amount, 0));
    return { hours, amount };
  }
}
