import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { QueryFilter } from 'mongoose';
import * as bcrypt from 'bcryptjs';

import { User, UserDocument } from '../../auth/schemas/user.schema';
import {
  UpdateTenantProfileDto,
  InviteTeamMemberDto,
  UpdateTeamMemberDto,
  UpdateTeamMemberStatusDto,
  TeamMemberFilterDto,
} from '../dto/tenant.dto';
import {
  UserType,
  TenantRole,
  AccountStatus,
} from '../../../common/interfaces/user-role.enum';
import { PaginationDto, paginate } from '../../../common/pagination.dto';
import { EmailService } from '../../../common/utils/mailing/email.service';
import {
  SubscriptionPlanConfig,
  SubscriptionPlanDocument,
  PlatformModule,
  PlatformModuleDocument,
} from 'src/modules/super_admin/schemas';
import { Employee, EmployeeDocument } from 'src/modules/hr/schemas';

// Role hierarchy — members can only assign roles below their own level
const ROLE_HIERARCHY: Record<string, number> = {
  tenant_owner: 5,
  tenant_admin: 4,
  tenant_manager: 3,
  tenant_compliance: 2,
  tenant_finance: 2,
  tenant_support: 1,
};

@Injectable()
export class TenantService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(SubscriptionPlanConfig.name)
    private readonly planModel: Model<SubscriptionPlanDocument>,
    @InjectModel('TenantSubscription')
    private readonly subscriptionModel: Model<any>,
    @InjectModel(PlatformModule.name)
    private readonly moduleModel: Model<PlatformModuleDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly mailService: EmailService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════

  // async getDashboard(tenantId: string) {
  //   const tId = new Types.ObjectId(tenantId);

  //   const [teamByRole, subscription, recentMembers, totalTeam, activeTeam] =
  //     await Promise.all([
  //       this.userModel.aggregate([
  //         { $match: { userType: UserType.TENANT, tenantId: tId } },
  //         { $unwind: '$roles' },
  //         { $group: { _id: '$roles', count: { $sum: 1 } } },
  //       ]),
  //       this.subscriptionModel
  //         .findOne({ tenantId: tId })
  //         .select('plan status activeModules trialEndsAt currentPeriodEnd')
  //         .lean(),
  //       this.userModel
  //         .find({ userType: UserType.TENANT, tenantId: tId })
  //         .select('firstName lastName email roles status createdAt')
  //         .sort({ createdAt: -1 })
  //         .limit(5)
  //         .lean(),
  //       this.userModel.countDocuments({
  //         userType: UserType.TENANT,
  //         tenantId: tId,
  //       }),
  //       this.userModel.countDocuments({
  //         userType: UserType.TENANT,
  //         tenantId: tId,
  //         status: AccountStatus.ACTIVE,
  //       }),
  //     ]);

  //   return {
  //     team: {
  //       total: totalTeam,
  //       active: activeTeam,
  //       byRole: teamByRole,
  //       recentMembers,
  //     },
  //     subscription: {
  //       plan: subscription?.plan || null,
  //       status: subscription?.status || null,
  //       activeModules: subscription?.activeModules || [],
  //       trialEndsAt: subscription?.trialEndsAt || null,
  //       currentPeriodEnd: subscription?.currentPeriodEnd || null,
  //     },
  //     generatedAt: new Date(),
  //   };
  // }

  async getDashboard(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);

    const [
      teamByRole,
      subscription,
      recentMembers,
      totalTeam,
      activeTeam,
      // ── HR stats ──────────────────────────────────────────
      totalEmployees,
      activeEmployees,
      employeesByClient,
      hrRecentJoins,
    ] = await Promise.all([
      // Existing team queries
      this.userModel.aggregate([
        { $match: { userType: UserType.TENANT, tenantId: tId } },
        { $unwind: '$roles' },
        { $group: { _id: '$roles', count: { $sum: 1 } } },
      ]),
      this.subscriptionModel
        .findOne({ tenantId: tId })
        .select('plan status activeModules trialEndsAt currentPeriodEnd')
        .lean(),
      this.userModel
        .find({ userType: UserType.TENANT, tenantId: tId })
        .select('firstName lastName email roles status createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      this.userModel.countDocuments({
        userType: UserType.TENANT,
        tenantId: tId,
      }),
      this.userModel.countDocuments({
        userType: UserType.TENANT,
        tenantId: tId,
        status: AccountStatus.ACTIVE,
      }),

      // HR queries
      this.employeeModel.countDocuments({ tenantId: tId }),
      this.employeeModel.countDocuments({
        tenantId: tId,
        employmentStatus: 'active',
      }),
      this.employeeModel.aggregate([
        { $match: { tenantId: tId, employmentStatus: 'active' } },
        { $group: { _id: '$clientId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      this.employeeModel
        .find({ tenantId: tId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('firstName lastName jobTitle department clientId startDate')
        .lean(),
    ]);

    return {
      team: {
        total: totalTeam,
        active: activeTeam,
        byRole: teamByRole,
        recentMembers,
      },
      subscription: {
        plan: subscription?.plan || null,
        status: subscription?.status || null,
        activeModules: subscription?.activeModules || [],
        trialEndsAt: subscription?.trialEndsAt || null,
        currentPeriodEnd: subscription?.currentPeriodEnd || null,
      },
      hr: {
        totalEmployees,
        activeEmployees,
        employeesByClient,
        recentJoins: hrRecentJoins,
      },
      generatedAt: new Date(),
    };
  }
  // ═══════════════════════════════════════════════════════════
  // PROFILE
  // ═══════════════════════════════════════════════════════════

  async getMyProfile(tenantId: string): Promise<UserDocument> {
    const tenant = await this.userModel
      .findById(tenantId)
      .select('-password -passwordResetToken')
      .lean();
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant as UserDocument;
  }

  async updateMyProfile(
    tenantId: string,
    dto: UpdateTenantProfileDto,
  ): Promise<UserDocument> {
    const update: any = {};
    if (dto.phone) update.phone = dto.phone;

    const profileFields = [
      'businessName',
      'industry',
      'website',
      'registrationNumber',
      'taxId',
      'address',
      'contactPerson',
    ];
    for (const field of profileFields) {
      if (dto[field] !== undefined) {
        update[`tenantProfile.${field}`] = dto[field];
      }
    }

    const tenant = await this.userModel
      .findByIdAndUpdate(tenantId, { $set: update }, { new: true })
      .select('-password -passwordResetToken');

    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  // ═══════════════════════════════════════════════════════════
  // MODULES (view-only for tenant)
  // ═══════════════════════════════════════════════════════════

  async getMyModules(tenantId: string) {
    const subscription = await this.subscriptionModel
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .select(
        'plan status activeModules baseModules addonModules trialEndsAt currentPeriodEnd',
      )
      .lean();

    if (!subscription) {
      return {
        plan: null,
        status: null,
        activeModules: [],
        baseModules: [],
        addonModules: [],
        message: 'No subscription found. Contact your administrator.',
      };
    }

    return {
      plan: subscription.plan,
      status: subscription.status,
      activeModules: subscription.activeModules || [],
      baseModules: subscription.baseModules || [],
      addonModules: subscription.addonModules || [],
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
    };
  }

  // ── Get available plans (for tenant to browse before upgrading) ──
  async getAvailablePlans() {
    return this.planModel
      .find({ isActive: true })
      .select(
        'plan displayName description priceMonthly priceAnnual features maxClients maxUsers includedModules',
      )
      .sort({ priceMonthly: 1 })
      .lean();
  }

  // ── Self-upgrade plan ─────────────────────────────────────────
  async upgradePlan(tenantId: string, newPlan: string) {
    const plan = await this.planModel
      .findOne({ plan: newPlan, isActive: true })
      .lean();
    if (!plan)
      throw new NotFoundException(`Plan "${newPlan}" not found or inactive`);

    const current = await this.subscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!current) throw new NotFoundException('No subscription found');

    if (current.plan === newPlan) {
      throw new BadRequestException('You are already on this plan');
    }

    // Update subscription with new plan's modules
    let baseModules: string[] = [];

    if (newPlan === 'free') {
      // FREE plan gets all active modules
      const allModules = await this.moduleModel
        .find({ isActive: true })
        .select('key')
        .lean();
      baseModules = allModules.map((m) => m.key);
    } else {
      // Paid plan: find all active modules that include this plan
      const planModules = await this.moduleModel
        .find({ isActive: true, includedInPlans: newPlan })
        .select('key')
        .lean();
      baseModules = planModules.map((m) => m.key);

      // Fallback: if no modules found via includedInPlans, try planConfig
      // (handles edge case where modules haven't been linked yet)
      if (baseModules.length === 0 && plan.includedModules?.length > 0) {
        baseModules = plan.includedModules;
      }
    }

    const addonModules = current.addonModules || [];
    const activeModules = [...new Set([...baseModules, ...addonModules])];
    const periodEnd = new Date(new Date().setMonth(new Date().getMonth() + 1));

    await this.subscriptionModel.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId) },
      {
        plan: newPlan,
        status: 'active',
        baseModules,
        activeModules,
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
        cancelledAt: null,
      },
    );

    return {
      success: true,
      message: `Successfully upgraded to the ${plan.plan || newPlan} plan.`,
    };
  }
  // ═══════════════════════════════════════════════════════════
  // TEAM MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  async inviteTeamMember(
    dto: InviteTeamMemberDto,
    tenantId: string,
    invitedBy: string,
    inviterRoles: string[],
  ): Promise<{ member: Record<string, any> }> {
    this.enforceRoleHierarchy(inviterRoles, dto.role);

    if (dto.role === TenantRole.TENANT_OWNER) {
      const existingOwner = await this.userModel.findOne({
        tenantId: new Types.ObjectId(tenantId),
        roles: { $in: [TenantRole.TENANT_OWNER] },
        userType: UserType.TENANT,
      });
      if (existingOwner) {
        throw new ConflictException(
          'A tenant owner already exists. Transfer ownership instead.',
        );
      }
    }

    const emailTaken = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (emailTaken)
      throw new ConflictException('Email already registered on the platform');

    const tempPassword = this.generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const member = await this.userModel.create({
      userType: UserType.TENANT,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email.toLowerCase(),
      password: hashedPassword,
      phone: dto.phone,
      roles: [dto.role],
      status: AccountStatus.PENDING,
      tenantId: new Types.ObjectId(tenantId),
      createdBy: new Types.ObjectId(invitedBy),
      mustChangePassword: true,
    });

    const tenant = await this.userModel
      .findById(tenantId)
      .select('tenantProfile.businessName firstName')
      .lean();

    const businessName =
      (tenant as any)?.tenantProfile?.businessName ||
      (tenant as any)?.firstName ||
      'Your Organization';

    await this.mailService.sendTeamMemberWelcome({
      to: member.email,
      firstName: member.firstName,
      businessName,
      role: dto.role,
      tempPassword,
      loginUrl: `${process.env.TENANT_APP_URL}`,
    });

    const obj = member.toObject();
    delete obj.password;
    return { member: obj };
  }

  async getTeamMembers(
    tenantId: string,
    pagination: PaginationDto,
    filters: TeamMemberFilterDto,
  ) {
    const query: QueryFilter<UserDocument> = {
      userType: UserType.TENANT,
      tenantId: new Types.ObjectId(tenantId),
    };

    if (filters.role) query.roles = { $in: [filters.role] };
    if (filters.status) query.status = filters.status;
    if (filters.search) {
      query.$or = [
        { firstName: { $regex: filters.search, $options: 'i' } },
        { lastName: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const { skip, limit, page } = pagination;
    const [items, total] = await Promise.all([
      this.userModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .select('-password -passwordResetToken')
        .populate('createdBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .lean(),
      this.userModel.countDocuments(query),
    ]);

    return paginate(items, total, page, limit);
  }

  async getTeamMemberById(
    memberId: string,
    tenantId: string,
  ): Promise<UserDocument> {
    const member = await this.userModel
      .findOne({
        _id: memberId,
        tenantId: new Types.ObjectId(tenantId),
        userType: UserType.TENANT,
      })
      .select('-password -passwordResetToken')
      .populate('createdBy', 'firstName lastName email')
      .lean();

    if (!member) throw new NotFoundException('Team member not found');
    return member as UserDocument;
  }

  async updateTeamMember(
    memberId: string,
    dto: UpdateTeamMemberDto,
    tenantId: string,
    updaterRoles: string[],
  ): Promise<UserDocument> {
    if (dto.role) this.enforceRoleHierarchy(updaterRoles, dto.role);

    const update: any = {};
    if (dto.firstName) update.firstName = dto.firstName;
    if (dto.lastName) update.lastName = dto.lastName;
    if (dto.phone) update.phone = dto.phone;
    if (dto.role) update.roles = [dto.role];

    const member = await this.userModel
      .findOneAndUpdate(
        {
          _id: memberId,
          tenantId: new Types.ObjectId(tenantId),
          userType: UserType.TENANT,
        },
        { $set: update },
        { new: true },
      )
      .select('-password -passwordResetToken');

    if (!member) throw new NotFoundException('Team member not found');
    return member;
  }

  async updateTeamMemberStatus(
    memberId: string,
    dto: UpdateTeamMemberStatusDto,
    tenantId: string,
  ): Promise<UserDocument> {
    const member = await this.userModel
      .findOneAndUpdate(
        {
          _id: memberId,
          tenantId: new Types.ObjectId(tenantId),
          userType: UserType.TENANT,
        },
        { status: dto.status },
        { new: true },
      )
      .select('-password -passwordResetToken');

    if (!member) throw new NotFoundException('Team member not found');
    return member;
  }

  async removeTeamMember(memberId: string, tenantId: string): Promise<void> {
    const member = await this.userModel.findOne({
      _id: memberId,
      tenantId: new Types.ObjectId(tenantId),
      userType: UserType.TENANT,
      roles: { $nin: [TenantRole.TENANT_OWNER] },
    });

    if (!member) {
      throw new NotFoundException(
        'Team member not found or cannot remove a tenant owner',
      );
    }

    await this.userModel.findByIdAndUpdate(memberId, {
      status: AccountStatus.INACTIVE,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════

  private enforceRoleHierarchy(inviterRoles: string[], targetRole: string) {
    const inviterMaxLevel = Math.max(
      ...inviterRoles.map((r) => ROLE_HIERARCHY[r] ?? 0),
    );
    const targetLevel = ROLE_HIERARCHY[targetRole] ?? 0;

    if (targetLevel >= inviterMaxLevel) {
      throw new ForbiddenException(
        `You cannot assign the "${targetRole}" role. ` +
          `You can only assign roles below your own access level.`,
      );
    }
  }

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
