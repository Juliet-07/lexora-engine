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
}

export enum TaxObligationStatus {
  DRAFT = 'Draft',
  FILED = 'Filed',
}

@Schema({ timestamps: true, collection: 'crm_tax_obligations' })
export class TaxObligation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ enum: TaxObligationType, required: true, index: true })
  type: TaxObligationType;
  @Prop({ required: true }) period: string;
  @Prop({ required: true }) dueOn: Date;
  // The amount here is a snapshot taken when the obligation was
  // created — the real, current figure for VAT/PAYE/RSSB/WHT/CIT is
  // always available live from TaxService's own computations; this
  // is what's actually being filed, which shouldn't silently change
  // after the fact just because more invoices came in.
  @Prop({ required: true }) amount: number;
  @Prop({
    enum: TaxObligationStatus,
    default: TaxObligationStatus.DRAFT,
    index: true,
  })
  status: TaxObligationStatus;
  @Prop({ default: null }) filedAt: Date | null;
}
export const TaxObligationSchema = SchemaFactory.createForClass(TaxObligation);
