import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdrCaseDocument = AdrCase & Document;

export enum AdrType {
  MEDIATION = 'Mediation',
  ARBITRATION = 'Arbitration',
  CONCILIATION = 'Conciliation',
  EXPERT_DETERMINATION = 'Expert determination',
}

export enum AdrStage {
  INTAKE = 'Intake',
  APPOINTMENT = 'Appointment',
  SESSIONS = 'Sessions',
  SETTLEMENT = 'Settlement',
  AWARD_OUTCOME = 'Award / Outcome',
  CLOSED = 'Closed',
}
export const ADR_STAGES: AdrStage[] = Object.values(AdrStage);

export enum SessionMode {
  PHYSICAL = 'Physical',
  VIRTUAL = 'Virtual',
}

@Schema({ _id: false })
export class AdrSession {
  @Prop({ required: true }) date: Date;
  @Prop({ enum: SessionMode, required: true }) mode: SessionMode;
  @Prop({ default: '' }) venue: string;
  @Prop({ default: '' }) outcome: string;
}
export const AdrSessionSchema = SchemaFactory.createForClass(AdrSession);

@Schema({ _id: false })
export class AdrSettlement {
  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) date: Date;
  @Prop({ default: '' }) terms: string;
}
export const AdrSettlementSchema = SchemaFactory.createForClass(AdrSettlement);

@Schema({ timestamps: true, collection: 'crm_adr_cases' })
export class AdrCase {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) ref: string;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ enum: AdrType, required: true }) type: AdrType;
  @Prop({ type: [String], default: [] }) parties: string[];

  // Free text, matching the confirmed prototype exactly — a neutral
  // is nearly always a real employee, but this stays name-only here
  // rather than a hard employee reference, since a case may also be
  // referred to an outside neutral who isn't on staff at all.
  @Prop({ type: Types.ObjectId, default: null })
  neutralUserId: Types.ObjectId | null;
  @Prop({ default: '' }) neutral: string;

  @Prop({ enum: AdrStage, default: AdrStage.INTAKE, index: true })
  stage: AdrStage;
  @Prop({ default: 0 }) claimValue: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ required: true }) filedOn: Date;

  @Prop({ type: [AdrSessionSchema], default: [] }) sessions: AdrSession[];
  @Prop({ type: AdrSettlementSchema, default: null })
  settlement: AdrSettlement | null;
  @Prop({ default: null }) outcome: string | null;
}
export const AdrCaseSchema = SchemaFactory.createForClass(AdrCase);
