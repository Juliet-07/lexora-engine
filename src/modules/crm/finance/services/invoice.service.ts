import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Invoice,
  InvoiceDocument,
  InvoiceStage,
  Payment,
  PaymentDocument,
  PaymentMatchStatus,
  PaymentPlan,
  PaymentPlanDocument,
  InstalmentStatus,
  WriteOffStage,
} from '../schemas';
import {
  CreateInvoiceDto,
  CreateInvoiceFromWipDto,
  AddDunningEventDto,
  RecordPaymentDto,
  CreatePaymentPlanDto,
} from '../dtos';
import {
  MandateService,
  TimeEntryService,
} from 'src/modules/crm/projects/services';
import { WriteOffService } from './write-off.service';
import { WipBillingStatus } from 'src/modules/crm/projects/schemas';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { ExpenseClaimService } from './purchases.service';

@Injectable()
export class InvoiceService {
  constructor(
    @InjectModel(Invoice.name)
    private readonly model: Model<InvoiceDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly mandateService: MandateService,
    private readonly timeEntryService: TimeEntryService,
    private readonly writeOffService: WriteOffService,
    private readonly emailService: EmailService,
    private readonly expenseClaimService: ExpenseClaimService,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.model.countDocuments({
      tenantId,
      ref: new RegExp(`^INV-${year}-`),
    });
    return `INV-${year}-${String(count + 100)}`;
  }

  // subtotal is always derived from lines — never trusted as a
  // separately-entered number that could disagree with what the
  // lines actually add up to.
  computeTotals(inv: any) {
    const subtotal = inv.lines.reduce(
      (s: number, l: any) => s + l.qty * l.unit,
      0,
    );
    const net = subtotal - inv.discount;
    const vat = (net * inv.vatRate) / 100;
    const wht = (net * inv.whtRate) / 100;
    return {
      subtotal,
      net,
      vat,
      wht,
      gross: net + vat,
      payable: net + vat - wht,
    };
  }

  private normalize(inv: any) {
    return { ...inv, ...this.computeTotals(inv) };
  }

  async getAll(
    tenantId: string,
    filters: {
      mandateId?: string;
      clientUserId?: string;
      stage?: InvoiceStage;
    } = {},
  ) {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (filters.mandateId)
      query.mandateId = new Types.ObjectId(filters.mandateId);
    if (filters.clientUserId)
      query.clientUserId = new Types.ObjectId(filters.clientUserId);
    if (filters.stage) query.stage = filters.stage;
    const rows = await this.model.find(query).sort({ createdAt: -1 }).lean();
    return rows.map((i) => this.normalize(i));
  }

