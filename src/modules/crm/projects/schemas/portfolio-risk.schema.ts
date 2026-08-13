import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PortfolioRiskDocument = PortfolioRisk & Document;

export enum RiskType {
  RISK = 'Risk',
  ISSUE = 'Issue',
}

export enum RiskSeverity {
  CRITICAL = 'Critical',
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

export enum RiskStatus {
  OPEN = 'Open',
  MITIGATING = 'Mitigating',
  MONITORING = 'Monitoring',
  ESCALATED = 'Escalated',
  CLOSED = 'Closed',
}

@Schema({ _id: true })
export class RiskNote {
  @Prop({ required: true }) author: string;
  @Prop({ required: true }) body: string;
  @Prop({ required: true, default: Date.now }) at: Date;
}
export const RiskNoteSchema = SchemaFactory.createForClass(RiskNote);

@Schema({ timestamps: true, collection: 'crm_portfolio_risks' })
export class PortfolioRisk {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) title: string;

  @Prop({ type: Types.ObjectId, ref: 'Mandate', required: true })
  mandateId: Types.ObjectId;
  @Prop({ required: true }) mandateName: string;

  @Prop({ enum: RiskType, required: true }) type: RiskType;
  @Prop({ enum: RiskSeverity, required: true }) severity: RiskSeverity;
  // Free text, not a hard employee reference — an owner can be a
  // department ("Finance") rather than a specific person, matching
  // the confirmed prototype's own data exactly.
  @Prop({ default: '' }) owner: string;
  @Prop({ enum: RiskStatus, default: RiskStatus.OPEN }) status: RiskStatus;
  @Prop({ default: '' }) impact: string;

  // Mitigation notes actually persist here — the prototype's dialog
  // collected a note and only ever showed a toast, nothing was ever
  // saved anywhere to review later.
  @Prop({ type: [RiskNoteSchema], default: [] }) notes: RiskNote[];
}
export const PortfolioRiskSchema = SchemaFactory.createForClass(PortfolioRisk);
