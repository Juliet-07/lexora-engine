import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ClientNotificationType {
  DOCUMENT = 'Document',
  INVOICE = 'Invoice',
  PAYMENT = 'Payment',
  TICKET = 'Ticket',
  COMPLIANCE = 'Compliance',
  ONBOARDING = 'Onboarding',
  NEWSLETTER = 'Newsletter',
  GENERAL = 'General',
}

export type ClientNotificationDocument = ClientNotification & Document;

// One real record per event a client should be told about — created
// only by the event listeners in notification.service.ts reacting to
// something that actually happened elsewhere in the app (a contract
// sent for signature, an invoice generated, a payment confirmed,
// etc). Never created directly by a controller — there is no
// "compose a notification" action for anyone to call.
@Schema({ timestamps: true, collection: 'client_notifications' })
export class ClientNotification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  clientUserId: Types.ObjectId;

  @Prop({ enum: ClientNotificationType, required: true })
  type: ClientNotificationType;
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) description: string;
  // Where clicking this notification should take the client in the
  // client app — a real, already-existing route, never a fabricated
  // one-off page.
  @Prop({ default: null }) link: string | null;

  @Prop({ default: false, index: true }) read: boolean;
  @Prop({ default: null }) readAt: Date | null;
}
export const ClientNotificationSchema =
  SchemaFactory.createForClass(ClientNotification);
