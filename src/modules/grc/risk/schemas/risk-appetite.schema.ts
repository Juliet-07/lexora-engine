import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RiskAppetiteVersionDocument = RiskAppetiteVersion & Document;

export enum RiskCategory {
  STRATEGIC = 'Strategic',
  OPERATIONAL = 'Operational',
  FINANCIAL = 'Financial',
  COMPLIANCE = 'Compliance',
  REPUTATIONAL = 'Reputational',
  INFORMATION_SECURITY = 'Information Security',
}

export enum RiskPosture {
  AVERSE = 'Averse',
  CAUTIOUS = 'Cautious',
  OPEN = 'Open',
  HUNGRY = 'Hungry',
}

@Schema({ _id: false })
export class AppetiteEntry {
  @Prop({ enum: RiskCategory, required: true }) category: RiskCategory;
  @Prop({ enum: RiskPosture, default: RiskPosture.OPEN }) posture: RiskPosture;
  @Prop({ default: '' }) qualitative: string;
  @Prop({ default: 0 }) maxLossPerEvent: number;
  @Prop({ default: 0 }) maxAggregateExposure: number;
  @Prop({ default: 20 }) amberThresholdPct: number;
}
export const AppetiteEntrySchema = SchemaFactory.createForClass(AppetiteEntry);

// Every save is a NEW immutable version — "current" is always just the
// most recent one for a tenant, never a separately-maintained singleton
// that could drift out of sync with history.
@Schema({ timestamps: true, collection: 'grc_risk_appetite_versions' })
export class RiskAppetiteVersion {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) note: string;
  @Prop({ type: [AppetiteEntrySchema], required: true })
  entries: AppetiteEntry[];
}
export const RiskAppetiteVersionSchema =
  SchemaFactory.createForClass(RiskAppetiteVersion);
