import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { RiskCategory } from './risk-appetite.schema';

export type RiskDocument = Risk & Document;

export enum RiskStatus {
  OPEN = 'Open',
  ON_HOLD = 'On Hold',
  TRANSFERRED = 'Transferred',
  CLOSED = 'Closed',
}

export enum ControlEffectiveness {
  EFFECTIVE = 'Effective',
  PARTIALLY_EFFECTIVE = 'Partially Effective',
  INEFFECTIVE = 'Ineffective',
  NOT_TESTED = 'Not Tested',
}

@Schema({ _id: false })
export class RiskControlLink {
  @Prop({ type: Types.ObjectId, ref: 'Control', required: true })
  controlId: Types.ObjectId;
  @Prop({
    enum: ControlEffectiveness,
    default: ControlEffectiveness.NOT_TESTED,
  })
  effectiveness: ControlEffectiveness;
}
export const RiskControlLinkSchema =
  SchemaFactory.createForClass(RiskControlLink);

@Schema({ _id: false })
export class RiskChangeEntry {
  @Prop({ required: true, default: () => new Date() }) at: Date;
  @Prop({ required: true }) note: string;
}
export const RiskChangeEntrySchema =
  SchemaFactory.createForClass(RiskChangeEntry);

@Schema({ timestamps: true, collection: 'grc_risks' })
export class Risk {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) title: string;
  @Prop({ enum: RiskCategory, required: true, index: true })
  category: RiskCategory;
  @Prop({ default: '' }) description: string;
  @Prop({ default: '' }) rootCauses: string;
  @Prop({ default: '' }) affectedProcesses: string;
  @Prop({ default: '' }) owner: string;

  @Prop({ required: true, min: 1, max: 5 }) likelihood: number;
  @Prop({ required: true, min: 1, max: 5 }) impact: number;
  @Prop({ default: 0 }) financialExposure: number;

  @Prop({ type: [RiskControlLinkSchema], default: [] })
  controls: RiskControlLink[];
  @Prop({ type: [Types.ObjectId], ref: 'Risk', default: [] })
  relatedRiskIds: Types.ObjectId[];

  @Prop({ enum: RiskStatus, default: RiskStatus.OPEN, index: true })
  status: RiskStatus;
  @Prop({ required: true }) nextReviewDate: Date;

  @Prop({ type: [RiskChangeEntrySchema], default: [] })
  changes: RiskChangeEntry[];
}
export const RiskSchema = SchemaFactory.createForClass(Risk);
