import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  TeamMemberLeave,
  TeamMemberLeaveDocument,
  TeamLeaveType,
  TeamLeaveStatus,
  TeamMemberAttendance,
  TeamMemberAttendanceDocument,
  AttendanceStatus,
} from '../schemas';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import { EmailService } from '../../../common/utils/mailing/email.service';
import { TenantService } from './tenant.service';

@Injectable()
export class TeamMemberService {
  constructor(
    @InjectModel(TeamMemberLeave.name)
    private readonly leaveModel: Model<TeamMemberLeaveDocument>,
    @InjectModel(TeamMemberAttendance.name)
    private readonly attendanceModel: Model<TeamMemberAttendanceDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly tenantService: TenantService,
    private readonly mailService: EmailService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // PROFILE — team member views/updates own profile
  // ═══════════════════════════════════════════════════════════

  async getMyProfile(memberId: string) {
    const member = await this.userModel
      .findById(memberId)
      .select('-password -passwordResetToken')
      .lean();
    if (!member) throw new NotFoundException('Profile not found');
    return member;
  }

  async updateMyProfile(
    memberId: string,
    dto: { phone?: string; firstName?: string; lastName?: string },
  ) {
    const update: any = {};
    if (dto.phone) update.phone = dto.phone;
    if (dto.firstName) update.firstName = dto.firstName;
    if (dto.lastName) update.lastName = dto.lastName;

    const member = await this.userModel
      .findByIdAndUpdate(memberId, { $set: update }, { new: true })
      .select('-password -passwordResetToken');
    if (!member) throw new NotFoundException('Profile not found');
    return member;
  }

  // ═══════════════════════════════════════════════════════════
  // LEAVE — team member submits requests
  // ═══════════════════════════════════════════════════════════

  async submitLeaveRequest(
    memberId: string,
    tenantId: string,
    dto: {
      type: string;
      startDate: string;
      endDate: string;
      reason: string;
    },
  ): Promise<TeamMemberLeaveDocument> {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (end < start) {
      throw new BadRequestException('End date must be after start date');
    }

    const days = this.calcWorkingDays(start, end);
    if (days < 1) {
      throw new BadRequestException('Leave must be at least 1 working day');
    }

    // Check overlap
    const overlap = await this.leaveModel.findOne({
      memberId: new Types.ObjectId(memberId),
      status: { $in: [TeamLeaveStatus.PENDING, TeamLeaveStatus.APPROVED] },
      $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
    });
    if (overlap) {
      throw new BadRequestException(
        'You already have a leave request that overlaps with these dates',
      );
    }

    const request = await this.leaveModel.create({
      memberId: new Types.ObjectId(memberId),
      tenantId: new Types.ObjectId(tenantId),
      type: dto.type,
      startDate: start,
      endDate: end,
      days,
      reason: dto.reason,
      status: TeamLeaveStatus.PENDING,
    });

    // Notify tenant owner
    await this.notifyTenantOfLeave(request, tenantId);

    return request;
  }

  async getMyLeaveRequests(
    memberId: string,
  ): Promise<TeamMemberLeaveDocument[]> {
    return this.leaveModel
      .find({ memberId: new Types.ObjectId(memberId) })
      .sort({ createdAt: -1 })
      .lean() as any;
  }

  async getMyLeaveBalance(memberId: string) {
    const mId = new Types.ObjectId(memberId);

    // Get the member to find their tenantId
    const member = await this.userModel.findById(mId).select('tenantId').lean();
    if (!member) throw new NotFoundException('Member not found');

    // Resolve tenantId — owner has no tenantId, use their own _id
    const tenantId = (member as any).tenantId?.toString() ?? memberId;

    // Count used days per type from approved requests this year
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const usedByType = await this.leaveModel.aggregate([
      {
        $match: {
          memberId: mId,
          status: TeamLeaveStatus.APPROVED,
          startDate: { $gte: yearStart },
        },
      },
      { $group: { _id: '$type', used: { $sum: '$days' } } },
    ]);

    const usedMap = usedByType.reduce(
      (m, r) => {
        m[r._id] = r.used;
        return m;
      },
      {} as Record<string, number>,
    );

    // Get policy from tenant settings
    const policyEntries =
      await this.tenantService.getLeavePolicyForTenant(tenantId);

    // Combine policy entitlements with actual usage
    return policyEntries.map((p) => ({
      type: p.type,
      label: p.label,
      entitled: p.entitled,
      used: usedMap[p.type] ?? 0,
      remaining: p.entitled - (usedMap[p.type] ?? 0),
      carryOver: p.carryOver,
      requiresApproval: p.requiresApproval,
    }));
  }

  async cancelLeaveRequest(
    requestId: string,
    memberId: string,
  ): Promise<TeamMemberLeaveDocument> {
    const request = await this.leaveModel.findOne({
      _id: requestId,
      memberId: new Types.ObjectId(memberId),
      status: TeamLeaveStatus.PENDING,
    });
    if (!request) {
      throw new NotFoundException(
        'Leave request not found or cannot be cancelled',
      );
    }
    request.status = TeamLeaveStatus.CANCELLED;
    await request.save();
    return request;
  }

  // ═══════════════════════════════════════════════════════════
  // LEAVE — tenant admin reviews team member leave
  // ═══════════════════════════════════════════════════════════

  async getTenantTeamLeaveRequests(
    tenantId: string,
    filters: {
      status?: string;
      memberId?: string;
    },
  ) {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (filters.status) query.status = filters.status;
    if (filters.memberId) query.memberId = new Types.ObjectId(filters.memberId);

    return this.leaveModel
      .find(query)
      .sort({ createdAt: -1 })
      .populate('memberId', 'firstName lastName email roles')
      .lean();
  }

  async reviewTeamLeaveRequest(
    requestId: string,
    tenantId: string,
    reviewerId: string,
    dto: { status: 'approved' | 'rejected'; reviewNote?: string },
  ): Promise<TeamMemberLeaveDocument> {
    const request = await this.leaveModel.findOne({
      _id: requestId,
      tenantId: new Types.ObjectId(tenantId),
      status: TeamLeaveStatus.PENDING,
    });
    if (!request) {
      throw new NotFoundException(
        'Leave request not found or already reviewed',
      );
    }

    const newStatus =
      dto.status === 'approved'
        ? TeamLeaveStatus.APPROVED
        : TeamLeaveStatus.REJECTED;

    request.status = newStatus;
    request.reviewedBy = new Types.ObjectId(reviewerId);
    request.reviewedAt = new Date();
    request.reviewNote = dto.reviewNote ?? null;
    await request.save();

    // Notify team member
    await this.notifyMemberOfReview(request, dto.reviewNote);

    return request;
  }

  // ═══════════════════════════════════════════════════════════
  // ATTENDANCE — clock in / out / break
  // ═══════════════════════════════════════════════════════════

  async clockIn(
    memberId: string,
    tenantId: string,
    dto: { location?: string },
  ): Promise<TeamMemberAttendanceDocument> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already clocked in today
    const existing = await this.attendanceModel.findOne({
      memberId: new Types.ObjectId(memberId),
      date: { $gte: today },
      clockOut: null,
    });
    if (existing) {
      throw new ConflictException(
        'You are already clocked in. Clock out before starting a new shift.',
      );
    }

    const now = new Date();
    const workStart = new Date(today);
    workStart.setHours(9, 0, 0, 0);

    const status = dto.location?.toLowerCase().includes('remote')
      ? AttendanceStatus.REMOTE
      : now > workStart
        ? AttendanceStatus.LATE
        : AttendanceStatus.PRESENT;

    return this.attendanceModel.create({
      memberId: new Types.ObjectId(memberId),
      tenantId: new Types.ObjectId(tenantId),
      date: today,
      clockIn: now,
      clockOut: null,
      location: dto.location || 'Office',
      status,
    });
  }

