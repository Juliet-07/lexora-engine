import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SlaProfileDocument = SlaProfile & Document;

export enum SlaTier {
  PREMIUM = 'Premium',
  STANDARD = 'Standard',
  BASIC = 'Basic',
}

// One matrix entry per priority — matches the confirmed prototype's
// Record<"Critical"|"High"|"Medium"|"Low", number> exactly, just as
// a real subdocument instead of a loose object.
@Schema({ _id: false })
export class SlaHours {
  @Prop({ required: true, default: 0 }) Critical: number;
  @Prop({ required: true, default: 0 }) High: number;
  @Prop({ required: true, default: 0 }) Medium: number;
  @Prop({ required: true, default: 0 }) Low: number;
}
export const SlaHoursSchema = SchemaFactory.createForClass(SlaHours);

// No `clients` array here — which clients are covered is derived
// from ClientCommercialProfile.slaProfileId at read time, not stored
// on the profile itself. Storing both would just be two copies of
// the same fact going out of sync with each other.
@Schema({ timestamps: true, collection: 'crm_sla_profiles' })
export class SlaProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ enum: SlaTier, required: true }) tier: SlaTier;
  @Prop({ required: true, trim: true }) serviceType: string;

  @Prop({ type: SlaHoursSchema, required: true }) responseHrs: SlaHours;
  @Prop({ type: SlaHoursSchema, required: true }) resolutionHrs: SlaHours;

  @Prop({ default: '' }) escalations: string;
}
export const SlaProfileSchema = SchemaFactory.createForClass(SlaProfile);
