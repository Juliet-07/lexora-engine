import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PolicyTemplateDocument = PolicyTemplate & Document;

export enum PolicyTemplateStatus {
  DRAFT = 'Draft',
  PUBLISHED = 'Published',
}

// Which tenant-side feature this template is selectable from. Kept
// deliberately as one shared catalogue (not a second model) — a
// template is just reusable title+sections content, and Policies and
// Governance Codes both consume it the same way. Defaults to POLICY
// so every template created before this field existed keeps behaving
// exactly as it did (see PolicyTemplateService.getPublished for how
// that default is honored on documents that literally have no
// `appliesTo` stored yet).
export enum PolicyTemplateAppliesTo {
  POLICY = 'Policy',
  GOVERNANCE_CODE = 'Governance Code',
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

  @Prop({
    enum: PolicyTemplateAppliesTo,
    default: PolicyTemplateAppliesTo.POLICY,
    index: true,
  })
  appliesTo: PolicyTemplateAppliesTo;
}
export const PolicyTemplateSchema =
  SchemaFactory.createForClass(PolicyTemplate);
