import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BoardMessageDocument = BoardMessage & Document;

// Board Directory messaging — "board members are able to see other
// board members and message them" (PO, Oct 2026). A flat per-message
// record between two directors on the same tenant's board, the same
// shape convention used for every other tenant↔counterpart thread in
// this codebase (MandateMessage, AdrCaseMessage: tenantId + the two
// parties + body + timestamps, no separate "conversation" document) —
// here the two parties are both board members rather than one tenant
// side and one external side, so both ends are a boardMemberId.
//
// A "thread" between two directors is derived, not stored: it's just
// every BoardMessage where {senderBoardMemberId, recipientBoardMemberId}
// matches the pair in either order (see BoardMessagingService#getThread).
@Schema({ timestamps: true, collection: 'board_messages' })
export class BoardMessage {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'BoardMember',
    required: true,
    index: true,
  })
  senderBoardMemberId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'BoardMember',
    required: true,
    index: true,
  })
  recipientBoardMemberId: Types.ObjectId;

  @Prop({ required: true, trim: true }) body: string;

  @Prop({ default: false }) read: boolean;
  @Prop({ default: null }) readAt: Date | null;
}
export const BoardMessageSchema = SchemaFactory.createForClass(BoardMessage);
