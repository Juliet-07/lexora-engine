import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type KycRecordDocument = KycRecord & Document;

export enum KycStatus {
  PENDING = 'pending',
  IN_REVIEW = 'in_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  REQUIRES_UPDATE = 'requires_update',
}

export enum VerificationLevel {
  BASIC = 'basic',
  STANDARD = 'standard',
  ENHANCED = 'enhanced',
}

@Schema({ timestamps: true })
export class KycRecord {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ enum: KycStatus, default: KycStatus.PENDING })
  status: KycStatus;

  @Prop({ enum: VerificationLevel, default: VerificationLevel.STANDARD })
  verificationLevel: VerificationLevel;

  @Prop({ type: Object, default: {} })
  personalInfo: {
    fullName: string;
    dateOfBirth: Date;
    nationality: string;
    placeOfBirth: string;
    taxId: string;
  };

  @Prop({ type: Object, default: {} })
  identityDocument: {
    type: string;
    number: string;
    issuedBy: string;
    issuedDate: Date;
    expiryDate: Date;
    frontImageUrl: string;
    backImageUrl: string;
  };

  @Prop({ type: Object, default: {} })
  addressInfo: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    proofDocumentUrl: string;
  };

  @Prop({ type: Object, default: {} })
  financialInfo: {
    sourceOfFunds: string;
    annualIncome: number;
    netWorth: number;
    occupation: string;
    employer: string;
    politicallyExposed: boolean;
    pepDetails: string;
  };

  @Prop({ type: Number, default: 0 })
  riskScore: number;

  @Prop({ default: null })
  reviewedBy: string;

  @Prop({ default: null })
  reviewedAt: Date;

  @Prop({ default: null })
  rejectionReason: string;

  @Prop({ default: null })
  expiresAt: Date;

  @Prop({ type: [Object], default: [] })
  auditTrail: Array<{
    action: string;
    performedBy: string;
    timestamp: Date;
    notes: string;
  }>;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const KycRecordSchema = SchemaFactory.createForClass(KycRecord);
