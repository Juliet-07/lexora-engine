import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TimeEntryService,
  MandateService,
} from 'src/modules/crm/projects/services';
import { WriteOffService } from './write-off.service';
import {
  CreditNote,
  CreditNoteDocument,
  WriteOffStage,
  Quote,
  QuoteDocument,
  QuoteStatus,
  BillingModel,
  RecurringInvoice,
  RecurringInvoiceDocument,
  RecurringStatus,
} from '../schemas';
import { InvoiceService } from './invoice.service';
import {
  CreateCreditNoteDto,
  CreateQuoteDto,
  CreateRecurringInvoiceDto,
} from '../dtos';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { buildQuotePdf } from 'src/common/utils/pdf/quote.util';
import { SetQuoteMandateDto } from '../dtos';

@Injectable()
export class WipService {
  constructor(
    private readonly timeEntryService: TimeEntryService,
    private readonly mandateService: MandateService,
    private readonly writeOffService: WriteOffService,
  ) {}

  async getRegister(tenantId: string, mandateId?: string) {
    return this.timeEntryService.getWipRegister(tenantId, mandateId);
  }

  async approveForBilling(tenantId: string, id: string) {
    return this.timeEntryService.approveForBilling(tenantId, id);
  }

  // Writing down or off creates the first checkpoint of the real
  // write-off lifecycle — the same WriteOff record type a credit
  // note or bad-debt write-off produces later in the chain. Client
  // name is resolved from the real mandate, not the employee who
  // logged the time — that would be a genuine bug in the audit trail.
  async writeDown(
    tenantId: string,
    id: string,
    writtenDownAmount: number,
    reason: string,
    approvedBy: string,
  ) {
    const entry: any = await this.timeEntryService.writeDownWip(
      tenantId,
      id,
      writtenDownAmount,
      reason,
    );
    const mandate: any = await this.mandateService.getById(
      tenantId,
      String(entry.mandateId),
    );
    const originalValue = entry.hours * entry.rate;
    await this.writeOffService.record(tenantId, {
      stage: WriteOffStage.WIP_WRITE_DOWN,
      reference: String(entry._id),
      clientName: mandate.clientName,
      mandateName: entry.mandateName,
      amount: originalValue - writtenDownAmount,
      reason,
      approvedBy,
    });
    return entry;
  }

  async writeOff(
    tenantId: string,
    id: string,
    reason: string,
    approvedBy: string,
  ) {
    const entry: any = await this.timeEntryService.writeOffWip(
      tenantId,
      id,
      reason,
    );
    const mandate: any = await this.mandateService.getById(
      tenantId,
      String(entry.mandateId),
    );
    await this.writeOffService.record(tenantId, {
      stage: WriteOffStage.WIP_WRITE_DOWN,
      reference: String(entry._id),
      clientName: mandate.clientName,
      mandateName: entry.mandateName,
      amount: entry.hours * entry.rate,
      reason,
      approvedBy,
    });
    return entry;
  }

  async hold(tenantId: string, id: string, reason?: string) {
    return this.timeEntryService.holdWip(tenantId, id, reason);
  }
}

@Injectable()
export class CreditNoteService {
  constructor(
    @InjectModel(CreditNote.name)
    private readonly model: Model<CreditNoteDocument>,
    private readonly invoiceService: InvoiceService,
    private readonly writeOffService: WriteOffService,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.model.countDocuments({
      tenantId,
      ref: new RegExp(`^CN-${year}-`),
    });
    return `CN-${year}-${String(count + 1).padStart(3, '0')}`;
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  // A credit note is its own real document referencing the original
  // invoice — it doesn't edit the invoice's lines directly, matching
  // real accounting practice. It's the second checkpoint of the
  // consolidated write-off lifecycle, same record type as a WIP
  // write-down or a bad-debt write-off.
  async create(tenantId: string, dto: CreateCreditNoteDto) {
    const invoice: any = await this.invoiceService.getById(
      tenantId,
      dto.invoiceId,
    );
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      invoiceId: new Types.ObjectId(dto.invoiceId),
      invoiceRef: invoice.ref,
      clientName: invoice.clientName,
      amount: dto.amount,
      reason: dto.reason,
      approvedBy: dto.approvedBy,
    });
    await this.writeOffService.record(tenantId, {
      stage: WriteOffStage.CREDIT_NOTE,
      reference: ref,
      clientName: invoice.clientName,
      mandateName: invoice.mandateName,
      amount: dto.amount,
      reason: dto.reason,
      approvedBy: dto.approvedBy,
    });
    return created.toObject();
  }
}

