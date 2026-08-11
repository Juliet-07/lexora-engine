import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClientCommercialDocument = ClientCommercial & Document;

export enum ClientRisk {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
}

export enum FeeTier {
  TIER_1 = 'Tier 1',
  TIER_2 = 'Tier 2',
  TIER_3 = 'Tier 3',
}

// Commercial / relationship parameters layered on top of a real KYC
// client (ClientProfileRecord / User with UserType.CLIENT). KYC owns
// identity, risk screening and onboarding; this owns who manages the
// relationship, which service lines are sold, the SLA profile that
// governs response times, and the commercials. Deliberately separate
// from ClientPipelineRecord, which tracks Active/Retained/Past
// lifecycle status from lead conversion onward — a different concern
// that happens to apply to the same client.
@Schema({ timestamps: true, collection: 'crm_client_commercials' })
export class ClientCommercial {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // The real, KYC-onboarded client this profile belongs to.
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientUserId: Types.ObjectId;

  // Free text, not a hard reference — matches the confirmed prototype
  // exactly: an employee picked from HR's list, or typed directly if
  // HR has no employees yet. Either way what's stored is a name.
  @Prop({ default: '' }) relationshipManager: string;

  @Prop({ type: [String], default: [] }) serviceLines: string[];
  @Prop({ enum: ClientRisk, default: ClientRisk.LOW }) riskRating: ClientRisk;
  @Prop({ enum: FeeTier, default: FeeTier.TIER_3 }) feeTier: FeeTier;

  @Prop({ type: Types.ObjectId, ref: 'SlaProfile', default: null })
  slaProfileId: Types.ObjectId | null;

  @Prop({ default: 0 }) revenueYtd: number;
  @Prop({ default: 0 }) costYtd: number;
  @Prop({ default: 'USD' }) currency: string;

  @Prop({ default: 0, min: 0, max: 5 }) satisfaction: number;
  @Prop({ default: 0 }) openTickets: number;
  @Prop({ default: 30 }) invoiceDaysAvg: number;
  @Prop({ default: null }) lastInteraction: Date | null;

  @Prop({ default: '' }) notes: string;
}
export const ClientCommercialSchema =
  SchemaFactory.createForClass(ClientCommercial);
ClientCommercialSchema.index(
  { tenantId: 1, clientUserId: 1 },
  { unique: true },
);
