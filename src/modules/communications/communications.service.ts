import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import {
  Message, MessageDocument, MessageStatus,
  Notification, NotificationDocument, NotificationChannel, NotificationType,
} from './schemas/communication.schema';
import {
  SendMessageDto, FetchMessagesDto, SendNotificationDto, BroadcastNotificationDto,
} from './dto/communication.dto';
import { PaginationDto, paginate } from '../../common/pagination.dto';

@Injectable()
export class CommunicationsService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
  ) {}

  async sendMessage(dto: SendMessageDto, senderId: string, organizationId: string): Promise<MessageDocument> {
    const threadId = dto.threadId || uuidv4();
    return this.messageModel.create({
      senderId: new Types.ObjectId(senderId),
      recipientId: new Types.ObjectId(dto.recipientId),
      organizationId: new Types.ObjectId(organizationId),
      threadId,
      subject: dto.subject,
      body: dto.body,
      attachments: dto.attachments || [],
    }) as any;
  }

  async fetchMessages(
    userId: string,
    organizationId: string,
    dto: FetchMessagesDto,
    pagination: PaginationDto,
  ) {
    const query: any = {
      $or: [
        { recipientId: new Types.ObjectId(userId) },
        { senderId: new Types.ObjectId(userId) },
      ],
      organizationId: new Types.ObjectId(organizationId),
    };
    if (dto.threadId) query.threadId = dto.threadId;
    if (dto.unreadOnly) {
      query.recipientId = new Types.ObjectId(userId);
      query.status = { $ne: MessageStatus.READ };
    }

    const { skip, limit, page } = pagination;
    const [data, total] = await Promise.all([
      this.messageModel.find(query).skip(skip).limit(limit)
        .populate('senderId', 'firstName lastName email')
        .populate('recipientId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .lean(),
      this.messageModel.countDocuments(query),
    ]);
    return paginate(data, total, page, limit);
  }

  async getThread(threadId: string, userId: string): Promise<MessageDocument[]> {
    const messages = await this.messageModel
      .find({
        threadId,
        $or: [{ senderId: new Types.ObjectId(userId) }, { recipientId: new Types.ObjectId(userId) }],
      })
      .populate('senderId', 'firstName lastName email')
      .sort({ createdAt: 1 })
      .lean();

    // Auto-mark received messages as read
    await this.messageModel.updateMany(
      { threadId, recipientId: new Types.ObjectId(userId), status: { $ne: MessageStatus.READ } },
      { status: MessageStatus.READ, readAt: new Date() },
    );

    return messages as any;
  }

  async markMessageRead(id: string, userId: string): Promise<MessageDocument> {
    const message = await this.messageModel.findOneAndUpdate(
      { _id: id, recipientId: new Types.ObjectId(userId) },
      { status: MessageStatus.READ, readAt: new Date() },
      { new: true },
    );
    if (!message) throw new NotFoundException('Message not found');
    return message;
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.messageModel.countDocuments({
      recipientId: new Types.ObjectId(userId),
      status: { $ne: MessageStatus.READ },
    });
  }

  // Notifications
  async sendNotification(dto: SendNotificationDto, organizationId?: string): Promise<NotificationDocument> {
    return this.notificationModel.create({
      userId: new Types.ObjectId(dto.userId),
      organizationId: organizationId ? new Types.ObjectId(organizationId) : null,
      title: dto.title,
      body: dto.body,
      type: dto.type || NotificationType.INFO,
      channel: dto.channel || NotificationChannel.IN_APP,
      link: dto.link,
    }) as any;
  }

  async broadcastNotification(dto: BroadcastNotificationDto, organizationId: string, userIds: string[]): Promise<number> {
    const notifications = userIds.map((uid) => ({
      userId: new Types.ObjectId(uid),
      organizationId: new Types.ObjectId(organizationId),
      title: dto.title,
      body: dto.body,
      type: dto.type || NotificationType.INFO,
      channel: NotificationChannel.IN_APP,
    }));
    await this.notificationModel.insertMany(notifications);
    return notifications.length;
  }

  async getNotifications(userId: string, pagination: PaginationDto, unreadOnly = false) {
    const query: any = { userId: new Types.ObjectId(userId) };
    if (unreadOnly) query.isRead = false;

    const { skip, limit, page } = pagination;
    const [data, total] = await Promise.all([
      this.notificationModel.find(query).skip(skip).limit(limit).sort({ createdAt: -1 }).lean(),
      this.notificationModel.countDocuments(query),
    ]);
    return paginate(data, total, page, limit);
  }

  async markNotificationRead(id: string, userId: string): Promise<NotificationDocument> {
    const notification = await this.notificationModel.findOneAndUpdate(
      { _id: id, userId: new Types.ObjectId(userId) },
      { isRead: true, readAt: new Date() },
      { new: true },
    );
    if (!notification) throw new NotFoundException('Notification not found');
    return notification;
  }

  async markAllNotificationsRead(userId: string): Promise<number> {
    const result = await this.notificationModel.updateMany(
      { userId: new Types.ObjectId(userId), isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return result.modifiedCount;
  }

  async getUnreadNotificationsCount(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isRead: false,
    });
  }
}
