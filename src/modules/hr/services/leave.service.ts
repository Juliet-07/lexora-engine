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
  DEFAULT_POLICY,
} from '../schemas/leave-policy.schema';
import { Employee, EmployeeDocument } from '../schemas/employee.schema';
import { HrLocation, HrLocationDocument } from '../schemas';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import {
  CreateLeaveRequestDto,
  ReviewLeaveRequestDto,
  LeaveFilterDto,
} from '../dtos/leave.dto';
import { PaginationDto, paginate } from '../../../common/pagination.dto';
import { EmailService } from '../../../common/utils/mailing/email.service';

// ── DTO ────────────────────────────────────────────────────────
export interface UpsertLocationLeavePolicyDto {
  locationId: string | null; // null = default policy
  policies: {
    type: string;
    daysAllowed: number;
    carryOver?: boolean;
    maxCarryOverDays?: number;
  }[];
}

@Injectable()
export class LeaveService {
  constructor(
    @InjectModel(LeaveRequest.name)
    private readonly leaveModel: Model<LeaveRequestDocument>,
    @InjectModel(LeavePolicy.name)
    private readonly policyModel: Model<LeavePolicyDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(HrLocation.name)
    private readonly locationModel: Model<HrLocationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly mailService: EmailService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // LEAVE POLICY — per location
  // ═══════════════════════════════════════════════════════════

  async upsertPolicy(
    tenantId: string,
    dto: UpsertLocationLeavePolicyDto,
  ): Promise<LeavePolicyDocument> {
    const tId = new Types.ObjectId(tenantId);
    const locId = dto.locationId ? new Types.ObjectId(dto.locationId) : null;

    // Validate location belongs to tenant
    if (locId) {
      const loc = await this.locationModel.findOne({
        _id: locId,
        tenantId: tId,
      });
      if (!loc) throw new NotFoundException('Location not found');
    }

    return this.policyModel.findOneAndUpdate(
      { tenantId: tId, locationId: locId },
      {
        $set: {
          tenantId: tId,
          locationId: locId,
          policies: dto.policies,
          effectiveFrom: new Date(),
        },
      },
      { upsert: true, new: true },
    );
  }

  async getPolicy(
    tenantId: string,
    locationId: string | null,
  ): Promise<LeavePolicyDocument | null> {
    const locId = locationId ? new Types.ObjectId(locationId) : null;
    return this.policyModel
      .findOne({ tenantId: new Types.ObjectId(tenantId), locationId: locId })
      .populate('locationId', 'name country city')
      .lean() as any;
  }

  async getAllPolicies(tenantId: string): Promise<any[]> {
    const policies = await this.policyModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .populate('locationId', 'name country city')
      .sort({ createdAt: 1 })
      .lean();

    // Attach location member counts
    const locationIds = policies
      .map((p: any) => p.locationId?._id)
      .filter(Boolean);

    const counts = await this.employeeModel.aggregate([
      {
        $match: {
          tenantId: new Types.ObjectId(tenantId),
          locationId: { $in: locationIds },
          employmentStatus: { $nin: ['terminated', 'resigned'] },
        },
      },
      { $group: { _id: '$locationId', count: { $sum: 1 } } },
    ]);

    const countMap = counts.reduce(
      (m, c) => {
        m[c._id.toString()] = c.count;
        return m;
      },
      {} as Record<string, number>,
    );

    return policies.map((p: any) => ({
      ...p,
      memberCount: p.locationId
        ? (countMap[p.locationId._id?.toString()] ?? 0)
        : 0,
    }));
  }

  // Get all locations that don't yet have a policy (for the "add policy" UI)
  async getLocationsWithoutPolicy(
    tenantId: string,
  ): Promise<HrLocationDocument[]> {
    const tId = new Types.ObjectId(tenantId);
    const existing = await this.policyModel
      .find({ tenantId: tId, locationId: { $ne: null } })
      .select('locationId')
      .lean();

    const coveredIds = existing.map((p: any) => p.locationId.toString());

    return this.locationModel
      .find({
        tenantId: tId,
        isActive: true,
        _id: { $nin: coveredIds.map((id) => new Types.ObjectId(id)) },
      })
      .lean() as any;
  }

  // ═══════════════════════════════════════════════════════════
  // LEAVE REQUEST — employee creates
  // ═══════════════════════════════════════════════════════════

  async createLeaveRequest(
    userId: string,
    dto: CreateLeaveRequestDto,
  ): Promise<LeaveRequestDocument> {
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

    // Check balance against location policy
    const policy = await this.getPolicyForEmployee(employee);
    const balance = this.getBalanceFromPolicy(
      policy,
      employee,
      dto.type as LeaveType,
    );
    const balancedTypes = [LeaveType.ANNUAL, LeaveType.SICK];
    if (balancedTypes.includes(dto.type as LeaveType) && days > balance) {
      throw new BadRequestException(
        `Insufficient leave balance. You have ${balance} day(s) remaining for ${dto.type} leave.`,
      );
    }

    const request = await this.leaveModel.create({
      employeeId: employee._id,
      tenantId: employee.tenantId,
      type: dto.type,
      startDate: start,
      endDate: end,
      days,
      reason: dto.reason,
      status: LeaveStatus.PENDING,
    });

    await this.notifyTenantOfRequest(request, employee);
    return request;
  }

  // ═══════════════════════════════════════════════════════════
  // GET LEAVE REQUESTS
  // ═══════════════════════════════════════════════════════════

  async getTenantLeaveRequests(
    tenantId: string,
    pagination: PaginationDto,
    filters: LeaveFilterDto,
  ) {
    const { skip, limit, page } = pagination;
    const query: any = { tenantId: new Types.ObjectId(tenantId) };

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
        .populate('employeeId', 'firstName lastName email jobTitle locationId')
        .lean(),
      this.leaveModel.countDocuments(query),
    ]);

