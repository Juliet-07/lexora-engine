import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReadinessAssessmentDocument = ReadinessAssessment & Document;

// ─────────────────────────────────────────────────────────────
// 8 fixed dimensions. Each carries a computeMode: 'auto' means a
// real cross-module query backs the score; 'manual' means there is
// no connected data source yet and the tenant sets the number
// directly via the same override mechanism auto dimensions use to
// correct themselves. Flipping a dimension from manual to auto
// later — e.g. once CRM's finance engine exists — is a one-line
// change to DIMENSION_COMPUTE_MODE, not a rebuild.
// ─────────────────────────────────────────────────────────────

export enum ReadinessDimension {
  GOVERNANCE = 'Corporate Structure & Governance',
  FINANCIAL_STATEMENTS = 'Financial Statements',
  LEGAL_COMPLIANCE = 'Legal & Regulatory Compliance',
  TAX_COMPLIANCE = 'Tax Compliance',
  OPERATIONAL_COMMERCIAL = 'Operational & Commercial',
  HR_MANAGEMENT = 'Management Team & HR',
  ESG = 'ESG & Sustainability',
  DATA_ROOM = 'Data Room Completeness',
}
export const READINESS_DIMENSIONS: ReadinessDimension[] =
  Object.values(ReadinessDimension);

export type ComputeMode = 'auto' | 'manual';
export const DIMENSION_COMPUTE_MODE: Record<ReadinessDimension, ComputeMode> = {
  [ReadinessDimension.GOVERNANCE]: 'auto',
  [ReadinessDimension.FINANCIAL_STATEMENTS]: 'manual',
  [ReadinessDimension.LEGAL_COMPLIANCE]: 'auto',
  [ReadinessDimension.TAX_COMPLIANCE]: 'auto',
  [ReadinessDimension.OPERATIONAL_COMMERCIAL]: 'manual',
  [ReadinessDimension.HR_MANAGEMENT]: 'auto',
  [ReadinessDimension.ESG]: 'manual',
  [ReadinessDimension.DATA_ROOM]: 'manual',
};

export const DIMENSION_SOURCE: Record<ReadinessDimension, string> = {
  [ReadinessDimension.GOVERNANCE]:
    'GRC → Governance (board, committees, codes, meetings)',
  [ReadinessDimension.FINANCIAL_STATEMENTS]:
    'Manual — no connected accounting engine yet',
  [ReadinessDimension.LEGAL_COMPLIANCE]: 'GRC → Compliance obligations',
  [ReadinessDimension.TAX_COMPLIANCE]: 'GRC → Compliance obligations (RRA)',
  [ReadinessDimension.OPERATIONAL_COMMERCIAL]:
    'Manual — no connected CRM/PM data yet',
  [ReadinessDimension.HR_MANAGEMENT]:
    'HR module (contracts, onboarding, performance reviews)',
  [ReadinessDimension.ESG]: 'Manual — no connected ESG register yet',
  [ReadinessDimension.DATA_ROOM]:
    'Manual — Deals data room is per-transaction, not company-wide',
};

export enum GapPriority {
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3',
}
export enum GapStatus {
  OPEN = 'Open',
  IN_PROGRESS = 'In progress',
  CLOSED = 'Closed',
}
export type ReportSectionState = 'Auto' | 'Review' | 'Incomplete';
export const REPORT_SECTIONS = [
  'Executive summary',
  'Company overview',
  'Governance',
  'Financials',
  'Compliance',
  'Tax',
  'ESG',
  'Key risks',
  'Remediation plan',
];

// Real _id (default) — gaps are addressed individually by ID from
// the frontend (status changes, deletion), same reasoning as Deal's
// Contract array getting a real _id instead of index addressing.
@Schema({ timestamps: true })
export class ReadinessGap {
  @Prop({ enum: ReadinessDimension, required: true })
  dimension: ReadinessDimension;

  @Prop({ enum: GapPriority, required: true })
  priority: GapPriority;

  @Prop({ required: true }) description: string;
  @Prop({ default: '' }) impact: string;
  @Prop({ default: '' }) remediation: string;
  @Prop({ default: '' }) owner: string;
  @Prop({ required: true }) targetDate: Date;

  @Prop({ enum: GapStatus, default: GapStatus.OPEN })
  status: GapStatus;

  @Prop({ default: null }) closedAt: Date | null;
}
export const ReadinessGapSchema = SchemaFactory.createForClass(ReadinessGap);

@Schema({ _id: false })
export class DimensionScore {
  @Prop({ enum: ReadinessDimension, required: true })
  dimension: ReadinessDimension;

  @Prop({ enum: ['auto', 'manual'], required: true })
  computeMode: ComputeMode;

  // Real computed value for 'auto' dimensions; stays 0 and unused
  // for 'manual' ones, which rely entirely on `override` below.
  @Prop({ required: true, default: 0 }) autoScore: number;

  @Prop({ default: null }) override: number | null;
  @Prop({ default: null }) overrideReason: string | null;
}
export const DimensionScoreSchema =
  SchemaFactory.createForClass(DimensionScore);

@Schema({ _id: false })
export class ReportSectionFlag {
  @Prop({ required: true }) name: string;
  @Prop({ enum: ['Auto', 'Review', 'Incomplete'], default: 'Incomplete' })
  state: ReportSectionState;
}
export const ReportSectionFlagSchema =
  SchemaFactory.createForClass(ReportSectionFlag);

@Schema({ timestamps: true, collection: 'deal_intel_readiness' })
export class ReadinessAssessment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // Snapshot of the tenant's own business name at creation time —
  // this feature is own-company-only (client readiness deferred as
  // a future nice-to-have per product direction), matching Valuation
  // and Portfolio's scope.
  @Prop({ required: true }) company: string;

  @Prop({ required: true, default: 1 }) version: number;
  @Prop({ default: '' }) advisor: string;
  @Prop({ required: true, default: 70 }) threshold: number;

  @Prop({ type: [DimensionScoreSchema], default: [] })
  scores: DimensionScore[];

  @Prop({ type: [ReadinessGapSchema], default: [] })
  gaps: Types.DocumentArray<ReadinessGap>;

  @Prop({ type: [ReportSectionFlagSchema], default: [] })
  reportSections: ReportSectionFlag[];

  @Prop({ default: '' }) notes: string;
}
export const ReadinessAssessmentSchema =
  SchemaFactory.createForClass(ReadinessAssessment);
