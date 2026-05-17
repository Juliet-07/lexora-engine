import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ClientClassification } from '../../../common/interfaces/user-role.enum';

export type ClientProfileDocument = ClientProfileRecord & Document;

/**
 * ClientProfile — stores the extended profile data for a client.
 * The core user account (email, password, name, roles) lives in the
 * users collection. This collection holds the business/compliance profile.
 */
@Schema({ timestamps: true, collection: 'client_profiles' })
export class ClientProfileRecord {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedTo: Types.ObjectId;

  @Prop({ type: String, enum: ClientClassification, default: null })
  classifications: ClientClassification;

  @Prop({ type: Date, default: null })
  verificationCompletedAt: Date | null;

  @Prop({ type: Object, default: null })
  verificationResults: Record<string, any> | null;

  // ── Address ──────────────────────────────────────────────
  @Prop({ type: Object, default: {} })
  address: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };

  // ── Individual-specific fields ────────────────────────────
  @Prop({ type: Object, default: null })
  individualProfile: {
    dateOfBirth: Date;
    nationality: string;
    idType: string;
    idNumber: string;
    occupation: string;
    employer: string;
    sourceOfFunds: string;
    annualIncome: number;
  };

  // ── Corporate / Trust / Partner fields ───────────────────
  @Prop({ type: Object, default: null })
  entityProfile: {
    companyName: string;
    companyRegistrationNumber: string;
    incorporationCountry: string;
    incorporationDate: Date;
    industry: string;
    taxId: string;
    trustDeedNumber: string;
    trustType: string;
    sourceOfFunds: string;
    annualTurnover: number;
  };

  // ── PEP / Compliance flags ────────────────────────────────
  @Prop({ default: false })
  isPoliticallyExposed: boolean;

  @Prop({ default: null })
  pepDetails: string;

  // ── KYC status (updated by KYC module) ───────────────────
  @Prop({
    default: 'not_started',
    enum: [
      'not_started',
      'in_progress',
      'submitted',
      'approved',
      'rejected',
      'expired',
    ],
  })
  kycStatus: string;

  @Prop({ default: null })
  kycCompletedAt: Date;

  // ── Risk level (updated by compliance module) ─────────────
  @Prop({
    default: 'unrated',
    enum: ['unrated', 'low', 'medium', 'high', 'critical'],
  })
  riskLevel: string;

  // ── Profile completion tracking ───────────────────────────
  @Prop({ default: 0 })
  profileCompletionPercent: number;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const ClientProfileSchema =
  SchemaFactory.createForClass(ClientProfileRecord);
