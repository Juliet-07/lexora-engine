import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ─── Tenant's uploaded engagement document ───────────────────
export type EngagementLetterDocument = EngagementLetter & Document;

@Schema({ timestamps: true, collection: 'engagement_letters' })
export class EngagementLetter {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  tenantId: Types.ObjectId;

  // Type of document the tenant uploaded
  @Prop({
    required: true,
    enum: ['engagement_letter', 'terms_and_agreement'],
  })
  documentType: 'engagement_letter' | 'terms_and_agreement';

  // Display title e.g. "Terms of Engagement & Client Authorization"
  @Prop({ required: true })
  title: string;

  // Path on disk: /uploads/engagement/filename.pdf
  @Prop({ required: true })
  filePath: string;

  // Original filename the tenant uploaded
  @Prop({ required: true })
  originalFileName: string;

  // File size in bytes
  @Prop({ default: 0 })
  fileSize: number;

  // Version increments on each re-upload
  @Prop({ default: 1 })
  version: number;

  // If true — tenant has explicitly chosen to skip the signing requirement.
  // This must be a conscious decision, not a default.
  @Prop({ default: false })
  bypassSigning: boolean;

  @Prop({ default: true })
  isActive: boolean;
}

export const EngagementLetterSchema =
  SchemaFactory.createForClass(EngagementLetter);

// ─── Per-client signing record ────────────────────────────────
export type ClientEngagementSigningDocument = ClientEngagementSigning &
  Document;

@Schema({ timestamps: true, collection: 'engagement_signings' })
export class ClientEngagementSigning {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'EngagementLetter', required: true })
  letterId: Types.ObjectId;

  // Version of the letter at the time of signing
  @Prop({ required: true })
  letterVersion: number;

  // Secure one-time token sent via email link
  @Prop({ required: true, unique: true })
  signingToken: string;

  @Prop({ required: true })
  tokenExpiresAt: Date;

  @Prop({
    default: 'pending',
    enum: ['pending', 'signed', 'expired'],
  })
  status: string;

  // Captured at signing
  @Prop({ default: null })
  signedAt: Date | null;

  @Prop({ default: null })
  signedByName: string | null;

  @Prop({ default: null })
  signedIpAddress: string | null;

  @Prop({ default: null })
  signedCertificatePath: string | null;

  @Prop({ type: [Number], default: [] })
  remindersSent: number[];
}

export const ClientEngagementSigningSchema = SchemaFactory.createForClass(
  ClientEngagementSigning,
);
