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
  OvertimeDayType,
  Employee,
  EmployeeDocument,
  OvertimePolicyDocument,
} from '../schemas';
import { LogOvertimeDto, DecideOvertimeDto } from '../dtos';
import { OvertimePolicyService } from './overtime-policy.service';

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
    private readonly overtimePolicyService: OvertimePolicyService,
  ) {}

  // ── Employee-facing: log overtime for a month ──────────────────

  // Shared by logOvertime and getMyOvertimePolicy — overtime rules
  // differ by the country a tenant operates from, so the rate
  // structure comes entirely from the tenant's own OvertimePolicy
  // (per location, falling back to the tenant default) rather than
  // any hardcoded default.
  private async resolvePolicyForEmployee(
    tenantId: string,
    employee: EmployeeDocument,
  ): Promise<OvertimePolicyDocument | null> {
    return this.overtimePolicyService.getPolicyForLocation(
      tenantId,
      employee.locationId ? employee.locationId.toString() : null,
    );
  }

  // Lets the employee-facing UI check up front whether logging
  // overtime is even possible, so it can disable the button instead
  // of letting the employee hit the BadRequestException in
  // logOvertime below.
  async getMyOvertimePolicy(
    tenantId: string,
    employeeId: string,
  ): Promise<OvertimePolicyDocument | null> {
    const employee = await this.employeeModel.findOne({
      _id: new Types.ObjectId(employeeId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!employee) throw new NotFoundException('Employee profile not found');
    return this.resolvePolicyForEmployee(tenantId, employee);
  }

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

    // If the tenant hasn't set one up, overtime is not calculated at
    // all — per the PO's Oct 2026 note — rather than silently falling
    // back to the old Rwanda-shaped 40hr/1.5x behavior.
    const policy = await this.resolvePolicyForEmployee(tenantId, employee);
    if (!policy) {
      throw new BadRequestException(
        "Your employer hasn't set up an overtime rule for your location yet, so overtime can't be logged. Ask them to configure an Overtime Policy under Payroll.",
      );
    }

    const workDate = new Date(dto.workDate);
    const periodStart = new Date(
      workDate.getFullYear(),
      workDate.getMonth(),
      1,
    );
    const periodEnd = new Date(
      workDate.getFullYear(),
      workDate.getMonth() + 1,
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

    // Day type drives the rate: self-reported public holiday beats
    // the calendar, otherwise it's derived from workDate's weekday —
    // there's no tenant-maintained holiday calendar to check against.
    const dayOfWeek = workDate.getDay(); // 0 = Sunday, 6 = Saturday
    const isPublicHoliday = !!dto.isPublicHoliday;
    const dayType = isPublicHoliday
      ? OvertimeDayType.PUBLIC_HOLIDAY
      : dayOfWeek === 0 || dayOfWeek === 6
        ? OvertimeDayType.WEEKEND
        : OvertimeDayType.ORDINARY;

    const multiplier =
      dayType === OvertimeDayType.PUBLIC_HOLIDAY
        ? policy.rates.publicHoliday
        : dayType === OvertimeDayType.WEEKEND
          ? policy.rates.weekend
          : policy.rates.ordinary;

    const monthlyHours = (policy.standardWeeklyHours * 52) / 12;
    const hourlyRate = employee.salary / monthlyHours;
    const amount = round2(dto.hoursLogged * hourlyRate * multiplier);

    // Snapshot the rate/multiplier/dayType/currency in effect right
    // now, so a later change to the employee's salary or the tenant's
    // overtime policy never rewrites an already-logged entry.
    return this.overtimeModel.create({
      employeeId: employee._id,
      tenantId: new Types.ObjectId(tenantId),
      workDate,
      isPublicHoliday,
      dayType,
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
