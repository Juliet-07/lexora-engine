import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── Side letters — LP-specific deals that sit outside the LPA. Every
// provision records what the LPA says, what the side letter says
// instead, whether it triggers MFN rights for other LPs, and whether
// the GP is actually honouring it. ───────────────────────────────────

export enum SideLetterStatus {
  DRAFT = 'Draft',
  UNDER_NEGOTIATION = 'Under negotiation',
  EXECUTED = 'Executed',
}

export enum SideLetterMfn {
  TRIGGERED = 'Triggered',
  EXCLUDED = 'Excluded',
  NOT_APPLICABLE = 'N/A',
}

export enum ProvisionCompliance {
  PENDING = 'Pending',
  APPLIED = 'Applied',
  NOTED = 'Noted',
  SEATED = 'Seated',
  DELIVERED = 'Delivered',
  MONITORED = 'Monitored',
  BREACH = 'Breach',
}

export enum MfnElectionStatus {
  PENDING = 'Pending',
  ELECTED = 'Elected',
  DECLINED = 'Declined',
}

@Schema({ _id: true })
export class SideLetterProvision {
  @Prop({ required: true }) type: string;
  @Prop({ default: '' }) lpaDefault: string;
  @Prop({ required: true }) term: string;
  @Prop({ enum: SideLetterMfn, default: SideLetterMfn.NOT_APPLICABLE })
  mfn: SideLetterMfn;
  @Prop({ default: '' }) notes: string;
  // A management-fee reduction carries the rate it sets (in percent),
  // so the fee engine can apply it.
  @Prop({ type: Number, default: null }) feePct: number | null;
  @Prop({ enum: ProvisionCompliance, default: ProvisionCompliance.PENDING })
  compliance: ProvisionCompliance;
  @Prop({ default: '' }) complianceNotes: string;
  @Prop({ type: Date, default: null }) complianceCheckedAt: Date | null;
}
export const SideLetterProvisionSchema =
  SchemaFactory.createForClass(SideLetterProvision);

@Schema({ _id: false })
export class MfnElection {
  @Prop({ type: Types.ObjectId, required: true }) commitmentId: Types.ObjectId;
  @Prop({ required: true }) lpName: string;
  @Prop({ enum: MfnElectionStatus, default: MfnElectionStatus.PENDING })
  status: MfnElectionStatus;
  @Prop({ type: Date, default: null }) respondedAt: Date | null;
}
export const MfnElectionSchema = SchemaFactory.createForClass(MfnElection);

// One entry per MFN-triggering provision, created when the side
// letter is executed: who else is entitled to elect the same term.
@Schema({ _id: true })
export class MfnFlag {
  @Prop({ required: true }) provisionType: string;
  @Prop({ required: true }) term: string;
  @Prop({ type: Date, default: null }) electionDeadline: Date | null;
  @Prop({ type: [MfnElectionSchema], default: [] })
  elections: MfnElection[];
}
export const MfnFlagSchema = SchemaFactory.createForClass(MfnFlag);

export type SideLetterDocument = SideLetter & Document;

@Schema({ timestamps: true, collection: 'crm_fund_side_letters' })
export class SideLetter {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Fund', required: true, index: true })
  fundId: Types.ObjectId;
  @Prop({ required: true }) ref: string;

  @Prop({ type: Types.ObjectId, ref: 'CapitalCommitment', required: true })
  commitmentId: Types.ObjectId;
  @Prop({ required: true }) lpName: string;

  @Prop({ required: true }) effectiveDate: Date;
  @Prop({ enum: SideLetterStatus, default: SideLetterStatus.DRAFT })
  status: SideLetterStatus;
  @Prop({ type: Date, default: null }) mfnElectionDeadline: Date | null;
  @Prop({ type: Date, default: null }) executedAt: Date | null;

  @Prop({ type: [SideLetterProvisionSchema], default: [] })
  provisions: Types.DocumentArray<SideLetterProvision>;
  @Prop({ type: [MfnFlagSchema], default: [] })
  mfnFlags: Types.DocumentArray<MfnFlag>;

  // The signed (or draft) letter itself, and — when drafted from the
  // template library — the vault document it came from.
  @Prop({ type: Object, default: null })
  document: {
    name: string;
    url: string;
    path: string;
    mimeType: string;
    size: number;
  } | null;
  @Prop({ type: Types.ObjectId, default: null })
  draftDocumentId: Types.ObjectId | null;
}
export const SideLetterSchema = SchemaFactory.createForClass(SideLetter);

// ── Fund document vault ────────────────────────────────────────────

