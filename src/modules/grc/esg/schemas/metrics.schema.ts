import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EsgMetricDocument = EsgMetric & Document;
export type EsgInitiativeDocument = EsgInitiative & Document;

// Full 3-value pillar, used by Materiality (topics can be Governance
// too). Metrics themselves are only ever Environmental or Social —
// Governance's score comes from the existing GRC health score, not
// from a metric register — hence the separate, narrower MetricPillar.
export enum EsgPillar {
  ENVIRONMENTAL = 'Environmental',
  SOCIAL = 'Social',
  GOVERNANCE = 'Governance',
}
export enum MetricPillar {
  ENVIRONMENTAL = 'Environmental',
  SOCIAL = 'Social',
}

export const ENV_CATEGORIES = [
  'Carbon',
  'Energy',
  'Water',
  'Waste',
  'Biodiversity',
] as const;
export const SOCIAL_CATEGORIES = [
  'Workforce',
  'Diversity',
  'Health & Safety',
  'Community',
  'Engagement',
  'Equal Pay',
] as const;
export type EnvCategory = (typeof ENV_CATEGORIES)[number];
export type SocialCategory = (typeof SOCIAL_CATEGORIES)[number];
export type MetricCategory = EnvCategory | SocialCategory;

export enum Direction {
  LOWER = 'lower',
  HIGHER = 'higher',
}
export enum IntensityBasis {
  NONE = 'none',
  PER_EMPLOYEE = 'per employee',
  PER_SQM = 'per m²',
  PER_REVENUE = 'per revenue unit',
}

@Schema({ timestamps: true, collection: 'esg_metrics' })
export class EsgMetric {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ enum: MetricPillar, required: true, index: true })
  pillar: MetricPillar;

  // Validated against ENV_CATEGORIES/SOCIAL_CATEGORIES for the given
  // pillar at the DTO layer — categories aren't part of the "make it
  // editable" request (that's specifically the Reporting frameworks),
  // so they stay a fixed, known set.
  @Prop({ required: true }) category: string;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true }) unit: string;
  @Prop({ required: true }) period: string;
  @Prop({ required: true }) value: number;
  @Prop({ required: true }) baseline: number;
  @Prop({ required: true }) target: number;
  @Prop({ required: true }) targetYear: string;
  @Prop({ enum: Direction, required: true }) direction: Direction;
  @Prop({ enum: IntensityBasis, default: IntensityBasis.NONE })
  intensityBasis: IntensityBasis;
  @Prop({ default: '' }) methodology: string;
  @Prop({ default: '' }) source: string;
}
export const EsgMetricSchema = SchemaFactory.createForClass(EsgMetric);

export enum InitiativeStatus {
  PLANNED = 'Planned',
  IN_PROGRESS = 'In progress',
  DELIVERED = 'Delivered',
  PAUSED = 'Paused',
}

@Schema({ timestamps: true, collection: 'esg_initiatives' })
export class EsgInitiative {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) title: string;
  @Prop({ required: true }) category: string;
  @Prop({ default: '' }) owner: string;
  @Prop({ default: 0 }) cost: number;
  @Prop({ default: '' }) expectedImpact: string;
  @Prop({ enum: InitiativeStatus, default: InitiativeStatus.PLANNED })
  status: InitiativeStatus;
  @Prop({ required: true, default: () => new Date() }) startDate: Date;
}
export const EsgInitiativeSchema = SchemaFactory.createForClass(EsgInitiative);
