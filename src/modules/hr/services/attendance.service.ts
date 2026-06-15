import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  EmployeeAttendance,
  EmployeeAttendanceDocument,
  EmployeeAttendanceStatus,
  Employee,
  EmployeeDocument,
  LeaveRequest,
  LeaveRequestDocument,
} from '../schemas';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(EmployeeAttendance.name)
    private readonly attendanceModel: Model<EmployeeAttendanceDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(LeaveRequest.name)
    private readonly leaveModel: Model<LeaveRequestDocument>,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // EMPLOYEE SELF-SERVICE — clock in/out/break
  // Called from /employee/attendance/* endpoints
  // userId is the User._id, we resolve employeeId from it
  // ═══════════════════════════════════════════════════════════

  async clockIn(
    userId: string,
    dto: { location?: string },
  ): Promise<EmployeeAttendanceDocument> {
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) throw new NotFoundException('Employee profile not found');

    const today = this.startOfDay(new Date());

    // Check not already clocked in
    const existing = await this.attendanceModel.findOne({
      employeeId: employee._id,
      date: { $gte: today },
      clockOut: null,
    });
    if (existing) {
      throw new ConflictException(
        'You are already clocked in. Clock out before starting a new shift.',
      );
    }

    const now = new Date();
    // Work day starts at 09:00 — flag as late if past that
    const workStart = new Date(today);
    workStart.setHours(9, 0, 0, 0);

    let status: EmployeeAttendanceStatus;
    const loc = dto.location?.toLowerCase() ?? '';
    if (loc.includes('remote')) {
      status = EmployeeAttendanceStatus.REMOTE;
    } else if (now > workStart) {
      status = EmployeeAttendanceStatus.LATE;
    } else {
      status = EmployeeAttendanceStatus.PRESENT;
    }

    return this.attendanceModel.create({
      employeeId: employee._id,
      clientId: employee.clientId,
      tenantId: employee.tenantId,
      date: today,
      clockIn: now,
      location: dto.location || 'Office',
      status,
    });
  }

  async startBreak(userId: string): Promise<EmployeeAttendanceDocument> {
    const record = await this.getActiveShiftByUser(userId);
    if (record.breakStartedAt) {
      throw new BadRequestException('You are already on a break');
    }
    record.breakStartedAt = new Date();
    await record.save();
    return record;
  }

  async endBreak(userId: string): Promise<EmployeeAttendanceDocument> {
    const record = await this.getActiveShiftByUser(userId);
    if (!record.breakStartedAt) {
      throw new BadRequestException('No active break to end');
    }
    const mins = Math.floor(
      (new Date().getTime() - record.breakStartedAt.getTime()) / 60000,
    );
    record.breakMinutes += mins;
    record.breakStartedAt = null;
    await record.save();
    return record;
  }

  async clockOut(userId: string): Promise<EmployeeAttendanceDocument> {
    const record = await this.getActiveShiftByUser(userId);
    const now = new Date();

    // Auto-end any active break
    if (record.breakStartedAt) {
      const mins = Math.floor(
        (now.getTime() - record.breakStartedAt.getTime()) / 60000,
      );
      record.breakMinutes += mins;
      record.breakStartedAt = null;
    }

    const totalMins = Math.floor(
      (now.getTime() - record.clockIn.getTime()) / 60000,
    );
    const workedMins = Math.max(0, totalMins - record.breakMinutes);

    record.clockOut = now;
    record.hoursWorked = +(workedMins / 60).toFixed(2);
    await record.save();
    return record;
  }

  async getActiveShiftByUser(
    userId: string,
  ): Promise<EmployeeAttendanceDocument> {
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) throw new NotFoundException('Employee profile not found');

    const today = this.startOfDay(new Date());
    const record = await this.attendanceModel.findOne({
      employeeId: employee._id,
      date: { $gte: today },
      clockOut: null,
    });
    if (!record) {
      throw new NotFoundException('No active shift. Please clock in first.');
    }
    return record;
  }

  async getMyAttendance(
    userId: string,
    limit = 30,
  ): Promise<EmployeeAttendanceDocument[]> {
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) throw new NotFoundException('Employee profile not found');

    return this.attendanceModel
      .find({ employeeId: employee._id })
      .sort({ date: -1 })
      .limit(limit)
      .lean() as any;
  }

  async getMyActiveShift(
    userId: string,
  ): Promise<EmployeeAttendanceDocument | null> {
    try {
      return await this.getActiveShiftByUser(userId);
    } catch {
      return null;
    }
  }

  async getMyAttendanceStats(userId: string) {
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) throw new NotFoundException('Employee profile not found');

    const weekStart = this.startOfWeek(new Date());
    const monthStart = this.startOfMonth(new Date());

    const [weekRecs, monthRecs] = await Promise.all([
      this.attendanceModel
        .find({ employeeId: employee._id, date: { $gte: weekStart } })
        .lean(),
      this.attendanceModel
        .find({ employeeId: employee._id, date: { $gte: monthStart } })
        .lean(),
    ]);

    return {
      weekHours: +weekRecs
        .reduce((s, r) => s + (r.hoursWorked ?? 0), 0)
        .toFixed(1),
      monthHours: +monthRecs
        .reduce((s, r) => s + (r.hoursWorked ?? 0), 0)
        .toFixed(1),
      daysPresent: weekRecs.filter(
        (r) => r.status !== EmployeeAttendanceStatus.ABSENT,
      ).length,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // TENANT VIEW — today's attendance across all employees
  // ═══════════════════════════════════════════════════════════

  async getTodayAttendance(tenantId: string, clientId?: string) {
    const today = this.startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tId = new Types.ObjectId(tenantId);

    // ── Attendance records for today ──────────────────────
    const matchAtt: any = {
      tenantId: tId,
      date: { $gte: today, $lt: tomorrow },
    };
    if (clientId) matchAtt.clientId = new Types.ObjectId(clientId);

    // ── All active employees for this tenant ──────────────
    const matchEmp: any = {
      tenantId: tId,
      employmentStatus: 'active',
    };
    if (clientId) matchEmp.clientId = new Types.ObjectId(clientId);

    const [todayRecords, allEmployees, onLeaveIds] = await Promise.all([
      this.attendanceModel
        .find(matchAtt)
        .populate(
          'employeeId',
          'firstName lastName jobTitle department clientId',
        )
        .lean(),
      this.employeeModel
        .find(matchEmp)
        .select('_id firstName lastName jobTitle department clientId')
        .lean(),
      // Employees on approved leave today
      this.leaveModel
        .find({
          tenantId: tId,
          status: 'approved',
          startDate: { $lte: new Date() },
          endDate: { $gte: new Date() },
        })
        .select('employeeId')
        .lean(),
    ]);

    const onLeaveSet = new Set(
      onLeaveIds.map((r) => (r as any).employeeId.toString()),
    );

    const clockedInIds = new Set(
      todayRecords.map(
        (r: any) =>
          (r.employeeId as any)?._id?.toString() ?? r.employeeId.toString(),
      ),
    );

    // Build full log — merge attendance records with employee list
    const log = allEmployees.map((emp) => {
      const empId = (emp._id as any).toString();
      const record = todayRecords.find(
        (r: any) =>
          ((r.employeeId as any)?._id?.toString() ??
            r.employeeId.toString()) === empId,
      );

      if (record) {
        return {
          employeeId: empId,
          firstName: (record.employeeId as any)?.firstName ?? emp.firstName,
          lastName: (record.employeeId as any)?.lastName ?? emp.lastName,
          jobTitle: (record.employeeId as any)?.jobTitle ?? emp.jobTitle,
          department: (record.employeeId as any)?.department ?? emp.department,
          clientId:
            (record.clientId as any)?.toString() ?? emp.clientId.toString(),
          clockIn: record.clockIn,
          clockOut: record.clockOut,
          hoursWorked: record.hoursWorked,
          breakMinutes: record.breakMinutes,
          location: record.location,
          status: record.status,
          _attendanceId: (record as any)._id,
        };
      }

      // Not clocked in — check if on leave
      const status = onLeaveSet.has(empId)
        ? EmployeeAttendanceStatus.ON_LEAVE
        : EmployeeAttendanceStatus.ABSENT;

      return {
        employeeId: empId,
        firstName: emp.firstName,
        lastName: emp.lastName,
        jobTitle: emp.jobTitle,
        department: emp.department,
        clientId: emp.clientId.toString(),
        clockIn: null,
        clockOut: null,
        hoursWorked: 0,
        breakMinutes: 0,
        location: null,
        status,
        _attendanceId: null,
      };
    });

    // ── Stats ─────────────────────────────────────────────
    const present = log.filter((r) => r.status === 'present').length;
    const late = log.filter((r) => r.status === 'late').length;
    const remote = log.filter((r) => r.status === 'remote').length;
    const absent = log.filter((r) => r.status === 'absent').length;
    const onLeave = log.filter((r) => r.status === 'on_leave').length;
    const avgHours =
      log.filter((r) => r.hoursWorked && r.hoursWorked > 0).length > 0
        ? +(
            log.reduce((s, r) => s + (r.hoursWorked ?? 0), 0) /
            Math.max(1, present + late + remote)
          ).toFixed(1)
        : 0;

    return {
      date: today,
      stats: {
        present,
        late,
        remote,
        absent,
        onLeave,
        avgHours,
        total: log.length,
      },
      log,
    };
  }

  async getWeeklyTrends(tenantId: string, clientId?: string) {
    const weekStart = this.startOfWeek(new Date());
    const tId = new Types.ObjectId(tenantId);

    const match: any = {
      tenantId: tId,
      date: { $gte: weekStart },
    };
    if (clientId) match.clientId = new Types.ObjectId(clientId);

    const records = await this.attendanceModel
      .find(match)
      .populate('employeeId', 'firstName lastName')
      .lean();

    // Group by date
    const byDay: Record<
      string,
      {
        present: number;
        late: number;
        remote: number;
        avgHours: number;
        total: number;
      }
    > = {};

    for (const r of records) {
      const d = new Date(r.date).toISOString().slice(0, 10);
      if (!byDay[d])
        byDay[d] = { present: 0, late: 0, remote: 0, avgHours: 0, total: 0 };
      byDay[d].total++;
      if (r.status === 'present') byDay[d].present++;
      if (r.status === 'late') byDay[d].late++;
      if (r.status === 'remote') byDay[d].remote++;
      byDay[d].avgHours = +(byDay[d].avgHours + (r.hoursWorked ?? 0));
    }

    return Object.entries(byDay)
      .map(([date, v]) => ({
        date,
        ...v,
        avgHours: v.total > 0 ? +(v.avgHours / v.total).toFixed(1) : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════

  private startOfDay(d: Date): Date {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r;
  }

  private startOfWeek(d: Date): Date {
    const r = new Date(d);
    r.setDate(r.getDate() - r.getDay());
    r.setHours(0, 0, 0, 0);
    return r;
  }

  private startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
}
