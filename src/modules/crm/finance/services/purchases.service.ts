import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Vendor,
  VendorDocument,
  PurchaseOrder,
  PurchaseOrderDocument,
  PoStatus,
  Bill,
  BillDocument,
  BillStatus,
  ExpenseClaim,
  ExpenseClaimDocument,
  ClaimStatus,
  ExpensePolicy,
  ExpensePolicyDocument,
} from '../schemas';
import {
  CreateVendorDto,
  CreatePurchaseOrderDto,
  CreateBillDto,
  CreateExpenseClaimDto,
  UpsertExpensePolicyDto,
} from '../dtos';
import { buildPurchaseOrderPdf } from 'src/common/utils/pdf/purchase-order.util';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { WhtService } from './wht.service';
import { WhtDirection } from '../schemas';
import { GlPostingService, GL_ACCOUNTS } from './gl-posting.service';
import { GlSource } from '../schemas';

// ── Vendors ───────────────────────────────────────────────────
// Outstanding and age band are never stored — always computed live
// from real, unpaid Bills, same reasoning as Aged Receivables.

@Injectable()
export class VendorService {
  constructor(
    @InjectModel(Vendor.name) private readonly model: Model<VendorDocument>,
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
  ) {}

  private band(daysOverdue: number) {
    if (daysOverdue <= 0) return 'Current';
    if (daysOverdue <= 30) return 'Current';
    if (daysOverdue <= 60) return '31–60';
    if (daysOverdue <= 90) return '61–90';
    return '90+';
  }

  async getAll(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const vendors = await this.model
      .find({ tenantId: tId })
      .sort({ name: 1 })
      .lean();
    const unpaidBills = await this.billModel
      .find({ tenantId: tId, status: { $ne: BillStatus.PAID } })
      .lean();
    return vendors.map((v) => {
      const bills = unpaidBills.filter(
        (b) => String(b.vendorId) === String(v._id),
      );
      const outstanding = bills.reduce((s, b) => s + b.amount, 0);
      const oldestDueMs = bills.length
        ? Math.min(...bills.map((b) => new Date(b.dueOn).getTime()))
        : null;
      const daysOverdue = oldestDueMs
        ? Math.max(0, Math.floor((Date.now() - oldestDueMs) / 86400000))
        : 0;
      return { ...v, outstanding, band: this.band(daysOverdue) };
    });
  }

  async create(tenantId: string, dto: CreateVendorDto) {
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      tin: dto.tin ?? '',
      category: dto.category ?? '',
      terms: dto.terms ?? 'Net 30',
      currency: dto.currency ?? 'USD',
      email: dto.email ?? '',
      wht: dto.wht ?? false,
    });
    return created.toObject();
  }
}

// ── Purchase orders ──────────────────────────────────────────

@Injectable()
export class PurchaseOrderService {
  constructor(
    @InjectModel(PurchaseOrder.name)
    private readonly model: Model<PurchaseOrderDocument>,
    @InjectModel(Vendor.name)
    private readonly vendorModel: Model<VendorDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.model.countDocuments({
      tenantId,
      ref: new RegExp(`^PO-${year}-`),
    });
    return `PO-${year}-${String(count + 1).padStart(3, '0')}`;
  }

  // No stored total — always the sum of qty*unit across lines, same
  // reasoning as Invoice.subtotal.
  private total(po: any) {
    return po.lines.reduce((s: number, l: any) => s + l.qty * l.unit, 0);
  }
  private normalize(po: any) {
    return { ...po, total: this.total(po) };
  }

  async getAll(tenantId: string) {
    const rows = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
    return rows.map((p) => this.normalize(p));
  }

