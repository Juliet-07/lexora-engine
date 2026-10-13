import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NewsletterSubscriberDocument = NewsletterSubscriber & Document;

export enum SubscriberStatus {
  ACTIVE = 'Active',
  UNSUBSCRIBED = 'Unsubscribed',
}

// Captured from the public website's "subscribe to newsletter" field
// (currently the Insights page). Platform-level — these are subscribers
// to the Lexora Africa newsletter itself, not any tenant's CRM
// contacts/clients (that audience lives in crm/tools' Segment/Campaign
// system and is a separate, tenant-scoped newsletter — see
// newsletter.schema.ts in crm/tools).
@Schema({ timestamps: true, collection: 'newsletter_subscribers' })
export class NewsletterSubscriber {
  @Prop({ required: true, trim: true, lowercase: true, unique: true })
  email: string;

  @Prop({ enum: SubscriberStatus, default: SubscriberStatus.ACTIVE, index: true })
  status: SubscriberStatus;

  // Where the signup happened — free text, not an enum, since more
  // public pages may grow a subscribe box later.
  @Prop({ default: 'website' }) source: string;

  @Prop({ default: null }) unsubscribedAt: Date | null;

  // Opaque token embedded in the one-click unsubscribe link sent with
  // every campaign — avoids requiring the subscriber to sign in to
  // unsubscribe themselves.
  @Prop({ required: true, unique: true }) unsubscribeToken: string;
}
export const NewsletterSubscriberSchema = SchemaFactory.createForClass(
  NewsletterSubscriber,
);
