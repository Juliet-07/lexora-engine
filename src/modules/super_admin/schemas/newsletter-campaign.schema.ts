import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { NewsletterTemplate } from 'src/common/utils/newsletter/newsletter-template';

export type NewsletterCampaignDocument = NewsletterCampaign & Document;

// One of the 4 "Lexora Africa"-branded designs. The enum and the
// email-safe, table-based renderer now live in
// common/utils/newsletter/newsletter-templates.ts, shared with each
// tenant's own CRM newsletter — re-exported here so existing imports
// keep working.
export { NewsletterTemplate };

export enum NewsletterCampaignStatus {
  DRAFT = 'Draft',
  SCHEDULED = 'Scheduled',
  SENDING = 'Sending',
  SENT = 'Sent',
}

// The SuperAdmin-authored newsletter sent to public website
// subscribers (NewsletterSubscriber) — a different, platform-level
// system from crm/tools' Segment/Campaign (that one is per-tenant,
// sent to a tenant's own Clients/Contacts/BoardMembers). Deliberately
// no tenantId, same as Insight/KnowledgeEntry.
@Schema({ timestamps: true, collection: 'newsletter_campaigns' })
export class NewsletterCampaign {
  @Prop({ required: true, trim: true, maxlength: 200 }) subject: string;

  @Prop({ default: '' }) previewText: string;

  @Prop({ enum: NewsletterTemplate, required: true })
  template: NewsletterTemplate;

  // Structured fields for whichever template is selected — shape
  // varies by template, validated in the service rather than at the
  // schema/DTO level (see NewsletterCampaignService.validateTemplateData).
  @Prop({ type: Object, default: {} }) templateData: Record<string, any>;

  @Prop({
    enum: NewsletterCampaignStatus,
    default: NewsletterCampaignStatus.DRAFT,
    index: true,
  })
  status: NewsletterCampaignStatus;

  @Prop({ default: null }) scheduledAt: Date | null;
  @Prop({ default: null }) sentAt: Date | null;

  // Snapshot — how many active subscribers this went to, taken at
  // send time. Not a live recipient list (unlike crm/tools' Campaign,
  // which tracks per-recipient delivery) since a public mailing list
  // can run into the thousands and per-recipient tracking isn't
  // needed for this use case.
  @Prop({ default: 0 }) recipientCount: number;
  @Prop({ default: 0 }) failedCount: number;
}
export const NewsletterCampaignSchema =
  SchemaFactory.createForClass(NewsletterCampaign);
