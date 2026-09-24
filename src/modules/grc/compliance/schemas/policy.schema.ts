import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PolicyDocument = Policy & Document;

export enum PolicyType {
  ORGANISATION = 'organisation',
  BOARD = 'board',
}

export enum PolicyStatus {
  DRAFT = 'Draft',
  UNDER_REVIEW = 'Under review',
  PUBLISHED = 'Published',
}

export enum ReviewFrequency {
  ANNUAL = 'Annual',
  SEMI_ANNUAL = 'Semi-annual',
  QUARTERLY = 'Quarterly',
  BIENNIAL = 'Biennial',
  AD_HOC = 'Ad hoc',
}

export enum AckRequirement {
  ALL_STAFF = 'All staff must acknowledge',
  DEPARTMENT_HEADS = 'Department heads only',
  SPECIFIC_ROLES = 'Specific roles',
  NONE = 'No acknowledgement required',
}

@Schema({ _id: false })
export class PolicyAcknowledgment {
  @Prop({ required: true }) name: string;
  @Prop({ required: true, lowercase: true }) email: string;
  @Prop({ required: true }) signature: string;
  @Prop({ required: true, default: () => new Date() }) ackedAt: Date;
  @Prop({ enum: ['external', 'employee'], required: true }) source: string;
  // Which version of the policy this acknowledgment covers — a newer
  // published version makes prior acknowledgments stale, which is
  // how "re-acknowledgement is triggered automatically when a new
  // version is published" is actually computed (no ack row for the
  // CURRENT version === outstanding), rather than a separate flag.
  @Prop({ default: 'v1' }) version: string;
}
export const PolicyAcknowledgmentSchema =
  SchemaFactory.createForClass(PolicyAcknowledgment);

@Schema({ _id: false })
export class PolicyAckToken {
  @Prop({ required: true }) token: string;
  @Prop({ required: true, lowercase: true }) recipientEmail: string;
  @Prop({ required: true }) recipientName: string;
  @Prop({ required: true, default: () => new Date() }) createdAt: Date;
}
export const PolicyAckTokenSchema =
  SchemaFactory.createForClass(PolicyAckToken);

@Schema({ _id: false })
export class PolicySection {
  @Prop({ required: true }) id: string;
  @Prop({ required: true, trim: true }) title: string;
  // HTML produced by the in-app section editor.
  @Prop({ default: '' }) content: string;
  @Prop({ required: true }) order: number;
}
export const PolicySectionSchema = SchemaFactory.createForClass(PolicySection);

@Schema({ _id: false })
export class PolicyApprovalEntry {
  @Prop({ required: true }) version: string;
  @Prop({ required: true }) approvedBy: string;
  @Prop({ required: true, default: () => new Date() }) date: Date;
  @Prop({ default: '' }) notes: string;
}
export const PolicyApprovalEntrySchema =
  SchemaFactory.createForClass(PolicyApprovalEntry);

@Schema({ _id: false })
export class PolicyComment {
  @Prop({ required: true }) id: string;
  @Prop({ required: true }) author: string;
  @Prop({ default: '' }) authorRole: string;
  @Prop({ required: true, default: () => new Date() }) date: Date;
  @Prop({ required: true }) content: string;
  @Prop({ default: null }) parentId: string | null;
}
export const PolicyCommentSchema = SchemaFactory.createForClass(PolicyComment);

@Schema({ timestamps: true, collection: 'grc_policies' })
export class Policy {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) title: string;
  @Prop({ default: '' }) category: string;
  // organisation/board still selects which acknowledgment channel a
  // policy uses (in-app employee roster vs. emailed board tokens) —
  // separate axis from `status`, which tracks the document lifecycle.
  @Prop({ enum: PolicyType, default: PolicyType.ORGANISATION })
  type: PolicyType;

  @Prop({ enum: PolicyStatus, default: PolicyStatus.DRAFT })
  status: PolicyStatus;
  @Prop({ default: 'v1' }) version: string;
  @Prop({ default: '' }) documentReference: string;
  @Prop({ default: '' }) owner: string;
  @Prop({ default: '' }) approvalAuthority: string;
  @Prop({ enum: ReviewFrequency, default: ReviewFrequency.ANNUAL })
  reviewFrequency: ReviewFrequency;
  @Prop({ enum: AckRequirement, default: AckRequirement.ALL_STAFF })
  acknowledgementRequirement: AckRequirement;
  @Prop({ default: '' }) description: string;
  @Prop({ type: [String], default: [] }) linkedRegulationsOrStandards: string[];
  @Prop({ default: null }) effectiveDate: Date | null;
  @Prop({ default: '' }) supersedes: string;
  @Prop({ type: [String], default: [] }) relatedPolicies: string[];
  @Prop({ default: null }) lastReviewed: Date | null;
  @Prop({ default: null }) nextReviewDue: Date | null;

  @Prop({ type: [PolicySectionSchema], default: [] })
  sections: PolicySection[];
  @Prop({ type: [PolicyApprovalEntrySchema], default: [] })
  approvalHistory: PolicyApprovalEntry[];
  @Prop({ type: [PolicyCommentSchema], default: [] })
  comments: PolicyComment[];

  // Legacy single-file-upload path — still populated by the
  // original "upload a document" flow (and the board-ack-token
  // emails), now optional since the editor-based flow creates a
  // policy with no attached file.
  @Prop({ default: '' }) fileName: string;
  @Prop({ default: null }) fileUrl: string | null;
  @Prop({ default: null }) mimeType: string | null;
  @Prop({ default: 0 }) size: number;

  @Prop({ type: [PolicyAcknowledgmentSchema], default: [] })
  acknowledgments: PolicyAcknowledgment[];
  // Only populated for board policies — one per current board member
  // at publish time, matching the Meeting/Board Pack pattern.
  @Prop({ type: [PolicyAckTokenSchema], default: [] })
  ackTokens: PolicyAckToken[];
}
export const PolicySchema = SchemaFactory.createForClass(Policy);