  async getById(tenantId: string, id: string) {
    const po = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!po) throw new NotFoundException('Purchase order not found');
    return this.normalize(po);
  }

  private async getRawDoc(tenantId: string, id: string) {
    const po = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  async create(
    tenantId: string,
    dto: CreatePurchaseOrderDto,
    vendorName: string,
    vendorTin: string,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      vendorId: new Types.ObjectId(dto.vendorId),
      vendorName,
      vendorTin,
      currency: dto.currency ?? 'USD',
      expectedDelivery: dto.expectedDelivery
        ? new Date(dto.expectedDelivery)
        : null,
      notes: dto.notes ?? '',
      deliveryAddress: dto.deliveryAddress ?? '',
      deliveryAttention: dto.deliveryAttention ?? '',
      deliveryPhone: dto.deliveryPhone ?? '',
      deliveryInstructions: dto.deliveryInstructions ?? '',
      lines: dto.lines.map((l) => ({
        description: l.description,
        qty: l.qty,
        unit: l.unit,
        discountPct: l.discountPct ?? 0,
        taxLabel: l.taxLabel ?? '',
      })),
    });
    return this.normalize(created.toObject());
  }

  // Builds the real PDF using the tenant's own branding — logo if
  // they've set one, business name either way. Never the platform's
  // own name; this document is issued by the firm, not by Lexora.
  private async buildPdfForPo(tenantId: string, po: any): Promise<Buffer> {
    const tenant = await this.userModel.findById(tenantId).lean();
    const profile = tenant?.tenantProfile;
    const firmName = profile?.businessName || 'Your firm';
    const addressLines = [
      profile?.address?.city,
      profile?.address?.state,
      profile?.address?.country,
    ].filter(Boolean);

    return buildPurchaseOrderPdf({
      ref: po.ref,
      vendorName: po.vendorName,
      vendorTin: po.vendorTin ?? '',
      currency: po.currency,
      issuedOn: po.issuedOn,
      expectedDelivery: po.expectedDelivery,
      notes: po.notes,
      lines: po.lines.map((l: any) => ({
        description: l.description,
        qty: l.qty,
        unit: l.unit,
        discountPct: l.discountPct ?? 0,
        taxLabel: l.taxLabel ?? '',
      })),
      deliveryAddress: po.deliveryAddress ?? '',
      deliveryAttention: po.deliveryAttention ?? '',
      deliveryPhone: po.deliveryPhone ?? '',
      deliveryInstructions: po.deliveryInstructions ?? '',
      firmName,
      firmAddressLines: addressLines,
      firmRegistrationNumber: profile?.registrationNumber || '',
      firmTaxId: profile?.taxId || '',
      logoDataUrl: profile?.logoUrl || null,
    });
  }

  // Issuing is the real "sent to vendor" moment — sets issuedOn, and
  // now actually emails the vendor with the real PDF attached if
  // they have an email on file. A missing vendor email doesn't block
  // issuing (the PO is still genuinely issued internally), it just
  // means there's nothing to send it to yet.
  async issue(tenantId: string, id: string) {
    const po = await this.getRawDoc(tenantId, id);
    if (po.status !== PoStatus.DRAFT) {
      throw new BadRequestException('Only a draft PO can be issued');
    }
    po.status = PoStatus.ISSUED;
    po.issuedOn = new Date();
    await po.save();
    const normalized = this.normalize(po.toObject());

    const vendor = await this.vendorModel.findById(po.vendorId).lean();
    if (vendor?.email) {
      const pdfBuffer = await this.buildPdfForPo(tenantId, normalized);
      const tenant = await this.userModel.findById(tenantId).lean();
      const firmName = tenant?.tenantProfile?.businessName || 'Your firm';
      const totalFormatted = `${po.currency} ${normalized.total.toLocaleString()}`;
      await this.emailService
        .sendPurchaseOrderIssued(
          {
            to: vendor.email,
            vendorName: po.vendorName,
            ref: po.ref,
            firmName,
            totalFormatted,
          },
          pdfBuffer,
        )
        .catch(() => undefined);
    }

    return normalized;
  }

  async markFulfilled(tenantId: string, id: string) {
    const po = await this.getRawDoc(tenantId, id);
    po.status = PoStatus.FULFILLED;
    await po.save();
    return this.normalize(po.toObject());
  }

  async cancel(tenantId: string, id: string) {
    const po = await this.getRawDoc(tenantId, id);
    po.status = PoStatus.CANCELLED;
    await po.save();
    return this.normalize(po.toObject());
  }

  async generatePdf(tenantId: string, id: string): Promise<Buffer> {
    const po = await this.getRawDoc(tenantId, id);
    return this.buildPdfForPo(tenantId, this.normalize(po.toObject()));
  }
}

