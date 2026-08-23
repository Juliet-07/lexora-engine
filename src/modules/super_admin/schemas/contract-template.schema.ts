import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// ── Platform contract templates — deliberately NOT tenant-scoped
// (no tenantId). Owned and authored by the super admin, published
// out to every tenant when status is Published. A tenant's own
// contract templates (built in a later stage) are a separate real
// collection, merged with these at read time on the tenant side —
// this collection never gets tenant-specific edits written into it.
//
// Two real, distinct sources for a template's actual content:
// authored (rich-text `content`, built in-app) or uploaded (a real
// PDF/Word file already on disk, `content` left empty). A template
// is genuinely one or the other, never both — sourceType says
// which, and only the matching fields are ever populated.

export enum PlatformTemplateCategory {
  EMPLOYMENT = 'Employment',
  COMMERCIAL = 'Commercial',
  PROPERTY = 'Property',
  NDA = 'NDA',
  SERVICES = 'Services',
  CORPORATE = 'Corporate',
}
export enum PlatformTemplateStatus {
  DRAFT = 'Draft',
  PUBLISHED = 'Published',
}
export enum TemplateSourceType {
  AUTHORED = 'authored',
  UPLOADED = 'uploaded',
}

export type PlatformContractTemplateDocument = PlatformContractTemplate &
  Document;

@Schema({ timestamps: true, collection: 'platform_contract_templates' })
export class PlatformContractTemplate {
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ enum: PlatformTemplateCategory, required: true, index: true })
  category: PlatformTemplateCategory;
  @Prop({ default: '' }) jurisdiction: string;
  @Prop({ default: '' }) description: string;

  @Prop({ enum: TemplateSourceType, default: TemplateSourceType.AUTHORED })
  sourceType: TemplateSourceType;

  // Populated only when sourceType is 'authored'.
  @Prop({ default: '' }) content: string;

  // Populated only when sourceType is 'uploaded' — a real file
  // already on disk, served the same static-asset way engagement
  // letters already are (see main.ts's /uploads prefix). fileUrl is
  // the real, public path a tenant can fetch directly.
  @Prop({ default: null }) fileUrl: string | null;
  @Prop({ default: null }) fileName: string | null;
  @Prop({ default: null }) fileMimeType: string | null;
  @Prop({ default: null }) filePath: string | null; // real disk path, for deletion on replace/delete

  @Prop({ default: '1.0' }) version: string;
  @Prop({
    enum: PlatformTemplateStatus,
    default: PlatformTemplateStatus.DRAFT,
    index: true,
  })
  status: PlatformTemplateStatus;
  @Prop({ default: '' }) createdBy: string;
}
export const PlatformContractTemplateSchema = SchemaFactory.createForClass(
  PlatformContractTemplate,
);
