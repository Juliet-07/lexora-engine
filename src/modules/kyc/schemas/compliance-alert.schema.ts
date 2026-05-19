import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ComplianceAlertDocument = ComplianceAlert & Document;

export enum AlertType {
  SANCTIONS_HIT    = 'sanctions_hit',
  PEP_MATCH        = 'pep_match',
  ADVERSE_MEDIA    = 'adverse_media',
  HIGH_RISK_CLIENT = 'high_risk_client',
  REVIEW_OVERDUE   = 'review_overdue',
  UBO_FLAGGED      = 'ubo_flagged',
  TRANSACTION_FLAG = 'transaction_flag',
  WATCHLIST_HIT    = 'watchlist_hit',
  MANUAL           = 'manual',
}

export enum AlertSeverity {
  LOW      = 'low',
  MEDIUM   = 'medium',
  HIGH     = 'high',
  CRITICAL = 'critical',
}

export enum AlertStatus {
  OPEN      = 'open',
  REVIEWED  = 'reviewed',
  DISMISSED = 'dismissed',
  ESCALATED = 'escalated',
}

@Schema({ timestamps: true, collection: 'compliance_alerts' })
export class ComplianceAlert {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  clientId: Types.ObjectId | null;

  @Prop({ type: String, enum: AlertType, required: true })
  type: AlertType;

  @Prop({ type: String, enum: AlertSeverity, required: true })
  severity: AlertSeverity;

  @Prop({ type: String, enum: AlertStatus, default: AlertStatus.OPEN })
  status: AlertStatus;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: Object, default: null })
  metadata: Record<string, any> | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reviewedBy: Types.ObjectId | null;

  @Prop({ default: null })
  reviewedAt: Date | null;

  @Prop({ default: null })
  reviewNote: string | null;
}

export const ComplianceAlertSchema =
  SchemaFactory.createForClass(ComplianceAlert);