  async startBreak(memberId: string): Promise<TeamMemberAttendanceDocument> {
    const record = await this.getActiveShift(memberId);
    if (record.breakStartedAt) {
      throw new BadRequestException('You are already on break');
    }
    record.breakStartedAt = new Date();
    await record.save();
    return record;
  }

  async endBreak(memberId: string): Promise<TeamMemberAttendanceDocument> {
    const record = await this.getActiveShift(memberId);
    if (!record.breakStartedAt) {
      throw new BadRequestException('No active break found');
    }
    const breakMins = Math.floor(
      (new Date().getTime() - record.breakStartedAt.getTime()) / 60000,
    );
    record.breakMinutes += breakMins;
    record.breakStartedAt = null;
    await record.save();
    return record;
  }

  async clockOut(memberId: string): Promise<TeamMemberAttendanceDocument> {
    const record = await this.getActiveShift(memberId);

    const now = new Date();

    // End any active break first
    if (record.breakStartedAt) {
      const breakMins = Math.floor(
        (now.getTime() - record.breakStartedAt.getTime()) / 60000,
      );
      record.breakMinutes += breakMins;
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

  async getMyAttendance(
    memberId: string,
    limit = 30,
  ): Promise<TeamMemberAttendanceDocument[]> {
    return this.attendanceModel
      .find({ memberId: new Types.ObjectId(memberId) })
      .sort({ date: -1 })
      .limit(limit)
      .lean() as any;
  }

  async getActiveShift(
    memberId: string,
  ): Promise<TeamMemberAttendanceDocument> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await this.attendanceModel.findOne({
      memberId: new Types.ObjectId(memberId),
      date: { $gte: today },
      clockOut: null,
    });
    if (!record) {
      throw new NotFoundException(
        'No active shift found. Please clock in first.',
      );
    }
    return record;
  }

  async getAttendanceStats(memberId: string) {
    const mId = new Types.ObjectId(memberId);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );

    const [weekRecords, monthRecords] = await Promise.all([
      this.attendanceModel
        .find({ memberId: mId, date: { $gte: weekStart } })
        .lean(),
      this.attendanceModel
        .find({ memberId: mId, date: { $gte: monthStart } })
        .lean(),
    ]);

    const weekHours = weekRecords.reduce((s, r) => s + (r.hoursWorked ?? 0), 0);
    const monthHours = monthRecords.reduce(
      (s, r) => s + (r.hoursWorked ?? 0),
      0,
    );

    return {
      weekHours: +weekHours.toFixed(1),
      monthHours: +monthHours.toFixed(1),
      daysPresent: weekRecords.filter(
        (r) => r.status !== AttendanceStatus.ABSENT,
      ).length,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════

  private calcWorkingDays(start: Date, end: Date): number {
    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) count++;
      current.setDate(current.getDate() + 1);
    }
    return count;
  }

