import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ContactDocument = Contact & Document;

export enum ContactSource {
  REFERRAL = 'Referral',
  EVENT = 'Event',
  WEB_FORM = 'Web form',
  COLD_OUTREACH = 'Cold outreach',
  PARTNER = 'Partner',
}

// Only activity types that can genuinely be logged manually today.
// The prototype's timeline also showed Mandate/Invoice/Portal
// events, but those come from modules that don't exist yet — no
// point faking events that can't really happen. Once Mandates/
// Invoicing/Documents exist, they can append entries here the same
// way a manual log does.
export enum ActivityType {
  EMAIL = 'Email',
  CALL = 'Call',
  MEETING = 'Meeting',
  DOCUMENT = 'Document',
  NOTE = 'Note',
}

@Schema({ timestamps: true })
export class ContactActivity {
  @Prop({ enum: ActivityType, required: true }) type: ActivityType;
  @Prop({ required: true }) summary: string;
  @Prop({ default: '' }) by: string;
  @Prop({ required: true, default: () => new Date() }) at: Date;
}
export const ContactActivitySchema =
  SchemaFactory.createForClass(ContactActivity);

// A plain repository of people — not linked to a formal Organisation
// or client-account entity. "Organisation" is free text the tenant
// types in, same as name or title; no KYC, no risk rating, no
// dropdown. Keep it that way even as Client Management gets built
// properly elsewhere — this page is deliberately lightweight.
@Schema({ timestamps: true, collection: 'crm_contacts' })
export class Contact {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: '' }) title: string;
  @Prop({ default: '', trim: true, index: true }) organisation: string;
  @Prop({ default: '', index: true }) email: string;
  @Prop({ default: '', index: true }) phone: string;

  @Prop({ enum: ContactSource, required: true })
  source: ContactSource;

  @Prop({ type: [String], default: [] }) tags: string[];
  // Freeform, same spirit as tags — describes this person's role at
  // their organisation (e.g. "Director", "UBO", "Finance contact")
  // rather than a general label. Kept as free text, not an enum.
  @Prop({ type: [String], default: [] }) roleTags: string[];

  @Prop({ default: '' }) owner: string;
  @Prop({ default: '' }) notes: string;

  // Set once at creation, matching the confirmed prototype — editing
  // a contact's details doesn't itself count as "contact made".
  @Prop({ required: true, default: () => new Date() })
  lastContact: Date;

  // ── Duplicate detection ─────────────────────────────────────
  // Set automatically on create/update when an existing contact in
  // the same tenant shares an email or phone number. Points at the
  // earlier record, matching the prototype's own example (a later,
  // misspelled duplicate points at the original).
  @Prop({ type: Types.ObjectId, ref: 'Contact', default: null })
  duplicateOf: Types.ObjectId | null;

  // A dismissed false-positive stays dismissed — unlike the
  // prototype's session-only dismiss state, this persists.
  @Prop({ default: false }) duplicateDismissed: boolean;

  @Prop({ type: [ContactActivitySchema], default: [] })
  activity: Types.DocumentArray<ContactActivity>;
}
export const ContactSchema = SchemaFactory.createForClass(Contact);
