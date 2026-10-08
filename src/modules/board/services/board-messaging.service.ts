import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BoardMessage, BoardMessageDocument } from '../schemas';
import { SendBoardMessageDto } from '../dtos/index.dto';
import {
  BoardMember,
  BoardMemberDocument,
} from 'src/modules/grc/governance/schemas';
import {
  BOARD_NOTIFICATION_EVENT,
  BoardNotificationEvent,
  BoardNotificationType,
} from '../board-notification.event';
import { RealtimeGateway } from 'src/modules/realtime/realtime.gateway';
import { BoardMemberService } from 'src/modules/grc/governance/services';

// Board Directory messaging — "board members are able to see other
// board members and message them (hence the messaging feature)" (PO,
// Oct 2026). Direct model injection for BoardMember here rather than
// going through BoardMemberService for every lookup (the established
// "direct model injection across module boundaries" fix elsewhere in
// this codebase) — this service only ever needs a name/tenant check,
// never the fuller onboarding/committee logic that service owns.
@Injectable()
export class BoardMessagingService {
  constructor(
    @InjectModel(BoardMessage.name)
    private readonly messageModel: Model<BoardMessageDocument>,
    @InjectModel(BoardMember.name)
    private readonly boardMemberModel: Model<BoardMemberDocument>,
    private readonly boardMemberService: BoardMemberService,
    private readonly realtime: RealtimeGateway,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // One row per counterpart this director has ever exchanged a
  // message with, newest message first — the inbox list. A
  // "conversation" is never stored as its own document (see the
  // schema's own comment); it's derived here by grouping every
  // BoardMessage where the caller is either side.
  async getThreads(userId: string) {
    const { boardMemberId, tenantId } =
      await this.boardMemberService.resolveBoardMember(userId);
    const me = new Types.ObjectId(boardMemberId);

    const messages = await this.messageModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        $or: [{ senderBoardMemberId: me }, { recipientBoardMemberId: me }],
      })
      .sort({ createdAt: -1 })
      .lean();

    const byCounterpart = new Map<
      string,
      {
        counterpartId: string;
        lastMessage: string;
        lastAt: Date;
        unreadCount: number;
      }
    >();
    for (const m of messages) {
      const counterpartId = (
        m.senderBoardMemberId.toString() === boardMemberId
          ? m.recipientBoardMemberId
          : m.senderBoardMemberId
      ).toString();
      const unread =
        m.recipientBoardMemberId.toString() === boardMemberId && !m.read;
      const existing = byCounterpart.get(counterpartId);
      if (!existing) {
        byCounterpart.set(counterpartId, {
          counterpartId,
          lastMessage: m.body,
          lastAt: (m as any).createdAt,
          unreadCount: unread ? 1 : 0,
        });
      } else if (unread) {
        existing.unreadCount += 1;
      }
    }

    const counterpartIds = [...byCounterpart.keys()];
    const counterparts = await this.boardMemberModel
      .find({ _id: { $in: counterpartIds } })
      .select('name role')
      .lean();
    const byId = new Map(counterparts.map((c) => [c._id.toString(), c]));

    return [...byCounterpart.values()]
      .map((t) => ({
        ...t,
        name: byId.get(t.counterpartId)?.name ?? 'Former board member',
        role: byId.get(t.counterpartId)?.role ?? '',
      }))
      .sort((a, b) => +new Date(b.lastAt) - +new Date(a.lastAt));
  }

  // Full history with one other director, oldest first — and marks
  // every message they sent me as read, the same "opening the thread
  // reads it" convention chat UIs always use.
  async getThread(userId: string, counterpartId: string) {
    const { boardMemberId, tenantId } =
      await this.boardMemberService.resolveBoardMember(userId);
    await this.assertSameTenant(tenantId, counterpartId);

    const me = new Types.ObjectId(boardMemberId);
    const them = new Types.ObjectId(counterpartId);

    const messages = await this.messageModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        $or: [
          { senderBoardMemberId: me, recipientBoardMemberId: them },
          { senderBoardMemberId: them, recipientBoardMemberId: me },
        ],
      })
      .sort({ createdAt: 1 })
      .lean();

    await this.messageModel.updateMany(
      {
        senderBoardMemberId: them,
        recipientBoardMemberId: me,
        read: false,
      },
      { $set: { read: true, readAt: new Date() } },
    );

    return messages.map((m) => ({
      id: m._id,
      body: m.body,
      fromMe: m.senderBoardMemberId.toString() === boardMemberId,
      createdAt: (m as any).createdAt,
    }));
  }

  async sendMessage(
    userId: string,
    counterpartId: string,
    dto: SendBoardMessageDto,
  ) {
    const { boardMemberId, tenantId, name } =
      await this.boardMemberService.resolveBoardMember(userId);
    if (counterpartId === boardMemberId) {
      throw new BadRequestException('You cannot message yourself.');
    }
    const counterpart = await this.assertSameTenant(tenantId, counterpartId);

    const message = await this.messageModel.create({
      tenantId: new Types.ObjectId(tenantId),
      senderBoardMemberId: new Types.ObjectId(boardMemberId),
      recipientBoardMemberId: new Types.ObjectId(counterpartId),
      body: dto.body,
    });

    const payload = {
      id: message._id,
      body: message.body,
      fromMe: false,
      createdAt: (message as any).createdAt,
      fromName: name,
      fromBoardMemberId: boardMemberId,
    };
    if (counterpart.userId) {
      this.realtime.emitToUser(
        counterpart.userId.toString(),
        'message:new',
        payload,
      );
    }

    const notification: BoardNotificationEvent = {
      tenantId,
      recipientBoardMemberId: counterpartId,
      recipientUserId: counterpart.userId
        ? counterpart.userId.toString()
        : null,
      type: BoardNotificationType.MESSAGE,
      title: `New message from ${name}`,
      description: dto.body.slice(0, 140),
      link: '/messages',
    };
    this.eventEmitter.emit(BOARD_NOTIFICATION_EVENT, notification);

    return {
      id: message._id,
      body: message.body,
      createdAt: (message as any).createdAt,
    };
  }

  private async assertSameTenant(tenantId: string, counterpartId: string) {
    const counterpart = await this.boardMemberModel.findOne({
      _id: counterpartId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!counterpart) {
      throw new NotFoundException('Board member not found.');
    }
    return counterpart;
  }
}
