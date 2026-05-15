import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OnboardingDocument = OnboardingSubmission & Document;

export enum OnboardingStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true, collection: 'onboarding_submissions' })
export class OnboardingSubmission {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  tenantId: Types.ObjectId;

  @Prop({ enum: OnboardingStatus, default: OnboardingStatus.DRAFT })
  status: OnboardingStatus;

  @Prop({
    required: true,
    enum: ['individual', 'corporate', 'partnership', 'trust'],
  })
  clientType: string;

  // The entire form lives here as one flat object.
  // Backend merges on every save — never overwrites untouched fields.
  @Prop({ type: Object, default: {} })
  formData: Record<string, any>;

  // Azure Blob URLs only — no binary data in DB
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

  // Frontend tells us which steps are complete — drives progress bar on reload
  @Prop({ type: Object, default: {} })
  sectionCompletion: Record<string, boolean>;

  @Prop({ default: 0 })
  completionPercent: number;

  @Prop({ default: null }) submittedAt: Date;
  @Prop({ default: null }) lastSavedAt: Date;
  @Prop({ default: null }) reviewedAt: Date;
  @Prop({ default: null }) rejectionReason: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reviewedBy: Types.ObjectId;

  @Prop({ type: [Object], default: [] })
  reviewNotes: Array<{ note: string; addedBy: string; addedAt: Date }>;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const OnboardingSchema =
  SchemaFactory.createForClass(OnboardingSubmission);
