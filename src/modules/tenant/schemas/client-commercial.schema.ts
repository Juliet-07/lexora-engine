import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum CommercialRiskRating {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
}

export enum FeeTier {
  TIER_1 = 'Tier 1',
  TIER_2 = 'Tier 2',
  TIER_3 = 'Tier 3',
}

export type ClientCommercialDocument = ClientCommercialRecord & Document;

// Real, backend-persisted relationship/commercial data for a client —
// distinct from the KYC profile, which owns identity, risk
// screening and onboarding. This is what a relationship manager
// tracks: which services are sold, the fee arrangement, revenue and
// cost, and their own read on how the relationship is going. One
// real record per client, entered and updated by tenant staff —
// never fabricated or defaulted to a fake number.
@Schema({ timestamps: true, collection: 'client_commercial_records' })
export class ClientCommercialRecord {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  clientId: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  serviceLines: string[];

  // Commercial/relationship risk — a real, separate judgment from
  // KYC's compliance risk rating (a client can be low compliance
  // risk but a difficult commercial relationship, or vice versa).
  @Prop({ enum: CommercialRiskRating, default: null })
  riskRating: CommercialRiskRating | null;

  @Prop({ enum: FeeTier, default: null })
  feeTier: FeeTier | null;

  // Free text — no separate SLA-profile management entity exists
  // yet, so this stores whichever profile name staff select from
  // the shared list on the frontend.
  @Prop({ default: '' })
  slaProfileId: string;

  @Prop({ default: 0 })
  revenueYtd: number;

  @Prop({ default: 0 })
  costYtd: number;

  @Prop({ default: 'USD' })
  currency: string;

  // 0–5 CSAT — a real, manually-recorded assessment by the
  // relationship manager (e.g. after a call or QBR), not an
  // automated survey score, since no client-facing survey mechanism
  // exists in this app.
  @Prop({ default: null, min: 0, max: 5 })
  satisfaction: number | null;

  @Prop({ default: '' })
  notes: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  updatedBy: Types.ObjectId | null;
}

export const ClientCommercialSchema = SchemaFactory.createForClass(
  ClientCommercialRecord,
);
