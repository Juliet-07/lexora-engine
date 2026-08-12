import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TicketDocument = Ticket & Document;

export enum TicketStatus {
  NEW = 'New',
  ASSIGNED = 'Assigned',
  IN_PROGRESS = 'In Progress',
  PENDING_CLIENT = 'Pending Client',
  RESOLVED = 'Resolved',
  CLOSED = 'Closed',
}
export const TICKET_STATUSES: TicketStatus[] = Object.values(TicketStatus);

export enum TicketPriority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  URGENT = 'Urgent',
}

export enum TicketChannel {
  PORTAL = 'Portal',
  EMAIL = 'Email',
  WHATSAPP = 'WhatsApp',
}

// Deliberately the same vocabulary the Knowledge Base uses for its
// own categories (KB is deferred, but no reason to pick a different
// list now and have to reconcile it later).
export const TICKET_CATEGORIES = [
  'Portal access',
  'Billing',
  'Advisory',
  'Process',
  'New work',
  'Other',
];

// Real SLA target hours per priority — the confirmed prototype's
// seed data (4h Urgent/WhatsApp, 8h High/Portal, 24h Medium/Email,
// 48h Low/Portal) matches this mapping closely enough to treat as
// the actual rule rather than per-ticket guesswork.
export const SLA_TARGET_HRS_BY_PRIORITY: Record<TicketPriority, number> = {
  [TicketPriority.URGENT]: 4,
  [TicketPriority.HIGH]: 8,
  [TicketPriority.MEDIUM]: 24,
  [TicketPriority.LOW]: 48,
};

@Schema({ _id: true })
export class TicketNote {
  @Prop({ required: true }) author: string;
  @Prop({ default: true }) internal: boolean;
  @Prop({ required: true }) body: string;
  @Prop({ required: true, default: Date.now }) at: Date;
}
export const TicketNoteSchema = SchemaFactory.createForClass(TicketNote);

@Schema({ timestamps: true, collection: 'crm_tickets' })
export class Ticket {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) ref: string;
  @Prop({ required: true, trim: true }) subject: string;
  @Prop({ default: '' }) description: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  clientUserId: Types.ObjectId;
  @Prop({ required: true }) clientName: string;

  // Client-raised tickets are always Portal — there's no real
  // email/WhatsApp intake being built, but the field stays flexible
  // rather than hardcoding "Portal" as a literal everywhere it's read.
  @Prop({ enum: TicketChannel, default: TicketChannel.PORTAL })
  channel: TicketChannel;

  @Prop({ enum: TicketPriority, required: true }) priority: TicketPriority;
  @Prop({ required: true }) category: string;

  @Prop({ type: Types.ObjectId, default: null })
  agentUserId: Types.ObjectId | null;
  @Prop({ default: '' }) agent: string;

  @Prop({ enum: TicketStatus, default: TicketStatus.NEW, index: true })
  status: TicketStatus;

  @Prop({ required: true }) slaTargetHrs: number;
  // Live, pause-aware SLA clock rather than a static number. The
  // clock pauses for the entire time status = Pending Client
  // (totalPausedMs accumulates each completed pause; pausedAt marks
  // one currently in progress) and freezes permanently the moment
  // the ticket first reaches Resolved or Closed (slaStoppedAt).
  // Elapsed hours are computed from these on every read, never
  // stored as a number that could go stale.
  @Prop({ default: null }) pausedAt: Date | null;
  @Prop({ default: 0 }) totalPausedMs: number;
  @Prop({ default: null }) slaStoppedAt: Date | null;

  // Not wired to real Timesheets in this pass — ticket-level time
  // tracking is its own integration, same deferral reasoning as
  // "Convert to mandate" below.
  @Prop({ default: 0 }) loggedHrs: number;

  @Prop({ default: null, min: 1, max: 5 }) rating: number | null;
  @Prop({ default: null }) ratingComment: string | null;

  @Prop({ type: [TicketNoteSchema], default: [] })
  notes: Types.DocumentArray<TicketNote>;
}
export const TicketSchema = SchemaFactory.createForClass(Ticket);

export type KbArticleDocument = KbArticle & Document;

export enum KbAudience {
  INTERNAL = 'Internal',
  CLIENT_FACING = 'Client-facing',
}

export enum KbStatus {
  DRAFT = 'Draft',
  PUBLISHED = 'Published',
}

@Schema({ timestamps: true, collection: 'crm_kb_articles' })
export class KbArticle {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) ref: string;
  @Prop({ required: true, trim: true }) title: string;

  // Free text, same convention as Ticket.category — not a hard enum,
  // but both frontends draw their dropdown options from the same
  // shared TICKET_CATEGORIES constant, so in practice they stay in
  // sync without needing a DB-level constraint forcing it.
  @Prop({ required: true }) category: string;

  @Prop({ enum: KbAudience, required: true, index: true }) audience: KbAudience;
  @Prop({ enum: KbStatus, default: KbStatus.DRAFT, index: true })
  status: KbStatus;

  @Prop({ type: [String], default: [] }) tags: string[];
  @Prop({ default: '' }) body: string;
  @Prop({ required: true }) author: string;

  @Prop({ default: 0 }) views: number;
  @Prop({ default: 0 }) helpful: number;
  @Prop({ default: 0 }) notHelpful: number;

  // Set when created via "Create article from this ticket" — purely
  // informational, no behavior hangs off it.
  @Prop({ type: Types.ObjectId, ref: 'Ticket', default: null })
  linkedTicketId: Types.ObjectId | null;
}
export const KbArticleSchema = SchemaFactory.createForClass(KbArticle);
