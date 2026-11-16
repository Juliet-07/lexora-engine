import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── WHT register — the single source of truth for withholding tax.
// Bill payments to WHT-liable vendors and invoices with a whtRate
// both create real certificates here; neither recalculates its own
// separate WHT concept. ──────────────────────────────────────────

export type WhtCertificateDocument = WhtCertificate & Document;

export enum WhtDirection {
  // Money the firm withholds from what it pays a non-resident vendor.
  VENDOR_PAYMENT = 'Vendor payment',
  // Money a client withholds before paying the firm's own invoice.
  CLIENT_RECEIPT = 'Client receipt',
}

@Schema({ timestamps: true, collection: 'crm_wht_certificates' })
export class WhtCertificate {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) certificateRef: string;
  @Prop({ enum: WhtDirection, required: true, index: true })
  direction: WhtDirection;
  // The vendor being paid, or the client who paid us — one label,
  // named by whichever side this certificate is actually about.
  @Prop({ required: true }) counterparty: string;
  // The real Bill or Invoice this WHT event came from.
  @Prop({ required: true }) sourceRef: string;
  @Prop({ type: Types.ObjectId, required: true }) sourceId: Types.ObjectId;

  @Prop({ required: true }) gross: number;
  @Prop({ default: 15 }) rate: number;
  @Prop({ required: true }) wht: number;
  @Prop({ required: true }) net: number;
  @Prop({ required: true }) date: Date;
}
export const WhtCertificateSchema =
  SchemaFactory.createForClass(WhtCertificate);

// ── Tax calendar ──────────────────────────────────────────────

export type TaxObligationDocument = TaxObligation & Document;

export enum TaxObligationType {
  VAT = 'VAT return',
  PAYE = 'PAYE remittance',
  RSSB = 'RSSB contributions',
  WHT = 'WHT remittance',
  CIT = 'CIT provisional',
  EXCISE = 'Excise duty return',
  CGT = 'Capital gains tax',
  STAMP = 'Stamp duty',
  SDL = 'Skills development levy',
  TURNOVER = 'Turnover tax',
  ENVIRONMENTAL = 'Environmental levy',
}

export enum TaxObligationStatus {
  DRAFT = 'Draft',
  // An employee has recorded the filing (return + proof of payment) and
  // it is waiting for the tenant owner, who has the final say.
  PENDING_APPROVAL = 'Pending approval',
  FILED = 'Filed',
}

export enum TaxPeriodType {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUAL = 'annual',
  ONCE_OFF = 'once-off',
}

export enum TaxPriority {
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

// Recurrence offered for tax obligations. The first three share their
// values with RecurringFrequency; bi-annual is tax-only.
export enum TaxRecurrence {
  MONTHLY = 'Monthly',
  QUARTERLY = 'Quarterly',
  BIANNUALLY = 'Bi-annually',
  ANNUALLY = 'Annually',
}

// A stored upload (a filed return or a proof of payment). `path` is the
// server-side location and never leaves the server.
@Schema({ _id: false })
export class TaxFilingFile {
  @Prop({ required: true }) url: string;
  @Prop({ required: true }) name: string;
  @Prop({ default: '' }) mimeType: string;
  @Prop({ default: '' }) path: string;
}
export const TaxFilingFileSchema = SchemaFactory.createForClass(TaxFilingFile);

// What was actually filed: the dated record of the return and the
// payment, kept with the obligation and shown in the Filing Archive.
@Schema({ _id: false })
export class TaxFiling {
  @Prop({ required: true }) filedOn: Date;
  @Prop({ default: 0 }) amountPaid: number;
  @Prop({ default: '' }) notes: string;
  @Prop({ type: TaxFilingFileSchema, default: null })
  returnFile: TaxFilingFile | null;
  @Prop({ type: TaxFilingFileSchema, default: null })
  popFile: TaxFilingFile | null;
  // Who recorded it, and — when they are not the owner — who approved it.
  @Prop({ default: '' }) recordedById: string;
  @Prop({ default: '' }) recordedByName: string;
  @Prop({ default: null }) recordedAt: Date | null;
  @Prop({ default: '' }) approvedByName: string;
  @Prop({ default: null }) approvedAt: Date | null;
  // Set when the owner sends a recorded filing back; cleared on resubmit.
  @Prop({ default: '' }) rejectedReason: string;
  @Prop({ default: null }) rejectedAt: Date | null;
}
export const TaxFilingSchema = SchemaFactory.createForClass(TaxFiling);

@Schema({ timestamps: true, collection: 'crm_tax_obligations' })
export class TaxObligation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ enum: TaxObligationType, required: true, index: true })
  type: TaxObligationType;
  // Free name as the tenant wants to see it; defaults to "<type> — <period>".
  @Prop({ default: '' }) name: string;
  // Tax authority / jurisdiction code ("rw", "ke", …) and the currency
  // the amounts are in.
  @Prop({ default: '' }) jurisdiction: string;
  @Prop({ default: 'RWF' }) currency: string;

  // The period being filed for. `period` is the label ("October 2026",
  // "Q3 2026", "Year of Income 2026"); periodStart (first day, UTC) is
  // what the recurring chain rolls forward.
  @Prop({ enum: TaxPeriodType, default: TaxPeriodType.MONTHLY })
  periodType: TaxPeriodType;
  @Prop({ required: true }) period: string;
  @Prop({ default: null }) periodStart: Date | null;
  @Prop({ required: true }) dueOn: Date;
  // The amount here is a snapshot taken when the obligation was
  // created — the real, current figure for VAT/PAYE/RSSB/WHT/CIT is
  // always available live from TaxService's own computations; this
  // is what's actually being filed, which shouldn't silently change
  // after the fact just because more invoices came in. The amount
  // really paid is on `filing`.
  @Prop({ required: true }) amount: number;
  @Prop({
    enum: TaxObligationStatus,
    default: TaxObligationStatus.DRAFT,
    index: true,
  })
  status: TaxObligationStatus;
  @Prop({ default: null }) filedAt: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  responsibleId: Types.ObjectId | null;
  @Prop({ default: '' }) responsibleName: string;
  @Prop({ enum: TaxPriority, default: TaxPriority.NORMAL })
  priority: TaxPriority;
  @Prop({ default: '' }) notes: string;
  // Document routing: when on, a filing can only be recorded with both
  // the return and the proof of payment attached.
  @Prop({ default: true }) requireDocuments: boolean;

  @Prop({ type: TaxFilingSchema, default: null })
  filing: TaxFiling | null;

  // Recurring obligations — set at creation: just a frequency and the
  // day of the month it falls due. When recurring, this record is the
  // current head of a chain: TaxObligationReminderService watches
  // nextDueOn and, once it's within the reminder window, creates the
  // next period's obligation (a new head, with its own nextDueOn),
  // files a Finance calendar entry for it, sends the reminder
  // email/portal notification, and clears nextDueOn here so this
  // record is never processed again.
  @Prop({ default: false }) recurring: boolean;
  @Prop({ enum: TaxRecurrence, default: null })
  frequency: TaxRecurrence | null;
  // Day of month it falls due (1–31; 31 means "last day").
  @Prop({ default: null }) dueDay: number | null;
  @Prop({ default: null }) nextDueOn: Date | null;
}
export const TaxObligationSchema = SchemaFactory.createForClass(TaxObligation);
