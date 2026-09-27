import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GovernanceCodeDocument = GovernanceCode & Document;

export enum GovernanceCodeCategory {
  CODE_OF_CONDUCT = 'Code of Conduct',
  GOVERNANCE_CHARTER = 'Governance Charter',
  BOARD_CHARTER = 'Board Charter',
  ETHICS = 'Ethics',
  OTHER = 'Other',
}

// Internal review and Board / Committee approval are named to match
// the tenant UI exactly (Codes.tsx's `Stage` type) — the frontend's
// existing 4-stage lifecycle badges map straight onto this enum, no
// separate local-only stage tracking needed anymore.
export enum GovernanceCodeStatus {
  DRAFT = 'Draft',
  INTERNAL_REVIEW = 'Internal review',
  PENDING_BOARD_APPROVAL = 'Board / Committee approval',
  PUBLISHED = 'Published',
}

export enum CodeApprovalDecision {
  PENDING = 'Pending',
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
}

@Schema({ _id: false })
export class CodeAttachment {
  @Prop({ required: true }) name: string;
  @Prop({ default: null }) fileUrl: string | null;
  @Prop({ default: null }) mimeType: string | null;
  @Prop({ default: 0 }) size: number;
  @Prop({ required: true, default: () => new Date() }) uploadedAt: Date;
}
export const CodeAttachmentSchema =
  SchemaFactory.createForClass(CodeAttachment);

// One row per active board member asked to approve a code — decided
// in-app from the Board Portal (the director is already an
// authenticated BoardPortalController caller there, so unlike
// Policy's board approval this needs no emailed magic-link token;
// the email notification below just points them at their portal).
@Schema({ _id: false })
export class CodeBoardApproval {
  @Prop({ type: Types.ObjectId, ref: 'BoardMember', required: true })
  boardMemberId: Types.ObjectId;
  @Prop({ required: true }) name: string;
  @Prop({ required: true, lowercase: true }) email: string;
  @Prop({ enum: CodeApprovalDecision, default: CodeApprovalDecision.PENDING })
  decision: CodeApprovalDecision;
  @Prop({ default: '' }) notes: string;
  @Prop({ default: null }) decidedAt: Date | null;
  @Prop({ required: true, default: () => new Date() }) requestedAt: Date;
}
export const CodeBoardApprovalSchema =
  SchemaFactory.createForClass(CodeBoardApproval);

@Schema({ timestamps: true, collection: 'grc_governance_codes' })
export class GovernanceCode {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ enum: GovernanceCodeCategory, required: true })
  category: GovernanceCodeCategory;

  @Prop({ default: '' })
  body: string;

  @Prop({ type: [CodeAttachmentSchema], default: [] })
  documents: CodeAttachment[];

  @Prop({ default: 1 })
  version: number;

  @Prop({ enum: GovernanceCodeStatus, default: GovernanceCodeStatus.DRAFT })
  status: GovernanceCodeStatus;

  // The super-admin-authored template this code was started from, if
  // any — record-keeping only, never re-read after creation (matches
  // Policy.templateId).
  @Prop({ type: Types.ObjectId, ref: 'PolicyTemplate', default: null })
  templateId: Types.ObjectId | null;

  // Populated when sendForBoardApproval opens an approval round.
  // Empty for a code that was bootstrap-published (Board Charter,
  // zero active board members at the time) or hasn't been sent yet.
  @Prop({ type: [CodeBoardApprovalSchema], default: [] })
  boardApprovals: CodeBoardApproval[];
}
export const GovernanceCodeSchema =
  SchemaFactory.createForClass(GovernanceCode);
