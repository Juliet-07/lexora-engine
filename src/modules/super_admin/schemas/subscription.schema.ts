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

  // Every module the tenant's plan grants — since every plan now
  // includes every real platform module, this is always the full
  // set, kept as its own field for a clear audit trail of "what the
  // plan itself grants" versus what's actually switched on below.
  @Prop({ type: [String], enum: PlatformModuleKey, default: [] })
  baseModules: PlatformModuleKey[];

  // The real, independently-settable per-tenant toggle. Defaults to
  // baseModules (everything on), but the super admin can switch
  // specific modules off for one tenant without touching any other
  // tenant or the plan itself — this is what every module-gated
  // route actually checks, not baseModules.
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

  // Override (SuperAdmin can override the plan's user limit per tenant)
  @Prop({ default: null })
  maxUsersOverride: number;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedBy: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const TenantSubscriptionSchema =
  SchemaFactory.createForClass(TenantSubscription);
