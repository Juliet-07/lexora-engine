import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';

import {
  Employee,
  EmployeeDocument,
  EmploymentStatus,
} from '../schemas/employee.schema';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  EmployeeFilterDto,
  TerminateEmployeeDto,
} from '../dtos';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import {
  HrTeam,
  HrTeamDocument,
  HrLocation,
  HrLocationDocument,
} from '../schemas';
import {
  UserType,
  AccountStatus,
} from '../../../common/interfaces/user-role.enum';
import { PaginationDto, paginate } from '../../../common/pagination.dto';
import { EmailService } from '../../../common/utils/mailing/email.service';
import { OffboardingService } from './offboarding.service';

@Injectable()
export class EmployeeService {
  constructor(
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(HrTeam.name)
    private readonly teamModel: Model<HrTeamDocument>,
    @InjectModel(HrLocation.name)
    private readonly locationModel: Model<HrLocationDocument>,
    private readonly offboardingService: OffboardingService,
    private readonly mailService: EmailService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // TEAM (DEPARTMENT) CRUD
  // ═══════════════════════════════════════════════════════════

  async createTeam(
    tenantId: string,
    dto: { name: string; description?: string; lead?: string },
  ): Promise<HrTeamDocument> {
    const existing = await this.teamModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      name: { $regex: `^${dto.name}$`, $options: 'i' },
    });
    if (existing)
      throw new ConflictException(`Team "${dto.name}" already exists`);

