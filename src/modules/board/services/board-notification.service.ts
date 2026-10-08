import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import { BoardNotification, BoardNotificationDocument } from '../schemas';
import {
  BOARD_NOTIFICATION_EVENT,
  BoardNotificationEvent,
} from '../board-notification.event';
import { RealtimeGateway } from 'src/modules/realtime/realtime.gateway';

@Injectable()
export class BoardNotificationService {
  constructor(
    @InjectModel(BoardNotification.name)
    private readonly model: Model<BoardNotificationDocument>,
    private readonly realtime: RealtimeGateway,
  ) {}

  // The only place a BoardNotification is ever created — every real
  // trigger across the platform (a meeting notice dispatched, minutes
  // sent for Chair review, a governance code sent for board approval,
  // a new Directory message, …) raises the same event rather than
  // calling this service directly; see board-notification.event.ts
  // for why one generic event replaces one bespoke listener per
  // trigger. Never created directly by a controller — there's no
  // "compose a notification" action for anyone to call.
  @OnEvent(BOARD_NOTIFICATION_EVENT)
  async handleNotify(event: BoardNotificationEvent) {
    const doc = await this.model.create({
      tenantId: new Types.ObjectId(event.tenantId),
      recipientBoardMemberId: new Types.ObjectId(event.recipientBoardMemberId),
      recipientUserId: event.recipientUserId
        ? new Types.ObjectId(event.recipientUserId)
        : null,
      type: event.type,
      title: event.title,
      description: event.description ?? '',
      link: event.link ?? null,
    });

    if (event.recipientUserId) {
      this.realtime.emitToUser(
        event.recipientUserId,
        'notification:new',
        doc.toObject(),
      );
    }
    return doc;
  }

  // ── Board-portal-facing reads/actions ───────────────────────────
  async getMyNotifications(boardMemberId: string) {
    return this.model
      .find({ recipientBoardMemberId: new Types.ObjectId(boardMemberId) })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
  }

  async getUnreadCount(boardMemberId: string) {
    const count = await this.model.countDocuments({
      recipientBoardMemberId: new Types.ObjectId(boardMemberId),
      read: false,
    });
    return { count };
  }

  async markRead(boardMemberId: string, id: string) {
    const notif = await this.model.findOne({
      _id: id,
      recipientBoardMemberId: new Types.ObjectId(boardMemberId),
    });
    if (!notif) throw new NotFoundException('Notification not found');
    if (!notif.read) {
      notif.read = true;
      notif.readAt = new Date();
      await notif.save();
    }
    return notif.toObject();
  }

  async markAllRead(boardMemberId: string) {
    const now = new Date();
    await this.model.updateMany(
      {
        recipientBoardMemberId: new Types.ObjectId(boardMemberId),
        read: false,
      },
      { $set: { read: true, readAt: now } },
    );
    return { marked: true };
  }
}
