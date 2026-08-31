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
  ClientCommercialRecord,
  ClientCommercialDocument,
} from '../schemas/client-commercial.schema';
import {
  QuickAddClientDto,
  UpdateClientProfileDto,
  ClientFilterDto,
  AssignClientDto,
  UpdateClientStatusDto,
  RequestClientInfoDto,
  UpdateClientCommercialDto,
} from '../dto/client.dto';
import {
  UserType,
  ClientRole,
  AccountStatus,
} from '../../../common/interfaces/user-role.enum';
import { PaginationDto, paginate } from '../../../common/pagination.dto';
import { EmailService } from '../../../common/utils/mailing/email.service';
import { VerificationService } from './verification.service';
import {
  Mandate,
  MandateDocument_,
} from '../../crm/projects/schemas/mandate.schema';
import {
  Ticket,
  TicketDocument,
  TicketStatus,
} from '../../crm/projects/schemas/ticket.schema';
import {
  Invoice,
  InvoiceDocument,
  Payment,
  PaymentDocument,
} from '../../crm/finance/schemas/invoice.schema';
import {
  buildReportPdf,
  ReportSection,
} from '../../../common/utils/pdf/report-builder.util';

@Injectable()
export class TenantClientsService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(ClientProfileRecord.name)
    private readonly profileModel: Model<ClientProfileDocument>,
    @InjectModel(ClientCommercialRecord.name)
    private readonly commercialModel: Model<ClientCommercialDocument>,
    @InjectModel('OnboardingSubmission')
    private readonly onboardingModel: Model<any>,
    @InjectModel('TenantSubscription')
    private readonly subscriptionModel: Model<any>,
    @InjectModel(Mandate.name)
    private readonly mandateModel: Model<MandateDocument_>,
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
    @InjectModel(Invoice.name)
    private readonly invoiceModel: Model<InvoiceDocument>,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
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
    const emailTaken = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (emailTaken)
      throw new ConflictException('Email already registered on the platform');

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

    await this.profileModel.create({
      userId: client._id,
      tenantId: new Types.ObjectId(tenantId),
      assignedTo: new Types.ObjectId(addedBy),
      classifications: dto.clientType,
      kycStatus: 'not_started',
    });

    const tenant = await this.userModel
      .findById(tenantId)
      .select('tenantProfile.businessName firstName')
      .lean();
    const businessName =
      (tenant as any)?.tenantProfile?.businessName || 'Your Provider';

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

    // Real deletion, not just a status flag — clientId is a unique
    // index on OnboardingSubmission, so the old (now rejected)
    // record physically blocks a new one from ever being created.
    // Without deleting it, a reactivated client hits "this form has
    // already been submitted" the moment they try to start over.
    await this.onboardingModel.deleteOne({
      clientId: new Types.ObjectId(clientId),
    });

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

    return {
      success: true,
      message:
        'Client rejected and notified via email. Their onboarding form has been cleared so they can start over once reactivated.',
    };
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

  // Real KYC report, built with the same shared report-builder used
  // across CRM and GRC (dark navy header, indigo summary strip,
  // striped tables, page numbers) instead of the old, one-off
  // purple/gold PDFKit layout — same house style as every other
  // generated report on the platform now. Titled and organised by
  // the client's real type (individual/corporate/partnership/
  // trust); the submitted form fields themselves are rendered
  // dynamically from whatever the client's onboarding form actually
  // collected, since that shape isn't fixed and shouldn't be
  // guessed at.
  async generateClientReport(
    clientId: string,
    tenantId: string,
  ): Promise<Buffer> {
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
    const clientType =
      (profile as any)?.classifications || (onboarding as any)?.clientType;
    const typeLabel = clientType
      ? clientType.charAt(0).toUpperCase() + clientType.slice(1)
      : 'Client';

    const humanize = (key: string) =>
      key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (c) => c.toUpperCase())
        .trim();

    const kv = (pairs: [string, string][]): string[][] =>
      pairs.filter(([, v]) => v).map(([l, v]) => [l, v]);

    const sections: ReportSection[] = [];

    // ── Client Identity ────────────────────────────────────────
    sections.push({
      heading: 'Client Identity',
      columns: ['Field', 'Value'],
      rows: kv([
        ['Full Name', clientFullName],
        ['Email', (client as any).email],
        ['Phone', (client as any).phone || '—'],
        ['Client Type', typeLabel],
        ['Status', (client as any).status],
        [
          'Account Created',
          new Date((client as any).createdAt).toLocaleDateString('en-GB'),
        ],
      ]),
    });

    // ── KYC Status ──────────────────────────────────────────────
    sections.push({
      heading: 'KYC Status',
      columns: ['Field', 'Value'],
      rows: kv([
        ['KYC Status', (profile as any)?.kycStatus || '—'],
        ['Risk Level', (profile as any)?.riskLevel || 'Unrated'],
        [
          'Politically Exposed',
          (profile as any)?.isPoliticallyExposed ? 'Yes' : 'No',
        ],
        [
          'KYC Completed',
          (profile as any)?.kycCompletedAt
            ? new Date((profile as any).kycCompletedAt).toLocaleDateString(
                'en-GB',
              )
            : '—',
        ],
        [
          'Verification Completed',
          (profile as any)?.verificationCompletedAt
            ? new Date(
                (profile as any).verificationCompletedAt,
              ).toLocaleDateString('en-GB')
            : '—',
        ],
      ]),
    });

    // ── Submitted form data — real fields, whatever the client's
    // real onboarding form actually collected for their real type.
    if (onboarding?.formData) {
      const formData = onboarding.formData as Record<string, any>;
      const skip = ['_declaration'];

      for (const [key, val] of Object.entries(formData)) {
        if (skip.includes(key)) continue;
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          const rows = kv(
            Object.entries(val).map(([k, v]) => [
              humanize(k),
              v == null ? '' : String(v),
            ]),
          );
          if (rows.length) {
            sections.push({
              heading: `${typeLabel} Profile — ${humanize(key)}`,
              columns: ['Field', 'Value'],
              rows,
            });
          }
        }
      }
      const flat = kv(
        Object.entries(formData)
          .filter(
            ([k, v]) =>
              !skip.includes(k) &&
              (typeof v !== 'object' || v === null) &&
              v != null &&
              v !== '',
          )
          .map(([k, v]) => [humanize(k), String(v)]),
      );
      if (flat.length) {
        sections.push({
          heading: `${typeLabel} Profile — Details`,
          columns: ['Field', 'Value'],
          rows: flat,
        });
      }
    }

    // ── Uploaded documents ───────────────────────────────────────
    if (onboarding?.documents?.length) {
      sections.push({
        heading: 'Uploaded Documents',
        columns: ['#', 'Document'],
        rows: onboarding.documents.map((d: any, i: number) => [
          String(i + 1),
          d.name || d.category || 'Document',
        ]),
      });
    }

    // ── Verification results ─────────────────────────────────────
    if ((profile as any)?.verificationResults) {
      const results = (profile as any).verificationResults as Record<
        string,
        any
      >;
      const rows = Object.entries(results)
        .filter(([, r]) => r && typeof r === 'object')
        .map(([check, r]: [string, any]) => [
          humanize(check),
          `${r.status || '—'}${r.detail ? ` — ${r.detail}` : ''}`,
        ]);
      if (rows.length) {
        sections.push({
          heading: 'Verification Results',
          columns: ['Check', 'Result'],
          rows,
        });
      }
    }

    // ── Declaration ───────────────────────────────────────────────
    const declaration = (onboarding?.formData as any)?._declaration;
    if (declaration) {
      sections.push({
        heading: 'Declaration',
        columns: ['Field', 'Value'],
        rows: kv([
          ['Signature', declaration.signature || '—'],
          ['Signatory Title', declaration.signatoryTitle || '—'],
          [
            'Signed At',
            declaration.signedAt
              ? new Date(declaration.signedAt).toLocaleString('en-GB')
              : '—',
          ],
          ['IP Address', declaration.ipAddress || '—'],
        ]),
      });
    }

    return buildReportPdf({
      title: `${typeLabel} Client Report`,
      subtitle: `${businessName} · KYC / AML`,
      summary: [
        { label: 'Client', value: clientFullName },
        { label: 'Type', value: typeLabel },
        { label: 'KYC Status', value: (profile as any)?.kycStatus || '—' },
        {
          label: 'Risk Level',
          value: (profile as any)?.riskLevel || 'Unrated',
        },
      ],
      sections,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // CLIENT HEALTH — real relationship data + live-computed
  // operational signals, combined into one real health score.
  // ═══════════════════════════════════════════════════════════

  async upsertClientCommercial(
    clientId: string,
    tenantId: string,
    dto: UpdateClientCommercialDto,
    updatedBy: string,
  ) {
    const client = await this.userModel.findOne({
      _id: clientId,
      userType: UserType.CLIENT,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!client) throw new NotFoundException('Client not found');

    const record = await this.commercialModel.findOneAndUpdate(
      { clientId: new Types.ObjectId(clientId) },
      {
        $set: {
          ...dto,
          tenantId: new Types.ObjectId(tenantId),
          clientId: new Types.ObjectId(clientId),
          updatedBy: new Types.ObjectId(updatedBy),
        },
      },
      { new: true, upsert: true },
    );
    return record.toObject();
  }

  // Real health scoring — same formula the frontend prototype used,
  // now applied to real inputs: a real saved commercial record
  // (relationship manager's own entries) combined with real,
  // live-computed operational signals. Nothing here is fabricated —
  // a field with no real data yet (e.g. satisfaction never
  // recorded) comes back null, not a fake default.
  async getClientHealth(clientId: string, tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const cId = new Types.ObjectId(clientId);

    const [profile, commercial, openTickets, invoices, lastActivity] =
      await Promise.all([
        this.profileModel
          .findOne({ userId: cId, tenantId: tId })
          .populate('assignedTo', 'firstName lastName')
          .select('riskLevel assignedTo')
          .lean(),
        this.commercialModel.findOne({ clientId: cId }).lean(),
        this.ticketModel.countDocuments({
          tenantId: tId,
          clientUserId: cId,
          status: { $nin: [TicketStatus.RESOLVED, TicketStatus.CLOSED] },
        }),
        this.invoiceModel
          .find({ tenantId: tId, clientUserId: cId })
          .select('_id createdAt')
          .lean(),
        Promise.all([
          this.ticketModel
            .findOne({ tenantId: tId, clientUserId: cId })
            .sort({ updatedAt: -1 })
            .select('updatedAt')
            .lean(),
          this.invoiceModel
            .findOne({ tenantId: tId, clientUserId: cId })
            .sort({ updatedAt: -1 })
            .select('updatedAt')
            .lean(),
          this.mandateModel
            .findOne({ tenantId: tId, clientUserId: cId })
            .sort({ updatedAt: -1 })
            .select('updatedAt')
            .lean(),
        ]),
      ]);

    // Real average days-to-pay: match each real payment back to the
    // real invoice it settled, using the invoice's own creation date
    // as the issue date — no invented "issued at" field needed.
    const invoiceIds = invoices.map((i) => i._id);
    const payments = invoiceIds.length
      ? await this.paymentModel
          .find({ tenantId: tId, invoiceId: { $in: invoiceIds } })
          .select('invoiceId at')
          .lean()
      : [];
    const invoiceById = new Map(invoices.map((i) => [i._id.toString(), i]));
    const daysToPayList = payments.map((p) => {
      const inv = invoiceById.get(p.invoiceId.toString());
      const days =
        (new Date(p.at).getTime() -
          new Date((inv as any).createdAt).getTime()) /
        86400000;
      return Math.max(0, Math.round(days));
    });
    const invoiceDaysAvg = daysToPayList.length
      ? Math.round(
          daysToPayList.reduce((s, d) => s + d, 0) / daysToPayList.length,
        )
      : null;

    const lastInteraction = lastActivity
      .filter(Boolean)
      .map((d: any) => new Date(d.updatedAt).getTime())
      .reduce((max, t) => (t > max ? t : max), 0);

    const relationshipManager = profile?.assignedTo
      ? `${(profile.assignedTo as any).firstName} ${(profile.assignedTo as any).lastName}`
      : null;

    // Commercial risk defaults to the real KYC risk level only when
    // no separate commercial assessment has ever been recorded —
    // after that, the relationship manager's own judgment is real
    // and shouldn't be silently overwritten by the compliance value.
    const riskRating =
      commercial?.riskRating ??
      (profile?.riskLevel
        ? profile.riskLevel.charAt(0).toUpperCase() +
          profile.riskLevel.slice(1).toLowerCase()
        : null);

    const rec = {
      serviceLines: commercial?.serviceLines ?? [],
      riskRating,
      feeTier: commercial?.feeTier ?? null,
      slaProfileId: commercial?.slaProfileId ?? '',
      revenueYtd: commercial?.revenueYtd ?? 0,
      costYtd: commercial?.costYtd ?? 0,
      currency: commercial?.currency ?? 'USD',
      satisfaction: commercial?.satisfaction ?? null,
      notes: commercial?.notes ?? '',
      relationshipManager,
      openTickets,
      invoiceDaysAvg,
      lastInteraction: lastInteraction
        ? new Date(lastInteraction).toISOString().slice(0, 10)
        : null,
      hasRecord: !!commercial,
    };

    // Same scoring formula the prototype used — now over real
    // inputs, with a real, honest fallback for anything never yet
    // recorded (unset satisfaction contributes 0, not a guessed
    // "average" score).
    const activity = rec.lastInteraction ? 25 : 0;
    const payment =
      rec.invoiceDaysAvg == null
        ? 0
        : Math.max(
            0,
            Math.min(25, 25 - Math.round((rec.invoiceDaysAvg - 30) / 2)),
          );
    const tickets = Math.max(0, 20 - rec.openTickets * 4);
    const csat =
      rec.satisfaction == null ? 0 : Math.round((rec.satisfaction / 5) * 20);
    const risk =
      rec.riskRating === 'Low'
        ? 10
        : rec.riskRating === 'Medium'
          ? 6
          : rec.riskRating === 'High'
            ? 2
            : 0;
    const score = activity + payment + tickets + csat + risk;
    const band = score >= 75 ? 'Healthy' : score >= 50 ? 'Watch' : 'At risk';
    const factors = [
      { l: 'Recent activity', v: activity, max: 25 },
      { l: 'Payment behaviour', v: payment, max: 25 },
      { l: 'Ticket load', v: tickets, max: 20 },
      { l: 'Satisfaction', v: csat, max: 20 },
      { l: 'Risk rating', v: risk, max: 10 },
    ];

    return { ...rec, score, band, factors };
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
