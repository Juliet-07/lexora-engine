import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ReportPeriodType {
  MONTH = 'Month',
  QUARTER = 'Quarter',
  YEAR = 'Year',
}

export type ManagementReportDocument = ManagementReport & Document;

export enum ReportSeverity {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}
export enum ReportActionPriority {
  HIGH = 'high',
  MEDIUM = 'medium',
  NORMAL = 'normal',
  LOW = 'low',
}
export enum CeoMessageStatus {
  DRAFT = 'Draft',
  FINAL = 'Final',
}

@Schema({ _id: false })
export class ReportCommentary {
  @Prop({ default: '' }) ceoMessage: string;
  @Prop({ default: '' }) revenue: string;
  @Prop({ default: '' }) costs: string;
  @Prop({ default: '' }) cashflow: string;
  @Prop({ default: '' }) receivables: string;
  @Prop({ default: '' }) payables: string;
  @Prop({ default: '' }) budget: string;
}
export const ReportCommentarySchema =
  SchemaFactory.createForClass(ReportCommentary);

@Schema({ _id: true })
export class ReportRisk {
  @Prop({ enum: ReportSeverity, default: ReportSeverity.MEDIUM })
  severity: ReportSeverity;
  @Prop({ required: true }) text: string;
  @Prop({ default: '' }) impact: string;
  @Prop({ default: '' }) likelihood: string;
  @Prop({ default: '' }) owner: string;
  @Prop({ default: '' }) mitigation: string;
}
export const ReportRiskSchema = SchemaFactory.createForClass(ReportRisk);

@Schema({ _id: true })
export class ReportAction {
  @Prop({ enum: ReportActionPriority, default: ReportActionPriority.NORMAL })
  priority: ReportActionPriority;
  @Prop({ required: true }) text: string;
  @Prop({ default: '' }) owner: string;
  @Prop({ default: '' }) due: string;
}
export const ReportActionSchema = SchemaFactory.createForClass(ReportAction);

// One management report's written content per tenant per period. Every
// number in the report itself is computed live from the general
// ledger, invoices, bills and budgets at read time — never stored
// here, so it can never drift from the ledger it's summarising. Only
// what the tenant writes is persisted: the CEO/MD message, the
// commentary on each section, the risk register and the actions for
// the next period.
@Schema({ timestamps: true, collection: 'crm_management_reports' })
export class ManagementReport {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ enum: ReportPeriodType, required: true, index: true })
  periodType: ReportPeriodType;
  // "2026-07" for a month, "2026-Q3" for a quarter, "2026" for a year.
  @Prop({ required: true, index: true }) periodKey: string;

  // Legacy single-text summary from before the report had sections.
  // Still read as the CEO/MD message when no message has been written
  // in the new commentary yet, so nothing already saved is lost.
  @Prop({ default: '' }) executiveSummary: string;

  @Prop({ type: ReportCommentarySchema, default: () => ({}) })
  commentary: ReportCommentary;
  @Prop({ enum: CeoMessageStatus, default: CeoMessageStatus.DRAFT })
  ceoMessageStatus: CeoMessageStatus;
  @Prop({ type: [ReportRiskSchema], default: [] }) risks: ReportRisk[];
  @Prop({ type: [ReportActionSchema], default: [] }) actions: ReportAction[];

  @Prop({ default: '' }) lastEditedBy: string;
}
export const ManagementReportSchema =
  SchemaFactory.createForClass(ManagementReport);
ManagementReportSchema.index(
  { tenantId: 1, periodType: 1, periodKey: 1 },
  { unique: true },
);
