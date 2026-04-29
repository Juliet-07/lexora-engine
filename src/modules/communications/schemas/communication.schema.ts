import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageDocument = Message & Document;
export type NotificationDocument = Notification & Document;

export enum MessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}

export enum NotificationType {
  INFO = 'info',
  WARNING = 'warning',
  SUCCESS = 'success',
  ERROR = 'error',
  ALERT = 'alert',
}

export enum NotificationChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
}

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  recipientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ default: null })
  threadId: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  body: string;

  @Prop({ enum: MessageStatus, default: MessageStatus.SENT })
  status: MessageStatus;

  @Prop({ default: null })
  readAt: Date;

  @Prop({ type: [String], default: [] })
  attachments: string[];

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ recipientId: 1, status: 1 });
MessageSchema.index({ senderId: 1 });
MessageSchema.index({ threadId: 1 });
MessageSchema.index({ organizationId: 1 });

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', default: null })
  organizationId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;

  @Prop({ enum: NotificationType, default: NotificationType.INFO })
  type: NotificationType;

  @Prop({ enum: NotificationChannel, default: NotificationChannel.IN_APP })
  channel: NotificationChannel;

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ default: null })
  readAt: Date;

  @Prop({ default: null })
  link: string;

  @Prop({ type: Object, default: {} })
  data: Record<string, any>;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
