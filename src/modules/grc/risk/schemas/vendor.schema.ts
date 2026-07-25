import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VendorDocument = Vendor & Document;

export enum VendorRiskRating {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  EXTREME = 'Extreme',
}
export enum VendorStatus {
  ACTIVE = 'Active',
  TERMINATED = 'Terminated',
}
export enum TriRating {
  STRONG = 'Strong',
  ADEQUATE = 'Adequate',
  WEAK = 'Weak',
}
export enum BcpRating {
  DOCUMENTED = 'Documented',
  PARTIAL = 'Partial',
  NONE = 'None',
}
export enum ComplianceRating {
  COMPLIANT = 'Compliant',
  ISSUES = 'Issues',
  UNKNOWN = 'Unknown',
}
export enum ReputationRating {
  GOOD = 'Good',
  NEUTRAL = 'Neutral',
  CONCERNS = 'Concerns',
}

@Schema({ _id: false })
export class DueDiligence {
  @Prop({ enum: TriRating, default: TriRating.ADEQUATE })
  financialStability: TriRating;
  @Prop({ enum: TriRating, default: TriRating.ADEQUATE })
  cybersecurityPosture: TriRating;
  @Prop({ enum: BcpRating, default: BcpRating.PARTIAL }) bcp: BcpRating;
  @Prop({ enum: ComplianceRating, default: ComplianceRating.COMPLIANT })
  complianceStatus: ComplianceRating;
  @Prop({ enum: ReputationRating, default: ReputationRating.NEUTRAL })
  reputation: ReputationRating;
}
export const DueDiligenceSchema = SchemaFactory.createForClass(DueDiligence);

@Schema({ _id: false })
export class RatingHistoryEntry {
  @Prop({ required: true, default: () => new Date() }) at: Date;
  @Prop({ enum: VendorRiskRating, required: true }) rating: VendorRiskRating;
  @Prop({ default: '' }) note: string;
}
export const RatingHistoryEntrySchema =
  SchemaFactory.createForClass(RatingHistoryEntry);

@Schema({ timestamps: true, collection: 'grc_vendors' })
export class Vendor {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: '' }) category: string;
  @Prop({ default: '' }) services: string;

  @Prop({ required: true }) contractStart: Date;
  @Prop({ required: true }) contractEnd: Date;

  @Prop({ enum: VendorRiskRating, required: true })
  riskRating: VendorRiskRating;
  @Prop({ type: DueDiligenceSchema, required: true })
  dueDiligence: DueDiligence;
  @Prop({ required: true }) nextReviewDate: Date;

  @Prop({ enum: VendorStatus, default: VendorStatus.ACTIVE, index: true })
  status: VendorStatus;
  @Prop({ type: [RatingHistoryEntrySchema], default: [] })
  ratingHistory: RatingHistoryEntry[];

  @Prop({ default: null }) terminationReason: string | null;
  @Prop({ default: null }) terminatedAt: Date | null;
}
export const VendorSchema = SchemaFactory.createForClass(Vendor);
