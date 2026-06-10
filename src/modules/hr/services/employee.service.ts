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
} from '../hr.dto';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import {
  ClientProfileRecord,
  ClientProfileDocument,
} from '../../tenant/schemas/client-profile.schema';
import {
  UserType,
  AccountStatus,
  ClientRole,
} from '../../../common/interfaces/user-role.enum';
import { PaginationDto, paginate } from '../../../common/pagination.dto';
import { EmailService } from '../../../common/utils/mailing/email.service';

@Injectable()
export class EmployeeService {
  constructor(
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(ClientProfileRecord.name)
    private readonly clientProfileModel: Model<ClientProfileDocument>,
    private readonly mailService: EmailService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // CREATE EMPLOYEE
  // Creates employee record + portal login credentials
  // ═══════════════════════════════════════════════════════════

  async createEmployee(
    dto: CreateEmployeeDto,
    tenantId: string,
    createdBy: string,
  ): Promise<EmployeeDocument> {
    // ── Validate client exists and belongs to this tenant ────
    const clientProfile = await this.clientProfileModel.findOne({
      _id: new Types.ObjectId(dto.clientId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!clientProfile) {
      throw new NotFoundException(
        'Client not found or does not belong to this tenant',
      );
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
    const count = await this.employeeModel.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
      clientId: new Types.ObjectId(dto.clientId),
    });
    const employeeNumber = `EMP-${String(count + 1).padStart(4, '0')}`;

    // ── Create portal User account ───────────────────────────
    const tempPassword = this.generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const user = await this.userModel.create({
      userType: UserType.EMPLOYEE,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email.toLowerCase(),
      password: hashedPassword,
      phone: dto.phone,
      roles: [ClientRole.CLIENT_EMPLOYEE],
      status: AccountStatus.ACTIVE,
      tenantId: new Types.ObjectId(tenantId),
      clientId: new Types.ObjectId(dto.clientId),
      mustChangePassword: true,
    });

    // ── Create employee record ────────────────────────────────
    const employee = await this.employeeModel.create({
      tenantId: new Types.ObjectId(tenantId),
      clientId: new Types.ObjectId(dto.clientId),
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
      department: dto.department ?? null,
      reportsTo: dto.reportsTo ?? null,
      employmentType: dto.employmentType ?? 'full_time',
      employmentStatus: EmploymentStatus.ACTIVE,
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

    // ── Get client business name for welcome email ────────────
    const clientUser = await this.userModel
      .findOne({ _id: clientProfile.userId })
      .select('tenantProfile')
      .lean();

    const businessName =
      (clientUser as any)?.tenantProfile?.businessName || 'Your Employer';

    // ── Send welcome email with credentials ───────────────────
    await this.mailService.sendEmployeeWelcome({
      to: dto.email,
      firstName: dto.firstName,
      businessName,
      employeeNumber,
      jobTitle: dto.jobTitle,
      tempPassword,
      loginUrl: `${process.env.CLIENT_APP_URL}/login`,
    });

    return employee;
  }

  // ═══════════════════════════════════════════════════════════
  // GET EMPLOYEES (tenant — list all employees across clients
  //                or filtered by client)
  // ═══════════════════════════════════════════════════════════

  async getEmployees(
    tenantId: string,
    pagination: PaginationDto,
    filters: EmployeeFilterDto,
  ) {
    const { skip, limit, page } = pagination;

    const query: any = { tenantId: new Types.ObjectId(tenantId) };

    if (filters.clientId) {
      query.clientId = new Types.ObjectId(filters.clientId);
    }
    if (filters.department) {
      query.department = { $regex: filters.department, $options: 'i' };
    }
    if (filters.employmentStatus) {
      query.employmentStatus = filters.employmentStatus;
    }
    if (filters.employmentType) {
      query.employmentType = filters.employmentType;
    }
    if (filters.search) {
      query.$or = [
        { firstName: { $regex: filters.search, $options: 'i' } },
        { lastName: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
        { employeeNumber: { $regex: filters.search, $options: 'i' } },
        { jobTitle: { $regex: filters.search, $options: 'i' } },
        { department: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.employeeModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .populate('clientId', 'classifications')
        .lean(),
      this.employeeModel.countDocuments(query),
    ]);

    return paginate(items, total, page, limit);
  }

  async getEmployeesGrouped(tenantId: string, filters: EmployeeFilterDto) {
    const tId = new Types.ObjectId(tenantId);

    const query: any = { tenantId: tId };

    if (filters.clientId) {
      query.clientId = new Types.ObjectId(filters.clientId);
    }
    if (filters.department) {
      query.department = { $regex: filters.department, $options: 'i' };
    }
    if (filters.employmentStatus) {
      query.employmentStatus = filters.employmentStatus;
    }
    if (filters.employmentType) {
      query.employmentType = filters.employmentType;
    }
    if (filters.search) {
      query.$or = [
        { firstName: { $regex: filters.search, $options: 'i' } },
        { lastName: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
        { employeeNumber: { $regex: filters.search, $options: 'i' } },
        { jobTitle: { $regex: filters.search, $options: 'i' } },
        { department: { $regex: filters.search, $options: 'i' } },
      ];
    }

    // ── Fetch matching employees ──────────────────────────────
    const employees = await this.employeeModel
      .find(query)
      .sort({ clientId: 1, firstName: 1 })
      .lean();

    // ── Fetch all client profiles for this tenant ─────────────
    // We need client names to group by
    const clientIds = [...new Set(employees.map((e) => e.clientId.toString()))];

    const clientProfiles = await this.clientProfileModel
      .find({ _id: { $in: clientIds.map((id) => new Types.ObjectId(id)) } })
      .lean();

    // Get client user records for business names
    const clientUserIds = clientProfiles.map((cp) => cp.userId);
    const clientUsers = await this.userModel
      .find({ _id: { $in: clientUserIds } })
      .select('_id tenantProfile firstName lastName')
      .lean();

    const clientUserMap = clientUsers.reduce(
      (m, u) => {
        m[u._id.toString()] = u;
        return m;
      },
      {} as Record<string, any>,
    );

    // Build client info map: clientProfileId → { name, id }
    const clientInfoMap = clientProfiles.reduce(
      (m, cp) => {
        const u = clientUserMap[cp.userId?.toString()];
        m[cp._id.toString()] = {
          _id: cp._id.toString(),
          businessName:
            (u as any)?.tenantProfile?.businessName ||
            `${(u as any)?.firstName ?? ''} ${(u as any)?.lastName ?? ''}`.trim() ||
            'Unknown Client',
          classifications: cp.classifications,
        };
        return m;
      },
      {} as Record<string, any>,
    );

    // ── Group employees by client ─────────────────────────────
    const groupMap: Record<string, { client: any; employees: any[] }> = {};

    for (const emp of employees) {
      const cid = emp.clientId.toString();
      const cInfo = clientInfoMap[cid] ?? {
        _id: cid,
        businessName: 'Unknown Client',
      };

      if (!groupMap[cid]) {
        groupMap[cid] = { client: cInfo, employees: [] };
      }
      groupMap[cid].employees.push(emp);
    }

    const groups = Object.values(groupMap).sort((a, b) =>
      a.client.businessName.localeCompare(b.client.businessName),
    );

    // ── Stats ─────────────────────────────────────────────────
    const allEmployees = await this.employeeModel
      .find({ tenantId: tId })
      .lean();

    const clientsServed = new Set(
      allEmployees.map((e) => e.clientId.toString()),
    ).size;
    const active = allEmployees.filter(
      (e) => e.employmentStatus === 'active',
    ).length;
    const onLeave = allEmployees.filter(
      (e) => e.employmentStatus === 'on_leave',
    ).length;

    return {
      stats: {
        totalHeadcount: allEmployees.length,
        clientsServed,
        active,
        onLeave,
      },
      groups,
      total: employees.length,
    };
  }

  async getEmployeesForClient(
    clientProfileId: string,
    pagination: PaginationDto,
  ) {
    const { skip, limit, page } = pagination;

    const query = {
      clientId: new Types.ObjectId(clientProfileId),
    };

    const [items, total] = await Promise.all([
      this.employeeModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ firstName: 1 })
        .lean(),
      this.employeeModel.countDocuments(query),
    ]);

    return paginate(items, total, page, limit);
  }
  // ═══════════════════════════════════════════════════════════
  // GET EMPLOYEE BY ID
  // ═══════════════════════════════════════════════════════════

  async getEmployeeById(
    employeeId: string,
    tenantId: string,
  ): Promise<EmployeeDocument> {
    const employee = await this.employeeModel
      .findOne({
        _id: employeeId,
        tenantId: new Types.ObjectId(tenantId),
      })
      .populate('clientId', 'classifications')
      .populate('userId', 'email status')
      .lean();

    if (!employee) throw new NotFoundException('Employee not found');
    return employee as EmployeeDocument;
  }

  // ═══════════════════════════════════════════════════════════
  // UPDATE EMPLOYEE
  // ═══════════════════════════════════════════════════════════

  async updateEmployee(
    employeeId: string,
    tenantId: string,
    dto: UpdateEmployeeDto,
  ): Promise<EmployeeDocument> {
    const update: any = { ...dto };

    // Convert date strings to Date objects
    if (dto.startDate) update.startDate = new Date(dto.startDate);
    if (dto.endDate) update.endDate = new Date(dto.endDate);
    if (dto.dateOfBirth) update.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.probationEndDate)
      update.probationEndDate = new Date(dto.probationEndDate);

    // clientId cannot be changed after creation
    delete update.clientId;

    const employee = await this.employeeModel
      .findOneAndUpdate(
        { _id: employeeId, tenantId: new Types.ObjectId(tenantId) },
        { $set: update },
        { new: true },
      )
      .lean();

    if (!employee) throw new NotFoundException('Employee not found');

    // Sync name/email changes to linked User account
    if (dto.firstName || dto.lastName || dto.phone) {
      const userUpdate: any = {};
      if (dto.firstName) userUpdate.firstName = dto.firstName;
      if (dto.lastName) userUpdate.lastName = dto.lastName;
      if (dto.phone) userUpdate.phone = dto.phone;
      await this.userModel.findByIdAndUpdate(employee.userId, userUpdate);
    }

    return employee as EmployeeDocument;
  }

  // ═══════════════════════════════════════════════════════════
  // TERMINATE EMPLOYEE
  // ═══════════════════════════════════════════════════════════

  async terminateEmployee(
    employeeId: string,
    tenantId: string,
    dto: TerminateEmployeeDto,
  ): Promise<EmployeeDocument> {
    const employee = await this.employeeModel.findOne({
      _id: employeeId,
      tenantId: new Types.ObjectId(tenantId),
    });

    if (!employee) throw new NotFoundException('Employee not found');

    if (
      employee.employmentStatus === EmploymentStatus.TERMINATED ||
      employee.employmentStatus === EmploymentStatus.RESIGNED
    ) {
      throw new BadRequestException(
        'Employee is already terminated or resigned',
      );
    }

    const updated = await this.employeeModel
      .findByIdAndUpdate(
        employeeId,
        {
          $set: {
            employmentStatus: dto.status,
            endDate: new Date(dto.endDate),
            'metadata.terminationReason': dto.reason,
            'metadata.terminatedAt': new Date(),
          },
        },
        { new: true },
      )
      .lean();

    // Deactivate portal account
    if (employee.userId) {
      await this.userModel.findByIdAndUpdate(employee.userId, {
        status: AccountStatus.INACTIVE,
      });
    }

    return updated as EmployeeDocument;
  }

  // ═══════════════════════════════════════════════════════════
  // GET STATS (tenant-level — across all clients)
  // ═══════════════════════════════════════════════════════════

  async getEmployeeStats(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);

    const [
      total,
      byStatus,
      byDepartment,
      byEmploymentType,
      byClient,
      recentJoins,
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
        { $group: { _id: '$department', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      this.employeeModel.aggregate([
        { $match: { tenantId: tId } },
        { $group: { _id: '$employmentType', count: { $sum: 1 } } },
      ]),

      this.employeeModel.aggregate([
        {
          $match: { tenantId: tId, employmentStatus: EmploymentStatus.ACTIVE },
        },
        { $group: { _id: '$clientId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      this.employeeModel
        .find({ tenantId: tId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('firstName lastName jobTitle department clientId startDate')
        .lean(),
    ]);

    const statusMap = byStatus.reduce(
      (m, s) => ({ ...m, [s._id]: s.count }),
      {} as Record<string, number>,
    );

    return {
      total,
      active: statusMap[EmploymentStatus.ACTIVE] ?? 0,
      onLeave: statusMap[EmploymentStatus.ON_LEAVE] ?? 0,
      terminated: statusMap[EmploymentStatus.TERMINATED] ?? 0,
      byDepartment,
      byEmploymentType,
      byClient,
      recentJoins,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // GET EMPLOYEES BY CLIENT (for client-specific HR view)
  // ═══════════════════════════════════════════════════════════

  async getEmployeesByClient(
    clientId: string,
    tenantId: string,
    pagination: PaginationDto,
  ) {
    const { skip, limit, page } = pagination;

    const query = {
      tenantId: new Types.ObjectId(tenantId),
      clientId: new Types.ObjectId(clientId),
    };

    const [items, total] = await Promise.all([
      this.employeeModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ firstName: 1 })
        .lean(),
      this.employeeModel.countDocuments(query),
    ]);

    return paginate(items, total, page, limit);
  }

  // ═══════════════════════════════════════════════════════════
  // EMPLOYEE SELF — get own profile (called from employee portal)
  // ═══════════════════════════════════════════════════════════

  async getMyProfile(userId: string): Promise<EmployeeDocument> {
    const employee = await this.employeeModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .populate('clientId', 'classifications')
      .lean();

    if (!employee) throw new NotFoundException('Employee profile not found');
    return employee as EmployeeDocument;
  }

  async updateMyProfile(
    userId: string,
    dto: {
      phone?: string;
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

    // Build update — only set fields that were provided
    const update: any = {};
    if (dto.phone !== undefined) update.phone = dto.phone;
    if (dto.address !== undefined) update.address = dto.address;
    if (dto.emergencyContactName !== undefined)
      update.emergencyContactName = dto.emergencyContactName;
    if (dto.emergencyContactPhone !== undefined)
      update.emergencyContactPhone = dto.emergencyContactPhone;
    if (dto.nationality !== undefined) update.nationality = dto.nationality;
    if (dto.nationalId !== undefined) update.nationalId = dto.nationalId;

    // Bank details — stored on employee record
    // In a full payroll system these would go through an approval workflow.
    // For now they update directly.
    if (dto.bankName !== undefined) update.bankName = dto.bankName;
    if (dto.bankAccountNumber !== undefined)
      update.bankAccountNumber = dto.bankAccountNumber;

    const updated = await this.employeeModel
      .findByIdAndUpdate(employee._id, { $set: update }, { new: true })
      .lean();

    // Sync phone to linked User account
    if (dto.phone) {
      await this.userModel.findByIdAndUpdate(userId, { phone: dto.phone });
    }

    return updated as EmployeeDocument;
  }

  // ═══════════════════════════════════════════════════════════
  // GET DISTINCT DEPARTMENTS (for filter dropdown)
  // ═══════════════════════════════════════════════════════════

  async getDepartments(tenantId: string): Promise<string[]> {
    const departments = await this.employeeModel.distinct('department', {
      tenantId: new Types.ObjectId(tenantId),
      department: { $ne: null },
    });
    return departments.filter(Boolean).sort();
  }
  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
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
