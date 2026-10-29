import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────
// Cap table & share register (Governance → Organisation Structure).
//
// The register is a LEDGER: holdings are never stored as a number that
// can drift, they are the running total of ShareTransaction rows
// (issuances, transfers, buybacks). A shareholder is an
// OrgStructureNode that carries the "Shareholder" role — the same
// person can also be a board member, a director, etc. (a node holds a
// set of roles) — and that node's holdings come from the ledger.
// ─────────────────────────────────────────────────────────────

export type ShareClassDocument = ShareClass & Document;

@Schema({ timestamps: true, collection: 'grc_share_classes' })
export class ShareClass {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  // Ceiling on shares that can be in issue for this class. Issuing
  // beyond it is refused.
  @Prop({ required: true, min: 1 })
  authorised: number;

  @Prop({ default: 0, min: 0 })
  parValue: number;

  // 'Yes' = full voting, 'Limited' = votes only on matters that vary
  // the class's own rights, 'No' = non-voting. Only 'Yes' counts toward
  // general voting power in the register.
  @Prop({ enum: ['Yes', 'No', 'Limited'], default: 'Yes' })
  voting: string;

  // Derived from `voting` (kept stored so existing readers stay simple).
  @Prop({ default: true })
  votingRights: boolean;

  @Prop({ default: '' }) votingNote: string;

  @Prop({
    enum: [
      'Pro rata',
      'Cumulative preferred',
      'Non-cumulative preferred',
      'Non-participating',
    ],
    default: 'Pro rata',
  })
  dividendType: string;

  // Annual % of par value, for the preferred dividend types.
  @Prop({ type: Number, default: null })
  dividendRate: number | null;

  @Prop({ default: 'Pari passu' }) liquidation: string;
  @Prop({ default: 'None' }) conversion: string;

  @Prop({ type: [String], default: [] })
  rights: string[];
}
export const ShareClassSchema = SchemaFactory.createForClass(ShareClass);
ShareClassSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export enum ShareTransactionType {
  ISSUANCE = 'Issuance',
  TRANSFER = 'Transfer',
  BUYBACK = 'Buyback',
  // A price-per-share mark with no shares moving — the latest one sets
  // the price the register values holdings at.
  VALUATION = 'Valuation',
}

export type ShareTransactionDocument = ShareTransaction & Document;

@Schema({ timestamps: true, collection: 'grc_share_transactions' })
export class ShareTransaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop({ enum: ShareTransactionType, required: true })
  type: ShareTransactionType;

  // null = the company itself (issuance: from the company; buyback: to
  // the company).
  @Prop({ type: Types.ObjectId, ref: 'OrgStructureNode', default: null })
  fromNodeId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'OrgStructureNode', default: null })
  toNodeId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'ShareClass', default: null })
  shareClassId: Types.ObjectId | null;

  @Prop({ default: 0, min: 0 })
  shares: number;

  // Base currency of the tenant.
  @Prop({ default: 0, min: 0 })
  pricePerShare: number;

  @Prop({ default: '' })
  note: string;

  // Board resolution / authorising reference (e.g. "BR-2026-012").
  @Prop({ default: '' })
  reference: string;
}
export const ShareTransactionSchema =
  SchemaFactory.createForClass(ShareTransaction);

export type VestingScheduleDocument = VestingSchedule & Document;

@Schema({ timestamps: true, collection: 'grc_vesting_schedules' })
export class VestingSchedule {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'OrgStructureNode', required: true })
  holderNodeId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ShareClass', default: null })
  shareClassId: Types.ObjectId | null;

  @Prop({ required: true })
  grantDate: Date;

  @Prop({ required: true, min: 1 })
  totalShares: number;

  // No shares vest until the cliff has passed; then they vest evenly
  // per month across the whole period (the part already earned during
  // the cliff is released at the cliff).
  @Prop({ default: 12, min: 0 })
  cliffMonths: number;

  @Prop({ default: 36, min: 1 })
  periodMonths: number;
}
export const VestingScheduleSchema =
  SchemaFactory.createForClass(VestingSchedule);

