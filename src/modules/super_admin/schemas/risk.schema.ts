import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RiskRulesDocument = RiskRules & Document;

@Schema({ timestamps: true, collection: 'risk_rules' })
export class RiskRules {
  @Prop({ default: 75, min: 0, max: 100 })
  highRisk: number;

  @Prop({ default: 40, min: 0, max: 100 })
  mediumRisk: number;

  @Prop({ default: 10000, min: 0 })
  autoFlagTransaction: number;

  @Prop({ default: 180, min: 1 })
  reviewPeriod: number;
}

export const RiskRulesSchema = SchemaFactory.createForClass(RiskRules);
