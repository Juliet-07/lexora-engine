import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PaymentTransaction,
  PaymentTransactionDocument,
  PaymentTransactionStatus,
  PaymentTransactionType,
  PaymentMethod,
  DocumentType,
  Currency,
} from '../payment.schema';
import { DpoPaymentGateway } from './dpo-payment.gateway';
import { User, UserDocument } from '../../auth/schemas';
import {
  PlatformModule,
  SubscriptionPlanConfig,
  SubscriptionPlanDocument,
} from '../../super_admin/schemas';
import { EmailService } from '../../../common/utils/mailing/email.service';
import { AccountStatus } from '../../../common/interfaces/user-role.enum';
import { paginate, PaginationDto } from '../../../common/pagination.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectModel(PaymentTransaction.name)
    private readonly transactionModel: Model<PaymentTransactionDocument>,
    @InjectModel('TenantSubscription')
    private readonly subscriptionModel: Model<any>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(PlatformModule.name)
    private readonly moduleModel: Model<any>,
    @InjectModel(SubscriptionPlanConfig.name)
    private readonly planModel: Model<SubscriptionPlanDocument>,
    private readonly dpoGateway: DpoPaymentGateway,
    private readonly mailService: EmailService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // TENANT SELF-UPGRADE — initiates DPO payment
  // Called by tenant portal when they click "Upgrade to this plan"
  // Returns a checkout URL to redirect tenant to DPO hosted page
  // ═══════════════════════════════════════════════════════════

  async initiateUpgradePayment(
    tenantId: string,
    planKey: string,
    currency: Currency = Currency.USD,
  ): Promise<{ checkoutUrl: string; transactionId: string }> {
    const [tenant, plan, existing] = await Promise.all([
      this.userModel.findById(tenantId).select('-password').lean(),
      this.planModel.findOne({ plan: planKey, isActive: true }).lean(),
      this.subscriptionModel
        .findOne({ tenantId: new Types.ObjectId(tenantId) })
        .lean(),
    ]);

    if (!tenant) throw new NotFoundException('Tenant not found');
    if (!plan) throw new NotFoundException(`Plan "${planKey}" not found`);

    if (existing?.plan === planKey) {
      throw new BadRequestException('You are already on this plan');
    }

    const amount =
      currency === Currency.RWF
        ? plan.priceMonthly * (Number(process.env.USD_TO_RWF_RATE) || 1350)
        : plan.priceMonthly;

    if (!amount || amount <= 0) {
      throw new BadRequestException(
        'This plan has no price configured. Contact your administrator.',
      );
    }

    // Generate unique company reference
    const companyRef = `LEX-${Date.now()}-${tenantId.slice(-6).toUpperCase()}`;

    // Create pending transaction record first
    const transaction = await this.transactionModel.create({
      tenantId: new Types.ObjectId(tenantId),
      type: PaymentTransactionType.SUBSCRIPTION_UPGRADE,
      status: PaymentTransactionStatus.PENDING,
      amount,
      currency,
      plan: planKey,
      paymentMethod: PaymentMethod.DPO,
      documentType: DocumentType.RECEIPT, // receipt generated on success
      gatewayRef: companyRef,
      metadata: {
        planName: plan.name,
        previousPlan: existing?.plan ?? null,
      },
    });

    const businessName =
      (tenant as any).tenantProfile?.businessName || tenant.firstName;

    // Create DPO token
    const tokenResult = await this.dpoGateway.createToken({
      amount,
      currency,
      companyRef,
      redirectUrl: `${process.env.TENANT_APP_URL}/settings/billing?payment=success&txn=${transaction._id}`,
      backUrl: `${process.env.APP_URL}/payments/callback/dpo`,
      customerFirstName: (tenant as any).firstName,
      customerLastName: (tenant as any).lastName,
      customerEmail: (tenant as any).email,
      description: `Lexora ${plan.name} subscription — ${businessName}`,
      ptlHours: 24,
    });

    if (!tokenResult.success) {
      await this.transactionModel.findByIdAndUpdate(transaction._id, {
        status: PaymentTransactionStatus.FAILED,
        notes: tokenResult.error,
      });
      throw new BadRequestException(
        `Payment gateway error: ${tokenResult.error}`,
      );
    }

    // Save gateway token to transaction
    await this.transactionModel.findByIdAndUpdate(transaction._id, {
      gatewayToken: tokenResult.token,
      gatewayRef: companyRef,
    });

    return {
      checkoutUrl: tokenResult.checkoutUrl,
      transactionId: transaction._id.toString(),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // DPO CALLBACK — BackURL called by DPO after payment
  // Verifies payment, activates subscription, sends receipt
  // ═══════════════════════════════════════════════════════════

  async handleDpoCallback(query: Record<string, any>): Promise<void> {
    const transToken = query.TransID || query.TransactionToken || query.token;

    if (!transToken) {
      this.logger.warn('DPO callback received with no token');
      return;
    }

    // Find transaction by gateway token
    const transaction = await this.transactionModel.findOne({
      gatewayToken: transToken,
      status: PaymentTransactionStatus.PENDING,
    });

    if (!transaction) {
      this.logger.warn(
        `DPO callback: no pending transaction for token ${transToken}`,
      );
      return;
    }

    // Verify with DPO
    const verification = await this.dpoGateway.verifyToken({
      token: transToken,
    });

    if (!verification.paid) {
      await this.transactionModel.findByIdAndUpdate(transaction._id, {
        status: PaymentTransactionStatus.FAILED,
        gatewayResult: verification.resultCode,
        gatewayResponse: verification.raw,
        notes: verification.resultExplanation,
      });
      this.logger.warn(
        `DPO callback: payment failed for transaction ${transaction._id} — ${verification.resultCode}`,
      );
      return;
    }

    // Payment confirmed — activate subscription and record transaction
    await this.activateSubscriptionAfterPayment(
      transaction,
      PaymentMethod.DPO,
      verification.resultCode,
      verification.raw,
    );
  }

  // ═══════════════════════════════════════════════════════════
  // SUPER ADMIN — record manual payment when creating tenant
  // on paid plan with payment already made (receipt flow)
  // ═══════════════════════════════════════════════════════════

  async recordManualPayment(dto: {
    tenantId: string;
    plan: string;
    amount: number;
    currency: Currency;
    documentType: DocumentType;
    paymentReference?: string;
    notes?: string;
    recordedBy: string;
    type?: PaymentTransactionType;
  }): Promise<PaymentTransactionDocument> {
    const tenant = await this.userModel.findById(dto.tenantId).lean();
    if (!tenant) throw new NotFoundException('Tenant not found');

    const docNumber =
      dto.documentType === DocumentType.RECEIPT
        ? await this.generateReceiptNumber()
        : await this.generateInvoiceNumber();

    const transaction = await this.transactionModel.create({
      tenantId: new Types.ObjectId(dto.tenantId),
      type: dto.type ?? PaymentTransactionType.SUBSCRIPTION_NEW,
      status:
        dto.documentType === DocumentType.RECEIPT
          ? PaymentTransactionStatus.PAID
          : PaymentTransactionStatus.AWAITING_PAYMENT,
      amount: dto.amount,
      currency: dto.currency,
      plan: dto.plan,
      paymentMethod: PaymentMethod.MANUAL,
      documentType: dto.documentType,
      invoiceNumber:
        dto.documentType === DocumentType.INVOICE ? docNumber : null,
      receiptNumber:
        dto.documentType === DocumentType.RECEIPT ? docNumber : null,
      paidAt: dto.documentType === DocumentType.RECEIPT ? new Date() : null,
      paymentReference: dto.paymentReference ?? null,
      notes: dto.notes ?? null,
      recordedBy: new Types.ObjectId(dto.recordedBy),
    });

    return transaction;
  }

  // ═══════════════════════════════════════════════════════════
  // SUPER ADMIN — confirm invoice payment
  // Called when super admin marks an invoice as paid
  // Activates account and sends credentials + receipt
  // ═══════════════════════════════════════════════════════════

  async confirmInvoicePayment(
    transactionId: string,
    dto: {
      paymentReference?: string;
      notes?: string;
      confirmedBy: string;
    },
  ): Promise<PaymentTransactionDocument> {
    const transaction = await this.transactionModel.findOne({
      _id: transactionId,
      status: PaymentTransactionStatus.AWAITING_PAYMENT,
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found or already paid');
    }

    const receiptNumber = await this.generateReceiptNumber();

    await this.transactionModel.findByIdAndUpdate(transactionId, {
      $set: {
        status: PaymentTransactionStatus.PAID,
        documentType: DocumentType.RECEIPT,
        receiptNumber,
        paidAt: new Date(),
        paymentReference: dto.paymentReference ?? transaction.paymentReference,
        notes: dto.notes ?? transaction.notes,
        recordedBy: new Types.ObjectId(dto.confirmedBy),
      },
    });

    // Activate tenant account and send credentials
    await this.activateTenantAccount(transaction.tenantId.toString());

    const updated = await this.transactionModel.findById(transactionId).lean();
    return updated as PaymentTransactionDocument;
  }

  // ═══════════════════════════════════════════════════════════
  // GET TRANSACTIONS (super admin — all transactions)
  // ═══════════════════════════════════════════════════════════

  async getAllTransactions(
    pagination: PaginationDto,
    filters: {
      status?: string;
      tenantId?: string;
      plan?: string;
      currency?: string;
      from?: string;
      to?: string;
    },
  ) {
    const { skip, limit, page } = pagination;
    const query: any = {};

    if (filters.status) query.status = filters.status;
    if (filters.plan) query.plan = filters.plan;
    if (filters.currency) query.currency = filters.currency;
    if (filters.tenantId) query.tenantId = new Types.ObjectId(filters.tenantId);
    if (filters.from || filters.to) {
      query.createdAt = {};
      if (filters.from) query.createdAt.$gte = new Date(filters.from);
      if (filters.to) query.createdAt.$lte = new Date(filters.to);
    }

    const [items, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .populate(
          'tenantId',
          'firstName lastName email tenantProfile.businessName',
        )
        .populate('recordedBy', 'firstName lastName email')
        .lean(),
      this.transactionModel.countDocuments(query),
    ]);

    return paginate(items, total, page, limit);
  }

  // ═══════════════════════════════════════════════════════════
  // GET TRANSACTIONS (tenant — their own)
  // ═══════════════════════════════════════════════════════════

  async getTenantTransactions(tenantId: string) {
    return this.transactionModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  // ═══════════════════════════════════════════════════════════
  // STATS (super admin dashboard)
  // ═══════════════════════════════════════════════════════════

  async getTransactionStats() {
    const [byStatus, byPlan, byCurrency, recentPaid, totals] =
      await Promise.all([
        this.transactionModel.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        this.transactionModel.aggregate([
          { $match: { status: PaymentTransactionStatus.PAID } },
          {
            $group: {
              _id: '$plan',
              count: { $sum: 1 },
              revenue: { $sum: '$amount' },
            },
          },
        ]),
        this.transactionModel.aggregate([
          { $match: { status: PaymentTransactionStatus.PAID } },
          { $group: { _id: '$currency', total: { $sum: '$amount' } } },
        ]),
        this.transactionModel
          .find({ status: PaymentTransactionStatus.PAID })
          .sort({ paidAt: -1 })
          .limit(5)
          .populate(
            'tenantId',
            'firstName lastName email tenantProfile.businessName',
          )
          .lean(),
        this.transactionModel.aggregate([
          { $match: { status: PaymentTransactionStatus.PAID } },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' },
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

    return {
      byStatus,
      byPlan,
      byCurrency,
      recentPaid,
      totalRevenue: totals[0]?.total ?? 0,
      totalTransactions: totals[0]?.count ?? 0,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE — activate subscription after confirmed payment
  // ═══════════════════════════════════════════════════════════

  private async activateSubscriptionAfterPayment(
    transaction: PaymentTransactionDocument,
    method: PaymentMethod,
    gatewayResult?: string,
    gatewayResponse?: Record<string, any>,
  ): Promise<void> {
    const receiptNumber = await this.generateReceiptNumber();

    // Update transaction to paid
    await this.transactionModel.findByIdAndUpdate(transaction._id, {
      $set: {
        status: PaymentTransactionStatus.PAID,
        paymentMethod: method,
        documentType: DocumentType.RECEIPT,
        receiptNumber,
        paidAt: new Date(),
        gatewayResult: gatewayResult ?? null,
        gatewayResponse: gatewayResponse ?? null,
      },
    });

    const tenantId = transaction.tenantId.toString();
    const planKey = transaction.plan;

    // Read modules from source of truth
    const planModules = await this.moduleModel
      .find({ isActive: true, includedInPlans: planKey })
      .select('key')
      .lean();
    const baseModules = planModules.map((m: any) => m.key);
    const activeModules = [...new Set(baseModules)];
    const periodEnd = new Date(new Date().setMonth(new Date().getMonth() + 1));

    // Activate subscription
    await this.subscriptionModel.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId) },
      {
        $set: {
          plan: planKey,
          status: 'active',
          baseModules: baseModules as any,
          addonModules: [] as any,
          activeModules: activeModules as any,
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
          trialEndsAt: null,
          cancelledAt: null,
        },
      },
      { upsert: true, new: true },
    );

    // Send receipt email
    await this.sendReceiptEmail(tenantId, transaction, receiptNumber);

    this.logger.log(
      `Payment confirmed for tenant ${tenantId} — plan: ${planKey} — receipt: ${receiptNumber}`,
    );
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE — activate tenant account (invoice → paid flow)
  // ═══════════════════════════════════════════════════════════

  private async activateTenantAccount(tenantId: string): Promise<void> {
    const tenant = await this.userModel
      .findById(tenantId)
      .select('email firstName status tenantProfile')
      .lean();

    if (!tenant) return;

    // Only activate if status is awaiting_payment
    // Guards against double-activation
    if ((tenant as any).status !== AccountStatus.AWAITING_PAYMENT) {
      this.logger.warn(
        `activateTenantAccount: tenant ${tenantId} has status ${(tenant as any).status}, skipping`,
      );
      return;
    }

    // Generate real credentials
    const tempPassword = this.generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    await this.userModel.findByIdAndUpdate(tenantId, {
      status: AccountStatus.PENDING,
      password: hashedPassword,
      mustChangePassword: true,
    });

    const businessName =
      (tenant as any).tenantProfile?.businessName || (tenant as any).firstName;

    await this.mailService.sendTenantWelcome({
      to: (tenant as any).email,
      firstName: (tenant as any).firstName,
      businessName,
      tempPassword,
      loginUrl: `${process.env.TENANT_APP_URL}`,
    });

    this.logger.log(
      `Tenant ${tenantId} activated — credentials sent to ${(tenant as any).email}`,
    );
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE — send receipt/invoice email
  // ═══════════════════════════════════════════════════════════

  private async sendReceiptEmail(
    tenantId: string,
    transaction: PaymentTransactionDocument,
    documentNumber: string,
  ): Promise<void> {
    try {
      const tenant = await this.userModel
        .findById(tenantId)
        .select('email firstName tenantProfile')
        .lean();

      if (!tenant) return;

      const plan = await this.planModel
        .findOne({ plan: transaction.plan })
        .select('name')
        .lean();

      await this.mailService.sendPaymentReceipt({
        to: (tenant as any).email,
        firstName: (tenant as any).firstName,
        businessName:
          (tenant as any).tenantProfile?.businessName ||
          (tenant as any).firstName,
        receiptNumber: documentNumber,
        planName: plan?.name || transaction.plan,
        amount: transaction.amount,
        currency: transaction.currency,
        paidAt: transaction.paidAt || new Date(),
        periodEnd: new Date(new Date().setMonth(new Date().getMonth() + 1)),
      });
    } catch (err) {
      this.logger.error(`Failed to send receipt email: ${err.message}`);
    }
  }

  private async sendInvoiceEmail(
    tenantId: string,
    transaction: PaymentTransactionDocument,
    docNumber: string,
  ): Promise<void> {
    try {
      const tenant = await this.userModel
        .findById(tenantId)
        .select('email firstName tenantProfile')
        .lean();

      if (!tenant) return;

      const plan = await this.planModel
        .findOne({ plan: transaction.plan })
        .select('name priceMonthly')
        .lean();

      await this.mailService.sendPaymentInvoice({
        to: (tenant as any).email,
        firstName: (tenant as any).firstName,
        businessName:
          (tenant as any).tenantProfile?.businessName ||
          (tenant as any).firstName,
        invoiceNumber: docNumber,
        planName: plan?.name || transaction.plan,
        amount: transaction.amount,
        currency: transaction.currency,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });
    } catch (err) {
      this.logger.error(`Failed to send invoice email: ${err.message}`);
    }
  }

  // Public method for super admin to trigger invoice email after transaction created
  async sendInvoiceEmailForTransaction(transactionId: string): Promise<void> {
    const transaction = await this.transactionModel
      .findById(transactionId)
      .lean();
    if (!transaction) return;

    // Invoice only — no account activation
    await this.sendInvoiceEmail(
      transaction.tenantId.toString(),
      transaction as PaymentTransactionDocument,
      transaction.invoiceNumber,
    );
  }

  // Public method for super admin to trigger receipt email after transaction created
  async sendReceiptEmailForTransaction(transactionId: string): Promise<void> {
    const transaction = await this.transactionModel
      .findById(transactionId)
      .lean();
    if (!transaction) return;

    // Send receipt email
    await this.sendReceiptEmail(
      transaction.tenantId.toString(),
      transaction as PaymentTransactionDocument,
      transaction.receiptNumber,
    );

    // Activate account if still awaiting payment
    // (receipt = payment confirmed = account should be live)
    await this.activateTenantAccount(transaction.tenantId.toString());
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE — document number generators
  // ═══════════════════════════════════════════════════════════

  private async generateInvoiceNumber(): Promise<string> {
    const count = await this.transactionModel.countDocuments({
      documentType: DocumentType.INVOICE,
    });
    return `LEX-INV-${String(count + 1).padStart(4, '0')}`;
  }

  private async generateReceiptNumber(): Promise<string> {
    const count = await this.transactionModel.countDocuments({
      documentType: DocumentType.RECEIPT,
    });
    return `LEX-REC-${String(count + 1).padStart(4, '0')}`;
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
