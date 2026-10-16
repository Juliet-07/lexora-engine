import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SuperAdminAvailabilityDocument = SuperAdminAvailability & Document;

export const WEEKDAYS = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
] as const;

@Schema({ _id: false })
export class DayAvailability {
  @Prop({ required: true, enum: WEEKDAYS }) day: string;

  @Prop({ default: false }) enabled: boolean;

  // "HH:mm" 24h slot start times — the duration that turns each one
  // into a bookable window comes from `durationMinutes` below, same
  // as the DemoRequests.tsx mock this replaces.
  @Prop({ type: [String], default: [] }) slots: string[];
}
export const DayAvailabilitySchema = SchemaFactory.createForClass(DayAvailability);

// Single global document — Lexora itself has one weekly meeting
// schedule, not one per tenant (this is the demo-booking calendar for
// prospects on the public marketing site, unrelated to any tenant's
// own calendar). The service enforces "exactly one document exists"
// rather than this schema having any natural key.
@Schema({ timestamps: true, collection: 'super_admin_availability' })
export class SuperAdminAvailability {
  @Prop({ type: [DayAvailabilitySchema], default: [] })
  days: DayAvailability[];

  @Prop({ default: 'CAT' }) timezone: string;

  @Prop({ default: 30 }) durationMinutes: number;
}
export const SuperAdminAvailabilitySchema = SchemaFactory.createForClass(
  SuperAdminAvailability,
);
