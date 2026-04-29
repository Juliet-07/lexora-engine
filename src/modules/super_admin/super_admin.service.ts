import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { QueryFilter } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User, UserDocument } from '../auth/schemas/user.schema';
import {
  PlatformModule,
  PlatformModuleDocument,
  SubscriptionPlanConfig,
  SubscriptionPlanDocument,
  TenantSubscription,
  TenantSubscriptionDocument,
} from './schemas';
import {
  CreateTenantDto,
  UpdateTenantDto,
  UpdateTenantStatusDto,
  TenantFilterDto,
  CreateModuleDto,
  UpdateModuleDto,
  CreateSubscriptionPlanDto,
  UpdateSubscriptionPlanDto,
  AssignTenantSubscriptionDto,
  UpdateTenantSubscriptionStatusDto,
  AddAddonModulesDto,
} from './dto/superadmin.dto';
import {
  UserType,
  TenantRole,
  AccountStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  PlatformModuleKey,
} from '../../common/interfaces/user-role.enum';
import { PaginationDto, paginate } from '../../common/pagination.dto';
import { EmailService } from '../../common/utils/mailing/email.service';

@Injectable()
export class SuperAdminService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(PlatformModule.name)
    private readonly moduleModel: Model<PlatformModuleDocument>,
    @InjectModel(SubscriptionPlanConfig.name)
    private readonly planModel: Model<SubscriptionPlanDocument>,
    @InjectModel(TenantSubscription.name)
    private readonly subscriptionModel: Model<TenantSubscriptionDocument>,
    private readonly mailService: EmailService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // TENANT MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  async createTenant(
    dto: CreateTenantDto,
    createdBy: string,
  ): Promise<UserDocument> {
    const existing = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (existing)
      throw new ConflictException('Email already registered on the platform');

    // Generate a secure temporary password
    const tempPassword = this.generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // Derive firstName/lastName: use DTO or fall back to contactPerson
    const firstName = dto.firstName || dto.contactPerson?.firstName || 'Tenant';
    const lastName = dto.lastName || dto.contactPerson?.lastName || 'Admin';

    const tenant = await this.userModel.create({
      userType: UserType.TENANT,
      firstName,
      lastName,
      email: dto.email.toLowerCase(),
      password: hashedPassword,
      phone: dto.phone || dto.contactPerson?.phone,
      roles: [dto.role || TenantRole.TENANT_OWNER],
      status: AccountStatus.PENDING, // activated on first login
      createdBy: new Types.ObjectId(createdBy),
      mustChangePassword: true,
      tenantProfile: {
        businessName: dto.businessName,
        industry: dto.industry,
        website: dto.website,
        registrationNumber: dto.registrationNumber,
        taxId: dto.taxId,
        address: dto.address || {},
        contactPerson: dto.contactPerson || {},
      },
    });

    // Create default subscription
    await this.createDefaultSubscription(
      tenant._id.toString(),
      dto.plan || SubscriptionPlan.FREE,
      createdBy,
    );

    // Send credentials by email
    await this.mailService.sendTenantWelcome({
      to: tenant.email,
      firstName,
      businessName: dto.businessName,
      tempPassword,
      loginUrl: `${process.env.APP_URL}`,
    });

    return tenant;
  }

  async getTenants(pagination: PaginationDto, filters: TenantFilterDto) {
    const query: QueryFilter<UserDocument> = { userType: UserType.TENANT };

    if (filters.status) query.status = filters.status;
    if (filters.industry)
      query['tenantProfile.industry'] = {
        $regex: filters.industry,
        $options: 'i',
      };
    if (filters.search) {
      query.$or = [
        {
          'tenantProfile.businessName': {
            $regex: filters.search,
            $options: 'i',
          },
        },
        { email: { $regex: filters.search, $options: 'i' } },
        { firstName: { $regex: filters.search, $options: 'i' } },
        { lastName: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const { skip, limit, page } = pagination;
    const [items, total] = await Promise.all([
      this.userModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .select('-password -passwordResetToken')
        .sort({ createdAt: -1 })
        .lean(),
      this.userModel.countDocuments(query),
    ]);

    // Attach subscription to each tenant
    const tenantIds = items.map((t) => t._id);
    const subscriptions = await this.subscriptionModel
      .find({ tenantId: { $in: tenantIds } })
      .lean();

    const subMap = subscriptions.reduce(
      (m, s) => {
        m[s.tenantId.toString()] = s;
        return m;
      },
      {} as Record<string, any>,
    );

    const enriched = items.map((t) => ({
      ...t,
      subscription: subMap[t._id.toString()] || null,
    }));

    return paginate(enriched, total, page, limit);
  }

  async getTenantById(
    id: string,
  ): Promise<UserDocument & { subscription?: any }> {
    const tenant = await this.userModel
      .findOne({ _id: id, userType: UserType.TENANT })
      .select('-password -passwordResetToken')
      .populate('createdBy', 'firstName lastName email')
      .lean();

    if (!tenant) throw new NotFoundException('Tenant not found');

    const subscription = await this.subscriptionModel
      .findOne({ tenantId: new Types.ObjectId(id) })
      .lean();

    return { ...tenant, subscription } as any;
  }

  async updateTenant(id: string, dto: UpdateTenantDto): Promise<UserDocument> {
    const update: any = {};
    if (dto.firstName) update.firstName = dto.firstName;
    if (dto.lastName) update.lastName = dto.lastName;
    if (dto.phone) update.phone = dto.phone;

    // Deep-merge tenantProfile fields
    if (dto.businessName)
      update['tenantProfile.businessName'] = dto.businessName;
    if (dto.industry) update['tenantProfile.industry'] = dto.industry;
    if (dto.website) update['tenantProfile.website'] = dto.website;
    if (dto.registrationNumber)
      update['tenantProfile.registrationNumber'] = dto.registrationNumber;
    if (dto.taxId) update['tenantProfile.taxId'] = dto.taxId;
    if (dto.address) update['tenantProfile.address'] = dto.address;
    if (dto.contactPerson)
      update['tenantProfile.contactPerson'] = dto.contactPerson;

    const tenant = await this.userModel
      .findOneAndUpdate(
        { _id: id, userType: UserType.TENANT },
        { $set: update },
        { new: true },
      )
      .select('-password');

    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async updateTenantStatus(
    id: string,
    dto: UpdateTenantStatusDto,
  ): Promise<UserDocument> {
    const tenant = await this.userModel
      .findOneAndUpdate(
        { _id: id, userType: UserType.TENANT },
        {
          status: dto.status,
          ...(dto.reason && { 'metadata.statusReason': dto.reason }),
        },
        { new: true },
      )
      .select('-password');

    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async deleteTenant(id: string): Promise<void> {
    const tenant = await this.userModel.findOne({
      _id: id,
      userType: UserType.TENANT,
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    // Soft-delete: deactivate tenant and all their clients
    await this.userModel.updateMany(
      { tenantId: new Types.ObjectId(id) },
      { status: AccountStatus.INACTIVE },
    );
    await this.userModel.findByIdAndUpdate(id, {
      status: AccountStatus.INACTIVE,
    });
    await this.subscriptionModel.findOneAndUpdate(
      { tenantId: new Types.ObjectId(id) },
      { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date() },
    );
  }

  //   async resetTenantPassword(id: string): Promise<{ tempPassword: string }> {
  //     const tenant = await this.userModel.findOne({
  //       _id: id,
  //       userType: UserType.TENANT,
  //     });
  //     if (!tenant) throw new NotFoundException('Tenant not found');

  //     const tempPassword = this.generateTempPassword();
  //     const hashedPassword = await bcrypt.hash(tempPassword, 12);
  //     tenant.password = hashedPassword;
  //     tenant.mustChangePassword = true;
  //     await tenant.save();

  //     await this.mailService.sendPasswordReset({
  //       to: tenant.email,
  //       firstName: tenant.firstName,
  //       tempPassword,
  //     });

  //     return { tempPassword };
  //   }

  async getTenantStats(id: string) {
    const tenantId = new Types.ObjectId(id);
    const tenant = await this.userModel.findOne({
      _id: id,
      userType: UserType.TENANT,
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const [clientCount, subscription] = await Promise.all([
      this.userModel.countDocuments({ userType: UserType.CLIENT, tenantId }),
      this.subscriptionModel.findOne({ tenantId }).lean(),
    ]);

    return {
      tenant: {
        _id: tenant._id,
        businessName: tenant.tenantProfile?.businessName,
        status: tenant.status,
        // createdAt: tenant.createdAt,
      },
      stats: { totalClients: clientCount },
      subscription,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // MODULE MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  async createModule(dto: CreateModuleDto): Promise<PlatformModuleDocument> {
    const existing = await this.moduleModel.findOne({ key: dto.key });
    if (existing)
      throw new ConflictException(`Module "${dto.key}" already exists`);
    return this.moduleModel.create(dto);
  }

  async getModules(includeInactive = false): Promise<PlatformModuleDocument[]> {
    const query = includeInactive ? {} : { isActive: true };
    return this.moduleModel.find(query).sort({ name: 1 }).lean() as any;
  }

  async getModuleByKey(key: string): Promise<PlatformModuleDocument> {
    const mod = await this.moduleModel.findOne({ key }).lean();
    if (!mod) throw new NotFoundException(`Module "${key}" not found`);
    return mod as PlatformModuleDocument;
  }

  async updateModule(
    key: string,
    dto: UpdateModuleDto,
  ): Promise<PlatformModuleDocument> {
    const mod = await this.moduleModel.findOneAndUpdate({ key }, dto, {
      new: true,
    });
    if (!mod) throw new NotFoundException(`Module "${key}" not found`);
    return mod;
  }

  async toggleModule(
    key: string,
    isActive: boolean,
  ): Promise<PlatformModuleDocument> {
    const mod = await this.moduleModel.findOneAndUpdate(
      { key },
      { isActive },
      { new: true },
    );
    if (!mod) throw new NotFoundException(`Module "${key}" not found`);

    // If deactivating, remove from all active subscriptions
    if (!isActive) {
      await this.subscriptionModel.updateMany(
        {},
        {
          $pull: {
            baseModules: key,
            addonModules: key,
            activeModules: key,
          },
        },
      );
    }
    return mod;
  }

  async deleteModule(key: string): Promise<void> {
    const mod = await this.moduleModel.findOneAndDelete({ key });
    if (!mod) throw new NotFoundException(`Module "${key}" not found`);
  }

  // ═══════════════════════════════════════════════════════════
  // SUBSCRIPTION PLAN MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  async createSubscriptionPlan(
    dto: CreateSubscriptionPlanDto,
  ): Promise<SubscriptionPlanDocument> {
    const existing = await this.planModel.findOne({ plan: dto.plan });
    if (existing)
      throw new ConflictException(`Plan "${dto.plan}" already configured`);
    return this.planModel.create(dto);
  }

  async getSubscriptionPlans(
    includeInactive = false,
  ): Promise<SubscriptionPlanDocument[]> {
    const query = includeInactive ? {} : { isActive: true };
    return this.planModel.find(query).sort({ priceMonthly: 1 }).lean() as any;
  }

  async getSubscriptionPlanByKey(
    plan: string,
  ): Promise<SubscriptionPlanDocument> {
    const p = await this.planModel.findOne({ plan }).lean();
    if (!p) throw new NotFoundException(`Plan "${plan}" not found`);
    return p as SubscriptionPlanDocument;
  }

  async updateSubscriptionPlan(
    plan: string,
    dto: UpdateSubscriptionPlanDto,
  ): Promise<SubscriptionPlanDocument> {
    const p = await this.planModel.findOneAndUpdate({ plan }, dto, {
      new: true,
    });
    if (!p) throw new NotFoundException(`Plan "${plan}" not found`);
    return p;
  }

  // ═══════════════════════════════════════════════════════════
  // TENANT SUBSCRIPTION MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  async assignTenantSubscription(
    tenantId: string,
    dto: AssignTenantSubscriptionDto,
    assignedBy: string,
  ): Promise<TenantSubscriptionDocument> {
    const tenant = await this.userModel.findOne({
      _id: tenantId,
      userType: UserType.TENANT,
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const planConfig = await this.planModel.findOne({ plan: dto.plan });
    if (!planConfig)
      throw new NotFoundException(`Plan "${dto.plan}" not configured`);

    const baseModules = planConfig.includedModules || [];
    const addonModules = dto.addonModules || [];
    const activeModules = [...new Set([...baseModules, ...addonModules])];

    const now = new Date();
    const periodEnd = new Date(
      dto.endsAt ||
        new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    );

    const subscription = await this.subscriptionModel.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId) },
      {
        plan: dto.plan,
        status: SubscriptionStatus.ACTIVE,
        baseModules,
        addonModules,
        activeModules,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        assignedBy: new Types.ObjectId(assignedBy),
        maxUsersOverride: dto.maxUsersOverride || null,
        maxClientsOverride: dto.maxClientsOverride || null,
        trialEndsAt: null,
        cancelledAt: null,
      },
      { new: true, upsert: true },
    );

    return subscription;
  }

  async addAddonModules(
    tenantId: string,
    dto: AddAddonModulesDto,
  ): Promise<TenantSubscriptionDocument> {
    const sub = await this.subscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!sub) throw new NotFoundException('Tenant subscription not found');

    const newAddons = dto.modules.filter((m) => !sub.addonModules.includes(m));
    const addonModules = [...new Set([...sub.addonModules, ...newAddons])];
    const activeModules = [...new Set([...sub.baseModules, ...addonModules])];

    sub.addonModules = addonModules;
    sub.activeModules = activeModules;
    return sub.save();
  }

  async removeAddonModules(
    tenantId: string,
    dto: AddAddonModulesDto,
  ): Promise<TenantSubscriptionDocument> {
    const sub = await this.subscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!sub) throw new NotFoundException('Tenant subscription not found');

    sub.addonModules = sub.addonModules.filter((m) => !dto.modules.includes(m));
    sub.activeModules = [...new Set([...sub.baseModules, ...sub.addonModules])];
    return sub.save();
  }

  async updateTenantSubscriptionStatus(
    tenantId: string,
    dto: UpdateTenantSubscriptionStatusDto,
  ): Promise<TenantSubscriptionDocument> {
    const update: any = { status: dto.status };
    if (dto.status === SubscriptionStatus.CANCELLED)
      update.cancelledAt = new Date();

    const sub = await this.subscriptionModel.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId) },
      update,
      { new: true },
    );
    if (!sub) throw new NotFoundException('Tenant subscription not found');
    return sub;
  }

  async getTenantSubscription(
    tenantId: string,
  ): Promise<TenantSubscriptionDocument> {
    const sub = await this.subscriptionModel
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .populate('assignedBy', 'firstName lastName email')
      .lean();
    if (!sub) throw new NotFoundException('Subscription not found');
    return sub as TenantSubscriptionDocument;
  }

  async getAllSubscriptions(
    pagination: PaginationDto,
    status?: SubscriptionStatus,
  ) {
    const query: any = {};
    if (status) query.status = status;

    const { skip, limit, page } = pagination;
    const [items, total] = await Promise.all([
      this.subscriptionModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .populate('tenantId', 'firstName lastName email tenantProfile status')
        .sort({ createdAt: -1 })
        .lean(),
      this.subscriptionModel.countDocuments(query),
    ]);
    return paginate(items, total, page, limit);
  }

  // ═══════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════

  async getDashboard() {
    const [
      totalTenants,
      activeTenants,
      suspendedTenants,
      pendingTenants,
      totalClients,
      subscriptionBreakdown,
      recentTenants,
      moduleCount,
    ] = await Promise.all([
      this.userModel.countDocuments({ userType: UserType.TENANT }),
      this.userModel.countDocuments({
        userType: UserType.TENANT,
        status: AccountStatus.ACTIVE,
      }),
      this.userModel.countDocuments({
        userType: UserType.TENANT,
        status: AccountStatus.SUSPENDED,
      }),
      this.userModel.countDocuments({
        userType: UserType.TENANT,
        status: AccountStatus.PENDING,
      }),
      this.userModel.countDocuments({ userType: UserType.CLIENT }),
      this.subscriptionModel.aggregate([
        {
          $group: {
            _id: '$plan',
            count: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          },
        },
        { $sort: { count: -1 } },
      ]),
      this.userModel
        .find({ userType: UserType.TENANT })
        .select('-password')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      this.moduleModel.countDocuments({ isActive: true }),
    ]);

    return {
      overview: {
        totalTenants,
        activeTenants,
        suspendedTenants,
        pendingTenants,
        totalClients,
        activeModules: moduleCount,
      },
      subscriptionBreakdown,
      recentTenants,
      generatedAt: new Date(),
    };
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

  private async createDefaultSubscription(
    tenantId: string,
    plan: SubscriptionPlan,
    assignedBy: string,
  ) {
    const planConfig = await this.planModel.findOne({ plan }).lean();
    const baseModules = planConfig?.includedModules || [];
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14); // 14-day trial

    await this.subscriptionModel.create({
      tenantId: new Types.ObjectId(tenantId),
      plan,
      status: SubscriptionStatus.TRIAL,
      baseModules,
      addonModules: [],
      activeModules: baseModules,
      trialEndsAt,
      currentPeriodStart: new Date(),
      currentPeriodEnd: trialEndsAt,
      assignedBy: new Types.ObjectId(assignedBy),
    });
  }
}
