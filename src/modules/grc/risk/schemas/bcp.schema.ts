import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BcpPlanDocument = BcpPlan & Document;
export type BcpTestDocument = BcpTest & Document;
export type RtoRpoDocument = RtoRpo & Document;
export type CrisisContactDocument = CrisisContact & Document;

export enum BcpTestOutcome {
  PASS = 'Pass',
  PARTIAL = 'Partial',
  FAIL = 'Fail',
}
export enum SystemCriticality {
  TIER_1 = 'Tier 1',
  TIER_2 = 'Tier 2',
  TIER_3 = 'Tier 3',
}

@Schema({ timestamps: true, collection: 'grc_bcp_plans' })
export class BcpPlan {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) title: string;
  @Prop({ required: true, default: 1 }) version: number;
  @Prop({ required: true }) content: string;
}
export const BcpPlanSchema = SchemaFactory.createForClass(BcpPlan);

@Schema({ timestamps: true, collection: 'grc_bcp_tests' })
export class BcpTest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'BcpPlan', required: true, index: true })
  planId: Types.ObjectId;

  @Prop({ required: true, default: () => new Date() }) testedAt: Date;
  @Prop({ enum: BcpTestOutcome, required: true }) outcome: BcpTestOutcome;
  @Prop({ default: '' }) notes: string;
}
export const BcpTestSchema = SchemaFactory.createForClass(BcpTest);

@Schema({ timestamps: true, collection: 'grc_rto_rpo' })
export class RtoRpo {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) system: string;
  @Prop({ required: true }) rtoHours: number;
  @Prop({ required: true }) rpoHours: number;
  @Prop({ enum: SystemCriticality, required: true })
  criticality: SystemCriticality;
}
export const RtoRpoSchema = SchemaFactory.createForClass(RtoRpo);

@Schema({ timestamps: true, collection: 'grc_crisis_contacts' })
export class CrisisContact {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: '' }) role: string;
  @Prop({ required: true }) phone: string;
  @Prop({ required: true }) escalationOrder: number;
}
export const CrisisContactSchema = SchemaFactory.createForClass(CrisisContact);
