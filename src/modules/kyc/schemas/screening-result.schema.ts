import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ScreeningResultDocument = ScreeningResult & Document;

export enum ScreeningStatus {
  CLEAR = 'clear',
  POTENTIAL_MATCH = 'potential_match',
  CONFIRMED_MATCH = 'confirmed_match',
  FALSE_POSITIVE = 'false_positive',
}

@Schema({ timestamps: true })
export class ScreeningResult {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ enum: ScreeningStatus, default: ScreeningStatus.CLEAR })
  status: ScreeningStatus;

  @Prop({ type: [Object], default: [] })
  sanctionsMatches: Array<{
    list: string;
    matchScore: number;
    name: string;
    details: Record<string, any>;
  }>;

  @Prop({ type: [Object], default: [] })
  pepMatches: Array<{
    name: string;
    position: string;
    country: string;
    matchScore: number;
  }>;

  @Prop({ type: [Object], default: [] })
  adverseMediaMatches: Array<{
    headline: string;
    source: string;
    date: Date;
    url: string;
    sentiment: string;
  }>;

  @Prop({ default: null })
  reviewedBy: string;

  @Prop({ default: null })
  reviewedAt: Date;

  @Prop({ default: null })
  notes: string;

  @Prop({ default: null })
  nextScreeningDate: Date;
}

export const ScreeningResultSchema = SchemaFactory.createForClass(ScreeningResult);
