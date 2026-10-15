import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BoardMessageDocument = BoardMessage & Document;

// Who a message party is. BOARD_MEMBER is the original case ("board
// members are able to see other board members and message them").
// TENANT was added Oct 2026 ("create that connection from board
// portal to tenant portal" so a director can message the tenant
// owner, and the tenant's own Board Messaging page can reply) — a
// Tenant party's id is simply the tenant's own User _id, the same
// id every other tenant-scoped record calls tenantId; there's no
// separate Tenant collection in this codebase (see
// resolveBusinessName's usage elsewhere for the same assumption).
export enum MessagePartyType {
  BOARD_MEMBER = 'BoardMember',
  TENANT = 'Tenant',
}

// Board Directory messaging — "board members are able to see other
// board members and message them" (PO, Oct 2026), extended so one
// side of a thread can also be the tenant itself. A flat per-message
// record between two parties on the same tenant's board, the same
// shape convention used for every other tenant↔counterpart thread in
// this codebase (MandateMessage, AdrCaseMessage: tenantId + the two
// parties + body + timestamps, no separate "conversation" document).
//
// senderId/recipientId are intentionally untyped ObjectIds (no fixed
// `ref`) rather than two parallel BoardMember-ref + User-ref fields —
// this service never calls .populate() on them, always resolving a
// party's display info itself via senderType/recipientType, so one
// polymorphic pair is simpler than keeping two optional refs in sync.
//
// A "thread" between two parties is derived, not stored: it's every
// BoardMessage where {senderId/senderType, recipientId/recipientType}
// matches the pair in either order (see BoardMessagingService).
@Schema({ timestamps: true, collection: 'board_messages' })
export class BoardMessage {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  senderId: Types.ObjectId;

  @Prop({ type: String, enum: MessagePartyType, required: true })
  senderType: MessagePartyType;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  recipientId: Types.ObjectId;

  @Prop({ type: String, enum: MessagePartyType, required: true })
  recipientType: MessagePartyType;

  @Prop({ required: true, trim: true }) body: string;

  @Prop({ default: false }) read: boolean;
  @Prop({ default: null }) readAt: Date | null;
}
export const BoardMessageSchema = SchemaFactory.createForClass(BoardMessage);
