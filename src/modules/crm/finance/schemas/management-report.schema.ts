import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ReportPeriodType {
  MONTH = 'Month',
  QUARTER = 'Quarter',
  YEAR = 'Year',
}

export type ManagementReportDocument = ManagementReport & Document;

// One executive summary per tenant per period. Every number in the
// report itself (revenue, expenses, cash, etc.) is computed live
// from real Invoices/Bills/BankAccounts at read time — never stored
// here, so it can never drift from the ledger it's summarising.
// Only the tenant's own written commentary is real, persisted data.
@Schema({ timestamps: true, collection: 'crm_management_reports' })
export class ManagementReport {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ enum: ReportPeriodType, required: true, index: true })
  periodType: ReportPeriodType;
  // "2026-07" for a month, "2026-Q3" for a quarter, "2026" for a year.
  @Prop({ required: true, index: true }) periodKey: string;

  @Prop({ default: '' }) executiveSummary: string;
  @Prop({ default: '' }) lastEditedBy: string;
}
export const ManagementReportSchema =
  SchemaFactory.createForClass(ManagementReport);
ManagementReportSchema.index(
  { tenantId: 1, periodType: 1, periodKey: 1 },
  { unique: true },
);
