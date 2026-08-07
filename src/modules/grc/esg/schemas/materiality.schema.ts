import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { EsgPillar } from './metrics.schema';

export type StakeholderDocument = Stakeholder & Document;
export type MaterialTopicDocument = MaterialTopic & Document;
export type MaterialityCycleDocument = MaterialityCycle & Document;

export const STAKEHOLDER_GROUPS = [
  'Employees',
  'Investors',
  'Regulators',
  'Communities',
  'Customers',
  'Suppliers',
] as const;
export type StakeholderGroup = (typeof STAKEHOLDER_GROUPS)[number];

export enum StakeholderPriority {
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

@Schema({ timestamps: true, collection: 'esg_stakeholders' })
export class Stakeholder {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) group: string; // validated against STAKEHOLDER_GROUPS in DTO
  @Prop({ enum: StakeholderPriority, default: StakeholderPriority.MEDIUM })
  priority: StakeholderPriority;
  @Prop({ default: '' }) engagementMethod: string;
  @Prop({ default: null }) lastEngaged: Date | null;
  @Prop({ default: '' }) input: string;
}
export const StakeholderSchema = SchemaFactory.createForClass(Stakeholder);

@Schema({ timestamps: true, collection: 'esg_material_topics' })
export class MaterialTopic {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) topic: string;
  @Prop({ enum: EsgPillar, required: true }) pillar: EsgPillar;
  @Prop({ required: true, min: 1, max: 5 }) financial: number;
  @Prop({ required: true, min: 1, max: 5 }) impact: number;
  @Prop({ default: null }) priorFinancial: number | null;
  @Prop({ default: null }) priorImpact: number | null;
  @Prop({ default: '' }) rationale: string;
  @Prop({ default: false }) escalatedToRisk: boolean;

  // Real link to the created Risk (the mock only tracked a boolean) —
  // gives a way back to the actual register entry, not just a flag.
  @Prop({ type: Types.ObjectId, ref: 'Risk', default: null })
  riskId: Types.ObjectId | null;
}
export const MaterialTopicSchema = SchemaFactory.createForClass(MaterialTopic);

export enum MaterialityCycleStatus {
  IN_PROGRESS = 'In progress',
  APPROVED = 'Approved',
}

// Singleton per tenant.
@Schema({ timestamps: true, collection: 'esg_materiality_cycle' })
export class MaterialityCycle {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  tenantId: Types.ObjectId;

  @Prop({ required: true, default: () => String(new Date().getFullYear()) })
  year: string;

  @Prop({
    enum: MaterialityCycleStatus,
    default: MaterialityCycleStatus.IN_PROGRESS,
  })
  status: MaterialityCycleStatus;

  @Prop({ required: true, default: 4, min: 2, max: 5 }) threshold: number;
  @Prop({ default: null }) approvedBy: string | null;
  @Prop({ default: null }) approvedAt: Date | null;

  @Prop({
    required: true,
    default: () => new Date(Date.now() + 365 * 86400000),
  })
  nextReviewDate: Date;
}
export const MaterialityCycleSchema =
  SchemaFactory.createForClass(MaterialityCycle);
