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

// Which real tenant-side audience a segment draws from. Added Oct
// 2026 alongside Contact/BoardMember support — a segment used to be
// implicitly Client-only, so `audience` defaults to Client for every
// segment created before this field existed. Rule-based resolution
// (SegmentRuleField) only exists for the Client audience today — a
// Contact/BoardMember segment is always manual (see
// SegmentService.resolveMembers), since there's no confirmed
// equivalent rule field for those two collections yet.
export enum SegmentAudience {
  CLIENT = 'Client',
  CONTACT = 'Contact',
  BOARD_MEMBER = 'BoardMember',
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

  @Prop({ enum: SegmentAudience, default: SegmentAudience.CLIENT, index: true })
  audience: SegmentAudience;

  // Ids of whichever collection `audience` names (User for Client,
  // Contact for Contact, BoardMember for BoardMember) — no single
  // `ref` since it varies by audience; resolveMembers looks each one
  // up against the right model itself.
  @Prop({ type: [Types.ObjectId], default: [] })
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

// "Event invite" was retired Oct 2026 — CRM → Tools → Event Management
// (src/pages/crm/tools/Events.tsx on the tenant) is now the one real
// place an event lives, with its own invites/registrations/check-in;
// this type no longer offers a shortcut that duplicated it. Historic
// campaigns stored with that string (if any) just read back as plain
// data — nothing here enforces the enum on read, only on write.
export enum CampaignType {
  NEWSLETTER = 'Newsletter',
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
  // Generalised Oct 2026 for Contact/BoardMember audiences —
  // `sourceType`/`sourceId` are the real identity now (set for every
  // recipient regardless of audience). `clientId` is kept, populated
  // only when sourceType is Client (same value as sourceId there),
  // purely so ClientNewsletterService's existing `recipients.clientId`
  // queries keep working unchanged for the client portal.
  @Prop({ enum: SegmentAudience, default: SegmentAudience.CLIENT })
  sourceType: SegmentAudience;
  @Prop({ type: Types.ObjectId, required: true })
  sourceId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  clientId: Types.ObjectId | null;
  // Recipient's display name — despite the field name (kept for
  // back-compat with existing stored campaigns and the tenant
  // frontend), this holds a Contact's or BoardMember's name too now.
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

  // Plural since Oct 2026 — a campaign can target several segments at
  // once (e.g. a Client segment AND a BoardMember segment in the same
  // send). Resolved recipients are the union across all of them,
  // de-duplicated by email — see CampaignService.resolveRecipients.
  @Prop({ type: [Types.ObjectId], ref: 'Segment', default: [] })
  segmentIds: Types.ObjectId[];
  @Prop({ type: [String], default: [] }) segmentNames: string[];

  @Prop({ default: '' }) subject: string;
  // Inbox preview line — only meaningful for template newsletters.
  @Prop({ default: '' }) previewText: string;
  // Rendered content. For a rich-text ("custom") newsletter this is
  // what the tenant typed; for a TEMPLATE newsletter it is the
  // rendered design (a self-contained, table-based HTML fragment),
  // regenerated from template + templateData on every save — this is
  // what the client and board portals show, so a templated
  // newsletter looks the same there as it did in the inbox.
  @Prop({ default: '' }) body: string;
  // Same four designs the SuperAdmin newsletter uses (shared
  // renderer — common/utils/newsletter). null = a plain rich-text
  // newsletter, exactly as before.
  @Prop({ type: String, default: null }) template: string | null;
  @Prop({ type: Object, default: {} }) templateData: Record<string, any>;
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

// ── Alerts — a distinct concept from Campaign: category/priority-
// driven regulatory, legal, financial, compliance and other notices
// broadcast to real segment members, with their own list, filter and
// approve-and-send workflow (per the product owner's "Alerts" tab
// design) rather than a Campaign with extra fields bolted on. Reuses
// Segment and CampaignRecipient — same real send/snapshot semantics
// as Campaign, just a different shape of content and its own send
// path (AlertService, not CampaignService). ───────────────────────

export enum AlertCategory {
  REGULATORY = 'Regulatory',
  LEGAL = 'Legal',
  FINANCIAL = 'Financial',
  COMPLIANCE = 'Compliance',
  GOVERNMENT = 'Government',
  SYSTEM = 'System',
  ENGINEERING = 'Engineering',
  INDUSTRY = 'Industry',
  HEALTH_SAFETY = 'Health & Safety',
  ENVIRONMENTAL = 'Environmental',
  CYBERSECURITY = 'Cybersecurity',
  SUPPLY_CHAIN = 'Supply chain',
}
export const ALERT_CATEGORIES: AlertCategory[] = Object.values(AlertCategory);

export enum AlertPriority {
  CRITICAL = 'Critical',
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}
export const ALERT_PRIORITIES: AlertPriority[] = Object.values(AlertPriority);

export enum AlertStatus {
  DRAFT = 'Draft',
  SCHEDULED = 'Scheduled',
  SENDING = 'Sending',
  SENT = 'Sent',
}

export type AlertDocument = Alert & Document;

@Schema({ timestamps: true, collection: 'crm_tools_alerts' })
export class Alert {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) title: string;
  @Prop({ enum: AlertCategory, required: true, index: true })
  category: AlertCategory;
  @Prop({ enum: AlertPriority, required: true, index: true })
  priority: AlertPriority;
  // Free text rather than a hard enum — the prototype's trigger-type
  // list (regulation change, filing deadline, gazette notice, etc.)
  // is long and advisory-firm-specific; locking it to a fixed enum
  // would just mean adding a new one every time a tenant hits a type
  // that isn't listed yet.
  @Prop({ default: '' }) triggerType: string;
  @Prop({ default: '' }) source: string;
  @Prop({ required: true }) summary: string;
  @Prop({ default: '' }) actionRequired: string;
  @Prop({ default: null }) effectiveDate: Date | null;
  @Prop({ default: null }) deadline: Date | null;

  @Prop({ type: [Types.ObjectId], ref: 'Segment', default: [] })
  segmentIds: Types.ObjectId[];
  @Prop({ type: [String], default: [] }) segmentNames: string[];

  @Prop({ enum: AlertStatus, default: AlertStatus.DRAFT, index: true })
  status: AlertStatus;
  @Prop({ default: null }) scheduledAt: Date | null;
  @Prop({ default: null }) sentAt: Date | null;

  // Same real snapshot-at-creation-time semantics as Campaign.recipients.
  @Prop({ type: [CampaignRecipientSchema], default: [] })
  recipients: CampaignRecipient[];
}
export const AlertSchema = SchemaFactory.createForClass(Alert);
