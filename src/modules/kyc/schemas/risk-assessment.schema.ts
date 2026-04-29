import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RiskAssessmentDocument = RiskAssessment & Document;

@Schema({ timestamps: true })
export class RiskAssessment {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'KycRecord', required: true })
  kycRecordId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, min: 0, max: 100 })
  overallScore: number;

  @Prop({ enum: ['low', 'medium', 'high', 'critical'], default: 'low' })
  riskLevel: string;

  @Prop({ type: Object, default: {} })
  factors: {
    geographicRisk: number;
    industryRisk: number;
    transactionRisk: number;
    pepRisk: number;
    sanctionsRisk: number;
    adverseMediaRisk: number;
  };

  @Prop({ type: [String], default: [] })
  riskFlags: string[];

  @Prop({ type: [String], default: [] })
  recommendations: string[];

  @Prop({ default: null })
  assessedBy: string;

  @Prop({ default: null })
  nextReviewDate: Date;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const RiskAssessmentSchema = SchemaFactory.createForClass(RiskAssessment);
