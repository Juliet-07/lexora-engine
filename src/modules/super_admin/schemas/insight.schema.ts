import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type InsightDocument = Insight & Document;

export enum InsightCategory {
  GOVERNANCE = 'Governance',
  COMPLIANCE = 'Compliance',
  ESG = 'ESG',
  FINANCE = 'Finance',
  RISK = 'Risk',
  TECHNOLOGY = 'Technology',
}

export enum InsightStatus {
  DRAFT = 'Draft',
  PUBLISHED = 'Published',
}

// Public-website "Insights" blog, authored by Super Admin only.
// Deliberately no tenantId — same "first genuinely global collection"
// shape as KnowledgeEntry (see that schema's comment), except this one
// is read by the public marketing site (no auth), not by tenants.
@Schema({ timestamps: true, collection: 'insights' })
export class Insight {
  @Prop({ required: true, trim: true, maxlength: 200 }) title: string;

  // URL slug for the public article route (/insights/:slug). Unique so
  // the public detail page can look an article up unambiguously;
  // generated from the title on create unless one is supplied.
  @Prop({ required: true, trim: true, lowercase: true, unique: true })
  slug: string;

  @Prop({ enum: InsightCategory, required: true, index: true })
  category: InsightCategory;

  @Prop({ required: true, maxlength: 400 }) excerpt: string;

  // HTML from the rich text editor.
  @Prop({ required: true, default: '' }) content: string;

  @Prop({ default: '' }) coverImage: string;

  @Prop({ default: '' }) author: string;

  @Prop({
    enum: InsightStatus,
    default: InsightStatus.DRAFT,
    index: true,
  })
  status: InsightStatus;

  // Set once, the first time an article goes live — unpublishing never
  // clears it (same convention as KnowledgeEntry.publishedAt).
  @Prop({ default: null }) publishedAt: Date | null;
}
export const InsightSchema = SchemaFactory.createForClass(Insight);
