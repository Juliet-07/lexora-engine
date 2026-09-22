import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { WorkerCategory } from './employee.schema';

export type ContractTemplateDocument = ContractTemplate & Document;

export const AVAILABLE_MERGE_FIELDS = [
  'employeeName',
  'jobTitle',
  'startDate',
  'salary',
  'salaryCurrency',
  'noticePeriod',
  'workerCategory',
  'tenantCompanyName',
  'todayDate',
  'reason',
  'effectiveDate',
  'endDate',
  // Free-text scope of work / responsibilities — optional, blank
  // unless supplied on the generate-from-candidate/employee request;
  // mainly useful for consultant/contractor-worker-category templates
  // where a defined scope matters more than it does for a standard
  // employment contract.
  'scopeOfWork',
] as const;
export type MergeField = (typeof AVAILABLE_MERGE_FIELDS)[number];

export enum TemplateCategory {
  CONTRACT = 'contract',
  LETTER = 'letter',
}

@Schema({ timestamps: true, collection: 'hr_contract_templates' })
export class ContractTemplate {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ enum: WorkerCategory, required: true, index: true })
  workerCategory: WorkerCategory;

  @Prop({ required: true })
  body: string;

  @Prop({ default: null })
  description: string | null;

  @Prop({ enum: TemplateCategory, default: TemplateCategory.CONTRACT })
  category: TemplateCategory;

  @Prop({ default: true })
  requiresSignature: boolean;

  @Prop({ default: true })
  isActive: boolean;
}

export const ContractTemplateSchema =
  SchemaFactory.createForClass(ContractTemplate);
