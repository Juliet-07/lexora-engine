import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { WorkerCategory } from './employee.schema';

export type ContractTemplateDocument = ContractTemplate & Document;

// The fixed, known set of merge fields a template body may
// reference. Kept as a real allow-list (not free-form) so template
// validation can catch a typo'd placeholder at SAVE time, rather
// than silently leaving "{{salry}}" unreplaced in a generated
// contract months later.
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
] as const;
export type MergeField = (typeof AVAILABLE_MERGE_FIELDS)[number];

@Schema({ timestamps: true, collection: 'hr_contract_templates' })
export class ContractTemplate {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ enum: WorkerCategory, required: true, index: true })
  workerCategory: WorkerCategory;

  @Prop({ required: true })
  body: string; // raw text with {{placeholder}} syntax, NOT yet rendered

  @Prop({ default: null })
  description: string | null;

  @Prop({ default: true })
  isActive: boolean;
}

export const ContractTemplateSchema =
  SchemaFactory.createForClass(ContractTemplate);
