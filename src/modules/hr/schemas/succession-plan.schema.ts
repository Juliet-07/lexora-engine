import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SuccessionPlanDocument = SuccessionPlan & Document;

export enum RiskOfLoss {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum BenchReadiness {
  READY_NOW = 'ready_now',
  READY_1_2_YEARS = 'ready_1_2_years',
  READY_3_PLUS_YEARS = 'ready_3_plus_years',
  GAP = 'gap',
}

export enum SuccessorPotential {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

@Schema({ _id: false })
export class Successor {
  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true })
  employeeId: Types.ObjectId;

  @Prop({ required: true })
  employeeName: string;

  @Prop({ enum: BenchReadiness, default: BenchReadiness.GAP })
  readiness: BenchReadiness;

  @Prop({ enum: SuccessorPotential, default: SuccessorPotential.MEDIUM })
  potential: SuccessorPotential;

  @Prop({ default: null })
  notes: string | null;
}
export const SuccessorSchema = SchemaFactory.createForClass(Successor);

@Schema({ timestamps: true, collection: 'hr_succession_plans' })
export class SuccessionPlan {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  criticalRole: string;

  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true })
  incumbentId: Types.ObjectId;

  @Prop({ required: true })
  incumbentName: string;

  @Prop({ enum: RiskOfLoss, default: RiskOfLoss.MEDIUM })
  riskOfLoss: RiskOfLoss;

  @Prop({ enum: BenchReadiness, default: BenchReadiness.GAP })
  overallReadiness: BenchReadiness;

  @Prop({ type: [SuccessorSchema], default: [] })
  successors: Successor[];

  @Prop({ default: null })
  notes: string | null;
}

export const SuccessionPlanSchema =
  SchemaFactory.createForClass(SuccessionPlan);
