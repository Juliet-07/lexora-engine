import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GovernanceCodeDocument = GovernanceCode & Document;

export enum GovernanceCodeCategory {
  CODE_OF_CONDUCT = 'Code of Conduct',
  GOVERNANCE_CHARTER = 'Governance Charter',
  BOARD_CHARTER = 'Board Charter',
  ETHICS = 'Ethics',
  OTHER = 'Other',
}

export enum GovernanceCodeStatus {
  DRAFT = 'Draft',
  PUBLISHED = 'Published',
}

@Schema({ _id: false })
export class CodeAttachment {
  @Prop({ required: true }) name: string;
  @Prop({ default: null }) fileUrl: string | null;
  @Prop({ default: null }) mimeType: string | null;
  @Prop({ default: 0 }) size: number;
  @Prop({ required: true, default: () => new Date() }) uploadedAt: Date;
}
export const CodeAttachmentSchema =
  SchemaFactory.createForClass(CodeAttachment);

@Schema({ timestamps: true, collection: 'grc_governance_codes' })
export class GovernanceCode {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ enum: GovernanceCodeCategory, required: true })
  category: GovernanceCodeCategory;

  @Prop({ default: '' })
  body: string;

  @Prop({ type: [CodeAttachmentSchema], default: [] })
  documents: CodeAttachment[];

  @Prop({ default: 1 })
  version: number;

  @Prop({ enum: GovernanceCodeStatus, default: GovernanceCodeStatus.DRAFT })
  status: GovernanceCodeStatus;
}
export const GovernanceCodeSchema =
  SchemaFactory.createForClass(GovernanceCode);
