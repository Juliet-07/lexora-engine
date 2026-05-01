import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type QueryFilter } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from '../auth/schemas/user.schema';
import {
  ClientProfileRecord,
  ClientProfileDocument,
} from './schemas/client-profile.schema';
import {
  QuickAddClientDto,
  UpdateClientProfileDto,
  ClientFilterDto,
  AssignClientDto,
  UpdateClientStatusDto,
  RequestClientInfoDto,
} from './dto/client.dto';
import {
  UserType,
  ClientRole,
  AccountStatus,
} from '../../common/interfaces/user-role.enum';
import { PaginationDto, paginate } from '../../common/pagination.dto';
import { EmailService } from '../../common/utils/mailing/email.service';

@Injectable()
export class TenantClientsService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(ClientProfileRecord.name)
    private readonly profileModel: Model<ClientProfileDocument>,
    @InjectModel('TenantSubscription')
    private readonly subscriptionModel: Model<any>,
    private readonly mailService: EmailService,
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
      loginUrl: `${process.env.APP_URL || 'http://localhost:3000'}/login`,
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

    const profile = await this.profileModel
      .findOne({ userId: new Types.ObjectId(clientId) })
      .populate('assignedTo', 'firstName lastName email roles')
      .lean();

    return {
      ...client,
      fullName: `${client.firstName} ${client.lastName}`,
      profile: profile || null,
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
            $in: ['submitted', 'in_progress', 'not_started'],
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

  // ═══════════════════════════════════════════════════════════
  // APPROVE CLIENT
  // ═══════════════════════════════════════════════════════════
  async approveClient(clientId: string, tenantId: string, approvedBy: string) {
    const client = await this.userModel.findOne({
      _id: clientId,
      tenantId: new Types.ObjectId(tenantId),
      userType: UserType.CLIENT,
    });
    if (!client) throw new NotFoundException('Client not found');

    await this.userModel.findByIdAndUpdate(clientId, {
      status: AccountStatus.ACTIVE,
    });

    await this.profileModel.findOneAndUpdate(
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
    );

    return { success: true, message: 'Client approved successfully' };
  }

  // ═══════════════════════════════════════════════════════════
  // REJECT CLIENT
  // ═══════════════════════════════════════════════════════════
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

    return { success: true, message: 'Client rejected' };
  }

  // ═══════════════════════════════════════════════════════════
  // REQUEST INFO
  // ═══════════════════════════════════════════════════════════
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

    // In production: send email to client with the request
    return { success: true, message: 'Information request sent to client' };
  }

  // ═══════════════════════════════════════════════════════════
  // UPDATE CLIENT PROFILE
  // ═══════════════════════════════════════════════════════════
  async updateClientProfile(
    clientId: string,
    dto: UpdateClientProfileDto,
    tenantId: string,
  ) {
    const userUpdate: any = {};
    if (dto.firstName) userUpdate.firstName = dto.firstName;
    if (dto.lastName) userUpdate.lastName = dto.lastName;
    if (dto.phone) userUpdate.phone = dto.phone;

    if (Object.keys(userUpdate).length) {
      await this.userModel.findOneAndUpdate(
        {
          _id: clientId,
          tenantId: new Types.ObjectId(tenantId),
          userType: UserType.CLIENT,
        },
        { $set: userUpdate },
      );
    }

    const profileUpdate: any = {};
    if (dto.classifications)
      profileUpdate.classifications = dto.classifications;
    if (dto.address) profileUpdate.address = dto.address;
    if (dto.individualProfile)
      profileUpdate.individualProfile = dto.individualProfile;
    if (dto.entityProfile) profileUpdate.entityProfile = dto.entityProfile;
    if (dto.isPoliticallyExposed !== undefined)
      profileUpdate.isPoliticallyExposed = dto.isPoliticallyExposed;
    if (dto.pepDetails) profileUpdate.pepDetails = dto.pepDetails;
    profileUpdate.profileCompletionPercent = this.calculateCompletion(dto);

    await this.profileModel.findOneAndUpdate(
      { userId: new Types.ObjectId(clientId) },
      { $set: profileUpdate },
      { upsert: true },
    );

    return this.getClientById(clientId, tenantId);
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
  // STATUS / PASSWORD / REMOVE
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

  //   async resetClientPassword(clientId: string, tenantId: string) {
  //     const client = await this.userModel.findOne({
  //       _id: clientId,
  //       tenantId: new Types.ObjectId(tenantId),
  //       userType: UserType.CLIENT,
  //     });
  //     if (!client) throw new NotFoundException('Client not found');
  //     const tempPassword = this.generateTempPassword();
  //     client.password = await bcrypt.hash(tempPassword, 12);
  //     client.mustChangePassword = true;
  //     await client.save();
  //     await this.mailService.sendPasswordReset({
  //       to: client.email,
  //       firstName: client.firstName,
  //       tempPassword,
  //     });
  //     return { message: 'Password reset and sent to client email' };
  //   }

  async removeClient(clientId: string, tenantId: string): Promise<void> {
    const client = await this.userModel.findOne({
      _id: clientId,
      tenantId: new Types.ObjectId(tenantId),
      userType: UserType.CLIENT,
    });
    if (!client) throw new NotFoundException('Client not found');
    await this.userModel.findByIdAndUpdate(clientId, {
      status: AccountStatus.INACTIVE,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════
  async getClientStats(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const [total, byStatus, byClassification, kycStats, recentClients] =
      await Promise.all([
        this.userModel.countDocuments({
          userType: UserType.CLIENT,
          tenantId: tId,
        }),
        this.userModel.aggregate([
          { $match: { userType: UserType.CLIENT, tenantId: tId } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        this.profileModel.aggregate([
          { $match: { tenantId: tId } },
          { $unwind: '$classifications' },
          { $group: { _id: '$classifications', count: { $sum: 1 } } },
        ]),
        this.profileModel.aggregate([
          { $match: { tenantId: tId } },
          { $group: { _id: '$kycStatus', count: { $sum: 1 } } },
        ]),
        this.userModel
          .find({ userType: UserType.CLIENT, tenantId: tId })
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
