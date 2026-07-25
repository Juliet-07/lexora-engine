import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ControlDocument = Control & Document;
export type ControlTestDocument = ControlTest & Document;
export type DeficiencyDocument = Deficiency & Document;

export enum ControlType {
  PREVENTIVE = 'Preventive',
  DETECTIVE = 'Detective',
  CORRECTIVE = 'Corrective',
}

export enum ControlFrequency {
  CONTINUOUS = 'Continuous',
  DAILY = 'Daily',
  WEEKLY = 'Weekly',
  MONTHLY = 'Monthly',
  QUARTERLY = 'Quarterly',
  ANNUAL = 'Annual',
}

export enum TestOutcome {
  PASS = 'Pass',
  FAIL = 'Fail',
}

export enum ControlEffectivenessRating {
  EFFECTIVE = 'Effective',
  PARTIALLY_EFFECTIVE = 'Partially Effective',
  INEFFECTIVE = 'Ineffective',
  NOT_TESTED = 'Not Tested',
}

export enum DeficiencySeverity {
  CRITICAL = 'Critical',
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

export enum DeficiencyStatus {
  OPEN = 'Open',
  REMEDIATED = 'Remediated',
}

@Schema({ timestamps: true, collection: 'grc_controls' })
export class Control {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) code: string;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: '' }) objective: string;
  @Prop({ enum: ControlType, required: true }) type: ControlType;
  @Prop({ default: '' }) owner: string;
  @Prop({ enum: ControlFrequency, required: true }) frequency: ControlFrequency;
}
export const ControlSchema = SchemaFactory.createForClass(Control);

@Schema({ timestamps: true, collection: 'grc_control_tests' })
export class ControlTest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Control', required: true, index: true })
  controlId: Types.ObjectId;

  @Prop({ required: true, default: () => new Date() }) testedAt: Date;
  @Prop({ enum: TestOutcome, required: true }) outcome: TestOutcome;
  @Prop({ enum: ControlEffectivenessRating, required: true })
  effectiveness: ControlEffectivenessRating;
  @Prop({ default: '' }) notes: string;
}
export const ControlTestSchema = SchemaFactory.createForClass(ControlTest);

@Schema({ timestamps: true, collection: 'grc_deficiencies' })
export class Deficiency {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Control', required: true, index: true })
  controlId: Types.ObjectId;

  @Prop({ enum: DeficiencySeverity, required: true })
  severity: DeficiencySeverity;
  @Prop({ required: true }) rootCause: string;
  @Prop({ required: true }) remediationDeadline: Date;
  @Prop({ enum: DeficiencyStatus, default: DeficiencyStatus.OPEN })
  status: DeficiencyStatus;
  @Prop({ required: true, default: () => new Date() }) openedAt: Date;
  @Prop({ default: null }) remediatedAt: Date | null;
}
export const DeficiencySchema = SchemaFactory.createForClass(Deficiency);
