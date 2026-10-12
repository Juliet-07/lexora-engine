import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BoardEvaluationCycleDocument = BoardEvaluationCycle & Document;
export type BoardEvaluationSubmissionDocument = BoardEvaluationSubmission &
  Document;

export enum BoardEvaluationCycleStatus {
  OPEN = 'Open',
  CLOSED = 'Closed',
}

// PO (Oct 2026): "Peer review means the board member is able to
// evaluate the peer according to each board member... Same thing as
// when doing committee eval" — so Peer and Committee are each one
// submission per target (every other director / every committee the
// reviewer sits on), not one flat form. Self is a single submission.
// Chair is a single submission per reviewer, about the one current
// Board Chair — and is never shown to the Chair themself (the
// board-portal context endpoint hides that tab for them).
export enum BoardEvaluationType {
  SELF = 'Self',
  PEER = 'Peer',
  CHAIR = 'Chair',
  COMMITTEE = 'Committee',
}

@Schema({ _id: false })
export class EvaluationRating {
  @Prop({ required: true }) question: string;
  @Prop({ required: true, min: 1, max: 5 }) score: number;
}
export const EvaluationRatingSchema =
  SchemaFactory.createForClass(EvaluationRating);

@Schema({ timestamps: true, collection: 'grc_board_evaluation_cycles' })
export class BoardEvaluationCycle {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) title: string;
  @Prop({ required: true }) dueDate: Date;

  @Prop({
    enum: BoardEvaluationCycleStatus,
    default: BoardEvaluationCycleStatus.OPEN,
    index: true,
  })
  status: BoardEvaluationCycleStatus;
  @Prop({ default: null }) closedAt: Date | null;
}
export const BoardEvaluationCycleSchema =
  SchemaFactory.createForClass(BoardEvaluationCycle);

// One row per (cycle, reviewer, type, target/committee) — upserted, so
// a director can revise their own answers any time before the cycle
// closes rather than piling up duplicates. The unique index below is
// the data-integrity backstop for that same guarantee: Mongo treats
// null consistently across documents, so e.g. two Self rows for the
// same reviewer in the same cycle (targetId/committeeId both null on
// both) collide correctly, while two Peer rows for different targets
// (targetId differs) never do.
@Schema({ timestamps: true, collection: 'grc_board_evaluation_submissions' })
export class BoardEvaluationSubmission {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'BoardEvaluationCycle',
    required: true,
    index: true,
  })
  cycleId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'BoardMember',
    required: true,
    index: true,
  })
  reviewerId: Types.ObjectId;
  @Prop({ required: true }) reviewerName: string;

  @Prop({ enum: BoardEvaluationType, required: true, index: true })
  type: BoardEvaluationType;

  // Peer/Chair only — who is being reviewed. Null for Self/Committee.
  @Prop({
    type: Types.ObjectId,
    ref: 'BoardMember',
    default: null,
    index: true,
  })
  targetId: Types.ObjectId | null;
  @Prop({ default: '' }) targetName: string;

  // Committee only.
  @Prop({ type: Types.ObjectId, ref: 'Committee', default: null, index: true })
  committeeId: Types.ObjectId | null;
  @Prop({ default: '' }) committeeName: string;

  @Prop({ type: [EvaluationRatingSchema], default: [] })
  ratings: EvaluationRating[];
  @Prop({ default: '' }) comment: string;
  @Prop({ required: true, default: () => new Date() }) submittedAt: Date;
}
export const BoardEvaluationSubmissionSchema = SchemaFactory.createForClass(
  BoardEvaluationSubmission,
);
BoardEvaluationSubmissionSchema.index(
  { cycleId: 1, reviewerId: 1, type: 1, targetId: 1, committeeId: 1 },
  { unique: true },
);
