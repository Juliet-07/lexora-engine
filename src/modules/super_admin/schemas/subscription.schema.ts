import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  SubscriptionPlan,
  SubscriptionStatus,
  PlatformModuleKey,
} from '../../../common/interfaces/user-role.enum';

export type SubscriptionPlanDocument = SubscriptionPlanConfig & Document;
export type TenantSubscriptionDocument = TenantSubscription & Document;

// ── Plan Configuration (created by SuperAdmin) ────────────────
@Schema({ timestamps: true })
export class SubscriptionPlanConfig {
  @Prop({ required: true, unique: true, enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description: string;

  // Modules included in this plan
  @Prop({ type: [String], enum: PlatformModuleKey, default: [] })
  includedModules: PlatformModuleKey[];

  @Prop({ default: 0 })
  priceMonthly: number;

  @Prop({ default: 0 })
  priceAnnually: number;

  @Prop({ default: 'USD' })
  currency: string;

  // Limits
  @Prop({ default: 5 })
  maxUsers: number;

  @Prop({ default: 100 })
  maxClients: number;

  @Prop({ default: 10 })
  maxStorageGb: number;

  // Feature flags
  @Prop({ type: Object, default: {} })
  features: {
    apiAccess: boolean;
    customBranding: boolean;
    prioritySupport: boolean;
    ssoEnabled: boolean;
    auditLogs: boolean;
    webhooks: boolean;
  };

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isCustom: boolean;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const SubscriptionPlanConfigSchema = SchemaFactory.createForClass(
  SubscriptionPlanConfig,
);

// ── Tenant Subscription (instance per tenant) ─────────────────
@Schema({ timestamps: true })
export class TenantSubscription {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @Prop({ enum: SubscriptionStatus, default: SubscriptionStatus.TRIAL })
  status: SubscriptionStatus;

  // Base modules from plan
  @Prop({ type: [String], enum: PlatformModuleKey, default: [] })
  baseModules: PlatformModuleKey[];

  // Add-on modules purchased on top of plan
  @Prop({ type: [String], enum: PlatformModuleKey, default: [] })
  addonModules: PlatformModuleKey[];

  // All accessible modules = baseModules + addonModules
  @Prop({ type: [String], enum: PlatformModuleKey, default: [] })
  activeModules: PlatformModuleKey[];

  @Prop({ default: null })
  trialEndsAt: Date;

  @Prop({ default: null })
  currentPeriodStart: Date;

  @Prop({ default: null })
  currentPeriodEnd: Date;

  @Prop({ default: null })
  cancelledAt: Date;

  // Overrides (SuperAdmin can override limits per tenant)
  @Prop({ default: null })
  maxUsersOverride: number;

  @Prop({ default: null })
  maxClientsOverride: number;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedBy: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const TenantSubscriptionSchema =
  SchemaFactory.createForClass(TenantSubscription);
