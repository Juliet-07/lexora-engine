import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WriteOffDocument = WriteOff & Document;

// One lifecycle, three checkpoints — not three unrelated concepts.
// A WriteOff record is created automatically at each checkpoint by
// FinanceService, giving one real audit trail across all three
// rather than three disconnected mentions.
export enum WriteOffStage {
  WIP_WRITE_DOWN = 'WIP write-down',
  CREDIT_NOTE = 'Credit note',
  BAD_DEBT_WRITE_OFF = 'Bad debt write-off',
}

export enum WriteOffStatus {
  PENDING_APPROVAL = 'Pending approval',
  APPROVED = 'Approved',
  POSTED = 'Posted',
}

@Schema({ timestamps: true, collection: 'crm_write_offs' })
export class WriteOff {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) ref: string;
  @Prop({ enum: WriteOffStage, required: true, index: true })
  stage: WriteOffStage;
  // Free-text pointer to the originating record (a TimeEntry id, a
  // CreditNote ref, or an Invoice ref) — the three stages point at
  // three different entity types, so this stays a reference string
  // rather than a single typed FK.
  @Prop({ required: true }) reference: string;
  @Prop({ required: true }) clientName: string;
  @Prop({ required: true }) mandateName: string;

  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) reason: string;
  @Prop({ required: true }) approvedBy: string;
  @Prop({ enum: WriteOffStatus, default: WriteOffStatus.PENDING_APPROVAL })
  status: WriteOffStatus;
}
export const WriteOffSchema = SchemaFactory.createForClass(WriteOff);
