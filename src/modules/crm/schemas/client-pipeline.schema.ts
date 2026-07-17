import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClientPipelineDocument = ClientPipelineRecord & Document;

export enum ClientPipelineStage {
  ACTIVE = 'active',
  RETAINED = 'retained',
  PAST = 'past',
}

@Schema({ timestamps: true, collection: 'crm_client_pipeline' })
export class ClientPipelineRecord {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // Same User._id as ClientProfileRecord.userId — one real client,
  // read jointly across modules, never duplicated.
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  clientUserId: Types.ObjectId;

  @Prop({
    enum: ClientPipelineStage,
    default: ClientPipelineStage.ACTIVE,
    index: true,
  })
  stage: ClientPipelineStage;

  @Prop({ type: Types.ObjectId, ref: 'Lead', default: null })
  convertedFromLeadId: Types.ObjectId | null;

  @Prop({ required: true, default: () => new Date() })
  clientSince: Date;

  @Prop({ default: null })
  churnedAt: Date | null;

  @Prop({ default: null })
  churnReason: string | null;

  // Real once Projects exists — "deals" is being renamed to
  // "projects" and will be counted from that module once built.
  @Prop({ default: 0 })
  projectCount: number;
}

export const ClientPipelineSchema =
  SchemaFactory.createForClass(ClientPipelineRecord);
