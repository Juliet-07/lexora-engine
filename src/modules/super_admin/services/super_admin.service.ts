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
import { User, UserDocument } from '../../auth/schemas/user.schema';
import {
  PlatformModule,
  PlatformModuleDocument,
  SubscriptionPlanConfig,
  SubscriptionPlanDocument,
  TenantSubscription,
  TenantSubscriptionDocument,
  RiskRules,
  RiskRulesDocument,
} from '../schemas';
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
  CreateRiskRulesDto,
} from '../dtos';
import {
  UserType,
  TenantRole,
  AccountStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  PlatformModuleKey,
} from '../../../common/interfaces/user-role.enum';
import { PaginationDto, paginate } from '../../../common/pagination.dto';
import { EmailService } from '../../../common/utils/mailing/email.service';
import { SubscriptionExpiryService } from './subscription-expiry.service';
import {
  PaymentTransaction,
  PaymentTransactionDocument,
  PaymentTransactionStatus,
  PaymentMethod,
  Currency,
  DocumentType,
  PaymentTransactionType,
} from '../../payment/payment.schema';
import {
  Employee,
  EmployeeDocument,
  EmployeeHierarchyRole,
  EmploymentStatus,
  EmploymentType,
} from 'src/modules/hr/schemas';

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
    @InjectModel(RiskRules.name)
    private readonly riskRulesModel: Model<RiskRulesDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly mailService: EmailService,
    private readonly subscriptionExpiryService: SubscriptionExpiryService,
    @InjectModel(PaymentTransaction.name)
    private readonly transactionModel: Model<PaymentTransactionDocument>,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════

  async getDashboard() {
    const rootTenantFilter = {
      userType: UserType.TENANT,
      $or: [{ tenantId: null }, { tenantId: { $exists: false } }],
    };

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
      // ── All four tenant counts use rootTenantFilter ──────────
      this.userModel.countDocuments(rootTenantFilter),

      this.userModel.countDocuments({
        ...rootTenantFilter,
        status: AccountStatus.ACTIVE,
      }),

      this.userModel.countDocuments({
        ...rootTenantFilter,
        status: AccountStatus.SUSPENDED,
      }),

      this.userModel.countDocuments({
        ...rootTenantFilter,
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
        .find(rootTenantFilter)
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

    // Derive firstName/lastName: use DTO or fall back to contactPerson
    const firstName = dto.firstName || dto.contactPerson?.firstName || 'Tenant';
    const lastName = dto.lastName || dto.contactPerson?.lastName || 'Admin';
    const isPaidPlan = dto.plan && dto.plan !== SubscriptionPlan.FREE;

    // Generate a secure temporary password
    const tempPassword = this.generateTempPassword();
    const passwordToHash = isPaidPlan
      ? `placeholder-${Date.now()}-${Math.random()}`
      : tempPassword;
    const hashedPassword = await bcrypt.hash(passwordToHash, 12);

    const tenant = await this.userModel.create({
      userType: UserType.TENANT,
      firstName,
      lastName,
      email: dto.email.toLowerCase(),
      password: hashedPassword,
      phone: dto.phone || dto.contactPerson?.phone,
      roles: [dto.role || TenantRole.TENANT_OWNER],
      status: isPaidPlan
        ? AccountStatus.AWAITING_PAYMENT
        : AccountStatus.PENDING,
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

    await this.createOwnerEmployeeRecord(
      tenant._id as Types.ObjectId,
      tenant._id as Types.ObjectId,
      tenant.firstName,
      tenant.lastName,
      tenant.email,
    );

    // Send credentials by email
    if (!isPaidPlan) {
      await this.mailService.sendTenantWelcome({
        to: tenant.email,
        firstName,
        businessName: dto.businessName,
        tempPassword,
        loginUrl: `${process.env.TENANT_APP_URL}`,
      });
    }

    return tenant;
  }

  // async getTenants(pagination: PaginationDto, filters: TenantFilterDto) {
  //   const query: QueryFilter<UserDocument> = { userType: UserType.TENANT };

  //   if (filters.status) query.status = filters.status;
  //   if (filters.industry)
  //     query['tenantProfile.industry'] = {
  //       $regex: filters.industry,
  //       $options: 'i',
  //     };
  //   if (filters.search) {
  //     query.$or = [
  //       {
  //         'tenantProfile.businessName': {
  //           $regex: filters.search,
  //           $options: 'i',
  //         },
  //       },
  //       { email: { $regex: filters.search, $options: 'i' } },
  //       { firstName: { $regex: filters.search, $options: 'i' } },
  //       { lastName: { $regex: filters.search, $options: 'i' } },
  //     ];
  //   }

  //   const { skip, limit, page } = pagination;
  //   const [items, total] = await Promise.all([
  //     this.userModel
  //       .find(query)
  //       .skip(skip)
  //       .limit(limit)
  //       .select('-password -passwordResetToken')
  //       .sort({ createdAt: -1 })
  //       .lean(),
  //     this.userModel.countDocuments(query),
  //   ]);

  //   // Attach subscription to each tenant
  //   const tenantIds = items.map((t) => t._id);
  //   const [subscriptions, clientCounts] = await Promise.all([
  //     this.subscriptionModel.find({ tenantId: { $in: tenantIds } }).lean(),
  //     this.userModel.aggregate([
  //       { $match: { userType: UserType.CLIENT, tenantId: { $in: tenantIds } } },
  //       { $group: { _id: '$tenantId', count: { $sum: 1 } } },
  //     ]),
  //   ]);

  //   const subMap = subscriptions.reduce(
  //     (m, s) => {
  //       m[s.tenantId.toString()] = s;
  //       return m;
  //     },
  //     {} as Record<string, any>,
  //   );

  //   const countMap = clientCounts.reduce(
  //     (m, c) => {
  //       m[c._id.toString()] = c.count;
  //       return m;
  //     },
  //     {} as Record<string, number>,
  //   );

  //   const enriched = items.map((t) => ({
  //     ...t,
  //     subscription: subMap[t._id.toString()] || null,
  //     clientCount: countMap[t._id.toString()] ?? 0,
  //   }));

  //   return paginate(enriched, total, page, limit);
  // }

  async getTenants(pagination: PaginationDto, filters: TenantFilterDto) {
    // Only root tenant accounts — team members have tenantId set (pointing to owner)
    // Root tenants have tenantId: null (they are the owner, not under anyone)
    const query: QueryFilter<UserDocument> = {
      userType: UserType.TENANT,
      $or: [{ tenantId: null }, { tenantId: { $exists: false } }],
    };

    if (filters.status) query.status = filters.status;
    if (filters.industry) {
      query['tenantProfile.industry'] = {
        $regex: filters.industry,
        $options: 'i',
      };
    }
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

    const tenantIds = items.map((t) => t._id);

    const [subscriptions, clientCounts, userCounts] = await Promise.all([
      this.subscriptionModel.find({ tenantId: { $in: tenantIds } }).lean(),

      // Count KYC clients per tenant
      this.userModel.aggregate([
        {
          $match: {
            userType: UserType.CLIENT,
            tenantId: { $in: tenantIds },
          },
        },
        { $group: { _id: '$tenantId', count: { $sum: 1 } } },
      ]),

      // Count team members per tenant — real Employee HR records,
      // not User accounts. The owner gets a real Employee record at
      // tenant creation too (see createOwnerEmployeeRecord), so this
      // is the only count that actually includes them alongside
      // every staff member added afterward. Only active records
      // count toward the live seat total; an offboarded employee
      // frees up their seat.
      this.employeeModel.aggregate([
        {
          $match: {
            tenantId: { $in: tenantIds },
            employmentStatus: EmploymentStatus.ACTIVE,
          },
        },
        { $group: { _id: '$tenantId', count: { $sum: 1 } } },
      ]),
    ]);

    const subMap = subscriptions.reduce(
      (m, s) => {
        m[s.tenantId.toString()] = s;
        return m;
      },
      {} as Record<string, any>,
    );

    const clientCountMap = clientCounts.reduce(
      (m, c) => {
        m[c._id.toString()] = c.count;
        return m;
      },
      {} as Record<string, number>,
    );

    const userCountMap = userCounts.reduce(
      (m, c) => {
        m[c._id.toString()] = c.count;
        return m;
      },
      {} as Record<string, number>,
    );

    const enriched = items.map((t) => ({
      ...t,
      subscription: subMap[t._id.toString()] || null,
      clientCount: clientCountMap[t._id.toString()] ?? 0,
      userCount: userCountMap[t._id.toString()] ?? 0, // team members added
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

    await Promise.all([
      this.userModel.deleteOne({ _id: id }),
      this.userModel.deleteMany({ tenantId: new Types.ObjectId(id) }),
      this.subscriptionModel.deleteOne({ tenantId: new Types.ObjectId(id) }),
    ]);
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

    const module = await this.moduleModel.create(dto);

    // Every plan now includes every real module — no selective
    // inclusion left to configure, so a newly created module is
    // simply added everywhere.
    await this.planModel.updateMany(
      {},
      { $addToSet: { includedModules: module.key } },
    );

    // Every active/trial subscription gains the new module as part
    // of its plan grant. It also lands in activeModules by default
    // — the per-tenant toggle starts "on" and the super admin can
    // switch it off for a specific tenant afterward if needed.
    await this.subscriptionModel.updateMany(
      {
        status: { $in: [SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE] },
      },
      { $addToSet: { baseModules: module.key, activeModules: module.key } },
    );

    return module;
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
    const before = await this.moduleModel.findOne({ key }).lean();
    if (!before) throw new NotFoundException(`Module ${key} not found`);

    const mod = await this.moduleModel.findOneAndUpdate({ key }, dto, {
      new: true,
    });
    return mod;
  }

  // Genuinely global — retires or restores a module for the whole
  // platform (e.g. sunsetting it, or it isn't ready to launch yet).
  // This is deliberately NOT the per-tenant access control; that's
  // TenantSubscription.activeModules, set independently per tenant
  // via setTenantModuleAccess below. Disabling a module here removes
  // it from every tenant regardless of their own per-tenant toggle —
  // a real platform-wide operational switch, not a customer-facing
  // access decision.
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

    if (!isActive) {
      await this.subscriptionModel.updateMany(
        {},
        { $pull: { baseModules: key, activeModules: key } },
      );
      await this.planModel.updateMany({}, { $pull: { includedModules: key } });
    } else {
      await this.planModel.updateMany(
        {},
        { $addToSet: { includedModules: key } },
      );
      await this.subscriptionModel.updateMany(
        {
          status: {
            $in: [SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE],
          },
        },
        { $addToSet: { baseModules: key, activeModules: key } },
      );
    }

    return mod;
  }

  async deleteModule(key: string): Promise<void> {
    const mod = await this.moduleModel.findOneAndDelete({ key });
    if (!mod) throw new NotFoundException(`Module "${key}" not found`);

    // Clean up plan configs and subscriptions on delete too
    await Promise.all([
      this.planModel.updateMany({}, { $pull: { includedModules: key } }),
      this.subscriptionModel.updateMany(
        {},
        { $pull: { baseModules: key, activeModules: key } },
      ),
    ]);
  }

  // ── Per-tenant module access — the real, day-to-day control.
  // Every module is available on every plan, but a specific tenant
  // may not need one; this toggles it for that tenant alone, never
  // touching the plan, the module definition, or any other tenant.
  async setTenantModuleAccess(tenantId: string, key: string, enabled: boolean) {
    if (!Object.values(PlatformModuleKey).includes(key as PlatformModuleKey)) {
      throw new BadRequestException(`"${key}" is not a real platform module`);
    }
    const sub = await this.subscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!sub) throw new NotFoundException('Tenant has no subscription yet');

    if (enabled) {
      if (!sub.activeModules.includes(key as PlatformModuleKey)) {
        sub.activeModules.push(key as PlatformModuleKey);
      }
    } else {
      sub.activeModules = sub.activeModules.filter((m) => m !== key);
    }
    await sub.save();
    return sub.toObject();
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
    const before = await this.planModel.findOne({ plan }).lean();
    if (!before) throw new NotFoundException(`Plan "${plan}" not found`);

    const updated = await this.planModel.findOneAndUpdate({ plan }, dto, {
      new: true,
    });

    if (dto.includedModules !== undefined) {
      const prevModules: string[] = before.includedModules ?? [];
      const nextModules: string[] = dto.includedModules ?? [];

      const added = nextModules.filter((m) => !prevModules.includes(m));
      const removed = prevModules.filter((m) => !nextModules.includes(m));

      if (added.length > 0 || removed.length > 0) {
        const affectedSubs = await this.subscriptionModel
          .find({
            plan,
            status: {
              $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL],
            },
          })
          .lean();

        await Promise.all(
          affectedSubs.map(async (sub) => {
            let newBaseModules: string[] = [...(sub.baseModules || [])];

            if (added.length > 0) {
              newBaseModules = [...new Set([...newBaseModules, ...added])];
            }
            if (removed.length > 0) {
              newBaseModules = newBaseModules.filter(
                (m) => !removed.includes(m),
              );
            }

            const newActiveModules: string[] = added.length
              ? [...new Set([...(sub.activeModules || []), ...added])]
              : (sub.activeModules || []).filter((m) => !removed.includes(m));

            await this.subscriptionModel.findByIdAndUpdate(sub._id, {
              baseModules: newBaseModules as PlatformModuleKey[],
              activeModules: newActiveModules as PlatformModuleKey[],
            });
          }),
        );
      }
    }

    return updated;
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

    // Every real, active module — every plan grants all of them now,
    // there's no more per-plan selective inclusion.
    const allModules = (
      await this.moduleModel.find({ isActive: true }).select('key').lean()
    ).map((m) => m.key);

    const existing = await this.subscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
    });
    // A tenant's own per-tenant module toggle is independent of
    // plan — changing plan must not silently re-enable something
    // the super admin had deliberately switched off for them.
    const activeModules = existing?.activeModules?.length
      ? existing.activeModules
      : allModules;

    const now = new Date();
    const periodEnd = new Date(
      dto.endsAt ||
        new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    );

    const isFree = dto.plan === SubscriptionPlan.FREE;
    const trialEndsAt = isFree
      ? new Date(new Date().setDate(new Date().getDate() + 7))
      : null;

    const subscription = await this.subscriptionModel.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId) },
      {
        plan: dto.plan,
        status: isFree ? SubscriptionStatus.TRIAL : SubscriptionStatus.ACTIVE,
        baseModules: allModules,
        activeModules,
        currentPeriodStart: now,
        currentPeriodEnd: isFree ? trialEndsAt : periodEnd,
        trialEndsAt,
        assignedBy: new Types.ObjectId(assignedBy),
        maxUsersOverride: dto.maxUsersOverride || null,
        cancelledAt: null,
      },
      { new: true, upsert: true },
    );

    // Real payment, recorded alongside the plan change — omitted
    // entirely (no transaction) when nothing was actually paid, e.g.
    // Free, or Premium before its separately-quoted invoice is
    // settled. Written directly here (not via PaymentService) to
    // keep this module free of cross-module service dependencies —
    // the receipt-number generation is simple enough to duplicate
    // safely, matching the same pattern used elsewhere in this app
    // for exactly this reason.
    if (dto.paymentAmount && dto.paymentAmount > 0) {
      const receiptCount = await this.transactionModel.countDocuments({
        documentType: DocumentType.RECEIPT,
      });
      const receiptNumber = `LEX-REC-${String(receiptCount + 1).padStart(4, '0')}`;

      await this.transactionModel.create({
        tenantId: new Types.ObjectId(tenantId),
        type: existing
          ? PaymentTransactionType.SUBSCRIPTION_UPGRADE
          : PaymentTransactionType.SUBSCRIPTION_NEW,
        status: PaymentTransactionStatus.PAID,
        amount: dto.paymentAmount,
        currency: dto.paymentCurrency ?? Currency.USD,
        plan: dto.plan,
        paymentMethod: PaymentMethod.MANUAL,
        documentType: DocumentType.RECEIPT,
        receiptNumber,
        paidAt: new Date(),
        paymentReference: dto.paymentReference ?? null,
        notes:
          dto.paymentNotes ??
          `Recorded by super admin on plan change to ${dto.plan}`,
        recordedBy: new Types.ObjectId(assignedBy),
      });
    }

    // A tenant whose employees/clients were locked out by an earlier
    // suspension/expiry cascade regains access the moment the super
    // admin puts them on a real, active plan again. Reactivation only
    // ever touches users this same cascade mechanism deactivated —
    // see cascadeReactivateTenantUsers — so someone suspended for an
    // unrelated reason stays untouched.
    if (!isFree) {
      await this.subscriptionExpiryService.cascadeReactivateTenantUsers(
        tenantId,
      );
    }

    return subscription;
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

    const isActive = dto.status === SubscriptionStatus.ACTIVE;
    if (isActive) {
      await this.subscriptionExpiryService.cascadeReactivateTenantUsers(
        tenantId,
      );
    } else {
      await this.subscriptionExpiryService.cascadeDeactivateTenantUsers(
        tenantId,
      );
    }
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
  // RISK RULES
  // ═══════════════════════════════════════════════════════════

  async getRiskRules(): Promise<RiskRulesDocument> {
    const rules = await this.riskRulesModel.findOne().lean();
    if (!rules) {
      // Return sensible defaults if none set yet
      return {
        highRisk: 75,
        mediumRisk: 40,
        autoFlagTransaction: 10000,
        reviewPeriod: 180,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;
    }
    return rules as RiskRulesDocument;
  }

  async createOrUpdateRiskRules(
    dto: CreateRiskRulesDto,
  ): Promise<RiskRulesDocument> {
    const rules = await this.riskRulesModel.findOneAndUpdate(
      {},
      { $set: dto },
      { new: true, upsert: true },
    );
    return rules;
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
    // Every plan grants every real module now — no more branching
    // on which plan was chosen.
    const allModules = await this.moduleModel
      .find({ isActive: true })
      .select('key')
      .lean();
    const baseModules = allModules.map((m) => m.key);

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7); // 7-day trial

    // For paid plans, no trial - just a standard period
    const isPaidPlan = plan != SubscriptionPlan.FREE;
    const periodEnd = isPaidPlan
      ? new Date(new Date().setMonth(new Date().getMonth() + 1))
      : trialEndsAt;

    await this.subscriptionModel.create({
      tenantId: new Types.ObjectId(tenantId),
      plan,
      status: isPaidPlan ? SubscriptionStatus.ACTIVE : SubscriptionStatus.TRIAL,
      baseModules,
      activeModules: baseModules,
      trialEndsAt: isPaidPlan ? null : trialEndsAt,
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
      assignedBy: new Types.ObjectId(assignedBy),
    });
  }

  private async createOwnerEmployeeRecord(
    tenantId: Types.ObjectId,
    userId: Types.ObjectId,
    firstName: string,
    lastName: string,
    email: string,
  ): Promise<void> {
    const count = await this.employeeModel.countDocuments({ tenantId });
    const employeeNumber = `EMP-${String(count + 1).padStart(4, '0')}`;

    await this.employeeModel.create({
      tenantId,
      teamId: null,
      locationId: null,
      userId,
      firstName,
      lastName,
      email: email.toLowerCase(),
      employeeNumber,
      jobTitle: 'Owner',
      hierarchyRole: EmployeeHierarchyRole.OWNER,
      reportsToManagerId: null,
      reportsToTenantId: tenantId,
      employmentType: EmploymentType.FULL_TIME,
      employmentStatus: EmploymentStatus.ACTIVE,
      startDate: new Date(),
      salaryCurrency: 'RWF',
      salaryFrequency: 'monthly',
      annualLeaveBalance: 21,
      sickLeaveBalance: 10,
      metadata: { isOwnerRecord: true },
    });
  }
}
