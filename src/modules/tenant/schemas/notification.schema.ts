import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum TenantNotificationType {
  ONBOARDING = 'Onboarding',
  INVOICE = 'Invoice',
  TICKET = 'Ticket',
  COMPLIANCE = 'Compliance',
  DOCUMENT = 'Document',
  HR = 'HR',
  GENERAL = 'General',
}

export type TenantNotificationDocument = TenantNotification & Document;

// One real record per event a tenant staff member should be told
// about — created only by the event listeners in
// tenant-notification.service.ts reacting to something that
// actually happened elsewhere in the app (a client submitted their
// KYC form, an invoice was paid, a client replied to a ticket,
// etc). Never created directly by a controller — there is no
// "compose a notification" action for anyone to call. Mirrors the
// same real pattern already established for ClientNotification.
@Schema({ timestamps: true, collection: 'tenant_notifications' })
export class TenantNotification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // The real staff member who should see this — the client's
  // assigned relationship owner where one exists, falling back to
  // the tenant owner account otherwise. Never broadcast to
  // everyone by default.
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  recipientUserId: Types.ObjectId;

  @Prop({ enum: TenantNotificationType, required: true })
  type: TenantNotificationType;
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) description: string;
  // Where clicking this notification should take the tenant user in
  // the tenant app — a real, already-existing route.
  @Prop({ default: null }) link: string | null;

  @Prop({ default: false, index: true }) read: boolean;
  @Prop({ default: null }) readAt: Date | null;

  // Whether the paired real email was actually sent — lets the
  // frontend/audit trail see when email delivery silently didn't
  // happen (e.g. no SMTP configured) rather than assume it did.
  @Prop({ default: false }) emailSent: boolean;
}
export const TenantNotificationSchema =
  SchemaFactory.createForClass(TenantNotification);
