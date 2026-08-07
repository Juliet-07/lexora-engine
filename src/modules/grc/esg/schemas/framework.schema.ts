import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EsgFrameworkDocument = EsgFramework & Document;
export type ReportIndicatorDocument = ReportIndicator & Document;
export type EsgReportDocument = EsgReport & Document;

// ─────────────────────────────────────────────────────────────
// Every tenant is seeded with these 6 on first use — a starting
// point, not a fixed list. Everything seeded here (label,
// description) is editable afterward, and the tenant can deactivate
// (hides the tab, keeps the data) or permanently delete any of them
// — including these — and add fully custom frameworks of their own
// for licensing-tied requirements that don't fit a generic
// international standard (e.g. a Capital Markets Authority corporate
// governance code, National Bank of Rwanda licensing conditions).
// `key` only matters for these seeded rows, so re-seeding never
// duplicates one the tenant already has, even after they've renamed
// it — custom frameworks generate their own key and it's never
// reused for matching.
// ─────────────────────────────────────────────────────────────
export const STANDARD_FRAMEWORKS: {
  key: string;
  label: string;
  description: string;
}[] = [
  {
    key: 'GRI',
    label: 'GRI',
    description: 'Global Reporting Initiative Standards',
  },
  {
    key: 'ISSB_S1',
    label: 'ISSB S1',
    description:
      'IFRS S1 — General Requirements for Disclosure of Sustainability-related Financial Information',
  },
  {
    key: 'ISSB_S2',
    label: 'ISSB S2',
    description: 'IFRS S2 — Climate-related Disclosures',
  },
  {
    key: 'TCFD',
    label: 'TCFD',
    description: 'Task Force on Climate-related Financial Disclosures',
  },
  {
    key: 'KING_V',
    label: 'King V',
    description: 'King Code on Corporate Governance',
  },
  {
    key: 'UN_SDG',
    label: 'UN SDG',
    description: 'United Nations Sustainable Development Goals',
  },
];

@Schema({ timestamps: true, collection: 'esg_frameworks' })
export class EsgFramework {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) key: string;
  @Prop({ required: true, trim: true }) label: string;
  @Prop({ default: '' }) description: string;
  @Prop({ default: false }) isStandard: boolean;

  // Deactivating hides the tab without touching its indicators —
  // "remove tabs that are not relevant" without losing history if
  // it turns out they need it again later.
  @Prop({ default: true, index: true }) isActive: boolean;

  @Prop({ default: 0 }) order: number;
}
export const EsgFrameworkSchema = SchemaFactory.createForClass(EsgFramework);
EsgFrameworkSchema.index({ tenantId: 1, key: 1 }, { unique: true });

export enum IndicatorStatus {
  NOT_STARTED = 'Not started',
  IN_PROGRESS = 'In progress',
  AWAITING_SIGN_OFF = 'Awaiting sign-off',
  SIGNED_OFF = 'Signed off',
}

@Schema({ timestamps: true })
export class IndicatorEvidence {
  @Prop({ required: true }) name: string;
  @Prop({ default: null }) fileUrl: string | null;
  @Prop({ default: null }) mimeType: string | null;
  @Prop({ default: 0 }) size: number;
}
export const IndicatorEvidenceSchema =
  SchemaFactory.createForClass(IndicatorEvidence);

@Schema({ timestamps: true, collection: 'esg_report_indicators' })
export class ReportIndicator {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'EsgFramework',
    required: true,
    index: true,
  })
  frameworkId: Types.ObjectId;

  @Prop({ required: true }) code: string;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ default: '' }) owner: string;
  @Prop({ default: '' }) response: string;

  @Prop({ type: [IndicatorEvidenceSchema], default: [] })
  evidence: Types.DocumentArray<IndicatorEvidence>;

  @Prop({ enum: IndicatorStatus, default: IndicatorStatus.NOT_STARTED })
  status: IndicatorStatus;
  @Prop({ default: null }) signedOffBy: string | null;
  @Prop({ default: null }) signedOffAt: Date | null;
}
export const ReportIndicatorSchema =
  SchemaFactory.createForClass(ReportIndicator);

export enum EsgReportStatus {
  DRAFT = 'Draft',
  COMPILED = 'Compiled',
  PUBLISHED = 'Published',
}

@Schema({ timestamps: true, collection: 'esg_reports' })
export class EsgReport {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'EsgFramework', required: true })
  frameworkId: Types.ObjectId;

  @Prop({ required: true }) title: string;
  @Prop({ required: true }) period: string;
  @Prop({ enum: EsgReportStatus, default: EsgReportStatus.COMPILED })
  status: EsgReportStatus;
  @Prop({ default: null }) compiledAt: Date | null;
  @Prop({ default: null }) publishedAt: Date | null;
  @Prop({ default: '' }) note: string;
}
export const EsgReportSchema = SchemaFactory.createForClass(EsgReport);
