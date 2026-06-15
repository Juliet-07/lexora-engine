import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  LeaveRequest,
  LeaveRequestDocument,
  LeaveStatus,
} from '../schemas/leave-request.schema';
import {
  LeavePolicy,
  LeavePolicyDocument,
  LeaveType,
} from '../schemas/leave-policy.schema';
import { Employee, EmployeeDocument } from '../schemas/employee.schema';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import {
  CreateLeaveRequestDto,
  ReviewLeaveRequestDto,
  LeaveFilterDto,
  UpsertLeavePolicyDto,
} from '../dtos/leave.dto';
import { PaginationDto, paginate } from '../../../common/pagination.dto';
import { EmailService } from '../../../common/utils/mailing/email.service';

@Injectable()
export class LeaveService {
  constructor(
    @InjectModel(LeaveRequest.name)
    private readonly leaveModel: Model<LeaveRequestDocument>,
    @InjectModel(LeavePolicy.name)
    private readonly policyModel: Model<LeavePolicyDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly mailService: EmailService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // LEAVE POLICY — tenant sets per client
  // ═══════════════════════════════════════════════════════════

  async upsertPolicy(
    tenantId: string,
    dto: UpsertLeavePolicyDto,
  ): Promise<LeavePolicyDocument> {
    const policy = await this.policyModel.findOneAndUpdate(
      {
        tenantId: new Types.ObjectId(tenantId),
        clientId: new Types.ObjectId(dto.clientId),
      },
      {
        $set: {
          tenantId: new Types.ObjectId(tenantId),
          clientId: new Types.ObjectId(dto.clientId),
          policies: dto.policies,
          effectiveFrom: new Date(),
        },
      },
      { upsert: true, new: true },
    );
    return policy;
  }

  async getPolicy(
    tenantId: string,
    clientId: string,
  ): Promise<LeavePolicyDocument | null> {
    return this.policyModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        clientId: new Types.ObjectId(clientId),
      })
      .lean() as any;
  }

  async getAllPolicies(tenantId: string): Promise<LeavePolicyDocument[]> {
    return this.policyModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .lean() as any;
  }

  // ═══════════════════════════════════════════════════════════
  // LEAVE REQUEST — employee creates
  // ═══════════════════════════════════════════════════════════

  async createLeaveRequest(
    userId: string, // employee's User._id
    dto: CreateLeaveRequestDto,
  ): Promise<LeaveRequestDocument> {
    // Get employee record from userId
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) throw new NotFoundException('Employee profile not found');

    if (
      employee.employmentStatus === 'terminated' ||
      employee.employmentStatus === 'resigned'
    ) {
      throw new ForbiddenException(
        'Terminated or resigned employees cannot submit leave requests',
      );
    }

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (end < start) {
      throw new BadRequestException('End date must be after start date');
    }

    // Calculate working days (Mon–Fri, excludes weekends)
    const days = this.calcWorkingDays(start, end);
    if (days < 1) {
      throw new BadRequestException('Leave must be at least 1 working day');
    }

    // Check for overlapping leave
    const overlap = await this.leaveModel.findOne({
      employeeId: employee._id,
      status: { $in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
      $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
    });
    if (overlap) {
      throw new BadRequestException(
        'You already have a leave request that overlaps with these dates',
      );
    }

    // Check leave balance (only for balance-tracked types)
    const balancedTypes = [LeaveType.ANNUAL, LeaveType.SICK];
    if (balancedTypes.includes(dto.type as LeaveType)) {
      const balance = this.getEmployeeBalance(employee, dto.type as LeaveType);
      if (days > balance) {
        throw new BadRequestException(
          `Insufficient leave balance. You have ${balance} day(s) remaining for ${dto.type} leave.`,
        );
      }
    }

    const request = await this.leaveModel.create({
      employeeId: employee._id,
      clientId: employee.clientId,
      tenantId: employee.tenantId,
      type: dto.type,
      startDate: start,
      endDate: end,
      days,
      reason: dto.reason,
      status: LeaveStatus.PENDING,
    });

    // Notify tenant
    await this.notifyTenantOfRequest(request, employee);

    return request;
  }

  // ═══════════════════════════════════════════════════════════
  // GET LEAVE REQUESTS — various scopes
  // ═══════════════════════════════════════════════════════════

  // Tenant — all requests across all clients (or filtered)
  async getTenantLeaveRequests(
    tenantId: string,
    pagination: PaginationDto,
    filters: LeaveFilterDto,
  ) {
    const { skip, limit, page } = pagination;
    const query: any = { tenantId: new Types.ObjectId(tenantId) };

    if (filters.clientId) query.clientId = new Types.ObjectId(filters.clientId);
    if (filters.employeeId)
      query.employeeId = new Types.ObjectId(filters.employeeId);
    if (filters.status) query.status = filters.status;
    if (filters.type) query.type = filters.type;

    const [items, total] = await Promise.all([
      this.leaveModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .populate('employeeId', 'firstName lastName email jobTitle department')
        .populate('reviewedBy', 'firstName lastName')
        .lean(),
      this.leaveModel.countDocuments(query),
    ]);

    return paginate(items, total, page, limit);
  }

  // Employee — own leave history
  async getMyLeaveRequests(userId: string) {
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) throw new NotFoundException('Employee profile not found');

    return this.leaveModel
      .find({ employeeId: employee._id })
      .sort({ createdAt: -1 })
      .lean();
  }

  // Employee — own leave balances + policy
  async getMyLeaveBalance(userId: string) {
    const employee = await this.employeeModel
      .findOne({
        userId: new Types.ObjectId(userId),
      })
      .lean();
    if (!employee) throw new NotFoundException('Employee profile not found');

    // Get policy for this client
    const policy = await this.policyModel
      .findOne({
        tenantId: employee.tenantId,
        clientId: employee.clientId,
      })
      .lean();

    // Build balance summary
    const balances = this.buildBalanceSummary(employee, policy);
    return {
      balances,
      employee: {
        annualLeaveBalance: employee.annualLeaveBalance,
        annualLeaveUsed: employee.annualLeaveUsed,
        sickLeaveBalance: employee.sickLeaveBalance,
        sickLeaveUsed: employee.sickLeaveUsed,
      },
    };
  }

  // Client — all their employees' leave requests
  async getClientLeaveRequests(
    clientProfileId: string,
    pagination: PaginationDto,
    filters: LeaveFilterDto,
  ) {
    const { skip, limit, page } = pagination;
    const query: any = {
      clientId: new Types.ObjectId(clientProfileId),
    };
    if (filters.status) query.status = filters.status;
    if (filters.type) query.type = filters.type;

    const [items, total] = await Promise.all([
      this.leaveModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .populate('employeeId', 'firstName lastName email jobTitle department')
        .lean(),
      this.leaveModel.countDocuments(query),
    ]);

    return paginate(items, total, page, limit);
  }

  // ═══════════════════════════════════════════════════════════
  // REVIEW — tenant approves or rejects
  // ═══════════════════════════════════════════════════════════

  async reviewLeaveRequest(
    requestId: string,
    tenantId: string,
    reviewerId: string,
    dto: ReviewLeaveRequestDto,
  ): Promise<LeaveRequestDocument> {
    const request = await this.leaveModel.findOne({
      _id: requestId,
      tenantId: new Types.ObjectId(tenantId),
      status: LeaveStatus.PENDING,
    });

    if (!request) {
      throw new NotFoundException(
        'Leave request not found or already reviewed',
      );
    }

    const newStatus =
      dto.status === 'approved' ? LeaveStatus.APPROVED : LeaveStatus.REJECTED;

    await this.leaveModel.findByIdAndUpdate(requestId, {
      $set: {
        status: newStatus,
        reviewedBy: new Types.ObjectId(reviewerId),
        reviewedAt: new Date(),
        reviewNote: dto.reviewNote ?? null,
      },
    });

    // If approved — deduct from employee leave balance
    if (newStatus === LeaveStatus.APPROVED) {
      await this.deductLeaveBalance(
        request.employeeId.toString(),
        request.type as LeaveType,
        request.days,
      );
    }

    // Notify employee
    await this.notifyEmployeeOfReview(request, newStatus, dto.reviewNote);

    const updated = await this.leaveModel.findById(requestId).lean();
    return updated as LeaveRequestDocument;
  }

  // ═══════════════════════════════════════════════════════════
  // CANCEL — employee cancels pending request
  // ═══════════════════════════════════════════════════════════

  async cancelLeaveRequest(
    requestId: string,
    userId: string,
  ): Promise<LeaveRequestDocument> {
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const request = await this.leaveModel.findOne({
      _id: requestId,
      employeeId: employee._id,
      status: LeaveStatus.PENDING,
    });

    if (!request) {
      throw new NotFoundException(
        'Leave request not found or cannot be cancelled',
      );
    }

    const updated = await this.leaveModel
      .findByIdAndUpdate(
        requestId,
        { status: LeaveStatus.CANCELLED },
        { new: true },
      )
      .lean();

    return updated as LeaveRequestDocument;
  }

  // ═══════════════════════════════════════════════════════════
  // STATS — for tenant leave dashboard
  // ═══════════════════════════════════════════════════════════

  async getLeaveStats(tenantId: string, clientId?: string) {
    const tId = new Types.ObjectId(tenantId);
    const match: any = { tenantId: tId };
    if (clientId) match.clientId = new Types.ObjectId(clientId);

    const [byStatus, byType, pending, recentApproved] = await Promise.all([
      this.leaveModel.aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.leaveModel.aggregate([
        { $match: match },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      this.leaveModel.countDocuments({ ...match, status: LeaveStatus.PENDING }),
      this.leaveModel
        .find({ ...match, status: LeaveStatus.APPROVED })
        .sort({ reviewedAt: -1 })
        .limit(5)
        .populate('employeeId', 'firstName lastName jobTitle')
        .lean(),
    ]);

    return { byStatus, byType, pending, recentApproved };
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

  private getEmployeeBalance(employee: any, type: LeaveType): number {
    if (type === LeaveType.ANNUAL) {
      return (
        (employee.annualLeaveBalance ?? 21) - (employee.annualLeaveUsed ?? 0)
      );
    }
    if (type === LeaveType.SICK) {
      return (employee.sickLeaveBalance ?? 10) - (employee.sickLeaveUsed ?? 0);
    }
    return 999; // unlimited for other types
  }

  private buildBalanceSummary(employee: any, policy: any) {
    const policyMap: Record<string, number> = {};
    if (policy?.policies) {
      for (const p of policy.policies) {
        policyMap[p.type] = p.daysAllowed;
      }
    }

    return [
      {
        type: LeaveType.ANNUAL,
        label: 'Annual Leave',
        daysAllowed:
          policyMap[LeaveType.ANNUAL] ?? employee.annualLeaveBalance ?? 21,
        daysUsed: employee.annualLeaveUsed ?? 0,
        daysLeft:
          (policyMap[LeaveType.ANNUAL] ?? employee.annualLeaveBalance ?? 21) -
          (employee.annualLeaveUsed ?? 0),
      },
      {
        type: LeaveType.SICK,
        label: 'Sick Leave',
        daysAllowed:
          policyMap[LeaveType.SICK] ?? employee.sickLeaveBalance ?? 10,
        daysUsed: employee.sickLeaveUsed ?? 0,
        daysLeft:
          (policyMap[LeaveType.SICK] ?? employee.sickLeaveBalance ?? 10) -
          (employee.sickLeaveUsed ?? 0),
      },
      {
        type: LeaveType.MATERNITY,
        label: 'Maternity Leave',
        daysAllowed: policyMap[LeaveType.MATERNITY] ?? 90,
        daysUsed: 0,
        daysLeft: policyMap[LeaveType.MATERNITY] ?? 90,
      },
      {
        type: LeaveType.PATERNITY,
        label: 'Paternity Leave',
        daysAllowed: policyMap[LeaveType.PATERNITY] ?? 5,
        daysUsed: 0,
        daysLeft: policyMap[LeaveType.PATERNITY] ?? 5,
      },
      {
        type: LeaveType.COMPASSIONATE,
        label: 'Compassionate Leave',
        daysAllowed: policyMap[LeaveType.COMPASSIONATE] ?? 3,
        daysUsed: 0,
        daysLeft: policyMap[LeaveType.COMPASSIONATE] ?? 3,
      },
      {
        type: LeaveType.STUDY,
        label: 'Study Leave',
        daysAllowed: policyMap[LeaveType.STUDY] ?? 5,
        daysUsed: 0,
        daysLeft: policyMap[LeaveType.STUDY] ?? 5,
      },
    ];
  }

  private async deductLeaveBalance(
    employeeId: string,
    type: LeaveType,
    days: number,
  ): Promise<void> {
    const field =
      type === LeaveType.ANNUAL
        ? 'annualLeaveUsed'
        : type === LeaveType.SICK
          ? 'sickLeaveUsed'
          : null;

    if (!field) return; // non-tracked types don't deduct

    await this.employeeModel.findByIdAndUpdate(employeeId, {
      $inc: { [field]: days },
    });
  }

  private async notifyTenantOfRequest(
    request: LeaveRequestDocument,
    employee: any,
  ): Promise<void> {
    try {
      const tenant = await this.userModel
        .findById(request.tenantId)
        .select('email firstName tenantProfile')
        .lean();
      if (!tenant) return;

      await this.mailService.sendLeaveRequestNotification({
        to: (tenant as any).email,
        tenantName: (tenant as any).firstName,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        leaveType: request.type,
        startDate: request.startDate,
        endDate: request.endDate,
        days: request.days,
        reason: request.reason,
        dashboardUrl: `${process.env.TENANT_APP_URL}/hr/leave`,
      });
    } catch (err) {
      // Non-blocking — log but don't fail
      console.error('Failed to notify tenant of leave request:', err.message);
    }
  }

  private async notifyEmployeeOfReview(
    request: LeaveRequestDocument,
    status: LeaveStatus,
    note?: string,
  ): Promise<void> {
    try {
      const employee = await this.employeeModel
        .findById(request.employeeId)
        .select('firstName lastName email')
        .lean();
      if (!employee) return;

      await this.mailService.sendLeaveReviewNotification({
        to: (employee as any).email,
        firstName: (employee as any).firstName,
        status,
        leaveType: request.type,
        startDate: request.startDate,
        endDate: request.endDate,
        days: request.days,
        note: note ?? null,
        portalUrl: `${process.env.CLIENT_APP_URL}/employee/leave`,
      });
    } catch (err) {
      console.error('Failed to notify employee of leave review:', err.message);
    }
  }
}