@Injectable()
export class QuoteService {
  constructor(
    @InjectModel(Quote.name)
    private readonly model: Model<QuoteDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly invoiceService: InvoiceService,
    private readonly emailService: EmailService,
    private readonly mandateService: MandateService,
  ) {}

  private async nextRef(
    tenantId: Types.ObjectId,
    kind: string,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = kind === 'Proforma' ? 'PF' : 'QT';
    const count = await this.model.countDocuments({
      tenantId,
      ref: new RegExp(`^${prefix}-${year}-`),
    });
    return `${prefix}-${year}-${String(count + 1).padStart(3, '0')}`;
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getById(tenantId: string, id: string) {
    const q = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!q) throw new NotFoundException('Quote not found');
    return q;
  }

  async create(tenantId: string, dto: CreateQuoteDto) {
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId, dto.kind);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      clientUserId: dto.clientUserId
        ? new Types.ObjectId(dto.clientUserId)
        : null,
      clientName: dto.clientName,
      mandateId: dto.mandateId ? new Types.ObjectId(dto.mandateId) : null,
      title: dto.title,
      amount: dto.amount,
      currency: dto.currency ?? 'USD',
      issued: new Date(),
      expires: new Date(dto.expires),
      kind: dto.kind,
    });
    return created.toObject();
  }

  private async getRawDoc(tenantId: string, id: string) {
    const q = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!q) throw new NotFoundException('Quote not found');
    return q;
  }

  // Sending is when the client actually finds out this exists — a
  // real email goes out here, not just a status flip. If the email
  // fails (bad address, SMTP hiccup) the status change still stands;
  // the tenant can see that and resend rather than the whole action
  // silently failing.
  async setStatus(tenantId: string, id: string, status: QuoteStatus) {
    const q = await this.getRawDoc(tenantId, id);
    const wasNotSent = q.status !== QuoteStatus.SENT;
    q.status = status;
    await q.save();

    if (status === QuoteStatus.SENT && wasNotSent && q.clientUserId) {
      const client = await this.userModel.findById(q.clientUserId).lean();
      if (client?.email) {
        await this.emailService
          .sendQuoteEmail({
            to: client.email,
            clientName: q.clientName,
            ref: q.ref,
            kind: q.kind as 'Quote' | 'Proforma',
            title: q.title,
            amount: q.amount,
            currency: q.currency,
            issued: q.issued,
            expires: q.expires,
          })
          .catch(() => undefined);
      }
    }

    return q.toObject();
  }

  // The flow the product owner asked for directly: a quote written
  // before a mandate existed (for a prospect, or just prepared
  // early) gets one attached once it's real, rather than needing to
  // be recreated from scratch. Validated against the real Mandate
  // record — same "financial documents trust the real record, not a
  // caller-supplied id" reasoning Invoice already follows.
  async setMandate(tenantId: string, id: string, dto: SetQuoteMandateDto) {
    const q = await this.getRawDoc(tenantId, id);
    await this.mandateService.getById(tenantId, dto.mandateId);
    q.mandateId = new Types.ObjectId(dto.mandateId);
    await q.save();
    return q.toObject();
  }

  // Real PDF, same tenant-branding convention the purchase order PDF
  // established — the firm's own logo/name, never the platform's.
  async generatePdf(tenantId: string, id: string): Promise<Buffer> {
    const q = await this.getRawDoc(tenantId, id);
    const tenant = await this.userModel.findById(tenantId).lean();
    const profile = tenant?.tenantProfile;
    const firmName = profile?.businessName || 'Your firm';
    const addressLines = [
      profile?.address?.city,
      profile?.address?.state,
      profile?.address?.country,
    ].filter(Boolean);

    return buildQuotePdf({
      ref: q.ref,
      kind: q.kind as 'Quote' | 'Proforma',
      clientName: q.clientName,
      title: q.title,
      amount: q.amount,
      currency: q.currency,
      issued: q.issued,
      expires: q.expires,
      firmName,
      firmAddressLines: addressLines,
      logoDataUrl: profile?.logoUrl || null,
    });
  }

  // Real conversion — creates an actual Draft invoice against the
  // quote's mandate, not just a status flip. Requires a real
  // mandate to bill against; a quote with no linked mandate needs
  // one created first.
  async convertToInvoice(tenantId: string, id: string, dueOn: string) {
    const q = await this.getRawDoc(tenantId, id);
    if (q.convertedInvoiceId) {
      throw new BadRequestException('This quote has already been converted');
    }
    if (!q.mandateId) {
      throw new BadRequestException(
        'This quote has no linked mandate to bill against — create the mandate first',
      );
    }
    const invoice: any = await this.invoiceService.create(tenantId, {
      mandateId: String(q.mandateId),
      model: BillingModel.FIXED_FEE,
      currency: q.currency,
      dueOn,
      proforma: q.kind === 'Proforma',
      lines: [{ description: q.title, qty: 1, unit: q.amount }],
    });
    q.status = QuoteStatus.ACCEPTED;
    q.convertedInvoiceId = invoice._id;
    await q.save();
    return { quote: q.toObject(), invoice };
  }
}

