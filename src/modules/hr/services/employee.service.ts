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
  EmployeeHierarchyRole,
  EmploymentStatus,
} from '../schemas/employee.schema';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  EmployeeFilterDto,
  TerminateEmployeeDto,
  SuspendEmployeeDto,
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
import { EventEmitter2 } from '@nestjs/event-emitter';
// import { ProbationService } from './probation.service';

export interface DirectoryEmployee {
  _id: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
}

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
    private readonly eventEmitter: EventEmitter2,
    // private readonly probationService: ProbationService,
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

    const hods = await this.employeeModel
      .find({
        tenantId: tId,
        hierarchyRole: EmployeeHierarchyRole.HEAD_OF_DEPARTMENT,
        employmentStatus: { $nin: ['terminated', 'resigned'] },
      })
      .select('teamId firstName lastName jobTitle')
      .lean();
    const hodMap = hods.reduce(
      (m, h: any) => {
        if (h.teamId) m[h.teamId.toString()] = h;
        return m;
      },
      {} as Record<string, any>,
    );

    return teams.map((t) => {
      const hod = hodMap[t._id.toString()] ?? null;
      return {
        ...t,
        memberCount: countMap[t._id.toString()] ?? 0,
        headOfDepartment: hod
          ? {
              _id: hod._id.toString(),
              firstName: hod.firstName,
              lastName: hod.lastName,
              jobTitle: hod.jobTitle,
            }
          : null,
      };
    });
  }

  async updateTeam(
    tenantId: string,
    teamId: string,
    dto: { name?: string; description?: string },
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

  async getEmployeesByHierarchyRole(
    tenantId: string,
    role: EmployeeHierarchyRole,
  ): Promise<EmployeeDocument[]> {
    return this.employeeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        hierarchyRole: role,
        employmentStatus: { $nin: ['terminated', 'resigned'] },
      })
      .select('firstName lastName jobTitle employeeNumber teamId')
      .sort({ firstName: 1 })
      .lean() as any;
  }

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

    // ── Validate hierarchy role + reporting relationship ─────
    const hierarchyRole = dto.hierarchyRole ?? EmployeeHierarchyRole.REGULAR;
    let reportsToManagerId: Types.ObjectId | null = null;
    let reportsToTenantId: Types.ObjectId | null = null;

    if (hierarchyRole === EmployeeHierarchyRole.HEAD_OF_DEPARTMENT) {
      if (dto.reportsToManagerId) {
        throw new BadRequestException(
          'A Head of Department does not report to another employee — leave reportsToManagerId unset.',
        );
      }
      if (!dto.teamId) {
        throw new BadRequestException(
          'A Head of Department must be assigned to a team (the department they head).',
        );
      }

      // ── One active HoD per team — confirmed invariant ──
      const existingHod = await this.employeeModel.findOne({
        tenantId: tId,
        teamId: new Types.ObjectId(dto.teamId),
        hierarchyRole: EmployeeHierarchyRole.HEAD_OF_DEPARTMENT,
        employmentStatus: { $nin: ['terminated', 'resigned'] },
      });
      if (existingHod) {
        throw new ConflictException(
          `${existingHod.firstName} ${existingHod.lastName} is already the Head of Department for this team. Terminate/reassign them first, or choose a different team.`,
        );
      }

      reportsToTenantId = tId;
    } else {
      if (!dto.reportsToManagerId) {
        throw new BadRequestException(
          hierarchyRole === EmployeeHierarchyRole.MANAGER
            ? 'A Manager must report to a Head of Department.'
            : 'An employee must report to a Manager.',
        );
      }

      const expectedRole =
        hierarchyRole === EmployeeHierarchyRole.MANAGER
          ? EmployeeHierarchyRole.HEAD_OF_DEPARTMENT
          : EmployeeHierarchyRole.MANAGER;

      const target = await this.employeeModel.findOne({
        _id: new Types.ObjectId(dto.reportsToManagerId),
        tenantId: tId,
      });

      if (!target) {
        throw new NotFoundException('The selected manager/HoD was not found.');
      }
      if (target.hierarchyRole !== expectedRole) {
        throw new BadRequestException(
          hierarchyRole === EmployeeHierarchyRole.MANAGER
            ? 'The selected person is not a Head of Department.'
            : 'The selected person is not a Manager.',
        );
      }

      if (!dto.teamId) {
        throw new BadRequestException(
          'A team must be selected — it must match the team of the manager/HoD being reported to.',
        );
      }
      if (target.teamId?.toString() !== dto.teamId) {
        throw new BadRequestException(
          hierarchyRole === EmployeeHierarchyRole.MANAGER
            ? 'This Head of Department belongs to a different team than the one selected.'
            : 'This Manager belongs to a different team than the one selected.',
        );
      }

      reportsToManagerId = target._id as Types.ObjectId;
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
      hierarchyRole,
      reportsToManagerId,
      reportsToTenantId,
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

    // if (dto.probationEndDate) {
    //   await this.probationService.createProbationRecord(
    //     tenantId,
    //     (employee._id as Types.ObjectId).toString(),
    //     new Date(dto.probationEndDate),
    //   );
    // }

    if (dto.probationEndDate) {
      this.eventEmitter.emit('employee.probation.started', {
        tenantId,
        employeeId: (employee._id as Types.ObjectId).toString(),
        probationEndDate: new Date(dto.probationEndDate),
      });
    }
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
      loginUrl: `${process.env.TENANT_APP_URL}`,
    });

    return employee;
  }

  async resendWelcomeEmail(
    tenantId: string,
    employeeId: string,
  ): Promise<{ message: string }> {
    // 1. Find the employee, scoped to this tenant
    const employee = await this.employeeModel.findOne({
      _id: new Types.ObjectId(employeeId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!employee) throw new NotFoundException('Employee not found.');

    // 2. Find their linked User record
    const user = await this.userModel.findById(employee.userId);
    if (!user)
      throw new NotFoundException('User account not found for this employee.');

    // ── COOLDOWN CHECK ───────────────────────────────────────────
    // Enforce 5-minute minimum between resend attempts.
    // Prevents multiple passwords being "in flight" simultaneously,
    // which causes the stale-password race condition.
    if (user.lastWelcomeEmailSentAt) {
      const minutesSinceLastSend =
        (Date.now() - new Date(user.lastWelcomeEmailSentAt).getTime()) /
        (1000 * 60);
      if (minutesSinceLastSend < 5) {
        const remaining = Math.ceil(5 - minutesSinceLastSend);
        throw new BadRequestException(
          `Please wait ${remaining} more minute${remaining !== 1 ? 's' : ''} before resending.`,
        );
      }
    }

    // 3. Generate a new temp password — same method as createEmployee()
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // 4. Update the user's password and flag mustChangePassword
    await this.userModel.findByIdAndUpdate(user._id, {
      password: hashedPassword,
      mustChangePassword: true,
      lastWelcomeEmailSentAt: new Date(),
    });

    // 5. Fetch tenant businessName — same pattern as createEmployee()
    const tenant = await this.userModel
      .findById(tenantId)
      .select('tenantProfile')
      .lean();

    // ADD THIS TEMPORARILY:
    const verify = await this.userModel
      .findById(user._id)
      .select('+password')
      .lean();
    console.log('[resend] stored hash:', verify?.password);
    console.log('[resend] tempPassword:', tempPassword);
    console.log(
      '[resend] bcrypt verify:',
      await bcrypt.compare(tempPassword, verify?.password ?? ''),
    );

    // 6. Send the welcome email using the same mailService call
    await this.mailService.sendEmployeeWelcome({
      to: employee.email,
      firstName: employee.firstName,
      businessName: (tenant as any)?.tenantProfile?.businessName ?? '',
      jobTitle: employee.jobTitle,
      employeeNumber: employee.employeeNumber,
      tempPassword,
      loginUrl: `${process.env.TENANT_APP_URL}/login`,
    });

    return { message: 'Welcome email resent successfully.' };
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

  async getEmployeeDirectory(tenantId: string): Promise<DirectoryEmployee[]> {
    const employees = await this.employeeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        employmentStatus: {
          $nin: [EmploymentStatus.TERMINATED, EmploymentStatus.RESIGNED],
        },
      })
      .select('firstName lastName jobTitle')
      .sort({ firstName: 1 })
      .lean();

    return employees.map((e) => ({
      _id: (e._id as Types.ObjectId).toString(),
      firstName: e.firstName,
      lastName: e.lastName,
      jobTitle: e.jobTitle,
    }));
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
      .populate('reportsToManagerId', 'firstName lastName jobTitle')
      .populate('reportsToTenantId', 'firstName lastName')
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

    if (
      dto.hierarchyRole !== undefined ||
      dto.reportsToManagerId !== undefined
    ) {
      const current = await this.employeeModel.findOne({
        _id: employeeId,
        tenantId: new Types.ObjectId(tenantId),
      });
      if (!current) throw new NotFoundException('Employee not found');

      const newRole = dto.hierarchyRole ?? current.hierarchyRole;
      const newTeamId = dto.teamId ?? current.teamId?.toString();

      const directReportCount = await this.employeeModel.countDocuments({
        tenantId: new Types.ObjectId(tenantId),
        reportsToManagerId: current._id,
        employmentStatus: { $nin: ['terminated', 'resigned'] },
      });

      if (directReportCount > 0 && newRole !== current.hierarchyRole) {
        throw new BadRequestException(
          `Cannot change this person's role — ${directReportCount} employee(s) currently report to them. Reassign those reports first.`,
        );
      }

      if (newRole === EmployeeHierarchyRole.HEAD_OF_DEPARTMENT) {
        if (dto.reportsToManagerId) {
          throw new BadRequestException(
            'A Head of Department does not report to another employee.',
          );
        }
        update.reportsToManagerId = null;
        update.reportsToTenantId = new Types.ObjectId(tenantId);
      } else {
        const targetId =
          dto.reportsToManagerId ?? current.reportsToManagerId?.toString();
        if (!targetId) {
          throw new BadRequestException(
            newRole === EmployeeHierarchyRole.MANAGER
              ? 'A Manager must report to a Head of Department.'
              : 'An employee must report to a Manager.',
          );
        }

        const expectedRole =
          newRole === EmployeeHierarchyRole.MANAGER
            ? EmployeeHierarchyRole.HEAD_OF_DEPARTMENT
            : EmployeeHierarchyRole.MANAGER;

        const target = await this.employeeModel.findOne({
          _id: new Types.ObjectId(targetId),
          tenantId: new Types.ObjectId(tenantId),
        });
        if (!target || target.hierarchyRole !== expectedRole) {
          throw new BadRequestException(
            newRole === EmployeeHierarchyRole.MANAGER
              ? 'The selected person is not a Head of Department.'
              : 'The selected person is not a Manager.',
          );
        }
        if (target.teamId?.toString() !== newTeamId) {
          throw new BadRequestException(
            'The selected manager/HoD belongs to a different team.',
          );
        }

        update.reportsToManagerId = target._id;
        update.reportsToTenantId = null;
      }

      update.hierarchyRole = newRole;
    }

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

  async suspendEmployee(
    tenantId: string,
    employeeId: string,
    dto: SuspendEmployeeDto,
  ): Promise<EmployeeDocument> {
    const employee = await this.employeeModel.findOne({
      _id: employeeId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!employee) throw new NotFoundException('Employee not found');

    if (
      [EmploymentStatus.TERMINATED, EmploymentStatus.RESIGNED].includes(
        employee.employmentStatus,
      )
    ) {
      throw new BadRequestException(
        'Cannot suspend someone who has already left the organization.',
      );
    }
    if (employee.employmentStatus === EmploymentStatus.SUSPENDED) {
      throw new ConflictException('This employee is already suspended.');
    }

    const endDate = new Date(dto.endDate);
    if (endDate <= new Date()) {
      throw new BadRequestException(
        'Suspension end date must be in the future.',
      );
    }

    employee.employmentStatus = EmploymentStatus.SUSPENDED;
    employee.suspensionReason = dto.reason;
    employee.suspensionStartDate = new Date();
    employee.suspensionEndDate = endDate;
    if (dto.contractId) {
      employee.suspensionLetterContractId = new Types.ObjectId(dto.contractId);
    }
    await employee.save();

    if (employee.userId) {
      await this.userModel.findByIdAndUpdate(employee.userId, {
        status: AccountStatus.SUSPENDED,
      });
    }

    return employee;
  }

  // Manual early end to a suspension — the automatic path (login
  // time, once suspensionEndDate has passed) is separate, in
  // AuthService.login.
  async reinstateEmployee(
    tenantId: string,
    employeeId: string,
  ): Promise<EmployeeDocument> {
    const employee = await this.employeeModel.findOne({
      _id: employeeId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!employee) throw new NotFoundException('Employee not found');
    if (employee.employmentStatus !== EmploymentStatus.SUSPENDED) {
      throw new BadRequestException(
        'This employee is not currently suspended.',
      );
    }

    employee.employmentStatus = EmploymentStatus.ACTIVE;
    employee.suspensionReason = null;
    employee.suspensionStartDate = null;
    employee.suspensionEndDate = null;
    await employee.save();

    if (employee.userId) {
      await this.userModel.findByIdAndUpdate(employee.userId, {
        status: AccountStatus.ACTIVE,
      });
    }

    return employee;
  }

  async terminateEmployee(
    tenantId: string,
    employeeId: string,
    dto: TerminateEmployeeDto,
  ): Promise<EmployeeDocument> {
    console.log('[terminateEmployee] DEBUG', {
      employeeId,
      employeeIdType: typeof employeeId,
      employeeIdLength: employeeId?.length,
      isValidObjectId: Types.ObjectId.isValid(employeeId),
      tenantId,
      tenantIdType: typeof tenantId,
    });

    const employee = await this.employeeModel.findOne({
      _id: employeeId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const directReportCount = await this.employeeModel.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
      reportsToManagerId: employee._id,
      employmentStatus: { $nin: ['terminated', 'resigned'] },
    });

    if (directReportCount > 0) {
      if (!dto.reassignDirectReportsTo) {
        throw new BadRequestException(
          `${employee.firstName} ${employee.lastName} has ${directReportCount} employee(s) reporting to them. Choose a replacement, or explicitly clear their reporting line, before terminating.`,
        );
      }

      const target =
        dto.reassignDirectReportsTo === 'clear'
          ? null
          : new Types.ObjectId(dto.reassignDirectReportsTo);

      if (target) {
        const replacement = await this.employeeModel.findById(target);
        if (!replacement) {
          throw new NotFoundException(
            'The selected replacement was not found.',
          );
        }
      }

      await this.reassignDirectReports(
        new Types.ObjectId(tenantId),
        employee._id as Types.ObjectId,
        target,
      );
    }

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

    // Only actual terminations get this notice — resignations are
    // voluntary, the employee already knows.
    if (dto.status === EmploymentStatus.TERMINATED) {
      const tenant = await this.userModel
        .findById(tenantId)
        .select('tenantProfile firstName')
        .lean();
      const businessName =
        (tenant as any)?.tenantProfile?.businessName ||
        (tenant as any)?.firstName ||
        'Your Organization';

      await this.mailService
        .sendEmployeeTerminated({
          to: employee.email,
          firstName: employee.firstName,
          businessName,
          endDate: employee.endDate as Date,
          reason: dto.reason ?? null,
        })
        .catch(() => {
          // Don't let an email failure undo the termination itself.
        });
    }

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
      .populate('reportsToManagerId', 'firstName lastName jobTitle')
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
      educationLevel?: string;
      occupationalCategory?: string;
      hasDisability?: boolean;
      disabilityNote?: string;
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
    if (dto.educationLevel !== undefined)
      update.educationLevel = dto.educationLevel;
    if (dto.occupationalCategory !== undefined)
      update.occupationalCategory = dto.occupationalCategory;
    if (dto.hasDisability !== undefined)
      update.hasDisability = dto.hasDisability;
    if (dto.disabilityNote !== undefined)
      update.disabilityNote = dto.disabilityNote;

    const updated = await this.employeeModel
      .findByIdAndUpdate(employee._id, { $set: update }, { new: true })
      .lean();

    if (dto.phone) {
      await this.userModel.findByIdAndUpdate(userId, { phone: dto.phone });
    }

    return updated as EmployeeDocument;
  }

  // ═══════════════════════════════════════════════════════════
  // REPORTING SYSTEM
  // ═══════════════════════════════════════════════════════════

  async getDirectReports(managerUserId: string): Promise<EmployeeDocument[]> {
    const manager = await this.employeeModel.findOne({
      userId: new Types.ObjectId(managerUserId),
    });
    if (!manager) throw new NotFoundException('Employee profile not found');

    if (manager.hierarchyRole !== EmployeeHierarchyRole.MANAGER) {
      throw new BadRequestException('Only a Manager has direct reports.');
    }

    return this.employeeModel
      .find({
        tenantId: manager.tenantId,
        reportsToManagerId: manager._id,
        employmentStatus: { $nin: ['terminated', 'resigned'] },
      })
      .populate('teamId', 'name')
      .populate('locationId', 'name')
      .sort({ firstName: 1 })
      .lean() as any;
  }

  async getDirectReportsOf(
    tenantId: string,
    employeeId: string,
  ): Promise<EmployeeDocument[]> {
    return this.employeeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        reportsToManagerId: new Types.ObjectId(employeeId),
        employmentStatus: { $nin: ['terminated', 'resigned'] },
      })
      .select('firstName lastName jobTitle teamId locationId')
      .populate('teamId', 'name')
      .populate('locationId', 'name')
      .sort({ firstName: 1 })
      .lean() as any;
  }

  async getDepartmentTree(hodUserId: string): Promise<{
    managers: (EmployeeDocument & { directReports: EmployeeDocument[] })[];
  }> {
    const hod = await this.employeeModel.findOne({
      userId: new Types.ObjectId(hodUserId),
    });
    if (!hod) throw new NotFoundException('Employee profile not found');

    if (hod.hierarchyRole !== EmployeeHierarchyRole.HEAD_OF_DEPARTMENT) {
      throw new BadRequestException(
        'Only a Head of Department has a department tree.',
      );
    }

    const managers = await this.employeeModel
      .find({
        tenantId: hod.tenantId,
        reportsToManagerId: hod._id,
        teamId: hod.teamId,
        employmentStatus: { $nin: ['terminated', 'resigned'] },
      })
      .populate('teamId', 'name')
      .populate('locationId', 'name')
      .sort({ firstName: 1 })
      .lean();

    if (managers.length === 0) {
      return { managers: [] };
    }

    const managerIds = managers.map((m) => m._id);
    const allReports = await this.employeeModel
      .find({
        tenantId: hod.tenantId,
        reportsToManagerId: { $in: managerIds },
        teamId: hod.teamId, // ADDED: same reasoning
        employmentStatus: { $nin: ['terminated', 'resigned'] },
      })
      .populate('teamId', 'name')
      .sort({ firstName: 1 })
      .lean();

    const reportsByManagerId = new Map<string, any[]>();
    for (const emp of allReports) {
      const key = (emp as any).reportsToManagerId.toString();
      if (!reportsByManagerId.has(key)) reportsByManagerId.set(key, []);
      reportsByManagerId.get(key)!.push(emp);
    }

    return {
      managers: managers.map((m) => ({
        ...m,
        directReports: reportsByManagerId.get((m._id as any).toString()) ?? [],
      })) as any,
    };
  }

  // async getDepartmentTeam(hodUserId: string) {
  //   const hod = await this.employeeModel.findOne({
  //     userId: new Types.ObjectId(hodUserId),
  //   });
  //   if (!hod || hod.hierarchyRole !== 'head_of_department') return [];

  //   // HOP 1: managers who report to this HoD
  //   const managers = await this.employeeModel
  //     .find({
  //       reportsToManagerId: hod._id,
  //       hierarchyRole: 'manager',
  //       employmentStatus: { $nin: ['terminated', 'resigned'] },
  //     })
  //     .populate('teamId', 'name')
  //     .populate('locationId', 'name')
  //     .lean();

  //   const managerIds = managers.map((m) => m._id);

  //   // HOP 2: regulars who report to those managers
  //   const regulars =
  //     managerIds.length === 0
  //       ? []
  //       : await this.employeeModel
  //           .find({
  //             reportsToManagerId: { $in: managerIds },
  //             employmentStatus: { $nin: ['terminated', 'resigned'] },
  //           })
  //           .populate('teamId', 'name')
  //           .populate('locationId', 'name')
  //           .lean();

  //   // Return flat array — frontend groups by teamId?.name itself
  //   return [...managers, ...regulars];
  // }

  async promoteManagerToHeadOfDepartment(
    tenantId: string,
    teamId: string,
    promotedManagerId: string,
    regularsReassignToManagerId: string | null, // null ONLY valid if promotedManager has zero Regular reports
  ): Promise<{
    newHod: EmployeeDocument;
    reassignedManagers: number;
    reassignedRegulars: number;
  }> {
    const tId = new Types.ObjectId(tenantId);
    const tmId = new Types.ObjectId(teamId);

    const promotedManager = await this.employeeModel.findOne({
      _id: new Types.ObjectId(promotedManagerId),
      tenantId: tId,
      teamId: tmId,
      hierarchyRole: EmployeeHierarchyRole.MANAGER,
    });
    if (!promotedManager) {
      throw new NotFoundException('This person is not a Manager in this team.');
    }

    const currentHod = await this.employeeModel.findOne({
      tenantId: tId,
      teamId: tmId,
      hierarchyRole: EmployeeHierarchyRole.HEAD_OF_DEPARTMENT,
      employmentStatus: { $nin: ['terminated', 'resigned'] },
    });
    if (!currentHod) {
      throw new BadRequestException(
        'This team has no current Head of Department to replace.',
      );
    }
    if ((currentHod._id as any).toString() === promotedManagerId) {
      throw new BadRequestException(
        'This person is already the Head of Department.',
      );
    }

    // Check the promoted Manager's own Regular reports FIRST — fail
    // fast, before making any other change, if the required
    // reassignment target is missing or invalid.
    const regularReportCount = await this.employeeModel.countDocuments({
      tenantId: tId,
      reportsToManagerId: promotedManager._id,
      employmentStatus: { $nin: ['terminated', 'resigned'] },
    });

    let validatedRegularsTarget: Types.ObjectId | null = null;
    if (regularReportCount > 0) {
      if (!regularsReassignToManagerId) {
        throw new BadRequestException(
          `${promotedManager.firstName} ${promotedManager.lastName} has ${regularReportCount} employee(s) reporting to them. Choose another Manager in this team to take them over before promoting.`,
        );
      }
      const newManagerTarget = await this.employeeModel.findOne({
        _id: new Types.ObjectId(regularsReassignToManagerId),
        tenantId: tId,
        teamId: tmId,
        hierarchyRole: EmployeeHierarchyRole.MANAGER,
        employmentStatus: { $nin: ['terminated', 'resigned'] },
      });
      if (!newManagerTarget) {
        throw new BadRequestException(
          'The selected replacement Manager was not found in this team.',
        );
      }
      if ((newManagerTarget._id as any).toString() === promotedManagerId) {
        throw new BadRequestException(
          'Cannot reassign reports to the same person being promoted.',
        );
      }
      validatedRegularsTarget = newManagerTarget._id as Types.ObjectId;
    }

    // All validated — now perform the actual changes.

    // 1. Demote the outgoing HoD back to Manager, reporting to the
    // NEW HoD (promotedManager) — they step down a level, not out.
    currentHod.hierarchyRole = EmployeeHierarchyRole.MANAGER;
    currentHod.reportsToTenantId = null;
    currentHod.reportsToManagerId = promotedManager._id as Types.ObjectId;
    await currentHod.save();

    // 2. Promote the Manager into the HoD slot.
    promotedManager.hierarchyRole = EmployeeHierarchyRole.HEAD_OF_DEPARTMENT;
    promotedManager.reportsToManagerId = null;
    promotedManager.reportsToTenantId = tId;
    await promotedManager.save();

    // 3. Move every Manager who reported to the OLD HoD onto the
    // NEW HoD. (The old HoD, now a Manager, was already pointed at
    // the new HoD in step 1 — this catches everyone ELSE who also
    // reported to them.)
    const reassignedManagers = await this.reassignDirectReports(
      tId,
      currentHod._id as Types.ObjectId,
      promotedManager._id as Types.ObjectId,
    );

    // 4. Move the promoted Manager's former Regular reports onto the
    // chosen replacement Manager (no-op if they had none).
    const reassignedRegulars = validatedRegularsTarget
      ? await this.reassignDirectReports(
          tId,
          promotedManager._id as Types.ObjectId,
          validatedRegularsTarget,
        )
      : 0;

    return { newHod: promotedManager, reassignedManagers, reassignedRegulars };
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

  private async reassignDirectReports(
    tenantId: Types.ObjectId,
    fromEmployeeId: Types.ObjectId,
    toEmployeeId: Types.ObjectId | null, // null = explicitly clear, never silent
  ): Promise<number> {
    const result = await this.employeeModel.updateMany(
      {
        tenantId,
        reportsToManagerId: fromEmployeeId,
        employmentStatus: { $nin: ['terminated', 'resigned'] },
      },
      { $set: { reportsToManagerId: toEmployeeId } },
    );
    return result.modifiedCount;
  }
}
