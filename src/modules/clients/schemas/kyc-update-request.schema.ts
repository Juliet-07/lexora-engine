import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type KycUpdateRequestDocument = KycUpdateRequest & Document;

export enum KycUpdateStatus {
  REQUESTED = 'requested',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

// Real, standalone record of a single periodic KYC refresh cycle for
// an already-active client — e.g. a 6-monthly or annual review where
// a few details may have changed. Deliberately separate from
// OnboardingSubmission (which is the one-time, unique original
// record): a client can go through many of these over their
// lifetime, and each one should remain a real, auditable event on
// its own rather than overwriting history. Never touches the
// client's active kycStatus — they keep normal portal access
// throughout.
@Schema({ timestamps: true, collection: 'kyc_update_requests' })
export class KycUpdateRequest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ enum: KycUpdateStatus, default: KycUpdateStatus.REQUESTED })
  status: KycUpdateStatus;

  // What the tenant is asking the client to refresh — free text, plus
  // an optional list of specific sections/fields as a hint.
  @Prop({ required: true })
  message: string;

  @Prop({ type: [String], default: [] })
  requestedSections: string[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  requestedBy: Types.ObjectId;

  @Prop({ default: () => new Date() })
  requestedAt: Date;

  // A real, pre-filled snapshot of the client's current approved
  // data at request time — the client edits from this rather than
  // starting blank, since most fields likely haven't changed.
  @Prop({ type: Object, default: {} })
  snapshotData: Record<string, any>;

  @Prop({ type: [Object], default: [] })
  snapshotDocuments: Array<{
    name: string;
    category: string;
    url: string;
    mimeType?: string;
    size?: number;
    description?: string;
    uploadedAt: Date;
  }>;

  // The client's actual submission — starts as a copy of the
  // snapshot (via save) and is edited/submitted from there.
  @Prop({ type: Object, default: {} })
  formData: Record<string, any>;

  @Prop({ type: [Object], default: [] })
  documents: Array<{
    name: string;
    category: string;
    url: string;
    mimeType?: string;
    size?: number;
    description?: string;
    uploadedAt: Date;
  }>;

  @Prop({ default: null }) lastSavedAt: Date;
  @Prop({ default: null }) submittedAt: Date;
  @Prop({ default: null }) reviewedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reviewedBy: Types.ObjectId;

  @Prop({ default: null })
  rejectionReason: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const KycUpdateRequestSchema =
  SchemaFactory.createForClass(KycUpdateRequest);
