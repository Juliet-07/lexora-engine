import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongoDocument, Types } from 'mongoose';

export type DocumentRecord = DocumentFile & MongoDocument;

export enum DocumentStatus {
  DRAFT = 'draft',
  PENDING_SIGNATURE = 'pending_signature',
  SIGNED = 'signed',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  ARCHIVED = 'archived',
}

export enum DocumentCategory {
  IDENTITY = 'identity',
  ADDRESS_PROOF = 'address_proof',
  FINANCIAL = 'financial',
  LEGAL = 'legal',
  CONTRACT = 'contract',
  REPORT = 'report',
  OTHER = 'other',
}

@Schema({ timestamps: true })
export class DocumentFile {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description: string;

  @Prop({ enum: DocumentCategory, default: DocumentCategory.OTHER })
  category: DocumentCategory;

  @Prop({ enum: DocumentStatus, default: DocumentStatus.DRAFT })
  status: DocumentStatus;

  @Prop({ required: true })
  fileUrl: string;

  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ default: 0 })
  fileSize: number;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Client', default: null })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploadedBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'DocumentTemplate', default: null })
  templateId: Types.ObjectId;

  @Prop({ default: false })
  requiresSignature: boolean;

  @Prop({ type: [Object], default: [] })
  signatories: Array<{
    userId: string;
    name: string;
    email: string;
    signedAt: Date;
    signatureUrl: string;
    status: string;
  }>;

  @Prop({ default: null })
  sentAt: Date;

  @Prop({ default: null })
  expiresAt: Date;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const DocumentFileSchema = SchemaFactory.createForClass(DocumentFile);
