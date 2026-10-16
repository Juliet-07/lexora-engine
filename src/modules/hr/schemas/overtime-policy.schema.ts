import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OvertimePolicyDocument = OvertimePolicy & Document;

// One rate band of an overtime policy. Overtime is logged as a single
// monthly hours total (not day-by-day attendance), so "tier" here
// means a band of TOTAL overtime hours for the period, applied
// progressively like a tax bracket — e.g. a country whose labor law
// pays 1.5x for the first 8 OT hours in a month and 2x beyond that
// would be two tiers: { upToHours: 8, multiplier: 1.5 } then
// { upToHours: null, multiplier: 2 }. A flat-rate country (most
// common) just needs one open-ended tier.
@Schema({ _id: false })
export class OvertimePolicyTier {
  @Prop({ default: null })
  upToHours: number | null; // null = open-ended — must be the last tier

  @Prop({ required: true, min: 0 })
  multiplier: number;
}
export const OvertimePolicyTierSchema =
  SchemaFactory.createForClass(OvertimePolicyTier);

// Tenant-configurable overtime rule. Oct 2026 PO note: overtime rules
// differ by the country a tenant operates from, so the old hardcoded
// Rwanda-shaped defaults (40hr week / 1.5x, baked into
// EmployeeOvertimeService) are replaced by this — a policy a tenant
// sets up themselves, per location or as a tenant-wide default,
// mirroring PayrollPolicy's locationId-or-default shape. If no policy
// resolves for an employee, overtime is not calculated at all (see
// EmployeeOvertimeService#logOvertime) rather than falling back to
// any default rate.
@Schema({ timestamps: true, collection: 'hr_overtime_policies' })
export class OvertimePolicy {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // null = tenant-wide default; set = applies to one specific location.
  @Prop({ type: Types.ObjectId, ref: 'HrLocation', default: null })
  locationId: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  name: string;

  // The full-time week this policy's hourly rate is based on:
  // hourlyRate = employee.salary / (standardWeeklyHours * 52 / 12).
  @Prop({ required: true, default: 40, min: 1 })
  standardWeeklyHours: number;

  // Ascending by upToHours; the last tier's upToHours must be null
  // (enforced in OvertimePolicyService, not here).
  @Prop({ type: [OvertimePolicyTierSchema], default: [] })
  tiers: OvertimePolicyTier[];
}

export const OvertimePolicySchema =
  SchemaFactory.createForClass(OvertimePolicy);