// ── Bills ─────────────────────────────────────────────────────

@Injectable()
export class BillService {
  constructor(
    @InjectModel(Bill.name) private readonly model: Model<BillDocument>,
    @InjectModel(Vendor.name)
    private readonly vendorModel: Model<VendorDocument>,
    private readonly whtService: WhtService,
    private readonly glPostingService: GlPostingService,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.model.countDocuments({
      tenantId,
      ref: new RegExp(`^BILL-${year}-`),
    });
    return `BILL-${year}-${String(count + 1).padStart(3, '0')}`;
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ dueOn: 1 })
      .lean();
  }

  // vendorName is passed in from the real Vendor record when
  // vendorId is set; when it's omitted, the caller-supplied
  // dto.vendorName carries the free-text payee label instead — a
  // bill genuinely doesn't require a formal vendor relationship.
  async create(
    tenantId: string,
    dto: CreateBillDto,
    resolvedVendorName: string | null,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      vendorId: dto.vendorId ? new Types.ObjectId(dto.vendorId) : null,
      vendorName: resolvedVendorName ?? dto.vendorName ?? 'Unspecified',
      poId: dto.poId ? new Types.ObjectId(dto.poId) : null,
      description: dto.description,
      category: dto.category ?? '',
      dueOn: new Date(dto.dueOn),
      amount: dto.amount,
      currency: dto.currency ?? 'USD',
      recurring: dto.recurring ?? false,
    });
    return created.toObject();
  }

  private async getRawDoc(tenantId: string, id: string) {
    const b = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!b) throw new NotFoundException('Bill not found');
    return b;
  }

  async approve(tenantId: string, id: string, approvedBy: string) {
    const b = await this.getRawDoc(tenantId, id);
    if (b.status !== BillStatus.AWAITING_APPROVAL) {
      throw new BadRequestException(
        'Only a bill awaiting approval can be approved',
      );
    }
    b.status = BillStatus.APPROVED;
    b.approvedBy = approvedBy;
    await b.save();

    await this.glPostingService.post(tenantId, [
      {
        date: new Date(),
        ref: b.ref,
        description: `${b.vendorName} — ${b.description}`,
        accountCode: GL_ACCOUNTS.GENERAL_EXPENSE.code,
        accountName: GL_ACCOUNTS.GENERAL_EXPENSE.name,
        source: GlSource.PURCHASES,
        debit: b.amount,
        sourceId: b._id,
      },
      {
        date: new Date(),
        ref: b.ref,
        description: `${b.vendorName} — AP`,
        accountCode: GL_ACCOUNTS.ACCOUNTS_PAYABLE.code,
        accountName: GL_ACCOUNTS.ACCOUNTS_PAYABLE.name,
        source: GlSource.PURCHASES,
        credit: b.amount,
        sourceId: b._id,
      },
    ]);

    return b.toObject();
  }

  async reject(tenantId: string, id: string) {
    const b = await this.getRawDoc(tenantId, id);
    b.status = BillStatus.REJECTED;
    await b.save();
    return b.toObject();
  }

  async schedulePayment(tenantId: string, id: string) {
    const b = await this.getRawDoc(tenantId, id);
    if (b.status !== BillStatus.APPROVED) {
      throw new BadRequestException(
        'Only an approved bill can be scheduled for payment',
      );
    }
    b.status = BillStatus.SCHEDULED;
    await b.save();
    return b.toObject();
  }

  // The vendor-payment side of the single WHT source of truth — if
  // the vendor is flagged non-resident/WHT-liable, this doesn't
  // compute its own WHT figure, it calls the one real register.
  async markPaid(tenantId: string, id: string) {
    const b = await this.getRawDoc(tenantId, id);
    b.status = BillStatus.PAID;
    b.paidAt = new Date();
    await b.save();

    let whtAmount = 0;
    if (b.vendorId) {
      const vendor = await this.vendorModel.findById(b.vendorId).lean();
      if (vendor?.wht) {
        const cert = await this.whtService.record(tenantId, {
          direction: WhtDirection.VENDOR_PAYMENT,
          counterparty: b.vendorName,
          sourceRef: b.ref,
          sourceId: String(b._id),
          gross: b.amount,
        });
        whtAmount = cert.wht;
      }
    }

    const glLines: Parameters<GlPostingService['post']>[1] = [
      {
        date: new Date(),
        ref: b.ref,
        description: `${b.vendorName} — AP settled`,
        accountCode: GL_ACCOUNTS.ACCOUNTS_PAYABLE.code,
        accountName: GL_ACCOUNTS.ACCOUNTS_PAYABLE.name,
        source: GlSource.PURCHASES,
        debit: b.amount,
        sourceId: b._id,
      },
      {
        date: new Date(),
        ref: b.ref,
        description: `${b.vendorName} — payment`,
        accountCode: GL_ACCOUNTS.BANK_OPERATING.code,
        accountName: GL_ACCOUNTS.BANK_OPERATING.name,
        source: GlSource.BANKING,
        credit: b.amount - whtAmount,
        sourceId: b._id,
      },
    ];
    if (whtAmount > 0) {
      glLines.push({
        date: new Date(),
        ref: b.ref,
        description: `${b.vendorName} — WHT withheld`,
        accountCode: GL_ACCOUNTS.WHT_PAYABLE.code,
        accountName: GL_ACCOUNTS.WHT_PAYABLE.name,
        source: GlSource.PURCHASES,
        credit: whtAmount,
        sourceId: b._id,
      });
    }
    await this.glPostingService.post(tenantId, glLines);

    return b.toObject();
  }
}

