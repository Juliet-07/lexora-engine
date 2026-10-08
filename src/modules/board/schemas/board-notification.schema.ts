import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BoardNotificationType } from '../board-notification.event';

export type BoardNotificationDocument = BoardNotification & Document;

// Mirrors TenantNotification/ClientNotification's own, already-proven
// shape (src/modules/tenant/schemas/notification.schema.ts) — one real
// record per event a director should be told about, created only by
// BoardNotificationService's single event listener (never by a
// controller directly; there is no "compose a notification" action).
// Keyed by recipientBoardMemberId rather than recipientUserId as the
// primary identity, since that's what every other board-portal
// feature (directory, skills, messaging) already keys on, and a
// director's notification list has to keep working even before their
// portal account exists or while they're offline; recipientUserId is
// kept alongside it purely to target the realtime push.
@Schema({ timestamps: true, collection: 'board_notifications' })
export class BoardNotification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'BoardMember',
    required: true,
    index: true,
  })
  recipientBoardMemberId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  recipientUserId: Types.ObjectId | null;

  @Prop({ enum: BoardNotificationType, required: true })
  type: BoardNotificationType;
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) description: string;
  @Prop({ default: null }) link: string | null;

  @Prop({ default: false, index: true }) read: boolean;
  @Prop({ default: null }) readAt: Date | null;
}
export const BoardNotificationSchema =
  SchemaFactory.createForClass(BoardNotification);
