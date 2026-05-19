import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RiskRuleDocument = RiskRule & Document;

export enum RuleType {
  TRANSACTION  = 'transaction',   // e.g. amount > 10000
  CLIENT       = 'client',        // e.g. nationality == 'IR'
  BEHAVIORAL   = 'behavioral',    // e.g. >5 transactions in 24h
}

export enum RuleCondition {
  GREATER_THAN     = 'greater_than',
  LESS_THAN        = 'less_than',
  EQUALS           = 'equals',
  NOT_EQUALS       = 'not_equals',
  CONTAINS         = 'contains',
  IN_LIST          = 'in_list',
}

export enum RuleAction {
  FLAG_HIGH        = 'flag_high',
  FLAG_MEDIUM      = 'flag_medium',
  FLAG_LOW         = 'flag_low',
  CREATE_ALERT     = 'create_alert',
  BLOCK            = 'block',
}

@Schema({ timestamps: true, collection: 'risk_rules_tenant' })
export class RiskRule {
  // null = created by SuperAdmin (global), ObjectId = created by tenant
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  tenantId: Types.ObjectId | null;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: String, enum: RuleType, required: true })
  ruleType: RuleType;

  @Prop({ required: true })
  field: string; // e.g. 'amount', 'country', 'transactionCount'

  @Prop({ type: String, enum: RuleCondition, required: true })
  condition: RuleCondition;

  @Prop({ required: true })
  value: string; // threshold value as string (cast on evaluation)

  @Prop({ type: String, enum: RuleAction, required: true })
  action: RuleAction;

  @Prop({ default: true })
  isActive: boolean;

  // Who created it — SuperAdmin id or Tenant id
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
}

export const RiskRuleSchema = SchemaFactory.createForClass(RiskRule);
