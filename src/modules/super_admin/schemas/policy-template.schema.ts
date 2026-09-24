import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PolicyTemplateDocument = PolicyTemplate & Document;

export enum PolicyTemplateStatus {
  DRAFT = 'Draft',
  PUBLISHED = 'Published',
}

@Schema({ _id: false })
export class PolicyTemplateSection {
  @Prop({ required: true, trim: true }) title: string;
  // HTML from the super-admin rich text editor — copied verbatim
  // into a tenant's policy sections when the template is selected.
  @Prop({ default: '' }) content: string;
}
export const PolicyTemplateSectionSchema = SchemaFactory.createForClass(
  PolicyTemplateSection,
);

// Deliberately no tenantId — authored exclusively by Super Admin
// under the GRC module's "Policies" area, matching the
// KnowledgeEntry ("Legal Knowledge Base") pattern: one global,
// versionless catalogue every tenant reads the published slice of
// when starting a new policy from a template.
@Schema({ timestamps: true, collection: 'grc_policy_templates' })
export class PolicyTemplate {
  @Prop({ required: true, trim: true, maxlength: 200 }) title: string;

  // Matches the tenant-side policy category list (Legal and
  // Compliance, IT/Data/Cyber, …) so a tenant creating a policy can
  // filter templates down to the category they picked — free text
  // here (not an enum) so Super Admin can introduce new categories
  // without a backend release.
  @Prop({ required: true, trim: true, index: true }) category: string;

  @Prop({ default: '' }) description: string;

  @Prop({ type: [PolicyTemplateSectionSchema], default: [] })
  sections: PolicyTemplateSection[];

  @Prop({
    enum: PolicyTemplateStatus,
    default: PolicyTemplateStatus.DRAFT,
    index: true,
  })
  status: PolicyTemplateStatus;

  @Prop({ default: null }) publishedAt: Date | null;
}
export const PolicyTemplateSchema =
  SchemaFactory.createForClass(PolicyTemplate);
