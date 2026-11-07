import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SupportTicketDocument = SupportTicket & Document;

export enum SupportTicketStatus {
  OPEN = 'Open',
  IN_PROGRESS = 'In Progress',
  WAITING_ON_TENANT = 'Waiting on Tenant',
  RESOLVED = 'Resolved',
  CLOSED = 'Closed',
}

export enum SupportTicketPriority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  URGENT = 'Urgent',
}

export const SUPPORT_CATEGORIES = [
  'Portal access',
  'Subscription & billing',
  'Modules & permissions',
  'Technical issue',
  'Feature request',
  'Other',
] as const;

// Where a platform ticket came from. A tenant can raise one themselves, or
// escalate a ticket one of their own clients raised (Portal access issues).
export enum SupportTicketSource {
  TENANT = 'tenant',
  ESCALATED = 'escalated',
}

@Schema({ _id: true })
export class SupportMessage {
  @Prop({ required: true, enum: ['tenant', 'platform'] })
  authorType: 'tenant' | 'platform';
  @Prop({ required: true }) authorName: string;
  @Prop({ required: true }) body: string;
  // Platform-only note — never sent to the tenant.
  @Prop({ default: false }) internal: boolean;
  @Prop({ required: true, default: Date.now }) at: Date;
}
export const SupportMessageSchema =
  SchemaFactory.createForClass(SupportMessage);

// A ticket a tenant raises to the platform team (Super Admin).
//
// Privacy rule: this record must never carry anything about the tenant's own
// clients. An escalated ticket only holds what the tenant wrote for the
// platform team. `sourceTicketId` links back to the tenant's client ticket so
// the tenant can find the thread again — it is stripped from every
// Super-Admin response (see SupportTicketService.forAdmin).
@Schema({ timestamps: true, collection: 'platform_support_tickets' })
export class SupportTicket {
  @Prop({ required: true, unique: true }) ref: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;
  @Prop({ default: '' }) tenantName: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  raisedByUserId: Types.ObjectId;
  @Prop({ default: '' }) raisedByName: string;

  @Prop({
    enum: SupportTicketSource,
    default: SupportTicketSource.TENANT,
    index: true,
  })
  source: SupportTicketSource;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  sourceTicketId: Types.ObjectId | null;

  @Prop({ required: true, trim: true, maxlength: 200 }) subject: string;
  @Prop({ default: '' }) description: string;
  @Prop({ required: true }) category: string;
  @Prop({ enum: SupportTicketPriority, required: true })
  priority: SupportTicketPriority;

  @Prop({
    enum: SupportTicketStatus,
    default: SupportTicketStatus.OPEN,
    index: true,
  })
  status: SupportTicketStatus;

  @Prop({ type: Types.ObjectId, default: null })
  assignedToUserId: Types.ObjectId | null;
  @Prop({ default: '' }) assignedToName: string;

  @Prop({ type: [SupportMessageSchema], default: [] })
  messages: Types.DocumentArray<SupportMessage>;

  // Who spoke last — drives the "needs a reply" view for the platform team
  // and the "reply received" flag for the tenant.
  @Prop({ enum: ['tenant', 'platform'], default: 'tenant' })
  lastActor: 'tenant' | 'platform';
  @Prop({ default: Date.now }) lastActivityAt: Date;
  @Prop({ default: null }) resolvedAt: Date | null;
}
export const SupportTicketSchema = SchemaFactory.createForClass(SupportTicket);
