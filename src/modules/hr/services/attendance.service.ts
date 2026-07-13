import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  EmployeeAttendance,
  EmployeeAttendanceDocument,
  EmployeeAttendanceStatus,
  Employee,
  EmployeeDocument,
  EmploymentStatus,
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

    if (
      [
        EmploymentStatus.TERMINATED,
        EmploymentStatus.RESIGNED,
        EmploymentStatus.SUSPENDED,
      ].includes(employee.employmentStatus)
    ) {
      throw new ForbiddenException(
        'Your account is not currently active — you cannot clock in.',
      );
    }

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
      tenantId: employee.tenantId,
      date: today,
      clockIn: now,
      location: dto.location,
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

  async getTodayAttendance(
    tenantId: string,
    teamId?: string,
    locationId?: string,
  ) {
    const today = this.startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tId = new Types.ObjectId(tenantId);

    // EmployeeAttendance has no teamId of its own (it only
    // references employeeId) — filtering by team/location happens
    // on the EMPLOYEE side, then attendance records are narrowed to
    // just those employee IDs.
    const matchAtt: any = {
      tenantId: tId,
      date: { $gte: today, $lt: tomorrow },
    };

    const matchEmp: any = {
      tenantId: tId,
      employmentStatus: {
        $nin: [
          EmploymentStatus.TERMINATED,
          EmploymentStatus.RESIGNED,
          EmploymentStatus.SUSPENDED,
        ],
      },
    };
    if (teamId) matchEmp.teamId = new Types.ObjectId(teamId);
    if (locationId) matchEmp.locationId = new Types.ObjectId(locationId);

    const [allEmployees, onLeaveIds] = await Promise.all([
      this.employeeModel
        .find(matchEmp)
        .select('_id firstName lastName jobTitle teamId')
        .populate('teamId', 'name')
        .lean(),
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

    const filteredEmployeeIds = allEmployees.map((e) => e._id);
    const todayRecords = await this.attendanceModel
      .find({ ...matchAtt, employeeId: { $in: filteredEmployeeIds } })
      .lean();

    const onLeaveSet = new Set(
      onLeaveIds.map((r) => (r as any).employeeId.toString()),
    );

    const recordByEmployeeId = new Map(
      todayRecords.map((r) => [r.employeeId.toString(), r]),
    );

    const log = allEmployees.map((emp) => {
      const empId = (emp._id as any).toString();
      const record = recordByEmployeeId.get(empId);
      const teamName = (emp.teamId as any)?.name ?? null;

      if (record) {
        return {
          employeeId: empId,
          firstName: emp.firstName,
          lastName: emp.lastName,
          jobTitle: emp.jobTitle,
          team: teamName,
          clockIn: record.clockIn,
          clockOut: record.clockOut,
          hoursWorked: record.hoursWorked,
          breakMinutes: record.breakMinutes,
          location: record.location,
          status: record.status,
          _attendanceId: (record as any)._id,
        };
      }

      const status = onLeaveSet.has(empId)
        ? EmployeeAttendanceStatus.ON_LEAVE
        : EmployeeAttendanceStatus.ABSENT;

      return {
        employeeId: empId,
        firstName: emp.firstName,
        lastName: emp.lastName,
        jobTitle: emp.jobTitle,
        team: teamName,
        clockIn: null,
        clockOut: null,
        hoursWorked: 0,
        breakMinutes: 0,
        location: null,
        status,
        _attendanceId: null,
      };
    });

    const present = log.filter((r) => r.status === 'present').length;
    const late = log.filter((r) => r.status === 'late').length;
    const remote = log.filter((r) => r.status === 'remote').length;
    const absent = log.filter((r) => r.status === 'absent').length;
    const onLeave = log.filter((r) => r.status === 'on_leave').length;
    const clockedInCount = present + late + remote;
    const avgHours =
      clockedInCount > 0
        ? +(
            log.reduce((s, r) => s + (r.hoursWorked ?? 0), 0) / clockedInCount
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

  async getWeeklyTrends(tenantId: string, teamId?: string) {
    const weekStart = this.startOfWeek(new Date());
    const tId = new Types.ObjectId(tenantId);

    const empQuery: any = {
      tenantId: tId,
      employmentStatus: {
        $nin: [
          EmploymentStatus.TERMINATED,
          EmploymentStatus.RESIGNED,
          EmploymentStatus.SUSPENDED,
        ],
      },
    };
    if (teamId) empQuery.teamId = new Types.ObjectId(teamId);

    const activeEmployees = await this.employeeModel
      .find(empQuery)
      .select('_id')
      .lean();
    const employeeIdFilter = activeEmployees.map(
      (e) => e._id as Types.ObjectId,
    );

    const match: any = {
      tenantId: tId,
      date: { $gte: weekStart },
      employeeId: { $in: employeeIdFilter },
    };

    const records = await this.attendanceModel.find(match).lean();

    const byDay: Record<
      string,
      {
        present: number;
        late: number;
        remote: number;
        totalHours: number;
        total: number;
      }
    > = {};

    for (const r of records) {
      const d = new Date(r.date).toISOString().slice(0, 10);
      if (!byDay[d]) {
        byDay[d] = { present: 0, late: 0, remote: 0, totalHours: 0, total: 0 };
      }
      byDay[d].total++;
      if (r.status === 'present') byDay[d].present++;
      if (r.status === 'late') byDay[d].late++;
      if (r.status === 'remote') byDay[d].remote++;
      byDay[d].totalHours += r.hoursWorked ?? 0;
    }

    return Object.entries(byDay)
      .map(([date, v]) => ({
        date,
        present: v.present,
        late: v.late,
        remote: v.remote,
        total: v.total,
        avgHours: v.total > 0 ? +(v.totalHours / v.total).toFixed(1) : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getEmployeeAttendance(employeeId: string, tenantId: string, limit = 5) {
    return this.attendanceModel
      .find({
        employeeId: new Types.ObjectId(employeeId),
        tenantId: new Types.ObjectId(tenantId),
      })
      .sort({ date: -1 })
      .limit(limit)
      .lean();
  }

  async getEmployeeAttendanceStats(employeeId: string, tenantId: string) {
    const eId = new Types.ObjectId(employeeId);
    const tId = new Types.ObjectId(tenantId);
    const weekStart = this.startOfWeek(new Date());
    const monthStart = this.startOfMonth(new Date());

    const [weekRecs, monthRecs] = await Promise.all([
      this.attendanceModel
        .find({ employeeId: eId, tenantId: tId, date: { $gte: weekStart } })
        .lean(),
      this.attendanceModel
        .find({ employeeId: eId, tenantId: tId, date: { $gte: monthStart } })
        .lean(),
    ]);

    const monthHours = +monthRecs
      .reduce((s, r) => s + (r.hoursWorked ?? 0), 0)
      .toFixed(1);
    const presentDays = monthRecs.filter((r) => r.status !== 'absent').length;
    const punctualDays = monthRecs.filter(
      (r) => r.status === 'present' || r.status === 'remote',
    ).length;
    const punctuality =
      monthRecs.length > 0
        ? Math.round((punctualDays / monthRecs.length) * 100)
        : 100;

    return {
      weekHours: +weekRecs
        .reduce((s, r) => s + (r.hoursWorked ?? 0), 0)
        .toFixed(1),
      monthHours,
      daysPresent: presentDays,
      punctuality,
    };
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
