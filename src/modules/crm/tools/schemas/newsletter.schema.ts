import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── Segments — real client targeting, either a manual list of real
// User (client) ids or a rule evaluated live against real client
// fields at resolution time. Membership is never stored — it's
// always resolved fresh, so a rule-based segment can't drift from
// what clients actually look like today. ─────────────────────────

export enum SegmentMode {
  MANUAL = 'manual',
  RULE = 'rule',
}
export enum SegmentRuleField {
  CLASSIFICATION = 'classification',
  RISK_LEVEL = 'riskLevel',
  STATUS = 'status',
}

@Schema({ _id: false })
export class SegmentRule {
  @Prop({ enum: SegmentRuleField, required: true }) field: SegmentRuleField;
  @Prop({ required: true }) value: string;
}
export const SegmentRuleSchema = SchemaFactory.createForClass(SegmentRule);

export type SegmentDocument = Segment & Document;

@Schema({ timestamps: true, collection: 'crm_tools_segments' })
export class Segment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: '' }) description: string;
  @Prop({ enum: SegmentMode, required: true }) mode: SegmentMode;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  memberIds: Types.ObjectId[];
  @Prop({ type: SegmentRuleSchema, default: null })
  rule: SegmentRule | null;
}
export const SegmentSchema = SchemaFactory.createForClass(Segment);

// ── Campaigns — a real email send to a real segment's real members,
// snapshotted at creation time so a later change to segment
// membership doesn't retroactively alter who a campaign says it
// went to. Delivered reflects whether SMTP actually accepted the
// send; opened now also carries a second, real meaning — see
// CampaignRecipient below. Clicked/RSVP'd are honestly left false —
// no email provider with click tracking is connected here. ────────

export enum CampaignType {
  NEWSLETTER = 'Newsletter',
  EVENT_INVITE = 'Event invite',
}
export enum CampaignStatus {
  DRAFT = 'Draft',
  SCHEDULED = 'Scheduled',
  SENDING = 'Sending',
  SENT = 'Sent',
}

@Schema({ _id: false })
export class CampaignEventDetails {
  @Prop({ default: '' }) title: string;
  @Prop({ default: '' }) dateTime: string;
  @Prop({ default: '' }) location: string;
  @Prop({ default: true }) rsvp: boolean;
}
export const CampaignEventDetailsSchema =
  SchemaFactory.createForClass(CampaignEventDetails);

@Schema({ _id: false })
export class CampaignRecipient {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientId: Types.ObjectId;
  @Prop({ required: true }) clientName: string;
  @Prop({ required: true }) email: string;

  @Prop({ default: false }) delivered: boolean;
  @Prop({ default: null }) deliveryError: string | null;
  // Real signal, but not from email-open-pixel tracking (no
  // provider for that is connected) — set true when this client
  // actually views the campaign in their own client portal. See
  // ClientNewsletterService.markOpenedByClient.
  @Prop({ default: false }) opened: boolean;
  // Honestly always false — no click-tracking-capable email
  // provider is connected, and nothing in-portal can observe this
  // the way portal views can observe "opened".
  @Prop({ default: false }) clicked: boolean;
  @Prop({ default: false }) rsvped: boolean;
}
export const CampaignRecipientSchema =
  SchemaFactory.createForClass(CampaignRecipient);

export type CampaignDocument = Campaign & Document;

@Schema({ timestamps: true, collection: 'crm_tools_campaigns' })
export class Campaign {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ enum: CampaignType, required: true }) type: CampaignType;

  @Prop({ type: Types.ObjectId, ref: 'Segment', required: true })
  segmentId: Types.ObjectId;
  @Prop({ required: true }) segmentName: string;

  @Prop({ default: '' }) subject: string;
  @Prop({ default: '' }) body: string;
  @Prop({ type: CampaignEventDetailsSchema, default: null })
  event: CampaignEventDetails | null;

  @Prop({ enum: CampaignStatus, default: CampaignStatus.DRAFT, index: true })
  status: CampaignStatus;
  @Prop({ default: null }) scheduledAt: Date | null;
  @Prop({ default: null }) sentAt: Date | null;

  // Real snapshot at creation time — see class comment.
  @Prop({ type: [CampaignRecipientSchema], default: [] })
  recipients: CampaignRecipient[];
}
export const CampaignSchema = SchemaFactory.createForClass(Campaign);

// ── Newsletter drafts — real, mechanical composition from actual
// GRC regulatory change entries. No AI/LLM summarisation is wired
// up here; this assembles a real draft from real title/summary/
// regulator/published-date fields, not a generated narrative. ─────

export type NewsletterDraftDocument = NewsletterDraft & Document;

@Schema({ timestamps: true, collection: 'crm_tools_newsletter_drafts' })
export class NewsletterDraft {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) title: string;
  @Prop({ required: true }) source: string;
  @Prop({ required: true }) body: string;
  @Prop({ required: true }) generatedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'Campaign', default: null })
  convertedToCampaignId: Types.ObjectId | null;

  // Real regulatory change ids this draft was composed from — so a
  // later generation run can skip entries already covered rather
  // than repeating them.
  @Prop({ type: [Types.ObjectId], ref: 'RegulatoryChange', default: [] })
  sourceChangeIds: Types.ObjectId[];
}
export const NewsletterDraftSchema =
  SchemaFactory.createForClass(NewsletterDraft);
