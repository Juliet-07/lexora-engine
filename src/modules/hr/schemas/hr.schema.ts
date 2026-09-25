import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type HrTeamDocument = HrTeam & Document;
export type HrLocationDocument = HrLocation & Document;

@Schema({ timestamps: true, collection: 'hr_teams' })
export class HrTeam {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: null })
  description: string | null;

  // @Prop({ default: null })
  // lead: string | null;

  @Prop({ default: true })
  isActive: boolean;

  // The tenant's designated Audit team — at most one team per tenant.
  // GRC's Audit Management module auto-assigns this team (its Head of
  // Department as lead auditor) to every Internal audit engagement, so
  // a tenant must flag one team here before creating an internal
  // engagement. Enforced (only one true at a time) in
  // EmployeeService.updateTeam.
  @Prop({ default: false })
  isAuditTeam: boolean;
}

export const HrTeamSchema = SchemaFactory.createForClass(HrTeam);

@Schema({ timestamps: true, collection: 'hr_locations' })
export class HrLocation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string; // e.g. "Lagos HQ", "Kigali Office", "Remote — EMEA"

  @Prop({ required: true, trim: true })
  country: string;

  @Prop({ default: null })
  city: string | null;

  @Prop({ default: null })
  address: string | null;

  @Prop({ default: null })
  timezone: string | null; // e.g. "Africa/Lagos" — used for attendance late detection

  @Prop({ default: true })
  isActive: boolean;
}

export const HrLocationSchema = SchemaFactory.createForClass(HrLocation);
