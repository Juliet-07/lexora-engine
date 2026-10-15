import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BoardMessage,
  BoardMessageDocument,
  MessagePartyType,
} from '../schemas';
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
import { User, UserDocument } from 'src/modules/auth/schemas';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';

// A tenant counterpart is addressed on the wire as `tenant:<tenantId>`
// so it can share the same string `counterpartId` param the existing
// board-portal routes already use, without colliding with a real
// BoardMember id (both are valid-looking ObjectIds, so the prefix is
// what disambiguates, not the id's own shape).
const TENANT_PREFIX = 'tenant:';

function wireCounterpartId(partyId: string, partyType: MessagePartyType) {
  return partyType === MessagePartyType.TENANT
    ? `${TENANT_PREFIX}${partyId}`
    : partyId;
}

// Board Directory messaging — "board members are able to see other
// board members and message them (hence the messaging feature)" (PO,
// Oct 2026), extended Oct 2026 so a director can also message the
// tenant owner and the tenant can reply from their own Board
// Messaging page ("create that connection from board portal to
// tenant portal"). Direct model injection for BoardMember/User here
// rather than going through BoardMemberService for every lookup (the
// established "direct model injection across module boundaries" fix
// elsewhere in this codebase) — this service only ever needs a
// name/tenant check, never the fuller onboarding/committee logic
// those services own.
//
// Every method below comes in two flavours: the original board-member
// one (getThreads/getThread/sendMessage — "self" is a BoardMember)
// and a tenant-side twin (…ForTenant — "self" is the tenant's own
// User id). Both share the same underlying collection and the same
// private helpers (listThreads/fetchThread), since a thread is
// symmetric — it's just whose perspective "fromMe" is computed from.
@Injectable()
export class BoardMessagingService {
  constructor(
    @InjectModel(BoardMessage.name)
    private readonly messageModel: Model<BoardMessageDocument>,
    @InjectModel(BoardMember.name)
    private readonly boardMemberModel: Model<BoardMemberDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly boardMemberService: BoardMemberService,
    private readonly realtime: RealtimeGateway,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Shared internals ────────────────────────────────────────────

  // One row per counterpart `self` has ever exchanged a message with,
  // newest message first. A "conversation" is never stored as its own
  // document (see the schema's own comment); it's derived here by
  // grouping every BoardMessage where `self` is either side.
  private async listThreads(
    tenantId: string,
    selfId: string,
    selfType: MessagePartyType,
  ) {
    const self = new Types.ObjectId(selfId);
    const messages = await this.messageModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        $or: [
          { senderId: self, senderType: selfType },
          { recipientId: self, recipientType: selfType },
        ],
      })
      .sort({ createdAt: -1 })
      .lean();