  async getById(tenantId: string, id: string) {
    const i = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!i) throw new NotFoundException('Invoice not found');
    return this.normalize(i);
  }

  private async getRawDoc(tenantId: string, id: string) {
    const i = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!i) throw new NotFoundException('Invoice not found');
    return i;
  }

  // Client and mandate are always resolved from the real Mandate
  // record, not trusted from the caller — an invoice is a financial
  // document, and getting the billed party wrong is a meaningfully
  // worse failure mode here than it is on, say, a Task's denormalized
  // mandate name.
  async create(tenantId: string, dto: CreateInvoiceDto) {
    const mandate: any = await this.mandateService.getById(
      tenantId,
      dto.mandateId,
    );
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      clientUserId: new Types.ObjectId(mandate.clientUserId),
      clientName: mandate.clientName,
      mandateId: new Types.ObjectId(dto.mandateId),
      mandateName: mandate.name,
      currency: dto.currency ?? 'USD',
      vatRate: dto.vatRate ?? 18,
      whtRate: dto.whtRate ?? 0,
      discount: dto.discount ?? 0,
      model: dto.model,
      issuedOn: new Date(),
      dueOn: new Date(dto.dueOn),
      proforma: dto.proforma ?? false,
      lines: dto.lines,
    });
    return this.normalize(created.toObject());
  }

  // The real WIP → invoice connection. Only Unbilled or Approved-for-
  // billing entries are invoiceable — Written off entries are worth
  // nothing and Held entries are deliberately paused, so both are
  // rejected here rather than silently invoiced anyway. A written-
  // down entry is billed at its reduced value, not its original
  // hours*rate, since that's what billing actually decided it's worth.
  // The real WIP → invoice connection, for both halves of what "work
  // in progress" means: time entries and rechargeable disbursements.
  // Only Unbilled or Approved-for-billing time entries are
  // invoiceable — Written off entries are worth nothing and Held
  // entries are deliberately paused, so both are rejected here
  // rather than silently invoiced anyway. A written-down entry is
  // billed at its reduced value, not its original hours*rate, since
  // that's what billing actually decided it's worth. Disbursements
  // need no such review stage — an approved, rechargeable claim is
  // simply invoiced at its real amount.
  async createFromWip(tenantId: string, dto: CreateInvoiceFromWipDto) {
    const mandate: any = await this.mandateService.getById(
      tenantId,
      dto.mandateId,
    );
    const timeEntryIds = dto.timeEntryIds ?? [];
    const disbursementIds = dto.expenseClaimIds ?? [];

    const entries = await Promise.all(
      timeEntryIds.map((id) => this.timeEntryService.getById(tenantId, id)),
    );
    const notInvoiceable = entries.filter(
      (e: any) =>
        String(e.mandateId) !== dto.mandateId ||
        e.invoiceId ||
        [WipBillingStatus.WRITTEN_OFF, WipBillingStatus.HELD].includes(
          e.billingStatus,
        ),
    );
    if (notInvoiceable.length) {
      throw new BadRequestException(
        'One or more selected time entries are not invoiceable (wrong mandate, already invoiced, written off, or held)',
      );
    }

    const disbursements = disbursementIds.length
      ? await this.expenseClaimService.getRechargeableRegister(
          tenantId,
          dto.mandateId,
        )
      : [];
    const selectedDisbursements = disbursements.filter((d: any) =>
      disbursementIds.includes(String(d._id)),
    );
    if (selectedDisbursements.length !== disbursementIds.length) {
      throw new BadRequestException(
        'One or more selected disbursements are not invoiceable (wrong mandate, already invoiced, or not an approved rechargeable claim)',
      );
    }

    if (!timeEntryIds.length && !disbursementIds.length) {
      throw new BadRequestException(
        'Select at least one time entry or disbursement',
      );
    }

    const timeLines = entries.map((e: any) => {
      const isWrittenDown = e.billingStatus === WipBillingStatus.WRITTEN_DOWN;
      return {
        description: `${e.taskTitle}${e.narrative ? ` — ${e.narrative}` : ''} (${e.member}, ${e.hours}h)`,
        qty: 1,
        unit: isWrittenDown ? e.writtenDownAmount : e.hours * e.rate,
        timeEntryId: e._id,
      };
    });
    const disbursementLines = selectedDisbursements.map((d: any) => ({
      description: `Disbursement — ${d.description}`,
      qty: 1,
      unit: d.amount,
      timeEntryId: null,
    }));

    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      clientUserId: new Types.ObjectId(mandate.clientUserId),
      clientName: mandate.clientName,
      mandateId: new Types.ObjectId(dto.mandateId),
      mandateName: mandate.name,
      currency: dto.currency ?? 'USD',
      vatRate: dto.vatRate ?? 18,
      whtRate: dto.whtRate ?? 0,
      discount: 0,
      model: 'Time & materials',
      issuedOn: new Date(),
      dueOn: new Date(dto.dueOn),
      lines: [...timeLines, ...disbursementLines],
    });

    if (timeEntryIds.length) {
      await this.timeEntryService.markInvoiced(
        tenantId,
        timeEntryIds,
        String(created._id),
      );
    }
    if (disbursementIds.length) {
      await this.expenseClaimService.markInvoiced(
        tenantId,
        disbursementIds,
        String(created._id),
      );
    }

    return this.normalize(created.toObject());
  }

  private async transition(
    tenantId: string,
    id: string,
    from: InvoiceStage[],
    to: InvoiceStage,
  ) {
    const i = await this.getRawDoc(tenantId, id);
    if (!from.includes(i.stage)) {
      throw new BadRequestException(
        `Can't move from ${i.stage} to ${to} directly`,
      );
    }
    i.stage = to;
    await i.save();
    return this.normalize(i.toObject());
  }

  async submitForReview(tenantId: string, id: string) {
    return this.transition(
      tenantId,
      id,
      [InvoiceStage.DRAFT],
      InvoiceStage.IN_REVIEW,
    );
  }

  async approve(tenantId: string, id: string) {
    return this.transition(
      tenantId,
      id,
      [InvoiceStage.IN_REVIEW],
      InvoiceStage.APPROVED,
    );
  }

  // This is the actual delivery to the client — a real email, not
  // just a stage flip. Self-contained with line items and totals in
  // the email body, since there's no client-facing invoice view in
  // the portal yet to link to. If the send fails the stage change
  // still stands; the tenant sees the invoice at Sent and can
  // manually follow up rather than the whole action failing silently.
  async send(tenantId: string, id: string) {
    const invoice = await this.transition(
      tenantId,
      id,
      [InvoiceStage.APPROVED],
      InvoiceStage.SENT,
    );
    const client = await this.userModel.findById(invoice.clientUserId).lean();
    if (client?.email) {
      await this.emailService
        .sendInvoiceEmail({
          to: client.email,
          clientName: invoice.clientName,
          ref: invoice.ref,
          mandateName: invoice.mandateName,
          lines: invoice.lines.map((l: any) => ({
            description: l.description,
            qty: l.qty,
            unit: l.unit,
          })),
          currency: invoice.currency,
          net: invoice.net,
          vat: invoice.vat,
          vatRate: invoice.vatRate,
          wht: invoice.wht,
          whtRate: invoice.whtRate,
          payable: invoice.payable,
          dueOn: new Date(invoice.dueOn),
          issuedOn: new Date(invoice.issuedOn),
        })
        .catch(() => undefined);
    }
    return invoice;
  }

  // Internal — used by PaymentService after recording a real payment,
  // so the stage always reflects the real running paidAmount.
  async applyPayment(tenantId: string, id: string, amount: number) {
    const i = await this.getRawDoc(tenantId, id);
    const totals = this.computeTotals(i.toObject());
    i.paidAmount = i.paidAmount + amount;
    i.stage =
      i.paidAmount >= totals.payable
        ? InvoiceStage.PAID
        : InvoiceStage.PART_PAID;
    await i.save();
    return this.normalize(i.toObject());
  }

  // Writing off an invoice creates the third checkpoint of the real
  // write-off lifecycle — same WriteOff record type as a WIP write-
  // down or a credit note, not a separate concept.
  async writeOff(
    tenantId: string,
    id: string,
    reason: string,
    approvedBy: string,
  ) {
    const i = await this.getRawDoc(tenantId, id);
    const totals = this.computeTotals(i.toObject());
    const outstanding = totals.payable - i.paidAmount;
    i.stage = InvoiceStage.WRITTEN_OFF;
    i.writeOffReason = reason;
    await i.save();
    await this.writeOffService.record(tenantId, {
      stage: WriteOffStage.BAD_DEBT_WRITE_OFF,
      reference: i.ref,
      clientName: i.clientName,
      mandateName: i.mandateName,
      amount: outstanding,
      reason,
      approvedBy,
    });
    return this.normalize(i.toObject());
  }

  async addDunningEvent(tenantId: string, id: string, dto: AddDunningEventDto) {
    const i = await this.getRawDoc(tenantId, id);
    i.dunningLog.push({
      action: dto.action,
      by: dto.by,
      at: new Date(),
      note: dto.note ?? null,
    } as any);
    await i.save();
    return this.normalize(i.toObject());
  }

  async setDunningPaused(tenantId: string, id: string, paused: boolean) {
    const i = await this.getRawDoc(tenantId, id);
    i.dunningPaused = paused;
    await i.save();
    return this.normalize(i.toObject());
  }

  async markOpenedByClient(tenantId: string, id: string) {
    const i = await this.getRawDoc(tenantId, id);
    i.openedByClient = true;
    await i.save();
    return this.normalize(i.toObject());
  }
}