  private leaveTypeLabel(type: string): string {
    const map: Record<string, string> = {
      annual: 'Annual Leave',
      sick: 'Sick Leave',
      parental: 'Parental Leave',
      compassionate: 'Compassionate Leave',
      study: 'Study Leave',
      unpaid: 'Unpaid Leave',
    };
    return map[type] ?? type;
  }

  private async notifyTenantOfLeave(
    request: TeamMemberLeaveDocument,
    tenantId: string,
  ): Promise<void> {
    try {
      const [member, tenant] = await Promise.all([
        this.userModel
          .findById(request.memberId)
          .select('firstName lastName')
          .lean(),
        this.userModel
          .findById(tenantId)
          .select('email firstName tenantProfile')
          .lean(),
      ]);
      if (!member || !tenant) return;

      await this.mailService.sendLeaveRequestNotification({
        to: (tenant as any).email,
        tenantName: (tenant as any).firstName,
        employeeName: `${(member as any).firstName} ${(member as any).lastName}`,
        leaveType: request.type,
        startDate: request.startDate,
        endDate: request.endDate,
        days: request.days,
        reason: request.reason,
        dashboardUrl: `${process.env.TENANT_APP_URL}/team`,
      });
    } catch (err) {
      console.error('Failed to notify tenant of team leave:', err.message);
    }
  }

  private async notifyMemberOfReview(
    request: TeamMemberLeaveDocument,
    note?: string,
  ): Promise<void> {
    try {
      const member = await this.userModel
        .findById(request.memberId)
        .select('firstName email')
        .lean();
      if (!member) return;

      await this.mailService.sendLeaveReviewNotification({
        to: (member as any).email,
        firstName: (member as any).firstName,
        status: request.status,
        leaveType: request.type,
        startDate: request.startDate,
        endDate: request.endDate,
        days: request.days,
        note: note ?? null,
        portalUrl: `${process.env.TENANT_APP_URL}/my/leave`,
      });
    } catch (err) {
      console.error('Failed to notify member of leave review:', err.message);
    }
  }
}
