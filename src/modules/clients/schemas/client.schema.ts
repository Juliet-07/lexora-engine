import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClientDocument = Client & Document;

export enum ClientStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
  SUSPENDED = 'suspended',
  ONBOARDING = 'onboarding',
}

export enum ClientType {
  INDIVIDUAL = 'individual',
  CORPORATE = 'corporate',
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

@Schema({ timestamps: true })
export class Client {
  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ trim: true })
  lastName: string;

  @Prop({ trim: true })
  companyName: string;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ trim: true })
  phone: string;

  @Prop({ enum: ClientType, default: ClientType.INDIVIDUAL })
  type: ClientType;

  @Prop({ enum: ClientStatus, default: ClientStatus.ONBOARDING })
  status: ClientStatus;

  @Prop({ enum: RiskLevel, default: RiskLevel.LOW })
  riskLevel: RiskLevel;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedTo: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  address: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };

  @Prop({ type: Object, default: {} })
  profile: {
    dateOfBirth: Date;
    nationality: string;
    idNumber: string;
    idType: string;
    occupation: string;
    income: number;
    sourceOfFunds: string;
  };

  @Prop({ default: null })
  onboardedAt: Date;

  @Prop({ default: null })
  kycStatus: string;

  @Prop({ default: null })
  lastActivityAt: Date;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const ClientSchema = SchemaFactory.createForClass(Client);
