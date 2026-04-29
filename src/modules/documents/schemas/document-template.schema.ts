import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DocumentTemplateDocument = DocumentTemplate & Document;

@Schema({ timestamps: true })
export class DocumentTemplate {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description: string;

  @Prop({ required: true })
  category: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: [String], default: [] })
  variables: string[];

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const DocumentTemplateSchema = SchemaFactory.createForClass(DocumentTemplate);
