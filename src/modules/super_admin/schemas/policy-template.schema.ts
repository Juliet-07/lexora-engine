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

  // The policy as ONE rich-text document (like a contract template). Heading
  // 1–3 mark its parts: a tenant's policy is split at them into sections, and
  // the contents page lists them.
  @Prop({ default: '' }) body: string;

  // Legacy — templates saved before the single body existed. Still read (see
  // templateBodyHtml) so they keep working; new saves leave it empty.
  @Prop({ type: [PolicyTemplateSectionSchema], default: [] })
  sections: PolicyTemplateSection[];

  // Cover page (rich text, merge fields allowed). Empty = no cover page.
  // Copied into a tenant's policy when the template is selected, the same
  // way contract templates carry a cover page.
  @Prop({ default: '' }) coverPage: string;

  // A contents page, built from the body's headings at the time the policy
  // is shown or exported — never typed by hand, so it cannot drift.
  @Prop({ default: false }) tocEnabled: boolean;
  @Prop({ default: 'Table of Contents' }) tocTitle: string;

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