export enum ConvertibleType {
  SAFE = 'SAFE',
  NOTE = 'Convertible Note',
}
export enum ConvertibleStatus {
  OUTSTANDING = 'Outstanding',
  CONVERTED = 'Converted',
  CANCELLED = 'Cancelled',
}

export type ConvertibleInstrumentDocument = ConvertibleInstrument & Document;

@Schema({ timestamps: true, collection: 'grc_convertible_instruments' })
export class ConvertibleInstrument {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ enum: ConvertibleType, required: true })
  type: ConvertibleType;

  @Prop({ required: true, trim: true })
  investor: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ default: 0, min: 0 })
  valuationCap: number;

  // Percent.
  @Prop({ default: 0, min: 0, max: 100 })
  discount: number;

  @Prop({ required: true })
  dateIssued: Date;

  @Prop({ default: 'Qualified financing round' })
  trigger: string;

  // Convertible notes only.
  @Prop({ type: Number, default: null })
  interestRate: number | null;

  @Prop({ type: Date, default: null })
  maturityDate: Date | null;

  @Prop({ enum: ConvertibleStatus, default: ConvertibleStatus.OUTSTANDING })
  status: ConvertibleStatus;

  @Prop({ default: '' })
  notes: string;

  @Prop({
    type: [
      {
        name: String,
        fileUrl: String,
        mimeType: String,
        size: Number,
        uploadedAt: Date,
      },
    ],
    default: [],
  })
  documents: {
    name: string;
    fileUrl: string;
    mimeType: string;
    size: number;
    uploadedAt: Date;
  }[];
}
export const ConvertibleInstrumentSchema = SchemaFactory.createForClass(
  ConvertibleInstrument,
);

// ── Shareholders' private document repository ───────────────────

export enum ShareholderDocAccess {
  PRIVATE = 'Private', // the shareholder + company secretary
  RESTRICTED = 'Restricted', // board + company secretary
  BOARD = 'Board', // all directors
}

export type ShareholderDocumentDocument = ShareholderDocument & Document;

@Schema({ timestamps: true, collection: 'grc_shareholder_documents' })
export class ShareholderDocument {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  category: string;

  @Prop({ required: true, trim: true })
  title: string;

  // null = applies to all shareholders.
  @Prop({ type: Types.ObjectId, ref: 'OrgStructureNode', default: null })
  shareholderNodeId: Types.ObjectId | null;

  @Prop({ enum: ShareholderDocAccess, default: ShareholderDocAccess.PRIVATE })
  access: ShareholderDocAccess;

  @Prop({ required: true })
  date: Date;

  @Prop({ default: '' }) refNo: string;
  @Prop({ default: '' }) notes: string;

  // Stored OUTSIDE the publicly served /uploads folder and only ever
  // handed out through an authenticated, logged download endpoint —
  // `storedName` is never exposed as a URL.
  @Prop({
    type: [
      {
        name: String,
        storedName: String,
        mimeType: String,
        size: Number,
        uploadedAt: Date,
      },
    ],
    default: [],
  })
  files: {
    name: string;
    storedName: string;
    mimeType: string;
    size: number;
    uploadedAt: Date;
  }[];
}
export const ShareholderDocumentSchema =
  SchemaFactory.createForClass(ShareholderDocument);

export type ShareholderDocAccessLogDocument = ShareholderDocAccessLog &
  Document;

@Schema({ timestamps: true, collection: 'grc_shareholder_doc_access_log' })
export class ShareholderDocAccessLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null })
  documentId: Types.ObjectId | null;

  // Kept as text so the trail survives the document being deleted.
  @Prop({ required: true })
  documentTitle: string;

  @Prop({ default: '' }) userName: string;
  @Prop({ default: '' }) userId: string;

  @Prop({
    enum: ['Uploaded', 'Viewed', 'Downloaded', 'Deleted'],
    required: true,
  })
  action: string;

  @Prop({ default: '' }) ip: string;

  @Prop({ required: true })
  at: Date;
}
export const ShareholderDocAccessLogSchema = SchemaFactory.createForClass(
  ShareholderDocAccessLog,
);