    return paginate(items, total, page, limit);
  }

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

  // Employee — own leave balances from location policy
  async getMyLeaveBalance(userId: string) {
    const employee = await this.employeeModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean();
    if (!employee) throw new NotFoundException('Employee profile not found');

    const policy = await this.getPolicyForEmployee(employee);
    const balances = this.buildBalanceSummary(employee, policy);

    return {
      balances,
      locationId: employee.locationId?.toString() ?? null,
      policyId: (policy as any)?._id?.toString() ?? null,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // REVIEW
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

    if (newStatus === LeaveStatus.APPROVED) {
      await this.deductLeaveBalance(
        request.employeeId.toString(),
        request.type as LeaveType,
        request.days,
      );
    }

    await this.notifyEmployeeOfReview(request, newStatus, dto.reviewNote);

    return this.leaveModel.findById(requestId).lean() as any;
  }

  // ═══════════════════════════════════════════════════════════
  // CANCEL
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

    return this.leaveModel
      .findByIdAndUpdate(
        requestId,
        { status: LeaveStatus.CANCELLED },
        { new: true },
      )
      .lean() as any;
  }

  // ═══════════════════════════════════════════════════════════
  // SUPPORTING DOCUMENTS
  // ═══════════════════════════════════════════════════════════

  async attachLeaveDocument(
    requestId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<LeaveRequestDocument> {
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) throw new NotFoundException('Employee profile not found');

    const request = await this.leaveModel.findOne({
      _id: requestId,
      employeeId: employee._id,
    });
    if (!request) throw new NotFoundException('Leave request not found');

    request.documents.push({
      name: file.originalname,
      url: `/uploads/leave/documents/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    });
    request.markModified('documents');
    await request.save();
    return request;
  }

  async removeLeaveDocument(
    requestId: string,
    userId: string,
    fileUrl: string,
  ): Promise<LeaveRequestDocument> {
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) throw new NotFoundException('Employee profile not found');

    const request = await this.leaveModel.findOne({
      _id: requestId,
      employeeId: employee._id,
    });
    if (!request) throw new NotFoundException('Leave request not found');

    request.documents = request.documents.filter((d) => d.url !== fileUrl);
    request.markModified('documents');
    await request.save();
    return request;
  }

  // ═══════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════

  async getLeaveStats(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const match = { tenantId: tId };

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

  // Resolve policy for an employee — tries their location, then default (null), then hardcoded
  private async getPolicyForEmployee(
    employee: any,
  ): Promise<LeavePolicyDocument | null> {
    const tId = employee.tenantId;

    // 1. Try location-specific policy
    if (employee.locationId) {
      const locPolicy = await this.policyModel
        .findOne({ tenantId: tId, locationId: employee.locationId })
        .lean();
      if (locPolicy) return locPolicy as any;
    }

    // 2. Fall back to tenant default policy (locationId: null)
    const defaultPolicy = await this.policyModel
      .findOne({ tenantId: tId, locationId: null })
      .lean();
    return defaultPolicy as any;
  }

  private getBalanceFromPolicy(
    policy: any,
    employee: any,
    type: LeaveType,
  ): number {
    // Get entitlement from policy or defaults
    const entitled =
      policy?.policies?.find((p: any) => p.type === type)?.daysAllowed ??
      DEFAULT_POLICY[type] ??
      999;

    // Used days from employee record (only annual/sick are tracked)
    if (type === LeaveType.ANNUAL) {
      return entitled - (employee.annualLeaveUsed ?? 0);
    }
    if (type === LeaveType.SICK) {
      return entitled - (employee.sickLeaveUsed ?? 0);
    }
    return entitled;
  }

  private buildBalanceSummary(employee: any, policy: any) {
    const policyMap: Record<
      string,
      { daysAllowed: number; carryOver: boolean }
    > = {};
    if (policy?.policies) {
      for (const p of policy.policies) {
        policyMap[p.type] = {
          daysAllowed: p.daysAllowed,
          carryOver: p.carryOver ?? false,
        };
      }
    }

    const get = (type: LeaveType) =>
      policyMap[type]?.daysAllowed ?? DEFAULT_POLICY[type] ?? 0;

    const annualAllowed = get(LeaveType.ANNUAL);
    const sickAllowed = get(LeaveType.SICK);

    return [
      {
        type: LeaveType.ANNUAL,
        label: 'Annual Leave',
        daysAllowed: annualAllowed,
        daysUsed: employee.annualLeaveUsed ?? 0,
        daysLeft: annualAllowed - (employee.annualLeaveUsed ?? 0),
        carryOver: policyMap[LeaveType.ANNUAL]?.carryOver ?? false,
      },
      {
        type: LeaveType.SICK,
        label: 'Sick Leave',
        daysAllowed: sickAllowed,
        daysUsed: employee.sickLeaveUsed ?? 0,
        daysLeft: sickAllowed - (employee.sickLeaveUsed ?? 0),
        carryOver: false,
      },
      {
        type: LeaveType.MATERNITY,
        label: 'Maternity Leave',
        daysAllowed: get(LeaveType.MATERNITY),
        daysUsed: 0,
        daysLeft: get(LeaveType.MATERNITY),
        carryOver: false,
      },
      {
        type: LeaveType.PATERNITY,
        label: 'Paternity Leave',
        daysAllowed: get(LeaveType.PATERNITY),
        daysUsed: 0,
        daysLeft: get(LeaveType.PATERNITY),
        carryOver: false,
      },
      {
        type: LeaveType.COMPASSIONATE,
        label: 'Compassionate Leave',
        daysAllowed: get(LeaveType.COMPASSIONATE),
        daysUsed: 0,
        daysLeft: get(LeaveType.COMPASSIONATE),
        carryOver: false,
      },
      {
        type: LeaveType.STUDY,
        label: 'Study Leave',
        daysAllowed: get(LeaveType.STUDY),
        daysUsed: 0,
        daysLeft: get(LeaveType.STUDY),
        carryOver: false,
      },
      {
        type: LeaveType.UNPAID,
        label: 'Unpaid Leave',
        daysAllowed: get(LeaveType.UNPAID),
        daysUsed: 0,
        daysLeft: get(LeaveType.UNPAID),
        carryOver: false,
      },
    ];
  }

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

    if (!field) return;
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
        .select('email firstName')
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
        portalUrl: `${process.env.TENANT_APP_URL}/employee/leave`,
      });
    } catch (err) {
      console.error('Failed to notify employee of leave review:', err.message);
    }
  }

  async getEmployeeLeaveBalance(employeeId: string, tenantId: string) {
    const employee = await this.employeeModel
      .findOne({ _id: employeeId, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!employee) throw new NotFoundException('Employee not found');

    const policy = await this.getPolicyForEmployee(employee);
    const balances = this.buildBalanceSummary(employee, policy);

    return {
      balances,
      locationId: employee.locationId?.toString() ?? null,
    };
  }

  async getEmployeeLeaveHistory(employeeId: string, tenantId: string) {
    return this.leaveModel
      .find({
        employeeId: new Types.ObjectId(employeeId),
        tenantId: new Types.ObjectId(tenantId),
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
  }
}
