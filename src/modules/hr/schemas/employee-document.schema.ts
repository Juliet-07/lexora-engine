import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EmployeeDocumentFileDocument = EmployeeDocumentFile & Document;

export enum DocumentUploader {
  EMPLOYEE = 'employee',
  TENANT = 'tenant',
}

// One document per uploaded file. Its own collection rather than an
// embedded array on Employee — matches the pattern already used for
// loans/onboarding elsewhere in this module, and keeps the Employee
// document from growing unboundedly as files accumulate over years.
@Schema({ timestamps: true, collection: 'hr_employee_documents' })
export class EmployeeDocumentFile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true, index: true })
  employeeId: Types.ObjectId;

  @Prop({ required: true })
  fileName: string;

  @Prop({ default: null })
  label: string | null;

  @Prop({ required: true })
  fileUrl: string; // relative path, e.g. "/uploads/employee/documents/<generated>.pdf"

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  sizeBytes: number;

  @Prop({ enum: DocumentUploader, required: true })
  uploadedBy: DocumentUploader;

  // Points to either an Employee's own userId or a tenant User's
  // id depending on uploadedBy — not constrained to one ref type.
  @Prop({ type: Types.ObjectId, required: true })
  uploadedByUserId: Types.ObjectId;
}

export const EmployeeDocumentFileSchema =
  SchemaFactory.createForClass(EmployeeDocumentFile);
