import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type KnowledgeEntryDocument = KnowledgeEntry & Document;

export enum KnowledgeCategory {
  STATUTE = 'Statute',
  REGULATION = 'Regulation',
  CASE_LAW = 'Case Law',
  INTERNATIONAL = 'International',
  COMMENTARY = 'Commentary',
  UPDATE = 'Update',
}

export enum KnowledgeStatus {
  DRAFT = 'Draft',
  PUBLISHED = 'Published',
}

// Deliberately no tenantId — this is the first genuinely global
// collection in the codebase. Authored exclusively by Super Admin;
// every tenant reads the same published set. See
// KnowledgeBaseService for the draft/published split.
@Schema({ timestamps: true, collection: 'legal_knowledge_entries' })
export class KnowledgeEntry {
  @Prop({ required: true, trim: true, maxlength: 200 }) title: string;

  @Prop({ enum: KnowledgeCategory, required: true, index: true })
  category: KnowledgeCategory;

  @Prop({ required: true, trim: true, index: true })
  practiceArea: string;

  @Prop({ default: '' }) jurisdiction: string;

  @Prop({ required: true, maxlength: 600 }) summary: string;

  // HTML from the rich text editor.
  @Prop({ required: true, default: '' }) content: string;

  @Prop({ default: '' }) reference: string;
  @Prop({ default: '' }) source: string;
  @Prop({ default: '' }) externalLink: string;

  @Prop({
    enum: KnowledgeStatus,
    default: KnowledgeStatus.DRAFT,
    index: true,
  })
  status: KnowledgeStatus;

  // Set once, the first time an entry goes live — unpublishing never
  // clears it, matching the confirmed prototype (setStatus keeps the
  // original publishedAt via `?? now`).
  @Prop({ default: null }) publishedAt: Date | null;
}
export const KnowledgeEntrySchema =
  SchemaFactory.createForClass(KnowledgeEntry);
