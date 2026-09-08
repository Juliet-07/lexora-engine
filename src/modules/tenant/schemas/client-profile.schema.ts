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

  // ── Ex-client — a real, separate record of a relationship that
  // has ended, distinct from User.status (which already carries a
  // different meaning for "inactive" — a client rejected during
  // onboarding, reactivated back into the onboarding flow). Marking
  // someone an ex-client never touches that lifecycle or deletes
  // anything; it's purely "no longer an active engagement, but every
  // record stays retrievable."
  @Prop({ default: false, index: true })
  isExClient: boolean;

  @Prop({ default: null })
  exClientAt: Date | null;

  @Prop({ default: '' })
  exClientReason: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  exClientMarkedBy: Types.ObjectId | null;

  // Real snapshot of the commercial relationship at the moment of
  // archiving — captured here (rather than only read live from the
  // commercial record) since that record can change or be removed
  // later, and the ex-client history should stay accurate to how
  // things stood when the relationship actually ended.
  @Prop({ default: null })
  exClientRelationshipFrom: Date | null;

  @Prop({ default: null })
  exClientRelationshipTo: Date | null;

  @Prop({ default: 0 })
  exClientLifetimeRevenue: number;

  @Prop({ default: 'USD' })
  exClientCurrency: string;

  @Prop({ default: '' })
  exClientRelationshipManager: string;

  @Prop({ type: [String], default: [] })
  exClientServiceLines: string[];

  @Prop({ default: '' })
  exClientNotes: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const ClientProfileSchema =
  SchemaFactory.createForClass(ClientProfileRecord);
