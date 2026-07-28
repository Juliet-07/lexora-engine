import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { RiskCategory } from './risk-appetite.schema';

export type EmergingRiskDocument = EmergingRisk & Document;

export enum EmergingRiskSource {
  MANUAL_ENTRY = 'Manual entry',
  REGULATORY_FEED = 'Regulatory feed',
  HORIZON_SCAN = 'Horizon scan',
}
export enum Velocity {
  IMMEDIATE = 'Immediate',
  SHORT_TERM = 'Short term',
  MEDIUM_TERM = 'Medium term',
  LONG_TERM = 'Long term',
}
export enum WatchList {
  ACTIVE_WATCH = 'Active watch',
  MONITOR = 'Monitor',
  LOW_PRIORITY = 'Low priority',
}
export enum EmergingStatus {
  WATCHING = 'Watching',
  ESCALATED = 'Escalated',
  REMOVED = 'Removed',
}
export enum TriggerKind {
  LIKELIHOOD_INCREASE = 'Likelihood increase',
  PROXIMITY = 'Proximity',
  TRIGGER_EVENT = 'Trigger event',
}
export enum ReviewRecommendation {
  ESCALATE = 'Escalate to register',
  MAINTAIN = 'Maintain watch',
  REMOVE = 'Remove',
}

@Schema({ _id: false })
export class EscalationTrigger {
  @Prop({ enum: TriggerKind, required: true }) kind: TriggerKind;
  @Prop({ required: true }) condition: string;
  @Prop({ default: false }) fired: boolean;
  @Prop({ default: null }) firedAt: Date | null;
}
export const EscalationTriggerSchema =
  SchemaFactory.createForClass(EscalationTrigger);

@Schema({ _id: false })
export class QuarterlyReview {
  @Prop({ required: true, default: () => new Date() }) at: Date;
  @Prop({ required: true }) quarter: string;
  @Prop({ enum: ReviewRecommendation, required: true })
  recommendation: ReviewRecommendation;
  @Prop({ default: '' }) note: string;
}
export const QuarterlyReviewSchema =
  SchemaFactory.createForClass(QuarterlyReview);

@Schema({ timestamps: true, collection: 'grc_emerging_risks' })
export class EmergingRisk {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) title: string;
  @Prop({ enum: RiskCategory, required: true }) category: RiskCategory;
  @Prop({ enum: EmergingRiskSource, required: true })
  source: EmergingRiskSource;
  @Prop({ default: '' }) description: string;
  @Prop({ required: true, min: 1, max: 5 }) impact: number;
  @Prop({ enum: Velocity, required: true }) velocity: Velocity;
  @Prop({ enum: WatchList, required: true }) watchList: WatchList;
  @Prop({ default: '' }) owner: string;

  @Prop({ type: [EscalationTriggerSchema], default: [] })
  triggers: EscalationTrigger[];
  @Prop({ type: [QuarterlyReviewSchema], default: [] })
  reviews: QuarterlyReview[];

  @Prop({ enum: EmergingStatus, default: EmergingStatus.WATCHING, index: true })
  status: EmergingStatus;
  @Prop({ default: null }) escalatedAt: Date | null;
  @Prop({ default: '' }) escalationNote: string;
  @Prop({ type: Types.ObjectId, ref: 'Risk', default: null })
  linkedRiskId: Types.ObjectId | null;
}
export const EmergingRiskSchema = SchemaFactory.createForClass(EmergingRisk);
