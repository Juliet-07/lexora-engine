import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── Messages (client communications thread) ─────────────────────

export type MandateMessageDocument = MandateMessage & Document;

export enum MessageDirection {
  TENANT = 'tenant',
  CLIENT = 'client',
}

@Schema({ timestamps: true, collection: 'crm_mandate_messages' })
export class MandateMessage {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Mandate', required: true, index: true })
  mandateId: Types.ObjectId;

  @Prop({ enum: MessageDirection, required: true })
  direction: MessageDirection;
  @Prop({ required: true }) author: string;
  @Prop({ required: true }) body: string;
}
export const MandateMessageSchema =
  SchemaFactory.createForClass(MandateMessage);

// ── Notes (internal only) ────────────────────────────────────────

export type MandateNoteDocument = MandateNote & Document;

@Schema({ timestamps: true, collection: 'crm_mandate_notes' })
export class MandateNote {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Mandate', required: true, index: true })
  mandateId: Types.ObjectId;

  @Prop({ required: true }) author: string;
  @Prop({ required: true }) body: string;
}
export const MandateNoteSchema = SchemaFactory.createForClass(MandateNote);

// ── Documents (folder-first, real uploads) ───────────────────────

export type MandateDocumentDocument = MandateDocumentEntry & Document;

export enum ClientDocStatus {
  PENDING = 'pending',
  FILED = 'filed',
}

export const DEFAULT_MANDATE_FOLDERS = [
  'Engagement letter',
  'Filings',
  'Correspondence',
  'Client submissions',
];

@Schema({ timestamps: true, collection: 'crm_mandate_documents' })
export class MandateDocumentEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Mandate', required: true, index: true })
  mandateId: Types.ObjectId;

  @Prop({ required: true }) folder: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) fileUrl: string;
  @Prop({ default: 0 }) size: number;
  @Prop({ default: '' }) mimeType: string;
  @Prop({ default: '' }) uploadedBy: string;

  // Set when a client uploads via the portal rather than a tenant
  // user uploading directly — drives the "Received from client"
  // inbox and Accept & file flow.
  @Prop({ default: false }) fromClient: boolean;
  @Prop({ enum: ClientDocStatus, default: null })
  status: ClientDocStatus | null;
}
export const MandateDocumentSchema =
  SchemaFactory.createForClass(MandateDocumentEntry);
