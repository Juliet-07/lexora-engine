import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OvertimePolicyDocument = OvertimePolicy & Document;

// Pay multipliers by the kind of day the overtime fell on. Oct 2026
// PO note: overtime pay rules differ by day type almost everywhere —
// ordinary weekdays usually get a lower rate than weekends or public
// holidays — so this replaces a flat single-multiplier policy with
// one rate per day type, each independently settable by the tenant.
// Defaults (1.5x ordinary, 2x weekend/holiday) are a common starting
// point, not a Rwanda-specific rule — the tenant can change any of
// them.
@Schema({ _id: false })
export class OvertimePolicyRates {
  @Prop({ required: true, default: 1.5, min: 0 })
  ordinary: number; // Monday–Friday, not a flagged public holiday

  @Prop({ required: true, default: 2, min: 0 })
  weekend: number; // Saturday/Sunday, not a flagged public holiday

  @Prop({ required: true, default: 2, min: 0 })
  publicHoliday: number; // flagged as a public holiday, any day of week
}
export const OvertimePolicyRatesSchema =
  SchemaFactory.createForClass(OvertimePolicyRates);

// Tenant-configurable overtime rule. Oct 2026 PO note: overtime rules
// differ by the country a tenant operates from, so the old hardcoded
// Rwanda-shaped defaults (40hr week / flat 1.5x, baked into
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

  @Prop({ type: OvertimePolicyRatesSchema, required: true })
  rates: OvertimePolicyRates;
}

export const OvertimePolicySchema =
  SchemaFactory.createForClass(OvertimePolicy);
