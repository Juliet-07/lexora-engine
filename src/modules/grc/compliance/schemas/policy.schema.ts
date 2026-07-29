import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PolicyDocument = Policy & Document;

export enum PolicyType {
  ORGANISATION = 'organisation',
  BOARD = 'board',
}

@Schema({ _id: false })
export class PolicyAcknowledgment {
  @Prop({ required: true }) name: string;
  @Prop({ required: true, lowercase: true }) email: string;
  @Prop({ required: true }) signature: string;
  @Prop({ required: true, default: () => new Date() }) ackedAt: Date;
  @Prop({ enum: ['external', 'employee'], required: true }) source: string;
}
export const PolicyAcknowledgmentSchema =
  SchemaFactory.createForClass(PolicyAcknowledgment);

@Schema({ _id: false })
export class PolicyAckToken {
  @Prop({ required: true }) token: string;
  @Prop({ required: true, lowercase: true }) recipientEmail: string;
  @Prop({ required: true }) recipientName: string;
  @Prop({ required: true, default: () => new Date() }) createdAt: Date;
}
export const PolicyAckTokenSchema =
  SchemaFactory.createForClass(PolicyAckToken);

@Schema({ timestamps: true, collection: 'grc_policies' })
export class Policy {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) title: string;
  @Prop({ default: '' }) category: string;
  @Prop({ enum: PolicyType, required: true }) type: PolicyType;

  @Prop({ required: true }) fileName: string;
  @Prop({ default: null }) fileUrl: string | null;
  @Prop({ default: null }) mimeType: string | null;
  @Prop({ default: 0 }) size: number;

  @Prop({ type: [PolicyAcknowledgmentSchema], default: [] })
  acknowledgments: PolicyAcknowledgment[];
  // Only populated for board policies — one per current board member
  // at publish time, matching the Meeting/Board Pack pattern.
  @Prop({ type: [PolicyAckTokenSchema], default: [] })
  ackTokens: PolicyAckToken[];
}
export const PolicySchema = SchemaFactory.createForClass(Policy);