// ── Expense claims ────────────────────────────────────────────

@Injectable()
export class ExpenseClaimService {
  constructor(
    @InjectModel(ExpenseClaim.name)
    private readonly model: Model<ExpenseClaimDocument>,
    private readonly glPostingService: GlPostingService,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.model.countDocuments({
      tenantId,
      ref: new RegExp(`^EXP-${year}-`),
    });
    return `EXP-${year}-${String(count + 1).padStart(3, '0')}`;
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getById(tenantId: string, id: string) {
    const c = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!c) throw new NotFoundException('Expense claim not found');
    return c;
  }

  async create(
    tenantId: string,
    employeeUserId: string,
    employee: string,
    dto: CreateExpenseClaimDto,
    mandateName?: string,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      employeeUserId: new Types.ObjectId(employeeUserId),
      employee,
      description: dto.description,
      mandateId: dto.mandateId ? new Types.ObjectId(dto.mandateId) : null,
      mandateName: dto.mandateId ? (mandateName ?? null) : null,
      amount: dto.amount,
      currency: dto.currency ?? 'USD',
      rechargeable: dto.rechargeable ?? false,
    });
    return created.toObject();
  }

  private async getRawDoc(tenantId: string, id: string) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Expense claim not found');
    return c;
  }

  async approve(tenantId: string, id: string) {
    const c = await this.getRawDoc(tenantId, id);
    c.status = ClaimStatus.APPROVED;
    await c.save();

    // Rechargeable claims sit in Unbilled disbursements — the same
    // account the WIP register's disbursement half already points
    // at — since they're recoverable from the client, not a sunk
    // cost. Non-rechargeable claims are a real firm expense.
    const debitAccount = c.rechargeable
      ? GL_ACCOUNTS.UNBILLED_DISBURSEMENTS
      : GL_ACCOUNTS.GENERAL_EXPENSE;
    await this.glPostingService.post(tenantId, [
      {
        date: new Date(),
        ref: c.ref,
        description: `${c.employee} — ${c.description}`,
        accountCode: debitAccount.code,
        accountName: debitAccount.name,
        source: GlSource.PURCHASES,
        debit: c.amount,
        sourceId: c._id,
      },
      {
        date: new Date(),
        ref: c.ref,
        description: `${c.employee} — reimbursement payable`,
        accountCode: GL_ACCOUNTS.STAFF_REIMBURSEMENTS_PAYABLE.code,
        accountName: GL_ACCOUNTS.STAFF_REIMBURSEMENTS_PAYABLE.name,
        source: GlSource.PURCHASES,
        credit: c.amount,
        sourceId: c._id,
      },
    ]);

    return c.toObject();
  }

  async reject(tenantId: string, id: string) {
    const c = await this.getRawDoc(tenantId, id);
    c.status = ClaimStatus.REJECTED;
    await c.save();
    return c.toObject();
  }

  async markPaid(tenantId: string, id: string) {
    const c = await this.getRawDoc(tenantId, id);
    c.status = ClaimStatus.PAID;
    await c.save();

    await this.glPostingService.post(tenantId, [
      {
        date: new Date(),
        ref: c.ref,
        description: `${c.employee} — reimbursement settled`,
        accountCode: GL_ACCOUNTS.STAFF_REIMBURSEMENTS_PAYABLE.code,
        accountName: GL_ACCOUNTS.STAFF_REIMBURSEMENTS_PAYABLE.name,
        source: GlSource.PURCHASES,
        debit: c.amount,
        sourceId: c._id,
      },
      {
        date: new Date(),
        ref: c.ref,
        description: `${c.employee} — reimbursement payment`,
        accountCode: GL_ACCOUNTS.BANK_OPERATING.code,
        accountName: GL_ACCOUNTS.BANK_OPERATING.name,
        source: GlSource.BANKING,
        credit: c.amount,
        sourceId: c._id,
      },
    ]);

    return c.toObject();
  }

  // Receipt/proof is attached as its own step after the claim is
  // created, via its own multipart endpoint — same convention
  // dispute case documents already use elsewhere in the app.
  async attachReceipt(tenantId: string, id: string, file: Express.Multer.File) {
    const c = await this.getRawDoc(tenantId, id);
    c.receiptUrl = `/uploads/finance/expense-claims/${file.filename}`;
    c.receiptName = file.originalname;
    await c.save();
    return c.toObject();
  }

  // ── Real WIP disbursements — the spec's other half of "work in
  // progress" alongside time. An approved, rechargeable, not-yet-
  // invoiced claim is exactly as real a piece of unbilled work as an
  // approved time entry. ─────────────────────────────────────────

  async getRechargeableRegister(tenantId: string, mandateId?: string) {
    const query: any = {
      tenantId: new Types.ObjectId(tenantId),
      status: ClaimStatus.APPROVED,
      rechargeable: true,
      invoiceId: null,
    };
    if (mandateId) query.mandateId = new Types.ObjectId(mandateId);
    return this.model.find(query).sort({ createdAt: 1 }).lean();
  }

  async markInvoiced(tenantId: string, ids: string[], invoiceId: string) {
    await this.model.updateMany(
      { _id: { $in: ids }, tenantId: new Types.ObjectId(tenantId) },
      { $set: { invoiceId: new Types.ObjectId(invoiceId) } },
    );
  }
}

// ── Expense policies ──────────────────────────────────────────

@Injectable()
export class ExpensePolicyService {
  constructor(
    @InjectModel(ExpensePolicy.name)
    private readonly model: Model<ExpensePolicyDocument>,
  ) {}

  async getAll(tenantId: string) {
    return this.model.find({ tenantId: new Types.ObjectId(tenantId) }).lean();
  }

  // Upsert by rule name — editing an existing policy line updates it
  // in place rather than creating a duplicate.
  async upsert(tenantId: string, dto: UpsertExpensePolicyDto) {
    const tId = new Types.ObjectId(tenantId);
    const saved = await this.model.findOneAndUpdate(
      { tenantId: tId, rule: dto.rule },
      {
        $set: { value: dto.value },
        $setOnInsert: { tenantId: tId, rule: dto.rule },
      },
      { upsert: true, new: true },
    );
    return saved.toObject();
  }
}