@Injectable()
export class PaymentService {
  constructor(
    @InjectModel(Payment.name)
    private readonly model: Model<PaymentDocument>,
    private readonly invoiceService: InvoiceService,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const count = await this.model.countDocuments({ tenantId });
    return `PMT-${String(count + 101)}`;
  }

  async getAll(tenantId: string, invoiceId?: string) {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (invoiceId) query.invoiceId = new Types.ObjectId(invoiceId);
    return this.model.find(query).sort({ at: -1 }).lean();
  }

  // Defaults to the full remaining balance if no amount is given —
  // that's the common case (a client pays what they owe), with a
  // specific amount available for genuine partial payments.
  async record(tenantId: string, invoiceId: string, dto: RecordPaymentDto) {
    const invoice: any = await this.invoiceService.getById(tenantId, invoiceId);
    const remaining = invoice.payable - invoice.paidAmount;
    const amount = dto.amount ?? remaining;

    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      invoiceId: new Types.ObjectId(invoiceId),
      clientName: invoice.clientName,
      amount,
      currency: invoice.currency,
      method: dto.method,
      matched: PaymentMatchStatus.MANUAL,
      at: new Date(),
    });

    await this.invoiceService.applyPayment(tenantId, invoiceId, amount);
    return created.toObject();
  }
}

@Injectable()
export class PaymentPlanService {
  constructor(
    @InjectModel(PaymentPlan.name)
    private readonly model: Model<PaymentPlanDocument>,
    private readonly invoiceService: InvoiceService,
  ) {}

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async create(tenantId: string, dto: CreatePaymentPlanDto) {
    const invoice: any = await this.invoiceService.getById(
      tenantId,
      dto.invoiceId,
    );
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      invoiceId: new Types.ObjectId(dto.invoiceId),
      invoiceRef: invoice.ref,
      clientName: invoice.clientName,
      instalments: dto.instalments.map((i) => ({
        due: new Date(i.due),
        amount: i.amount,
      })),
    });
    // Agreeing a payment plan naturally pauses dunning while the
    // client is compliant with it — matches the spec's own framing.
    await this.invoiceService.setDunningPaused(tenantId, dto.invoiceId, true);
    return created.toObject();
  }

  async markInstalmentPaid(
    tenantId: string,
    planId: string,
    instalmentId: string,
  ) {
    const plan = await this.model.findOne({
      _id: planId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!plan) throw new NotFoundException('Payment plan not found');
    const instalment = (plan.instalments as any).id(instalmentId);
    if (!instalment) throw new NotFoundException('Instalment not found');
    instalment.status = InstalmentStatus.PAID;
    await plan.save();
    await this.invoiceService.applyPayment(
      tenantId,
      String(plan.invoiceId),
      instalment.amount,
    );
    return plan.toObject();
  }
}
