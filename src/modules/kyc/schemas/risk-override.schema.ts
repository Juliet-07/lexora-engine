import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RiskOverrideDocument = RiskOverride & Document;

@Schema({ timestamps: true, collection: 'risk_overrides' })
export class RiskOverride {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientId: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    required: true,
  })
  overriddenRiskLevel: string;

  @Prop({ required: true })
  reason: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  overriddenBy: Types.ObjectId;

  @Prop({ default: null })
  expiresAt: Date | null;
}

export const RiskOverrideSchema = SchemaFactory.createForClass(RiskOverride);
