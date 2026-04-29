import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OrganizationDocument = Organization & Document;

export enum OrgStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

export enum PlanType {
  FREE = 'free',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

@Schema({ timestamps: true })
export class Organization {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ trim: true })
  description: string;

  @Prop({ trim: true })
  website: string;

  @Prop({ trim: true })
  industry: string;

  @Prop({ type: Object, default: {} })
  address: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };

  @Prop({ trim: true })
  phone: string;

  @Prop({ trim: true })
  email: string;

  @Prop({ trim: true })
  logoUrl: string;

  @Prop({ enum: OrgStatus, default: OrgStatus.PENDING })
  status: OrgStatus;

  @Prop({ enum: PlanType, default: PlanType.FREE })
  plan: PlanType;

  @Prop({ default: null })
  planExpiresAt: Date;

  @Prop({ default: 5 })
  maxUsers: number;

  @Prop({ type: Object, default: {} })
  settings: Record<string, any>;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