@Injectable()
export class RecurringInvoiceService {
  constructor(
    @InjectModel(RecurringInvoice.name)
    private readonly model: Model<RecurringInvoiceDocument>,
    private readonly invoiceService: InvoiceService,
  ) {}

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ nextRun: 1 })
      .lean();
  }

  async create(tenantId: string, dto: CreateRecurringInvoiceDto) {
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      clientUserId: new Types.ObjectId(dto.clientUserId),
      clientName: dto.clientName,
      mandateId: new Types.ObjectId(dto.mandateId),
      mandateName: dto.mandateName,
      description: dto.description,
      amount: dto.amount,
      currency: dto.currency ?? 'USD',
      frequency: dto.frequency,
      nextRun: new Date(dto.nextRun),
    });
    return created.toObject();
  }

  private async getRawDoc(tenantId: string, id: string) {
    const r = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!r) throw new NotFoundException('Recurring invoice not found');
    return r;
  }

  async setStatus(tenantId: string, id: string, status: RecurringStatus) {
    const r = await this.getRawDoc(tenantId, id);
    r.status = status;
    await r.save();
    return r.toObject();
  }

  // Manual trigger — creates a real draft invoice and advances
  // nextRun by one period. Automatic firing on schedule (a cron job)
  // is a further, separate step.
  async generateNow(tenantId: string, id: string) {
    const r = await this.getRawDoc(tenantId, id);
    const invoice = await this.invoiceService.create(tenantId, {
      mandateId: String(r.mandateId),
      model: BillingModel.RETAINER,
      currency: r.currency,
      dueOn: new Date(Date.now() + 30 * 86400000).toISOString(),
      lines: [{ description: r.description, qty: 1, unit: r.amount }],
    });

    const next = new Date(r.nextRun);
    if (r.frequency === 'Monthly') next.setMonth(next.getMonth() + 1);
    else if (r.frequency === 'Quarterly') next.setMonth(next.getMonth() + 3);
    else next.setFullYear(next.getFullYear() + 1);
    r.nextRun = next;
    await r.save();

    return { recurring: r.toObject(), invoice };
  }
}
