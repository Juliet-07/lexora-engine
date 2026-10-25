import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── Tenant email footer + newsletter unsubscribes (Oct 2026) ───────
// Two small records that sit under every email a tenant sends from
// CRM → Tools (newsletters, alerts and event emails):
//
//   NewsletterSettings    one per tenant — the social links and
//                         postal address shown at the bottom of
//                         those emails.
//   NewsletterUnsubscribe one per (tenant, email) — someone who used
//                         the unsubscribe link. Keyed by EMAIL, not
//                         by Contact id, so it holds whether the
//                         person is a contact, a client or a board
//                         member, and survives the contact record
//                         being edited, merged or re-created. It is
//                         the single source of truth: segments,
//                         sends and the pickers all read it.
// ───────────────────────────────────────────────────────────────

export const SOCIAL_LINK_KEYS = [
  'website',
  'linkedin',
  'x',
  'facebook',
  'instagram',
  'youtube',
] as const;
export type SocialLinkKey = (typeof SOCIAL_LINK_KEYS)[number];

export type NewsletterSettingsDocument = NewsletterSettings & Document;

@Schema({ timestamps: true, collection: 'crm_tools_newsletter_settings' })
export class NewsletterSettings {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  tenantId: Types.ObjectId;

  // Empty string = not set. Stored as plain https URLs.
  @Prop({ default: '' }) website: string;
  @Prop({ default: '' }) linkedin: string;
  @Prop({ default: '' }) x: string;
  @Prop({ default: '' }) facebook: string;
  @Prop({ default: '' }) instagram: string;
  @Prop({ default: '' }) youtube: string;

  // Postal address line shown under the links (most anti-spam rules
  // expect a sender address on marketing email).
  @Prop({ default: '' }) address: string;
}
export const NewsletterSettingsSchema =
  SchemaFactory.createForClass(NewsletterSettings);

export type NewsletterUnsubscribeDocument = NewsletterUnsubscribe & Document;

@Schema({ timestamps: true, collection: 'crm_tools_newsletter_unsubscribes' })
export class NewsletterUnsubscribe {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // Always stored lower-cased and trimmed.
  @Prop({ required: true, lowercase: true, trim: true }) email: string;

  // Best-known display name at the time (contact/client/board name).
  @Prop({ default: '' }) name: string;
  // 'Contact' | 'Client' | 'Board member' | '' — informational only.
  @Prop({ default: '' }) role: string;
  @Prop({ default: '' }) reason: string;
  @Prop({ default: () => new Date() }) unsubscribedAt: Date;
}
export const NewsletterUnsubscribeSchema = SchemaFactory.createForClass(
  NewsletterUnsubscribe,
);
NewsletterUnsubscribeSchema.index({ tenantId: 1, email: 1 }, { unique: true });
