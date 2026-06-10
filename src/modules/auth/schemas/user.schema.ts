import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  UserType,
  AccountStatus,
  ClientClassification,
  ClientRole,
  TenantRole,
  SuperAdminRole,
} from '../../../common/interfaces/user-role.enum';

export type UserDocument = User & Document;

// ── Embedded: Tenant profile ──────────────────────────────────
export class TenantProfile {
  @Prop({ trim: true }) businessName: string;
  @Prop({ trim: true }) industry: string;
  @Prop({ trim: true }) website: string;
  @Prop({ trim: true }) registrationNumber: string;
  @Prop({ type: Object, default: {} }) address: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  @Prop({ type: Object, default: {} }) contactPerson: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    position: string;
  };
  @Prop({ default: null }) logoUrl: string;
  @Prop({ default: null }) taxId: string;
}

// ── Embedded: Client profile ──────────────────────────────────
export class ClientProfile {
  @Prop({ type: [String], enum: ClientClassification, default: [] })
  classifications: ClientClassification;

  // Individual fields
  @Prop({ default: null }) dateOfBirth: Date;
  @Prop({ default: null }) nationality: string;
  @Prop({ default: null }) idType: string;
  @Prop({ default: null }) idNumber: string;
  @Prop({ default: null }) occupation: string;

  // Corporate/Trust/Partner fields
  @Prop({ default: null }) companyName: string;
  @Prop({ default: null }) companyRegistrationNumber: string;
  @Prop({ default: null }) incorporationCountry: string;
  @Prop({ default: null }) trustDeedNumber: string;

  @Prop({ type: Object, default: {} }) address: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  @Prop({ default: null }) sourceOfFunds: string;
  @Prop({ default: null }) annualIncome: number;
}

// ── Main User Schema ──────────────────────────────────────────
@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, enum: UserType })
  userType: UserType;

  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ default: null, trim: true })
  phone: string;

  // admin role
  @Prop()
  adminRole: string;

  // Other user roles
  @Prop({ type: [String], default: [] })
  roles: string[];

  @Prop({ enum: AccountStatus, default: AccountStatus.PENDING })
  status: AccountStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  tenantId: Types.ObjectId;

  @Prop({ type: TenantProfile, default: null })
  tenantProfile: TenantProfile;

  @Prop({ type: ClientProfile, default: null })
  clientProfile: ClientProfile;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: null })
  lastLoginAt: Date;

  @Prop({ default: null, select: false })
  passwordResetToken: string;

  @Prop({ default: null })
  passwordResetExpires: Date;

  // For tenants/clients — tracks who created them
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy: Types.ObjectId;

  // Temporary password flag — forces change on first login
  @Prop({ default: false })
  mustChangePassword: boolean;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;

  @Prop({ type: Types.ObjectId, ref: 'ClientProfileRecord', default: null })
  clientId: Types.ObjectId | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