export enum FundDocumentStatus {
  DRAFT = 'Draft',
  UNDER_REVIEW = 'Under review',
  SENT_FOR_SIGNATURE = 'Sent for signature',
  EXECUTED = 'Executed',
  FINAL = 'Final',
  SUPERSEDED = 'Superseded',
  ARCHIVED = 'Archived',
}

export enum FundDocumentConfidentiality {
  FUND_LEVEL = 'Fund-level (all LPs)',
  LP_SPECIFIC = 'LP-specific (restricted)',
  GP_INTERNAL = 'GP internal only',
  PUBLIC = 'Public / regulatory',
}

export type FundVaultDocumentDocument = FundVaultDocument & Document;

@Schema({ timestamps: true, collection: 'crm_fund_documents' })
export class FundVaultDocument {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Fund', required: true, index: true })
  fundId: Types.ObjectId;

  @Prop({ required: true }) category: string;
  // The vault section it is listed under, worked out from the category.
  @Prop({ required: true, index: true }) group: string;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ default: 'v1.0' }) version: string;
  @Prop({ required: true }) docDate: Date;
  @Prop({ enum: FundDocumentStatus, default: FundDocumentStatus.DRAFT })
  status: FundDocumentStatus;
  @Prop({
    enum: FundDocumentConfidentiality,
    default: FundDocumentConfidentiality.FUND_LEVEL,
  })
  confidentiality: FundDocumentConfidentiality;

  @Prop({ type: Types.ObjectId, default: null })
  commitmentId: Types.ObjectId | null;
  @Prop({ default: '' }) lpName: string;
  @Prop({ type: Types.ObjectId, default: null })
  holdingId: Types.ObjectId | null;
  @Prop({ default: '' }) companyName: string;

  // Regulatory filings.
  @Prop({ default: '' }) authority: string;
  @Prop({ type: Date, default: null }) filedOn: Date | null;

  @Prop({ default: '' }) notes: string;

  // An uploaded file…
  @Prop({ type: Object, default: null })
  file: {
    name: string;
    url: string;
    path: string;
    mimeType: string;
    size: number;
  } | null;
  // …or a document drafted in the editor (HTML), usually from a template.
  @Prop({ default: '' }) content: string;
  @Prop({ default: '' }) templateKey: string;
  @Prop({ default: '' }) templateName: string;
  // The merge-field values the document was filled with, so the editor's
  // Merge Fields panel can show and change them.
  @Prop({ type: Object, default: {} }) mergeValues: Record<string, string>;
  @Prop({ type: Types.ObjectId, default: null }) callId: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, default: null })
  distributionId: Types.ObjectId | null;

  @Prop({ default: '' }) createdBy: string;
}
export const FundVaultDocumentSchema =
  SchemaFactory.createForClass(FundVaultDocument);

// ── LP report library — every report generated or uploaded for LPs,
// kept so it can be downloaded again and shows what was sent to whom. ─

export type FundReportDocument = FundReport & Document;

@Schema({ timestamps: true, collection: 'crm_fund_reports' })
export class FundReport {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Fund', required: true, index: true })
  fundId: Types.ObjectId;

  @Prop({ required: true }) reportType: string;
  @Prop({ default: '' }) title: string;
  @Prop({ default: '' }) period: string;
  @Prop({ type: Date, default: null }) periodStart: Date | null;
  @Prop({ type: Date, default: null }) periodEnd: Date | null;

  // 'all' | 'lpac' | one commitment id
  @Prop({ default: 'all' }) recipients: string;
  @Prop({ default: '' }) recipientLabel: string;
  @Prop({ default: 'Generate only' }) delivery: string;
  @Prop({ default: '' }) commentary: string;
  @Prop({ type: [String], default: [] }) sections: string[];
  @Prop({ default: 'Fund letterhead' }) branding: string;

  @Prop({ default: 'Generated' }) status: string;
  @Prop({ default: false }) uploaded: boolean;

  @Prop({
    type: [
      {
        name: String,
        url: String,
        path: String,
        mimeType: String,
        size: Number,
        format: String,
      },
    ],
    default: [],
    _id: false,
  })
  files: {
    name: string;
    url: string;
    path: string;
    mimeType: string;
    size: number;
    format: string;
  }[];

  @Prop({
    type: [
      {
        lpName: String,
        email: String,
        sentAt: Date,
        channel: String,
        status: String,
        error: String,
      },
    ],
    default: [],
    _id: false,
  })
  deliveries: {
    lpName: string;
    email: string;
    sentAt: Date;
    channel: string;
    status: string;
    error: string;
  }[];

  @Prop({ default: '' }) generatedBy: string;
}
export const FundReportSchema = SchemaFactory.createForClass(FundReport);