    const byCounterpart = new Map<
      string,
      {
        counterpartId: string;
        rawId: string;
        rawType: MessagePartyType;
        lastMessage: string;
        lastAt: Date;
        unreadCount: number;
      }
    >();
    for (const m of messages) {
      const iAmSender =
        m.senderId.toString() === selfId && m.senderType === selfType;
      const rawId = (iAmSender ? m.recipientId : m.senderId).toString();
      const rawType = iAmSender ? m.recipientType : m.senderType;
      const key = `${rawType}:${rawId}`;
      const unread = !iAmSender && !m.read;
      const existing = byCounterpart.get(key);
      if (!existing) {
        byCounterpart.set(key, {
          counterpartId: wireCounterpartId(rawId, rawType),
          rawId,
          rawType,
          lastMessage: m.body,
          lastAt: (m as any).createdAt,
          unreadCount: unread ? 1 : 0,
        });
      } else if (unread) {
        existing.unreadCount += 1;
      }
    }
    return [...byCounterpart.values()];
  }

  // Full history between `self` and one counterpart, oldest first —
  // and marks every message the counterpart sent `self` as read, the
  // same "opening the thread reads it" convention chat UIs always use.
  private async fetchThread(
    tenantId: string,
    selfId: string,
    selfType: MessagePartyType,
    counterpartId: string,
    counterpartType: MessagePartyType,
  ) {
    const self = new Types.ObjectId(selfId);
    const them = new Types.ObjectId(counterpartId);

    const messages = await this.messageModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        $or: [
          {
            senderId: self,
            senderType: selfType,
            recipientId: them,
            recipientType: counterpartType,
          },
          {
            senderId: them,
            senderType: counterpartType,
            recipientId: self,
            recipientType: selfType,
          },
        ],
      })
      .sort({ createdAt: 1 })
      .lean();

    await this.messageModel.updateMany(
      {
        senderId: them,
        senderType: counterpartType,
        recipientId: self,
        recipientType: selfType,
        read: false,
      },
      { $set: { read: true, readAt: new Date() } },
    );

    return messages.map((m) => ({
      id: m._id,
      body: m.body,
      fromMe: m.senderId.toString() === selfId && m.senderType === selfType,
      createdAt: (m as any).createdAt,
    }));
  }

  private parseCounterpartId(counterpartId: string, tenantId: string) {
    if (counterpartId.startsWith(TENANT_PREFIX)) {
      // Only ever this tenant's own board, so the tenant counterpart
      // is always this same tenantId — the prefix just disambiguates
      // the type, never a different tenant.
      return { id: tenantId, type: MessagePartyType.TENANT };
    }
    return { id: counterpartId, type: MessagePartyType.BOARD_MEMBER };
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

  // ── Board-member side (board-portal) ─────────────────────────────

  async getThreads(userId: string) {
    const { boardMemberId, tenantId } =
      await this.boardMemberService.resolveBoardMember(userId);
    const threads = await this.listThreads(
      tenantId,
      boardMemberId,
      MessagePartyType.BOARD_MEMBER,
    );

    const boardMemberIds = threads
      .filter((t) => t.rawType === MessagePartyType.BOARD_MEMBER)
      .map((t) => t.rawId);
    const counterparts = await this.boardMemberModel
      .find({ _id: { $in: boardMemberIds } })
      .select('name role')
      .lean();
    const byId = new Map(counterparts.map((c) => [c._id.toString(), c]));

    const hasTenantThread = threads.some(
      (t) => t.rawType === MessagePartyType.TENANT,
    );
    const businessName = hasTenantThread
      ? await resolveBusinessName(this.userModel, tenantId)
      : null;

    return threads
      .map((t) => ({
        counterpartId: t.counterpartId,
        lastMessage: t.lastMessage,
        lastAt: t.lastAt,
        unreadCount: t.unreadCount,
        name:
          t.rawType === MessagePartyType.TENANT
            ? (businessName ?? 'Tenant Owner')
            : (byId.get(t.rawId)?.name ?? 'Former board member'),
        role:
          t.rawType === MessagePartyType.TENANT
            ? 'Account Owner'
            : (byId.get(t.rawId)?.role ?? ''),
      }))
      .sort((a, b) => +new Date(b.lastAt) - +new Date(a.lastAt));
  }

  async getThread(userId: string, counterpartId: string) {
    const { boardMemberId, tenantId } =
      await this.boardMemberService.resolveBoardMember(userId);
    const counterpart = this.parseCounterpartId(counterpartId, tenantId);
    if (counterpart.type === MessagePartyType.BOARD_MEMBER) {
      await this.assertSameTenant(tenantId, counterpart.id);
    }
    return this.fetchThread(
      tenantId,
      boardMemberId,
      MessagePartyType.BOARD_MEMBER,
      counterpart.id,
      counterpart.type,
    );
  }

  async sendMessage(
    userId: string,
    counterpartId: string,
    dto: SendBoardMessageDto,
  ) {
    const { boardMemberId, tenantId, name } =
      await this.boardMemberService.resolveBoardMember(userId);
    const counterpart = this.parseCounterpartId(counterpartId, tenantId);

    if (
      counterpart.type === MessagePartyType.BOARD_MEMBER &&
      counterpart.id === boardMemberId
    ) {
      throw new BadRequestException('You cannot message yourself.');
    }

    let counterpartUserId: string | null = null;
    if (counterpart.type === MessagePartyType.BOARD_MEMBER) {
      const bm = await this.assertSameTenant(tenantId, counterpart.id);
      counterpartUserId = bm.userId ? bm.userId.toString() : null;
    } else {
      // The tenant IS a User with this id — no separate lookup needed.
      counterpartUserId = tenantId;
    }

    const message = await this.messageModel.create({
      tenantId: new Types.ObjectId(tenantId),
      senderId: new Types.ObjectId(boardMemberId),
      senderType: MessagePartyType.BOARD_MEMBER,
      recipientId: new Types.ObjectId(counterpart.id),
      recipientType: counterpart.type,
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
    if (counterpartUserId) {
      this.realtime.emitToUser(counterpartUserId, 'message:new', payload);
    }

    if (counterpart.type === MessagePartyType.BOARD_MEMBER) {
      const notification: BoardNotificationEvent = {
        tenantId,
        recipientBoardMemberId: counterpart.id,
        recipientUserId: counterpartUserId,
        type: BoardNotificationType.MESSAGE,
        title: `New message from ${name}`,
        description: dto.body.slice(0, 140),
        link: '/messages',
      };
      this.eventEmitter.emit(BOARD_NOTIFICATION_EVENT, notification);
    } else {
      // Mirrors every other thread in TenantNotificationService:
      // real in-app + email notification for whichever side didn't
      // just send the message.
      this.eventEmitter.emit('board.message_to_tenant.received', {
        tenantId,
        boardMemberName: name,
        preview: dto.body.slice(0, 140),
      });
    }

    return {
      id: message._id,
      body: message.body,
      createdAt: (message as any).createdAt,
    };
  }

  // ── Tenant side (lexora-tenant's Board Messaging page) ───────────
  // "self" here is the tenant's own User id — the same id found on
  // every tenant-scoped record as tenantId — never a BoardMember id,
  // so no prefix parsing is needed: a tenant-side counterpartId is
  // always a bare BoardMember id.

  async getThreadsForTenant(tenantUserId: string) {
    const threads = await this.listThreads(
      tenantUserId,
      tenantUserId,
      MessagePartyType.TENANT,
    );
    const boardMemberIds = threads.map((t) => t.rawId);
    const counterparts = await this.boardMemberModel
      .find({ _id: { $in: boardMemberIds } })
      .select('name role')
      .lean();
    const byId = new Map(counterparts.map((c) => [c._id.toString(), c]));

    return threads
      .map((t) => ({
        counterpartId: t.counterpartId,
        lastMessage: t.lastMessage,
        lastAt: t.lastAt,
        unreadCount: t.unreadCount,
        name: byId.get(t.rawId)?.name ?? 'Former board member',
        role: byId.get(t.rawId)?.role ?? '',
      }))
      .sort((a, b) => +new Date(b.lastAt) - +new Date(a.lastAt));
  }

  async getThreadForTenant(tenantUserId: string, counterpartId: string) {
    await this.assertSameTenant(tenantUserId, counterpartId);
    return this.fetchThread(
      tenantUserId,
      tenantUserId,
      MessagePartyType.TENANT,
      counterpartId,
      MessagePartyType.BOARD_MEMBER,
    );
  }

  async sendMessageForTenant(
    tenantUserId: string,
    counterpartId: string,
    dto: SendBoardMessageDto,
  ) {
    const counterpart = await this.assertSameTenant(
      tenantUserId,
      counterpartId,
    );
    const businessName = await resolveBusinessName(
      this.userModel,
      tenantUserId,
    );

    const message = await this.messageModel.create({
      tenantId: new Types.ObjectId(tenantUserId),
      senderId: new Types.ObjectId(tenantUserId),
      senderType: MessagePartyType.TENANT,
      recipientId: new Types.ObjectId(counterpartId),
      recipientType: MessagePartyType.BOARD_MEMBER,
      body: dto.body,
    });

    const payload = {
      id: message._id,
      body: message.body,
      fromMe: false,
      createdAt: (message as any).createdAt,
      fromName: businessName,
      // Matches wireCounterpartId's `tenant:<id>` shape so the board
      // portal's existing realtime handler (which compares this field
      // against the open thread's selectedId) keeps working unchanged
      // for a tenant-sent message too.
      fromBoardMemberId: wireCounterpartId(
        tenantUserId,
        MessagePartyType.TENANT,
      ),
    };
    if (counterpart.userId) {
      this.realtime.emitToUser(
        counterpart.userId.toString(),
        'message:new',
        payload,
      );
    }

    const notification: BoardNotificationEvent = {
      tenantId: tenantUserId,
      recipientBoardMemberId: counterpartId,
      recipientUserId: counterpart.userId
        ? counterpart.userId.toString()
        : null,
      type: BoardNotificationType.MESSAGE,
      title: `New message from ${businessName}`,
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
}
