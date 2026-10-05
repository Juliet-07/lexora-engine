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

export enum EsgApprovalDecision {
  PENDING = 'Pending',
  APPROVED = 'Approved',
  DECLINED = 'Declined',
}

// The ESG Committee Chair signs externally — they're never logged
// into any Lexora app, so this row carries its own emailed-link
// token (same shape as PolicyService's board-approval round, built
// before board members had portal logins). The Board Chair signs
// in-app instead (see EsgBoardChairApproval below), so their row
// carries no token at all.
@Schema({ _id: false })
export class EsgCommitteeChairApproval {
  @Prop({ type: Types.ObjectId, ref: 'Committee', default: null })
  committeeId: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, ref: 'BoardMember', default: null })
  boardMemberId: Types.ObjectId | null;
  @Prop({ default: '' }) name: string;
  @Prop({ default: '', lowercase: true }) email: string;
  @Prop({ enum: EsgApprovalDecision, default: EsgApprovalDecision.PENDING })
  decision: EsgApprovalDecision;
  @Prop({ default: '' }) notes: string;
  @Prop({ default: null }) decidedAt: Date | null;
  @Prop({ default: null }) requestedAt: Date | null;
  @Prop({ default: null }) token: string | null;
}
export const EsgCommitteeChairApprovalSchema = SchemaFactory.createForClass(
  EsgCommitteeChairApproval,
);

// Decided in-app from the Board Portal (board-portal.controller-style
// authenticated route, no token needed) — but gated server-side so it
// can never be recorded before the ESG Committee Chair's own row
// above is Approved (see EsgFrameworkService#decideBoardChairApproval).
@Schema({ _id: false })
export class EsgBoardChairApproval {
  @Prop({ type: Types.ObjectId, ref: 'BoardMember', default: null })
  boardMemberId: Types.ObjectId | null;
  @Prop({ default: '' }) name: string;
  @Prop({ default: '', lowercase: true }) email: string;
  @Prop({ enum: EsgApprovalDecision, default: EsgApprovalDecision.PENDING })
  decision: EsgApprovalDecision;
  @Prop({ default: '' }) notes: string;
  @Prop({ default: null }) decidedAt: Date | null;
  @Prop({ default: null }) requestedAt: Date | null;
}
export const EsgBoardChairApprovalSchema = SchemaFactory.createForClass(
  EsgBoardChairApproval,
);

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

  // The quoted requirement text (e.g. "Describe the governance
  // structure, including committees of the highest governance
  // body.") — distinct from `title`, which stays a short label.
  @Prop({ default: '' }) requirement: string;

  // Applicability — tenant-set, not derived from a fixed catalog
  // (this codebase seeds frameworks/indicators as starting points
  // the tenant then owns and edits, never a locked taxonomy).
  @Prop({ default: true }) isApplicable: boolean;
  @Prop({ default: '' }) applicabilityNote: string;

  @Prop({ default: '' }) response: string;

  @Prop({ type: [IndicatorEvidenceSchema], default: [] })
  evidence: Types.DocumentArray<IndicatorEvidence>;

  @Prop({ enum: IndicatorStatus, default: IndicatorStatus.NOT_STARTED })
  status: IndicatorStatus;

  // Legacy single-signer stamp — kept so anything already relying on
  // it (frameworkCoverage()'s "signed off" count) still reads
  // correctly; now set from boardChairApproval the moment that
  // completes, rather than from the old single `signOff()` action.
  @Prop({ default: null }) signedOffBy: string | null;
  @Prop({ default: null }) signedOffAt: Date | null;

  // The two-party approval chain — Board Chair's row can only be
  // decided once ESG Committee Chair's row is Approved (enforced in
  // EsgFrameworkService, not just in the UI).
  @Prop({ type: EsgCommitteeChairApprovalSchema, default: () => ({}) })
  esgChairApproval: EsgCommitteeChairApproval;
  @Prop({ type: EsgBoardChairApprovalSchema, default: () => ({}) })
  boardChairApproval: EsgBoardChairApproval;
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
