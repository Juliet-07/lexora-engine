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
import { VerificationService } from './verification.service';
import { EngagementLetterService } from './engagement-letter.service';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

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
    private readonly engagementLetterService: EngagementLetterService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // QUICK ADD
  // ═══════════════════════════════════════════════════════════
  async quickAddClient(
    dto: QuickAddClientDto,
    tenantId: string,
    addedBy: string,
  ) {
    // ── 1. Check engagement document setup FIRST ───────────────
    // This throws ForbiddenException if tenant hasn't set up their
    // document and hasn't explicitly bypassed the requirement.
    const { requiresSigning, letter } =
      await this.engagementLetterService.checkTenantSetup(tenantId);

    // ── 2. Standard checks ─────────────────────────────────────
    const emailTaken = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (emailTaken)
      throw new ConflictException('Email already registered on the platform');

    const nameParts = dto.fullName.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '-';

    // ── 3. Create client with placeholder password ─────────────
    // Real password is only set after engagement letter is signed.
    // If bypass is on, we set a real password immediately below.
    const placeholderPassword = await bcrypt.hash(
      `placeholder-${Date.now()}`,
      12,
    );

    const client = await this.userModel.create({
      userType: UserType.CLIENT,
      firstName,
      lastName,
      email: dto.email.toLowerCase(),
      password: placeholderPassword,
      phone: dto.phoneNumber,
      roles: [ClientRole.CLIENT_PRIMARY],
      // Status stays PENDING until engagement letter is signed
      // (or PENDING immediately if bypass is on — same status, different path)
      status: AccountStatus.PENDING,
      tenantId: new Types.ObjectId(tenantId),
      createdBy: new Types.ObjectId(addedBy),
      mustChangePassword: true,
      clientProfile: {
        classifications: dto.clientType,
      },
    });

    await this.profileModel.create({
      userId: client._id,
      tenantId: new Types.ObjectId(tenantId),
      assignedTo: new Types.ObjectId(addedBy),
      classifications: dto.clientType,
      kycStatus: 'not_started',
      engagementLetterSigned: false,
      engagementLetterSignedAt: null,
    });

    const tenant = await this.userModel
      .findById(tenantId)
      .select('tenantProfile.businessName firstName')
      .lean();
    const businessName =
      (tenant as any)?.tenantProfile?.businessName || 'Your Provider';

    // ── 4. Route based on setup ────────────────────────────────
    if (requiresSigning && letter) {
      // Send engagement letter to prospect — NO credentials yet
      await this.engagementLetterService.sendEngagementLetterToClient(
        client._id.toString(),
        tenantId,
        letter,
      );

      const obj = client.toObject();
      delete obj.password;
      return {
        success: true,
        message:
          'Prospect added. Engagement document sent to their email for signing. ' +
          'They will receive login credentials once they sign.',
        data: obj,
      };
    }

    // Bypass is on — send credentials immediately (old flow)
    const tempPassword = this.generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    await this.userModel.findByIdAndUpdate(client._id, {
      password: hashedPassword,
    });

    await this.mailService.sendClientWelcome({
      to: client.email,
      firstName,
      tenantBusinessName: businessName,
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
    callerId: string,
    callerUserType: string,
    callerRoles: string[],
  ) {
    // Same admin-access rule the frontend uses to decide which view
    // to show (tenant owner, or tagged staff with real roles) —
    // replicated here so it's real access control, not just a UI
    // choice the caller could ignore by editing the query string.
    const callerHasAdminAccess =
      callerUserType === 'tenant' ||
      (callerUserType === 'employee' && callerRoles.length > 0);
    const assignedTo = callerHasAdminAccess ? filters.assignedTo : callerId;

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
      ...(assignedTo
        ? [
            {
              $match: {
                'profile.assignedTo': new Types.ObjectId(assignedTo),
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

    await Promise.all([
      this.profileModel.findOneAndUpdate(
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
      ),

      this.onboardingModel.findOneAndUpdate(
        {
          clientId: new Types.ObjectId(clientId),
        },
        { $set: { status: 'under_review' } },
      ),
    ]);

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
      loginUrl: `${process.env.CLIENT_APP_URL}/login`,
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
  // REPORT
  // ═══════════════════════════════════════════════════════════
  async generateClientReport(
    clientId: string,
    tenantId: string,
  ): Promise<{ filePath: string; fileName: string }> {
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
        .populate('assignedTo', 'firstName lastName email')
        .lean(),
      this.onboardingModel
        .findOne({ clientId: new Types.ObjectId(clientId) })
        .lean(),
    ]);

    const tenant = await this.userModel
      .findById(tenantId)
      .select('tenantProfile.businessName')
      .lean();

    const businessName =
      (tenant as any)?.tenantProfile?.businessName || 'Lexora';
    const clientFullName = `${(client as any).firstName} ${(client as any).lastName}`;

    // ── Generate PDF ──────────────────────────────────────────
    const reportDir = path.join(process.cwd(), 'uploads', 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const fileName = `kyc-report-${clientId}-${Date.now()}.pdf`;
    const filePath = path.join(reportDir, fileName);

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 60, bottom: 60, left: 72, right: 72 },
      });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const pageWidth = doc.page.width;
      const PURPLE = '#4B0082';
      const GOLD = '#C9A84C';
      const DARK = '#1A1A2E';
      const GREY = '#6B7280';

      // ── Header ──────────────────────────────────────────────
      doc.rect(0, 0, pageWidth, 80).fill(PURPLE);
      doc
        .fillColor('#FFFFFF')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('LEXORA', 72, 24);
      doc
        .fillColor('rgba(255,255,255,0.7)')
        .fontSize(10)
        .font('Helvetica')
        .text('KYC Client Report', 72, 50);
      doc
        .fillColor('#FFFFFF')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(businessName, 0, 32, { align: 'right', width: pageWidth - 72 });

      // Gold bar
      doc.rect(0, 80, pageWidth, 4).fill(GOLD);

      doc.moveDown(3);

      // ── Report title ─────────────────────────────────────────
      doc
        .fillColor(DARK)
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('KYC Client Report', { align: 'center' });
      doc.moveDown(0.3);
      doc
        .fillColor(GREY)
        .fontSize(11)
        .font('Helvetica')
        .text(`Generated: ${new Date().toLocaleString('en-GB')}`, {
          align: 'center',
        });

      doc.moveDown(1.5);
      doc
        .moveTo(72, doc.y)
        .lineTo(pageWidth - 72, doc.y)
        .strokeColor(GOLD)
        .lineWidth(1.5)
        .stroke();
      doc.moveDown(1.2);

      // Helper: section heading
      const section = (title: string) => {
        doc.moveDown(0.5);
        doc.rect(72, doc.y, pageWidth - 144, 24).fill('#F0EBF8');
        doc
          .fillColor(PURPLE)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(title.toUpperCase(), 80, doc.y - 18, {
            width: pageWidth - 160,
          });
        doc.moveDown(1.2);
      };

      // Helper: row
      const row = (label: string, value: string) => {
        const y = doc.y;
        doc
          .fillColor(GREY)
          .fontSize(9)
          .font('Helvetica-Bold')
          .text(label.toUpperCase(), 72, y, { width: 160 });
        doc
          .fillColor(DARK)
          .fontSize(11)
          .font('Helvetica')
          .text(value || '—', 240, y, { width: pageWidth - 312 });
        doc.moveDown(0.9);
      };

      // ── Client Identity ───────────────────────────────────────
      section('Client Identity');
      row('Full Name', clientFullName);
      row('Email', (client as any).email);
      row('Phone', (client as any).phone || '—');
      row('Client Type', (profile as any)?.classifications || '—');
      row('Status', (client as any).status);
      row(
        'Account Created',
        new Date((client as any).createdAt).toLocaleDateString('en-GB'),
      );

      // ── KYC Status ────────────────────────────────────────────
      section('KYC Status');
      row('KYC Status', (profile as any)?.kycStatus || '—');
      row('Risk Level', (profile as any)?.riskLevel || 'Unrated');
      row(
        'Politically Exposed',
        (profile as any)?.isPoliticallyExposed ? 'Yes' : 'No',
      );
      row(
        'KYC Completed',
        (profile as any)?.kycCompletedAt
          ? new Date((profile as any).kycCompletedAt).toLocaleDateString(
              'en-GB',
            )
          : '—',
      );
      row(
        'Verification Completed',
        (profile as any)?.verificationCompletedAt
          ? new Date(
              (profile as any).verificationCompletedAt,
            ).toLocaleDateString('en-GB')
          : '—',
      );

      // ── Form Data ─────────────────────────────────────────────
      if (onboarding?.formData) {
        section('Submitted Form Data');
        const formData = onboarding.formData as Record<string, any>;
        const skip = ['_declaration'];

        for (const [key, val] of Object.entries(formData)) {
          if (skip.includes(key)) continue;
          if (typeof val === 'object' && val !== null) {
            // Nested object (e.g. address, individual profile)
            const label = key.replace(/([A-Z])/g, ' $1').trim();
            doc
              .fillColor(PURPLE)
              .fontSize(10)
              .font('Helvetica-Bold')
              .text(label.toUpperCase(), 72, doc.y, { width: pageWidth - 144 });
            doc.moveDown(0.5);
            for (const [k, v] of Object.entries(val)) {
              if (v) row(k.replace(/([A-Z])/g, ' $1').trim(), String(v));
            }
          } else if (val) {
            row(key.replace(/([A-Z])/g, ' $1').trim(), String(val));
          }
        }
      }

      // ── Documents ─────────────────────────────────────────────
      if (onboarding?.documents?.length > 0) {
        section('Uploaded Documents');
        onboarding.documents.forEach((doc_: any, i: number) => {
          row(`Document ${i + 1}`, doc_.name || doc_.type || 'Document');
        });
      }

      // ── Verification Results ──────────────────────────────────
      if ((profile as any)?.verificationResults) {
        section('Verification Results');
        const results = (profile as any).verificationResults as Record<
          string,
          any
        >;
        for (const [check, result] of Object.entries(results)) {
          if (typeof result === 'object' && result !== null) {
            row(
              check.replace(/([A-Z])/g, ' $1').trim(),
              `${(result as any).status || '—'}${(result as any).detail ? ` — ${(result as any).detail}` : ''}`,
            );
          }
        }
      }

      // ── Declaration ───────────────────────────────────────────
      const declaration = onboarding?.formData?._declaration;
      if (declaration) {
        section('Declaration');
        row('Signature', declaration.signature || '—');
        row('Signatory Title', declaration.signatoryTitle || '—');
        row(
          'Signed At',
          declaration.signedAt
            ? new Date(declaration.signedAt).toLocaleString('en-GB')
            : '—',
        );
        row('IP Address', declaration.ipAddress || '—');
      }

      // ── Footer ────────────────────────────────────────────────
      const footerY = doc.page.height - 60;
      doc.rect(0, footerY - 10, pageWidth, 70).fill(PURPLE);
      doc
        .fillColor('rgba(255,255,255,0.6)')
        .fontSize(9)
        .font('Helvetica')
        .text(
          `Generated by Lexora · ${new Date().toLocaleDateString('en-GB')} · ${businessName} · CONFIDENTIAL`,
          0,
          footerY + 4,
          { align: 'center', width: pageWidth },
        );

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    return { filePath, fileName };
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════
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
