import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type QueryFilter } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import {
  ClientProfileRecord,
  ClientProfileDocument,
} from '../schemas/client-profile.schema';
import {
  QuickAddClientDto,
  UpdateClientProfileDto,
  ClientFilterDto,
  AssignClientDto,
  UpdateClientStatusDto,
  RequestClientInfoDto,
} from '../dto/client.dto';
import {
  UserType,
  ClientRole,
  AccountStatus,
} from '../../../common/interfaces/user-role.enum';
import { PaginationDto, paginate } from '../../../common/pagination.dto';
import { EmailService } from '../../../common/utils/mailing/email.service';
import { timestamp } from 'rxjs';
import { VerificationService } from './verification.service';

@Injectable()
export class TenantClientsService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(ClientProfileRecord.name)
    private readonly profileModel: Model<ClientProfileDocument>,
    @InjectModel('OnboardingSubmission')
    private readonly onboardingModel: Model<any>,
    @InjectModel('TenantSubscription')
    private readonly subscriptionModel: Model<any>,
    private readonly mailService: EmailService,
    private readonly verificationService: VerificationService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // QUICK ADD
  // ═══════════════════════════════════════════════════════════
  async quickAddClient(
    dto: QuickAddClientDto,
    tenantId: string,
    addedBy: string,
  ) {
    await this.enforceClientLimit(tenantId);

    const emailTaken = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (emailTaken)
      throw new ConflictException('Email already registered on the platform');

    // Split fullName into firstName + lastName
    const nameParts = dto.fullName.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '-';

    const tempPassword = this.generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const client = await this.userModel.create({
      userType: UserType.CLIENT,
      firstName,
      lastName,
      email: dto.email.toLowerCase(),
      password: hashedPassword,
      phone: dto.phoneNumber,
      roles: [ClientRole.CLIENT_PRIMARY],
      status: AccountStatus.PENDING,
      tenantId: new Types.ObjectId(tenantId),
      createdBy: new Types.ObjectId(addedBy),
      mustChangePassword: true,
      clientProfile: {
        classifications: dto.clientType,
      },
    });

    // Create extended profile
    await this.profileModel.create({
      userId: client._id,
      tenantId: new Types.ObjectId(tenantId),
      assignedTo: new Types.ObjectId(addedBy),
      classifications: dto.clientType,
      kycStatus: 'not_started',
    });

    // Get tenant business name
    const tenant = await this.userModel
      .findById(tenantId)
      .select('tenantProfile.businessName firstName')
      .lean();

    await this.mailService.sendClientWelcome({
      to: client.email,
      firstName,
      tenantBusinessName:
        (tenant as any)?.tenantProfile?.businessName || 'Your Provider',
      tempPassword,
      loginUrl: `${process.env.CLIENT_APP_URL || 'http://localhost:3000'}/login`,
      clientType: client.clientProfile.classifications,
    });

    const obj = client.toObject();
    delete obj.password;
    return {
      success: true,
      message:
        'Client added successfully. Login credentials sent to their email.',
      data: obj,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // GET CLIENTS (Onboarding & CDD list view)
  // ═══════════════════════════════════════════════════════════
  async getClients(
    tenantId: string,
    pagination: PaginationDto,
    filters: ClientFilterDto,
  ) {
    const userQuery: QueryFilter<UserDocument> = {
      userType: UserType.CLIENT,
      tenantId: new Types.ObjectId(tenantId),
    };
    if (filters.status) userQuery.status = filters.status;
    if (filters.search) {
      userQuery.$or = [
        { firstName: { $regex: filters.search, $options: 'i' } },
        { lastName: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const { skip, limit, page } = pagination;

    const pipeline: any[] = [
      { $match: userQuery },
      {
        $lookup: {
          from: 'client_profiles',
          localField: '_id',
          foreignField: 'userId',
          as: 'profile',
        },
      },
      { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
      ...(filters.classification
        ? [
            {
              $match: {
                'profile.classifications': { $in: [filters.classification] },
              },
            },
          ]
        : []),
      {
        $addFields: {
          fullName: { $concat: ['$firstName', ' ', '$lastName'] },
          classifications: '$profile.classifications',
          kycStatus: '$profile.kycStatus',
          riskLevel: '$profile.riskLevel',
          country: '$profile.address.country',
          assignedTo: '$profile.assignedTo',
        },
      },
      { $project: { password: 0, passwordResetToken: 0 } },
      { $sort: { createdAt: -1 } },
    ];

    const [items, countResult] = await Promise.all([
      this.userModel.aggregate([
        ...pipeline,
        { $skip: skip },
        { $limit: limit },
      ]),
      this.userModel.aggregate([...pipeline, { $count: 'total' }]),
    ]);

    const total = countResult[0]?.total || 0;
    return paginate(items, total, page, limit);
  }

  // ═══════════════════════════════════════════════════════════
  // GET CLIENT BY ID (full detail view with all tabs data)
  // ═══════════════════════════════════════════════════════════
  async getClientById(clientId: string, tenantId: string) {
    const client = await this.userModel
      .findOne({
        _id: clientId,
        tenantId: new Types.ObjectId(tenantId),
        userType: UserType.CLIENT,
      })
      .select('-password -passwordResetToken')
      .lean();
    if (!client) throw new NotFoundException('Client not found');

    const [profile, onboarding] = await Promise.all([
      this.profileModel
        .findOne({ userId: new Types.ObjectId(clientId) })
        .populate('assignedTo', 'firstName lastName email roles')
        .lean(),
      this.onboardingModel
        .findOne({ clientId: new Types.ObjectId(clientId) })
        .lean(),
    ]);

    return {
      ...client,
      fullName: `${client.firstName} ${client.lastName}`,
      profile: profile || null,
      onboarding: onboarding || null,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // PENDING APPROVALS (Onboarding & CDD queue)
  // ═══════════════════════════════════════════════════════════
  async getPendingApprovals(tenantId: string, pagination: PaginationDto) {
    const { skip, limit, page } = pagination;

    const pipeline: any[] = [
      {
        $match: {
          userType: UserType.CLIENT,
          tenantId: new Types.ObjectId(tenantId),
        },
      },
      {
        $lookup: {
          from: 'client_profiles',
          localField: '_id',
          foreignField: 'userId',
          as: 'profile',
        },
      },
      { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
      {
        $match: {
          'profile.kycStatus': {
            $in: ['not_started'],
          },
        },
      },
      {
        $addFields: {
          fullName: { $concat: ['$firstName', ' ', '$lastName'] },
          classifications: '$profile.classifications',
          kycStatus: '$profile.kycStatus',
          country: '$profile.address.country',
        },
      },
      { $project: { password: 0, passwordResetToken: 0 } },
      { $sort: { createdAt: -1 } },
    ];

    const [items, countResult] = await Promise.all([
      this.userModel.aggregate([
        ...pipeline,
        { $skip: skip },
        { $limit: limit },
      ]),
      this.userModel.aggregate([...pipeline, { $count: 'total' }]),
    ]);

    return paginate(items, countResult[0]?.total || 0, page, limit);
  }

  async getOnboardingInProgress(tenantId: string, pagination: PaginationDto) {
    const { skip, limit, page } = pagination;

    const pipeline: any[] = [
      {
        $match: {
          userType: UserType.CLIENT,
          tenantId: new Types.ObjectId(tenantId),
        },
      },
      {
        $lookup: {
          from: 'client_profiles',
          localField: '_id',
          foreignField: 'userId',
          as: 'profile',
        },
      },
      { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
      {
        // ✅ Clients actively filling or who have submitted
        $match: {
          'profile.kycStatus': { $in: ['in_progress', 'submitted'] },
        },
      },
      {
        $lookup: {
          from: 'onboarding_submissions',
          localField: '_id',
          foreignField: 'clientId',
          as: 'onboarding',
        },
      },
      { $unwind: { path: '$onboarding', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          fullName: { $concat: ['$firstName', ' ', '$lastName'] },
          classifications: '$profile.classifications',
          kycStatus: '$profile.kycStatus',
          country: '$profile.address.country',
          completionPercent: '$onboarding.completionPercent',
          submittedAt: '$onboarding.submittedAt',
          lastSavedAt: '$onboarding.lastSavedAt',
          documents: '$onboarding.documents',
        },
      },
      { $project: { password: 0, passwordResetToken: 0 } },
      { $sort: { createdAt: -1 } },
    ];

    const [items, countResult] = await Promise.all([
      this.userModel.aggregate([
        ...pipeline,
        { $skip: skip },
        { $limit: limit },
      ]),
      this.userModel.aggregate([...pipeline, { $count: 'total' }]),
    ]);

    return paginate(items, countResult[0]?.total || 0, page, limit);
  }
  // ═══════════════════════════════════════════════════════════
  // CLIENT (KYC|AML) MANAGEMENT | Verification calls OpenSacntions
  // ═══════════════════════════════════════════════════════════

  async runVerifications(
    clientId: string,
    tenantId: string,
    completedBy: string,
  ) {
    // Confirm client belongs to this tenant before running
    const client = await this.userModel.findOne({
      _id: clientId,
      tenantId: new Types.ObjectId(tenantId),
      userType: UserType.CLIENT,
    });
    if (!client) throw new NotFoundException('Client not found');

    const profile = await this.profileModel.findOne({
      userId: new Types.ObjectId(clientId),
    });

    if (!profile || profile.kycStatus !== 'submitted') {
      throw new BadRequestException(
        'Client must have submitted their onboarding form before verifications can be run.',
      );
    }

    // Delegate to VerificationService — runs all checks in parallel
    const results = await this.verificationService.runAllVerifications(
      clientId,
      tenantId,
      completedBy,
    );

    return {
      success: true,
      message: 'Verifications completed.',
      results,
    };
  }

  async approveClient(clientId: string, tenantId: string, approvedBy: string) {
    const client = await this.userModel.findOne({
      _id: clientId,
      tenantId: new Types.ObjectId(tenantId),
      userType: UserType.CLIENT,
    });
    if (!client) throw new NotFoundException('Client not found');

    const profile = await this.profileModel.findOne({
      userId: new Types.ObjectId(clientId),
    });

    // ── Verification gate ─────────────────────────────────────
    // Client must have submitted their onboarding before approval
    if (!profile || profile.kycStatus !== 'submitted') {
      throw new BadRequestException(
        'Client has not submitted their onboarding form. ' +
          'Approval is only possible after the client submits and ' +
          'verifications have been completed.',
      );
    }

    // Check that verifications have been run (verificationCompletedAt set by
    // the verification service when all checks pass)
    if (!profile.verificationCompletedAt) {
      throw new BadRequestException(
        'Verifications must be completed before approving this client. ' +
          'Run all verification checks in the Onboarding Detail view first.',
      );
    }

    await Promise.all([
      this.userModel.findByIdAndUpdate(clientId, {
        status: AccountStatus.ACTIVE,
      }),
      this.profileModel.findOneAndUpdate(
        { userId: new Types.ObjectId(clientId) },
        {
          kycStatus: 'approved',
          kycCompletedAt: new Date(),
          $push: {
            'metadata.auditTrail': {
              action: 'approved',
              performedBy: approvedBy,
              timestamp: new Date(),
            },
          },
        },
      ),
    ]);

    return { success: true, message: 'Client approved successfully' };
  }

  async rejectClient(
    clientId: string,
    tenantId: string,
    rejectedBy: string,
    reason: string,
  ) {
    const client = await this.userModel.findOne({
      _id: clientId,
      tenantId: new Types.ObjectId(tenantId),
      userType: UserType.CLIENT,
    });
    if (!client) throw new NotFoundException('Client not found');

    await this.userModel.findByIdAndUpdate(clientId, {
      status: AccountStatus.INACTIVE,
    });

    await this.profileModel.findOneAndUpdate(
      { userId: new Types.ObjectId(clientId) },
      {
        kycStatus: 'rejected',
        $push: {
          'metadata.auditTrail': {
            action: 'rejected',
            reason,
            performedBy: rejectedBy,
            timestamp: new Date(),
          },
        },
      },
    );

    const tenant = await this.userModel
      .findById(tenantId)
      .select('tenantProfile.businessName firstName')
      .lean();

    await this.mailService.sendClientRejection({
      to: client.email,
      firstName: client.firstName,
      tenantBusinessName:
        (tenant as any)?.tenantProfile?.businessName || 'Your Provider',
      reason:
        reason ||
        'Your application did not meet our current verification requirements',
      loginUrl: `${process.env.CLIENT_APP_URL}`,
    });

    return { success: true, message: 'Client rejected and notified via email' };
  }

  async reactivateClient(
    clientId: string,
    tenantId: string,
    reactivatedBy: string,
  ) {
    const client = await this.userModel.findOne({
      _id: clientId,
      tenantId: new Types.ObjectId(tenantId),
      userType: UserType.CLIENT,
      status: AccountStatus.INACTIVE,
    });
    if (!client)
      throw new NotFoundException('Client not found or is not inactive');

    await this.userModel.findByIdAndUpdate(clientId, {
      status: AccountStatus.PENDING,
    });

    await this.profileModel.findOneAndUpdate(
      { userId: new Types.ObjectId(clientId) },
      {
        kycStatus: 'not_started',
        $push: {
          'metadata.auditTrail': {
            action: 'reactivated',
            performedBy: reactivatedBy,
            timestamp: new Date(),
            note: 'Account reactivated — client may re-submit onboarding',
          },
        },
      },
    );

    return {
      success: true,
      message:
        'Client reactivated. They can now log in and redo their onboarding.',
    };
  }

  async requestInfo(
    clientId: string,
    tenantId: string,
    dto: RequestClientInfoDto,
  ) {
    const client = await this.userModel.findOne({
      _id: clientId,
      tenantId: new Types.ObjectId(tenantId),
      userType: UserType.CLIENT,
    });
    if (!client) throw new NotFoundException('Client not found');

    await this.profileModel.findOneAndUpdate(
      { userId: new Types.ObjectId(clientId) },
      {
        kycStatus: 'in_progress',
        $push: {
          'metadata.infoRequests': {
            message: dto.message,
            requiredDocuments: dto.requiredDocuments || [],
            requestedAt: new Date(),
          },
        },
      },
    );

    // Get tenant info for the email
    const tenant = await this.userModel
      .findById(tenantId)
      .select('tenantProfile.businessName firstName')
      .lean();

    // Send email to client
    await this.mailService.sendInfoRequest({
      to: client.email,
      firstName: client.firstName,
      tenantBusinessName:
        (tenant as any)?.tenantProfile?.businessName || 'Your Provider',
      message: dto.message,
      requiredDocuments: dto.requiredDocuments || [],
      loginUrl: `${process.env.CLIENT_APP_URL}`,
    });

    return {
      success: true,
      message: `Information request sent to ${client.email}`,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // ASSIGN CLIENT
  // ═══════════════════════════════════════════════════════════
  async assignClient(clientId: string, dto: AssignClientDto, tenantId: string) {
    const assignee = await this.userModel.findOne({
      _id: dto.userId,
      tenantId: new Types.ObjectId(tenantId),
      userType: UserType.TENANT,
      status: AccountStatus.ACTIVE,
    });
    if (!assignee)
      throw new NotFoundException('Team member not found or inactive');

    const profile = await this.profileModel
      .findOneAndUpdate(
        { userId: new Types.ObjectId(clientId) },
        { assignedTo: new Types.ObjectId(dto.userId) },
        { new: true },
      )
      .populate('assignedTo', 'firstName lastName email');

    if (!profile) throw new NotFoundException('Client profile not found');
    return profile;
  }

  // ═══════════════════════════════════════════════════════════
  // DELETE CLIENT
  // ═══════════════════════════════════════════════════════════
  async deleteClient(clientId: string, tenantId: string): Promise<void> {
    const client = await this.userModel.findOne({
      _id: clientId,
      tenantId: new Types.ObjectId(tenantId),
      userType: UserType.CLIENT,
    });
    if (!client) throw new NotFoundException('Client not found');

    // Delete user record, profile, and onboarding submission
    await Promise.all([
      this.userModel.deleteOne({ _id: clientId }),
      this.profileModel.deleteOne({ userId: new Types.ObjectId(clientId) }),
      this.onboardingModel.deleteOne({
        clientId: new Types.ObjectId(clientId),
      }),
    ]);
  }

  // ═══════════════════════════════════════════════════════════
  // UPDATE STATUS
  // ═══════════════════════════════════════════════════════════
  async updateClientStatus(
    clientId: string,
    dto: UpdateClientStatusDto,
    tenantId: string,
  ) {
    const client = await this.userModel
      .findOneAndUpdate(
        {
          _id: clientId,
          tenantId: new Types.ObjectId(tenantId),
          userType: UserType.CLIENT,
        },
        { status: dto.status },
        { new: true },
      )
      .select('-password');
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  // ═══════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════
  async getClientStats(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);

    const [total, byStatus, byClassification, kycStats, recentClients] =
      await Promise.all([
        // ✅ Only count active clients — excludes soft-deleted (INACTIVE)
        this.userModel.countDocuments({
          userType: UserType.CLIENT,
          tenantId: tId,
          status: { $ne: AccountStatus.INACTIVE },
        }),

        // ✅ Group by status — excludes INACTIVE from breakdown
        this.userModel.aggregate([
          {
            $match: {
              userType: UserType.CLIENT,
              tenantId: tId,
              status: { $ne: AccountStatus.INACTIVE },
            },
          },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),

        // ✅ Fix: classifications is a string not array — remove $unwind
        //    Also exclude inactive clients' profiles
        this.profileModel.aggregate([
          {
            $match: {
              tenantId: tId,
              // Exclude profiles whose users are inactive by joining
              // We filter by kycStatus != rejected/expired as a proxy,
              // but the cleaner fix is a $lookup to exclude inactive users
            },
          },
          {
            $lookup: {
              from: 'users',
              localField: 'userId',
              foreignField: '_id',
              as: 'user',
            },
          },
          { $unwind: '$user' },
          { $match: { 'user.status': { $ne: AccountStatus.INACTIVE } } },
          {
            $group: {
              _id: '$classifications', // ← string field, no $unwind needed
              count: { $sum: 1 },
            },
          },
        ]),

        // ✅ KYC stats — exclude inactive users
        this.profileModel.aggregate([
          { $match: { tenantId: tId } },
          {
            $lookup: {
              from: 'users',
              localField: 'userId',
              foreignField: '_id',
              as: 'user',
            },
          },
          { $unwind: '$user' },
          { $match: { 'user.status': { $ne: AccountStatus.INACTIVE } } },
          { $group: { _id: '$kycStatus', count: { $sum: 1 } } },
        ]),

        // ✅ Recent clients — excludes INACTIVE
        this.userModel
          .find({
            userType: UserType.CLIENT,
            tenantId: tId,
            status: { $ne: AccountStatus.INACTIVE },
          })
          .select('firstName lastName email status createdAt')
          .sort({ createdAt: -1 })
          .limit(5)
          .lean(),
      ]);

    return { total, byStatus, byClassification, kycStats, recentClients };
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════
  private async enforceClientLimit(tenantId: string) {
    const subscription = await this.subscriptionModel
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!subscription) return;

    const planLimits: Record<string, number> = {
      free: 10,
      starter: 50,
      professional: 500,
      enterprise: 999999,
    };
    const maxClients =
      subscription.maxClientsOverride || planLimits[subscription.plan] || 10;
    const currentCount = await this.userModel.countDocuments({
      userType: UserType.CLIENT,
      tenantId: new Types.ObjectId(tenantId),
      status: { $ne: AccountStatus.INACTIVE },
    });
    if (currentCount >= maxClients) {
      throw new ForbiddenException(
        `Client limit reached (${maxClients}). Upgrade your plan to add more clients.`,
      );
    }
  }

  private calculateCompletion(dto: UpdateClientProfileDto): number {
    const fields = [
      dto.firstName,
      dto.lastName,
      dto.address?.country,
      dto.individualProfile?.dateOfBirth || dto.entityProfile?.companyName,
      dto.individualProfile?.nationality ||
        dto.entityProfile?.incorporationCountry,
      dto.individualProfile?.idNumber ||
        dto.entityProfile?.companyRegistrationNumber,
      dto.individualProfile?.occupation || dto.entityProfile?.industry,
      dto.individualProfile?.sourceOfFunds || dto.entityProfile?.sourceOfFunds,
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const special = '@#$!';
    let pass = '';
    for (let i = 0; i < 10; i++)
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    pass += special.charAt(Math.floor(Math.random() * special.length));
    pass += Math.floor(Math.random() * 9);
    return pass;
  }
}
