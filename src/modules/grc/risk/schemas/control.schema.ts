import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { RiskCategory } from './risk-appetite.schema';

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

// ═══════════════════════════════════════════════════════════
// TEST PLAN — replaces the earlier simple ControlTest design.
// A failed test automatically logs a Deficiency (see below and
// TestPlanService.complete()).
// ═══════════════════════════════════════════════════════════

export enum TestRiskRating {
  EXTREME = 'Extreme',
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

export enum TestFrequency {
  SEMI_ANNUAL = 'Every 6 months',
  ANNUAL = 'Annually',
  BIENNIAL = 'Biennially',
  EVERY_2_3_YEARS = 'Every 2-3 years',
}

export enum TestStatus {
  PLANNED = 'Planned',
  ASSIGNED = 'Assigned',
  IN_PROGRESS = 'In progress',
  AWAITING_SIGNOFF = 'Awaiting sign-off',
  SIGNED_OFF = 'Signed off',
}

export enum TestConclusion {
  PASS = 'Pass',
  FAIL = 'Fail',
}

export const FREQUENCY_BY_RATING: Record<TestRiskRating, TestFrequency> = {
  [TestRiskRating.EXTREME]: TestFrequency.SEMI_ANNUAL,
  [TestRiskRating.HIGH]: TestFrequency.ANNUAL,
  [TestRiskRating.MEDIUM]: TestFrequency.BIENNIAL,
  [TestRiskRating.LOW]: TestFrequency.EVERY_2_3_YEARS,
};

// Shared by both ControlTest and Deficiency below.
@Schema({ _id: false })
export class EvidenceItem {
  @Prop({ required: true }) name: string;
  @Prop({ default: null }) fileUrl: string | null;
  @Prop({ default: null }) mimeType: string | null;
  @Prop({ default: 0 }) size: number;
  @Prop({ required: true, default: () => new Date() }) uploadedAt: Date;
}
export const EvidenceItemSchema = SchemaFactory.createForClass(EvidenceItem);

@Schema({ timestamps: true, collection: 'grc_control_tests' })
export class ControlTest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Control', required: true, index: true })
  controlId: Types.ObjectId;
  // Snapshot at creation — a historical test still shows what the
  // control was called even if it's later renamed.
  @Prop({ required: true }) controlCode: string;
  @Prop({ required: true }) controlName: string;

  @Prop({ enum: TestRiskRating, required: true }) riskRating: TestRiskRating;
  @Prop({ enum: TestFrequency, required: true }) frequency: TestFrequency;
  @Prop({ default: '' }) procedure: string;
  @Prop({ required: true }) year: number;
  @Prop({ required: true }) dueDate: Date;
  @Prop({ default: '' }) tester: string;
  @Prop({ enum: TestStatus, default: TestStatus.PLANNED }) status: TestStatus;
  @Prop({ enum: TestConclusion, default: null })
  conclusion: TestConclusion | null;
  @Prop({ default: '' }) findings: string;
  @Prop({ type: [EvidenceItemSchema], default: [] }) evidence: EvidenceItem[];
  @Prop({ default: '' }) signedOffBy: string;
  @Prop({ default: null }) signedOffAt: Date | null;
  @Prop({ default: null }) completedAt: Date | null;
}
export const ControlTestSchema = SchemaFactory.createForClass(ControlTest);

// ═══════════════════════════════════════════════════════════
// DEFICIENCY — replaces the earlier control-only design. Now a
// general remediation register: a deficiency can originate from a
// control test, an incident investigation, or an audit finding.
// ═══════════════════════════════════════════════════════════

export enum DeficiencyOrigin {
  CONTROL_TEST = 'Control test',
  INCIDENT_INVESTIGATION = 'Incident investigation',
  AUDIT_FINDING = 'Audit finding',
}

export enum Severity {
  CRITICAL = 'Critical',
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

export enum DefStatus {
  OPEN = 'Open',
  PLAN_AGREED = 'Plan agreed',
  IN_REMEDIATION = 'In remediation',
  AWAITING_VALIDATION = 'Awaiting validation',
  CLOSED = 'Closed',
}

export const REMEDIATION_DAYS: Record<Severity, number> = {
  [Severity.CRITICAL]: 30,
  [Severity.HIGH]: 60,
  [Severity.MEDIUM]: 90,
  [Severity.LOW]: 180,
};

@Schema({ timestamps: true, collection: 'grc_deficiencies' })
export class Deficiency {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) reference: string;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ enum: DeficiencyOrigin, required: true }) origin: DeficiencyOrigin;
  @Prop({ default: '' }) sourceRef: string;
  @Prop({ enum: RiskCategory, required: true }) category: RiskCategory;
  @Prop({ enum: Severity, required: true }) severity: Severity;
  @Prop({ default: '' }) rootCause: string;
  @Prop({ default: '' }) owner: string;

  @Prop({ required: true, default: () => new Date() }) loggedAt: Date;
  @Prop({ required: true }) deadline: Date;

  @Prop({ default: '' }) plan: string;
  @Prop({ default: '' }) managementResponse: string;
  @Prop({ type: [EvidenceItemSchema], default: [] }) evidence: EvidenceItem[];
  @Prop({ default: '' }) validatedBy: string;
  @Prop({ default: null }) validatedAt: Date | null;
  @Prop({ enum: DefStatus, default: DefStatus.OPEN }) status: DefStatus;
}
export const DeficiencySchema = SchemaFactory.createForClass(Deficiency);