    return this.teamModel.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      description: dto.description ?? null,
      lead: dto.lead ?? null,
    });
  }

  async getTeams(tenantId: string): Promise<HrTeamDocument[]> {
    const tId = new Types.ObjectId(tenantId);
    const teams = (await this.teamModel
      .find({ tenantId: tId, isActive: true })
      .sort({ name: 1 })
      .lean()) as any[];

    // Add member count
    const counts = await this.employeeModel.aggregate([
      { $match: { tenantId: tId, employmentStatus: { $ne: 'terminated' } } },
      { $group: { _id: '$teamId', count: { $sum: 1 } } },
    ]);
    const countMap = counts.reduce(
      (m, c) => {
        m[c._id?.toString()] = c.count;
        return m;
      },
      {} as Record<string, number>,
    );

    return teams.map((t) => ({
      ...t,
      memberCount: countMap[t._id.toString()] ?? 0,
    }));
  }

  async updateTeam(
    tenantId: string,
    teamId: string,
    dto: { name?: string; description?: string; lead?: string },
  ): Promise<HrTeamDocument> {
    const team = await this.teamModel.findOneAndUpdate(
      { _id: teamId, tenantId: new Types.ObjectId(tenantId) },
      { $set: dto },
      { new: true },
    );
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }

  async deleteTeam(tenantId: string, teamId: string): Promise<void> {
    const count = await this.employeeModel.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
      teamId: new Types.ObjectId(teamId),
      employmentStatus: { $nin: ['terminated', 'resigned'] },
    });
    if (count > 0) {
      throw new BadRequestException(
        `Cannot delete team — ${count} active employee(s) are assigned to it. Reassign them first.`,
      );
    }
    await this.teamModel.findOneAndDelete({
      _id: teamId,
      tenantId: new Types.ObjectId(tenantId),
    });
  }

  // ═══════════════════════════════════════════════════════════
  // LOCATION (BRANCH) CRUD
  // ═══════════════════════════════════════════════════════════

  async createLocation(
    tenantId: string,
    dto: {
      name: string;
      country: string;
      city?: string;
      address?: string;
      timezone?: string;
    },
  ): Promise<HrLocationDocument> {
    const existing = await this.locationModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      name: { $regex: `^${dto.name}$`, $options: 'i' },
    });
    if (existing)
      throw new ConflictException(`Location "${dto.name}" already exists`);

    return this.locationModel.create({
      tenantId: new Types.ObjectId(tenantId),
      ...dto,
      city: dto.city ?? null,
      address: dto.address ?? null,
      timezone: dto.timezone ?? null,
    });
  }

  async getLocations(tenantId: string): Promise<HrLocationDocument[]> {
    const tId = new Types.ObjectId(tenantId);
    const locations = (await this.locationModel
      .find({ tenantId: tId, isActive: true })
      .sort({ name: 1 })
      .lean()) as any[];

    // Add member count
    const counts = await this.employeeModel.aggregate([
      { $match: { tenantId: tId, employmentStatus: { $ne: 'terminated' } } },
      { $group: { _id: '$locationId', count: { $sum: 1 } } },
    ]);
    const countMap = counts.reduce(
      (m, c) => {
        m[c._id?.toString()] = c.count;
        return m;
      },
      {} as Record<string, number>,
    );

    return locations.map((l) => ({
      ...l,
      memberCount: countMap[l._id.toString()] ?? 0,
    }));
  }

  async updateLocation(
    tenantId: string,
    locationId: string,
    dto: {
      name?: string;
      country?: string;
      city?: string;
      address?: string;
      timezone?: string;
    },
  ): Promise<HrLocationDocument> {
    const loc = await this.locationModel.findOneAndUpdate(
      { _id: locationId, tenantId: new Types.ObjectId(tenantId) },
      { $set: dto },
      { new: true },
    );
    if (!loc) throw new NotFoundException('Location not found');
    return loc;
  }

  async deleteLocation(tenantId: string, locationId: string): Promise<void> {
    const count = await this.employeeModel.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
      locationId: new Types.ObjectId(locationId),
      employmentStatus: { $nin: ['terminated', 'resigned'] },
    });
    if (count > 0) {
      throw new BadRequestException(
        `Cannot delete location — ${count} active employee(s) are assigned to it. Reassign them first.`,
      );
    }
    await this.locationModel.findOneAndDelete({
      _id: locationId,
      tenantId: new Types.ObjectId(tenantId),
    });
  }

  // ═══════════════════════════════════════════════════════════
  // CREATE EMPLOYEE
  // ═══════════════════════════════════════════════════════════

  async createEmployee(
    dto: CreateEmployeeDto,
    tenantId: string,
    createdBy: string,
  ): Promise<EmployeeDocument> {
    const tId = new Types.ObjectId(tenantId);

    // ── Validate team exists ─────────────────────────────────
    if (dto.teamId) {
      const team = await this.teamModel.findOne({
        _id: new Types.ObjectId(dto.teamId),
        tenantId: tId,
      });
      if (!team) throw new NotFoundException('Team not found');
    }

    // ── Validate location exists ─────────────────────────────
    if (dto.locationId) {
      const loc = await this.locationModel.findOne({
        _id: new Types.ObjectId(dto.locationId),
        tenantId: tId,
      });
      if (!loc) throw new NotFoundException('Location not found');
    }

    // ── Check email not already used ─────────────────────────
    const emailTaken = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (emailTaken) {
      throw new ConflictException(
        'This email is already registered on the platform',
      );
    }

    // ── Generate employee number ─────────────────────────────
    const count = await this.employeeModel.countDocuments({ tenantId: tId });
    const employeeNumber = `EMP-${String(count + 1).padStart(4, '0')}`;

    // ── Create portal User account ───────────────────────────
    // Employees log into the TENANT app — UserType.EMPLOYEE
    const tempPassword = this.generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const user = await this.userModel.create({
      userType: UserType.EMPLOYEE,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email.toLowerCase(),
      password: hashedPassword,
      phone: dto.phone ?? null,
      roles: [], // employees have no platform roles
      status: AccountStatus.ACTIVE,
      tenantId: tId,
      mustChangePassword: true,
    });

    // ── Create employee record ────────────────────────────────
    const employee = await this.employeeModel.create({
      tenantId: tId,
      teamId: dto.teamId ? new Types.ObjectId(dto.teamId) : null,
      locationId: dto.locationId ? new Types.ObjectId(dto.locationId) : null,
      userId: user._id,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email.toLowerCase(),
      phone: dto.phone ?? null,
      gender: dto.gender ?? null,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
      nationality: dto.nationality ?? null,
      nationalId: dto.nationalId ?? null,
      address: dto.address ?? null,
      emergencyContactName: dto.emergencyContactName ?? null,
      emergencyContactPhone: dto.emergencyContactPhone ?? null,
      employeeNumber,
      jobTitle: dto.jobTitle,
      reportsTo: dto.reportsTo ?? null,
      employmentType: dto.employmentType ?? 'full_time',
      employmentStatus: dto.probationEndDate
        ? EmploymentStatus.PROBATION
        : EmploymentStatus.ACTIVE,
      startDate: new Date(dto.startDate),
      probationEndDate: dto.probationEndDate
        ? new Date(dto.probationEndDate)
        : null,
      salary: dto.salary ?? null,
      salaryCurrency: dto.salaryCurrency ?? 'RWF',
      salaryFrequency: dto.salaryFrequency ?? 'monthly',
      bankName: dto.bankName ?? null,
      bankAccountNumber: dto.bankAccountNumber ?? null,
      taxId: dto.taxId ?? null,
      annualLeaveBalance: dto.annualLeaveBalance ?? 21,
      sickLeaveBalance: dto.sickLeaveBalance ?? 10,
      metadata: { createdBy },
    });

    // ── Get tenant business name for welcome email ────────────
    const tenant = await this.userModel
      .findById(tId)
      .select('tenantProfile firstName')
      .lean();
    const businessName =
      (tenant as any)?.tenantProfile?.businessName ||
      (tenant as any)?.firstName ||
      'Your Organization';

    // ── Send welcome email — login URL is the TENANT app ─────
    await this.mailService.sendEmployeeWelcome({
      to: dto.email,
      firstName: dto.firstName,
      businessName,
      employeeNumber,
      jobTitle: dto.jobTitle,
      tempPassword,
      loginUrl: `${process.env.TENANT_APP_URL}/login`,
    });

    return employee;
  }

  // ═══════════════════════════════════════════════════════════
  // GET EMPLOYEES
  // ═══════════════════════════════════════════════════════════

  async getEmployees(
    tenantId: string,
    pagination: PaginationDto,
    filters: EmployeeFilterDto,
  ) {
    const { skip, limit, page } = pagination;
    const query: any = { tenantId: new Types.ObjectId(tenantId) };

    if (filters.teamId) query.teamId = new Types.ObjectId(filters.teamId);
    if (filters.locationId)
      query.locationId = new Types.ObjectId(filters.locationId);
    if (filters.employmentStatus)
      query.employmentStatus = filters.employmentStatus;
    if (filters.employmentType) query.employmentType = filters.employmentType;
    if (filters.search) {
      query.$or = [
        { firstName: { $regex: filters.search, $options: 'i' } },
        { lastName: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
        { employeeNumber: { $regex: filters.search, $options: 'i' } },
        { jobTitle: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.employeeModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ firstName: 1 })
        .populate('teamId', 'name description lead')
        .populate('locationId', 'name country city')
        .lean(),
      this.employeeModel.countDocuments(query),
    ]);

    return paginate(items, total, page, limit);
  }

  async getEmployeeById(
    employeeId: string,
    tenantId: string,
  ): Promise<EmployeeDocument> {
    const employee = await this.employeeModel
      .findOne({ _id: employeeId, tenantId: new Types.ObjectId(tenantId) })
      .populate('teamId', 'name description lead')
      .populate('locationId', 'name country city timezone')
      .populate('userId', 'email status')
      .lean();

    if (!employee) throw new NotFoundException('Employee not found');
    return employee as EmployeeDocument;
  }

  async getEmployeeStats(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);

    const [
      total,
      byStatus,
      byTeam,
      byLocation,
      recentJoins,
      teamCount,
      locationCount,
    ] = await Promise.all([
      this.employeeModel.countDocuments({ tenantId: tId }),
      this.employeeModel.aggregate([
        { $match: { tenantId: tId } },
        { $group: { _id: '$employmentStatus', count: { $sum: 1 } } },
      ]),
      this.employeeModel.aggregate([
        {
          $match: { tenantId: tId, employmentStatus: EmploymentStatus.ACTIVE },
        },
        { $group: { _id: '$teamId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.employeeModel.aggregate([
        {
          $match: { tenantId: tId, employmentStatus: EmploymentStatus.ACTIVE },
        },
        { $group: { _id: '$locationId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.employeeModel
        .find({ tenantId: tId })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('teamId', 'name')
        .populate('locationId', 'name')
        .select('firstName lastName jobTitle teamId locationId startDate')
        .lean(),
      this.teamModel.countDocuments({ tenantId: tId, isActive: true }),
      this.locationModel.countDocuments({ tenantId: tId, isActive: true }),
    ]);

    const statusMap = byStatus.reduce(
      (m, s) => ({ ...m, [s._id]: s.count }),
      {} as Record<string, number>,
    );

    return {
      total,
      active: statusMap[EmploymentStatus.ACTIVE] ?? 0,
      onLeave: statusMap[EmploymentStatus.ON_LEAVE] ?? 0,
      probation: statusMap[EmploymentStatus.PROBATION] ?? 0,
      terminated: statusMap[EmploymentStatus.TERMINATED] ?? 0,
      teamCount,
      locationCount,
      byTeam,
      byLocation,
      recentJoins,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // UPDATE / TERMINATE
  // ═══════════════════════════════════════════════════════════

  async updateEmployee(
    employeeId: string,
    tenantId: string,
    dto: UpdateEmployeeDto,
  ): Promise<EmployeeDocument> {
    const update: any = { ...dto };
    if (dto.startDate) update.startDate = new Date(dto.startDate);
    if (dto.endDate) update.endDate = new Date(dto.endDate);
    if (dto.dateOfBirth) update.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.probationEndDate)
      update.probationEndDate = new Date(dto.probationEndDate);
    if (dto.teamId) update.teamId = new Types.ObjectId(dto.teamId);
    if (dto.locationId) update.locationId = new Types.ObjectId(dto.locationId);

    const employee = await this.employeeModel
      .findOneAndUpdate(
        { _id: employeeId, tenantId: new Types.ObjectId(tenantId) },
        { $set: update },
        { new: true },
      )
      .lean();

    if (!employee) throw new NotFoundException('Employee not found');

    if (dto.firstName || dto.lastName || dto.phone) {
      const userUpdate: any = {};
      if (dto.firstName) userUpdate.firstName = dto.firstName;
      if (dto.lastName) userUpdate.lastName = dto.lastName;
      if (dto.phone) userUpdate.phone = dto.phone;
      await this.userModel.findByIdAndUpdate(
        (employee as any).userId,
        userUpdate,
      );
    }

    return employee as EmployeeDocument;
  }

  async terminateEmployee(
    tenantId: string,
    employeeId: string,
    dto: TerminateEmployeeDto,
  ): Promise<EmployeeDocument> {
    const employee = await this.employeeModel.findOne({
      _id: employeeId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!employee) throw new NotFoundException('Employee not found');

    employee.employmentStatus = dto.status as any;
    employee.endDate = new Date(dto.endDate);
    await employee.save();

    if (dto.status !== 'terminated' && dto.status !== 'resigned') {
      throw new BadRequestException(
        'Offboarding can only be triggered for a "terminated" or "resigned" status.',
      );
    }

    await this.offboardingService.createFromTermination({
      tenantId,
      employeeId: (employee._id as any).toString(),
      employeeName: `${employee.firstName} ${employee.lastName}`,
      jobTitle: employee.jobTitle,
      endDate: new Date(dto.endDate),
      reason: dto.reason ?? null,
      status: dto.status,
    });

    return employee;
  }

  // ═══════════════════════════════════════════════════════════
  // EMPLOYEE SELF-SERVICE
  // ═══════════════════════════════════════════════════════════

  async getMyProfile(userId: string): Promise<EmployeeDocument> {
    const employee = await this.employeeModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .populate('teamId', 'name description lead')
      .populate('locationId', 'name country city')
      .lean();

    if (!employee) throw new NotFoundException('Employee profile not found');
    return employee as EmployeeDocument;
  }

  async updateMyProfile(
    userId: string,
    dto: {
      phone?: string;
      dateOfBirth?: string;
      address?: {
        street?: string;
        city?: string;
        state?: string;
        country?: string;
      };
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      bankName?: string;
      bankAccountNumber?: string;
      nationality?: string;
      nationalId?: string;
    },
  ): Promise<EmployeeDocument> {
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) throw new NotFoundException('Employee profile not found');

    const update: any = {};
    if (dto.phone !== undefined) update.phone = dto.phone;
    if (dto.dateOfBirth !== undefined)
      update.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    if (dto.address !== undefined) update.address = dto.address;
    if (dto.emergencyContactName !== undefined)
      update.emergencyContactName = dto.emergencyContactName;
    if (dto.emergencyContactPhone !== undefined)
      update.emergencyContactPhone = dto.emergencyContactPhone;
    if (dto.nationality !== undefined) update.nationality = dto.nationality;
    if (dto.nationalId !== undefined) update.nationalId = dto.nationalId;
    if (dto.bankName !== undefined) update.bankName = dto.bankName;
    if (dto.bankAccountNumber !== undefined)
      update.bankAccountNumber = dto.bankAccountNumber;

    const updated = await this.employeeModel
      .findByIdAndUpdate(employee._id, { $set: update }, { new: true })
      .lean();

    if (dto.phone) {
      await this.userModel.findByIdAndUpdate(userId, { phone: dto.phone });
    }

    return updated as EmployeeDocument;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const special = '@#$!';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    pass += special.charAt(Math.floor(Math.random() * special.length));
    pass += Math.floor(Math.random() * 9);
    return pass;
  }
}
