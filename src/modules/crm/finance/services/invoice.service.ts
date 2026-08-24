import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
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
  ClientInvoiceAction,
  RemittanceAccount,
  RemittanceAccountDocument,
} from '../schemas';
import {
  CreateInvoiceDto,
  CreateInvoiceFromWipDto,
  AddDunningEventDto,
  RecordPaymentDto,
  CreatePaymentPlanDto,
  CreateRemittanceAccountDto,
  SetClientInvoiceStatusDto,
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
import { WhtService } from './wht.service';
import { WhtDirection, EbmStatus } from '../schemas';
import { GlPostingService, GL_ACCOUNTS } from './gl-posting.service';
import { GlSource } from '../schemas';
import { buildInvoicePdf } from 'src/common/utils/pdf/invoice.util';

// Same real conversion used across the app's other upload
// features — filePath may be absolute or relative, so only the
// part from 'uploads/' onwards is kept, then prefixed with the
// real configured APP_URL.
function toFileUrl(filePath: string): string {
  const rawPath = filePath.replace(/\\/g, '/');
  const uploadsIndex = rawPath.indexOf('uploads/');
  const relativePath =
    uploadsIndex !== -1 ? rawPath.slice(uploadsIndex) : rawPath;
  return `${process.env.APP_URL}/${relativePath}`;
}

@Injectable()
export class InvoiceService {
  constructor(
    @InjectModel(Invoice.name)
    private readonly model: Model<InvoiceDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(RemittanceAccount.name)
    private readonly remittanceModel: Model<RemittanceAccountDocument>,
    private readonly mandateService: MandateService,
    private readonly timeEntryService: TimeEntryService,
    private readonly writeOffService: WriteOffService,
    private readonly emailService: EmailService,
    private readonly expenseClaimService: ExpenseClaimService,
    private readonly whtService: WhtService,
    private readonly glPostingService: GlPostingService,
  ) {}

  // A client can't be told where to send money if the tenant hasn't
  // said where money goes — real guard, not a UI-only nudge, since
  // an invoice created via any path (manual or from WIP) needs this
  // to actually be payable.
  private async requirePaymentDetails(tenantId: string) {
    const hasActive = await this.remittanceModel.exists({
      tenantId: new Types.ObjectId(tenantId),
      active: true,
    });
    if (!hasActive) {
      throw new BadRequestException(
        'Add your payment details in Settings before creating invoices, so clients know where to send payment.',
      );
    }
  }

  // Real accounts matching the invoice's own currency come first —
  // a client paying a USD invoice needs the USD account, not a RWF
  // one buried in the same list. Falls back to every active account
  // if none match, rather than showing nothing. Shared by both
  // generatePdf and ClientInvoiceService (via injected InvoiceService),
  // so the PDF and the portal view never disagree about which
  // accounts to show.
  async getRemittanceAccountsFor(tenantId: string, currency: string) {
    const all = await this.remittanceModel
      .find({ tenantId: new Types.ObjectId(tenantId), active: true })
      .lean();
    const matching = all.filter((a) => a.currency === currency);
    return matching.length ? matching : all;
  }

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
    await this.requirePaymentDetails(tenantId);
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
    await this.requirePaymentDetails(tenantId);
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

    // Real double-entry posting — this is the actual "Sales" source
    // in the general ledger, not a separate figure the ledger
    // trusts on faith. Dr AR for the full payable, Cr Revenue for
    // net, Cr VAT payable for the VAT component if any.
    const glLines: Parameters<GlPostingService['post']>[1] = [
      {
        date: new Date(invoice.issuedOn),
        ref: invoice.ref,
        description: `${invoice.clientName} — ${invoice.mandateName}`,
        accountCode: GL_ACCOUNTS.ACCOUNTS_RECEIVABLE.code,
        accountName: GL_ACCOUNTS.ACCOUNTS_RECEIVABLE.name,
        source: GlSource.SALES,
        debit: invoice.payable,
        sourceId: invoice._id,
      },
      {
        date: new Date(invoice.issuedOn),
        ref: invoice.ref,
        description: `${invoice.clientName} — accounts receivable`,
        accountCode: GL_ACCOUNTS.REVENUE.code,
        accountName: GL_ACCOUNTS.REVENUE.name,
        source: GlSource.SALES,
        credit: invoice.net,
        sourceId: invoice._id,
      },
    ];
    if (invoice.vat > 0) {
      glLines.push({
        date: new Date(invoice.issuedOn),
        ref: invoice.ref,
        description: `${invoice.clientName} — VAT`,
        accountCode: GL_ACCOUNTS.VAT_PAYABLE.code,
        accountName: GL_ACCOUNTS.VAT_PAYABLE.name,
        source: GlSource.SALES,
        credit: invoice.vat,
        sourceId: invoice._id,
      });
    }
    await this.glPostingService.post(tenantId, glLines);

    // The client-receipt side of the single WHT source of truth —
    // this invoice doesn't compute its own separate WHT figure
    // beyond what's already in computeTotals; it just records that
    // real event in the one real register.
    if (invoice.whtRate > 0) {
      await this.whtService.record(tenantId, {
        direction: WhtDirection.CLIENT_RECEIPT,
        counterparty: invoice.clientName,
        sourceRef: invoice.ref,
        sourceId: invoice._id,
        gross: invoice.net,
        rate: invoice.whtRate,
      });
    }

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

  // Real PDF, same tenant-branding convention Quote and Purchase
  // Order PDFs already use — the firm's own logo/name, never the
  // platform's. Called both by the tenant-facing download endpoint
  // and by ClientInvoiceService.downloadMyInvoicePdf for the client
  // portal — one real PDF, not two separately maintained renderers.
  // Includes real payment details matching the invoice's currency,
  // so a client reading the PDF alone (not just the portal) still
  // knows where to send money.
  async generatePdf(tenantId: string, id: string): Promise<Buffer> {
    const i = await this.getRawDoc(tenantId, id);
    const totals = this.computeTotals(i.toObject());
    const tenant = await this.userModel.findById(tenantId).lean();
    const profile: any = tenant?.tenantProfile;
    const firmName = profile?.businessName || 'Your firm';
    const addressLines = [
      profile?.address?.city,
      profile?.address?.state,
      profile?.address?.country,
    ].filter(Boolean);
    const remittanceAccounts = await this.getRemittanceAccountsFor(
      tenantId,
      i.currency,
    );

    return buildInvoicePdf({
      ref: i.ref,
      clientName: i.clientName,
      mandateName: i.mandateName,
      lines: i.lines.map((l: any) => ({
        description: l.description,
        qty: l.qty,
        unit: l.unit,
      })),
      currency: i.currency,
      net: totals.net,
      vat: totals.vat,
      vatRate: i.vatRate,
      wht: totals.wht,
      whtRate: i.whtRate,
      payable: totals.payable,
      issuedOn: i.issuedOn,
      dueOn: i.dueOn,
      firmName,
      firmAddressLines: addressLines,
      logoDataUrl: profile?.logoUrl || null,
      remittanceAccounts: remittanceAccounts.map((a: any) => ({
        accountName: a.accountName,
        bankName: a.bankName,
        accountNumber: a.accountNumber,
        currency: a.currency,
        branchCode: a.branchCode || undefined,
        swiftCode: a.swiftCode || undefined,
      })),
    });
  }

  // The actual writer of the client's claim — called by
  // ClientInvoiceService.markStatus after it's confirmed the client
  // genuinely owns this invoice. Records the claim and nothing more:
  // no stage change, no paidAmount change, no GL posting. Those only
  // happen when the tenant takes their own real confirming action.
  async setClientAction(
    tenantId: string,
    id: string,
    action: ClientInvoiceAction,
    note: string | null,
    proofOfPaymentFile?: Express.Multer.File | null,
  ) {
    const i = await this.getRawDoc(tenantId, id);
    i.clientAction = action;
    i.clientActionAt = new Date();
    i.clientActionNote = note;
    if (proofOfPaymentFile) {
      // Real file, real proof — replaces any earlier attempt's
      // file on disk rather than leaving orphaned uploads behind.
      if (i.proofOfPaymentFilePath && fs.existsSync(i.proofOfPaymentFilePath)) {
        fs.unlinkSync(i.proofOfPaymentFilePath);
      }
      i.proofOfPaymentUrl = toFileUrl(proofOfPaymentFile.path);
      i.proofOfPaymentFileName = proofOfPaymentFile.originalname;
      i.proofOfPaymentMimeType = proofOfPaymentFile.mimetype;
      i.proofOfPaymentFilePath = proofOfPaymentFile.path;
    }
    await i.save();
    return this.normalize(i.toObject());
  }

  // Tenant clears a client's claim without it having been a real
  // payment — the claim was premature, mistaken, or already
  // resolved another way (e.g. a written-off dispute). A real,
  // separate action from applyPayment's own automatic clearing.
  async dismissClientAction(tenantId: string, id: string) {
    const i = await this.getRawDoc(tenantId, id);
    i.clientAction = null;
    i.clientActionAt = null;
    i.clientActionNote = null;
    if (i.proofOfPaymentFilePath && fs.existsSync(i.proofOfPaymentFilePath)) {
      fs.unlinkSync(i.proofOfPaymentFilePath);
    }
    i.proofOfPaymentUrl = null;
    i.proofOfPaymentFileName = null;
    i.proofOfPaymentMimeType = null;
    i.proofOfPaymentFilePath = null;
    await i.save();
    return this.normalize(i.toObject());
  }

  // Called by EbmService.resync — the only writer of this field, so
  // the real sync state lives in one place.
  async setEbmStatus(
    tenantId: string,
    id: string,
    status: EbmStatus,
    receiptNumber: string,
  ) {
    const i = await this.getRawDoc(tenantId, id);
    i.ebmStatus = status;
    i.ebmReceiptNumber = receiptNumber;
    await i.save();
    return this.normalize(i.toObject());
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
    // The client's "I've paid" claim has now been genuinely verified
    // by a real recorded payment — clear it rather than leave a
    // stale flag sitting on an invoice that's actually settled.
    if (
      i.stage === InvoiceStage.PAID &&
      i.clientAction === ClientInvoiceAction.PAID
    ) {
      i.clientAction = null;
      i.clientActionAt = null;
      i.clientActionNote = null;
    }
    await i.save();

    await this.glPostingService.post(tenantId, [
      {
        date: new Date(),
        ref: i.ref,
        description: `${i.clientName} — payment received`,
        accountCode: GL_ACCOUNTS.BANK_OPERATING.code,
        accountName: GL_ACCOUNTS.BANK_OPERATING.name,
        source: GlSource.BANKING,
        debit: amount,
        sourceId: i._id,
      },
      {
        date: new Date(),
        ref: i.ref,
        description: `${i.clientName} — AR cleared`,
        accountCode: GL_ACCOUNTS.ACCOUNTS_RECEIVABLE.code,
        accountName: GL_ACCOUNTS.ACCOUNTS_RECEIVABLE.name,
        source: GlSource.BANKING,
        credit: amount,
        sourceId: i._id,
      },
    ]);

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

// ── Client-facing — a thin layer over the real InvoiceService,
// scoped to exactly the invoices genuinely belonging to this
// client. Draft/In Review/Approved invoices aren't visible here —
// those are internal, not yet the client's business. Dunning log is
// stripped from what the client sees, same reasoning ticket
// internal notes are stripped for clients elsewhere in the app. ──

@Injectable()
export class ClientInvoiceService {
  constructor(private readonly invoiceService: InvoiceService) {}

  private readonly visibleStages = [
    'Sent',
    'Part Paid',
    'Paid',
    'Overdue',
    'Written Off',
  ];

  private sanitize(i: any) {
    const { dunningLog, ...rest } = i;
    return rest;
  }

  async getMyInvoices(tenantId: string, clientUserId: string) {
    const invoices = await this.invoiceService.getAll(tenantId, {
      clientUserId,
    });
    return invoices
      .filter((i: any) => this.visibleStages.includes(i.stage))
      .map((i) => this.sanitize(i));
  }

  private async getOwnedInvoice(
    tenantId: string,
    clientUserId: string,
    id: string,
  ) {
    const invoice: any = await this.invoiceService.getById(tenantId, id);
    if (String(invoice.clientUserId) !== clientUserId) {
      throw new ForbiddenException('This is not your invoice');
    }
    if (!this.visibleStages.includes(invoice.stage)) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  async getMyInvoice(tenantId: string, clientUserId: string, id: string) {
    const invoice = await this.getOwnedInvoice(tenantId, clientUserId, id);
    // Real signal the tenant's credit control already relies on —
    // this is the one place it's genuinely set, when the client
    // actually opens their own invoice.
    if (!invoice.openedByClient) {
      await this.invoiceService.markOpenedByClient(tenantId, id);
    }
    // Same real accounts the PDF shows — one source, via the
    // injected InvoiceService, so the portal and the PDF never
    // disagree about which accounts to display.
    const remittanceAccounts =
      await this.invoiceService.getRemittanceAccountsFor(
        tenantId,
        invoice.currency,
      );
    return { ...this.sanitize(invoice), remittanceAccounts };
  }

  async downloadMyInvoicePdf(
    tenantId: string,
    clientUserId: string,
    id: string,
  ): Promise<{ buffer: Buffer; ref: string }> {
    const invoice = await this.getOwnedInvoice(tenantId, clientUserId, id);
    const buffer = await this.invoiceService.generatePdf(tenantId, id);
    return { buffer, ref: invoice.ref };
  }

  // The client's own claim — "I've paid" or "there's an issue" —
  // recorded as a real, timestamped signal the tenant sees and acts
  // on. Deliberately never touches stage, paidAmount, or the ledger;
  // only the tenant's own confirmation (via the real payment-
  // recording flow) does that.
  async markStatus(
    tenantId: string,
    clientUserId: string,
    id: string,
    dto: SetClientInvoiceStatusDto,
    proofOfPaymentFile?: Express.Multer.File | null,
  ) {
    await this.getOwnedInvoice(tenantId, clientUserId, id);
    return this.invoiceService.setClientAction(
      tenantId,
      id,
      dto.action,
      dto.note ?? null,
      proofOfPaymentFile,
    );
  }
}

// ── Remittance accounts — a small, real CRUD surface for the
// tenant's own bank details shown to clients on invoices and PDFs. ──

@Injectable()
export class RemittanceAccountService {
  constructor(
    @InjectModel(RemittanceAccount.name)
    private readonly model: Model<RemittanceAccountDocument>,
  ) {}

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async create(tenantId: string, dto: CreateRemittanceAccountDto) {
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      accountName: dto.accountName,
      bankName: dto.bankName,
      accountNumber: dto.accountNumber,
      currency: dto.currency,
      branchCode: dto.branchCode ?? '',
      swiftCode: dto.swiftCode ?? '',
    });
    return created.toObject();
  }

  async update(
    tenantId: string,
    id: string,
    dto: Partial<CreateRemittanceAccountDto>,
  ) {
    const a = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!a) throw new NotFoundException('Remittance account not found');
    Object.assign(a, dto);
    await a.save();
    return a.toObject();
  }

  async setActive(tenantId: string, id: string, active: boolean) {
    const a = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!a) throw new NotFoundException('Remittance account not found');
    a.active = active;
    await a.save();
    return a.toObject();
  }
}
