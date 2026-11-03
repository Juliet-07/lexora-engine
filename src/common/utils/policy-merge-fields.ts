// ═══════════════════════════════════════════════════════════════
// Merge fields for POLICIES (and the governance codes built from the same
// template catalogue) — the same idea as contract merge fields: a template
// author drops {{companyName}}-style fields into the text, and when a tenant
// starts a policy from the template the fields are filled in where the system
// knows the value (our company, the policy's owner, version, dates…). The
// rest stay visible as {{token}} until the tenant fills them in the policy
// editor's Merge Fields panel, which rewrites a value everywhere it appears.
//
// Company fields deliberately use the SAME tokens as contracts
// (tenantCompanyName, tenantRegisteredAddress…), so an author learns one
// vocabulary across contracts and policies.
// ═══════════════════════════════════════════════════════════════

import { parse } from 'node-html-parser';
import type { MergeFieldDefinition } from './contract-merge-registry';
import type { TenantCompany } from './contract-common-fields';
import {
  escapeMergeValue,
  renderContractBody,
  renderContractBodyMarked,
} from './contract-fields.util';

type Seed = Omit<MergeFieldDefinition, 'modules' | 'areas'>;
const policyField = (f: Seed): MergeFieldDefinition => ({
  ...f,
  modules: ['grc'],
});

export const POLICY_MERGE_FIELDS: MergeFieldDefinition[] = [
  // ── Our company (from the workspace profile) ────────────────
  policyField({
    token: 'tenantCompanyName',
    label: 'Company name',
    description: "This workspace's own registered business name",
    group: 'Our company',
    input: 'text',
    example: 'Wekraft Ltd',
    source: 'auto',
    common: true,
  }),
  policyField({
    token: 'tenantRegisteredAddress',
    label: 'Registered address',
    description: "The company's registered office address",
    group: 'Our company',
    input: 'text',
    example: 'KG 7 Ave, Kigali, Rwanda',
    source: 'auto',
    common: true,
  }),
  policyField({
    token: 'tenantCompanyJurisdiction',
    label: 'Jurisdiction',
    description: 'Where the company is incorporated (its profile country)',
    group: 'Our company',
    input: 'text',
    example: 'Rwanda',
    source: 'auto',
    common: true,
  }),
  policyField({
    token: 'tenantCompanyRegistrationNumber',
    label: 'Registration number',
    description: "The company's registration number",
    group: 'Our company',
    input: 'text',
    example: '123456789',
    source: 'auto',
    common: true,
  }),
  policyField({
    token: 'tenantCompanyEmail',
    label: 'Contact email',
    description: "The company's contact email",
    group: 'Our company',
    input: 'text',
    example: 'legal@wekraft.example',
    source: 'auto',
    common: true,
  }),
  policyField({
    token: 'tenantCompanyPhone',
    label: 'Contact phone',
    description: "The company's contact phone number",
    group: 'Our company',
    input: 'text',
    example: '+250 788 000 000',
    source: 'auto',
    common: true,
  }),

  // ── The policy itself ───────────────────────────────────────
  policyField({
    token: 'policyTitle',
    label: 'Policy title',
    description: 'The title the policy was given when it was created',
    group: 'Policy',
    input: 'text',
    example: 'Information Security Policy',
    source: 'record',
    common: true,
  }),
  policyField({
    token: 'policyReference',
    label: 'Document reference',
    description: 'The policy’s document reference (e.g. POL-LEG-004)',
    group: 'Policy',
    input: 'text',
    example: 'POL-LEG-004',
    source: 'record',
    common: true,
  }),
  policyField({
    token: 'policyVersion',
    label: 'Version',
    description: 'The version the policy is at when it is created (v1)',
    group: 'Policy',
    input: 'text',
    example: 'v1',
    source: 'record',
    common: true,
  }),
  policyField({
    token: 'policyCategory',
    label: 'Category',
    description: 'The policy category chosen when it was created',
    group: 'Policy',
    input: 'text',
    example: 'IT, Data and Cyber',
    source: 'record',
    common: true,
  }),
  policyField({
    token: 'policyOwner',
    label: 'Policy owner',
    description: 'The person or role that owns the policy',
    group: 'Policy',
    input: 'text',
    example: 'Head of Compliance',
    source: 'record',
    common: true,
  }),
  policyField({
    token: 'approvalAuthority',
    label: 'Approval authority',
    description: 'Who approves the policy',
    group: 'Policy',
    input: 'text',
    example: 'Board of Directors',
    source: 'record',
    common: true,
  }),
  policyField({
    token: 'reviewFrequency',
    label: 'Review frequency',
    description: 'How often the policy is reviewed (Annual, Quarterly…)',
    group: 'Policy',
    input: 'text',
    example: 'Annual',
    source: 'record',
    common: true,
  }),
  policyField({
    token: 'effectiveDate',
    label: 'Effective date',
    description:
      'When the policy takes effect (today unless another date is typed in the panel)',
    group: 'Policy',
    input: 'date',
    example: '2026-11-02',
    source: 'auto',
    common: true,
  }),
  policyField({
    token: 'todayDate',
    label: "Today's date",
    description: 'The date the policy was created from the template',
    group: 'Policy',
    input: 'date',
    example: '2026-11-02',
    source: 'auto',
    common: true,
  }),

  // ── Contacts (typed on the policy) ──────────────────────────
  policyField({
    token: 'dpoName',
    label: 'Data protection officer',
    description: 'Name of the data protection officer',
    group: 'Contacts',
    input: 'text',
    example: 'Aline Uwase',
    source: 'form',
  }),
  policyField({
    token: 'dpoEmail',
    label: 'Data protection officer email',
    description: 'Where data-protection questions and requests go',
    group: 'Contacts',
    input: 'text',
    example: 'dpo@wekraft.example',
    source: 'form',
  }),
  policyField({
    token: 'securityContactName',
    label: 'Security contact',
    description: 'Person to report security incidents to',
    group: 'Contacts',
    input: 'text',
    example: 'Jean Mugisha',
    source: 'form',
  }),
  policyField({
    token: 'securityContactEmail',
    label: 'Security contact email',
    description: 'Mailbox for reporting security incidents',
    group: 'Contacts',
    input: 'text',
    example: 'security@wekraft.example',
    source: 'form',
  }),
  policyField({
    token: 'hrContactName',
    label: 'HR contact',
    description: 'Person in HR who handles questions about the policy',
    group: 'Contacts',
    input: 'text',
    example: 'Grace Ingabire',
    source: 'form',
  }),
  policyField({
    token: 'hrContactEmail',
    label: 'HR contact email',
    description: 'HR mailbox for questions about the policy',
    group: 'Contacts',
    input: 'text',
    example: 'hr@wekraft.example',
    source: 'form',
  }),
  policyField({
    token: 'complianceOfficerName',
    label: 'Compliance officer',
    description: 'Name of the compliance officer',
    group: 'Contacts',
    input: 'text',
    example: 'Eric Habimana',
    source: 'form',
  }),
  policyField({
    token: 'complianceOfficerEmail',
    label: 'Compliance officer email',
    description: 'Where compliance concerns and reports go',
    group: 'Contacts',
    input: 'text',
    example: 'compliance@wekraft.example',
    source: 'form',
  }),
  policyField({
    token: 'whistleblowerEmail',
    label: 'Whistleblowing email',
    description: 'Confidential channel for reporting wrongdoing',
    group: 'Contacts',
    input: 'text',
    example: 'speakup@wekraft.example',
    source: 'form',
  }),

  // ── Policy terms (typed on the policy) ──────────────────────
  policyField({
    token: 'dataRetentionPeriod',
    label: 'Data retention period',
    description: 'How long records are kept (e.g. 7 years)',
    group: 'Policy terms',
    input: 'text',
    example: '7 years',
    source: 'form',
  }),
  policyField({
    token: 'incidentResponseTime',
    label: 'Incident response time',
    description: 'How quickly an incident must be acknowledged',
    group: 'Policy terms',
    input: 'text',
    example: '24 hours',
    source: 'form',
  }),
  policyField({
    token: 'breachNotificationPeriod',
    label: 'Breach notification period',
    description: 'Deadline for notifying a data breach',
    group: 'Policy terms',
    input: 'text',
    example: '72 hours',
    source: 'form',
  }),
  policyField({
    token: 'passwordMinLength',
    label: 'Minimum password length',
    description: 'Shortest password allowed',
    group: 'Policy terms',
    input: 'text',
    example: '12 characters',
    source: 'form',
  }),
  policyField({
    token: 'trainingFrequency',
    label: 'Training frequency',
    description: 'How often staff must repeat the training',
    group: 'Policy terms',
    input: 'text',
    example: 'every year',
    source: 'form',
  }),
  policyField({
    token: 'giftLimit',
    label: 'Gift & hospitality limit',
    description: 'Value above which a gift must be declared',
    group: 'Policy terms',
    input: 'text',
    example: 'USD 50',
    source: 'form',
  }),
];

const iso = (d: Date | string | null | undefined): string => {
  if (!d) return '';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '' : x.toISOString().slice(0, 10);
};

/** The values the system can fill when a policy is created from a template. */
export function buildPolicyMergeFields(input: {
  company: TenantCompany;
  policy: {
    title?: string;
    category?: string;
    owner?: string;
    approvalAuthority?: string;
    reviewFrequency?: string;
    version?: string;
    documentReference?: string;
    effectiveDate?: Date | string | null;
  };
}): Record<string, string> {
  const { company: c, policy: p } = input;
  const today = new Date().toISOString().slice(0, 10);
  return {
    tenantCompanyName: c.name ?? '',
    tenantRegisteredAddress: c.registeredAddress ?? '',
    tenantCompanyJurisdiction: c.jurisdiction ?? '',
    tenantCompanyRegistrationNumber: c.registrationNumber ?? '',
    tenantCompanyEmail: c.email ?? '',
    tenantCompanyPhone: c.phone ?? '',
    policyTitle: p.title ?? '',
    policyReference: p.documentReference ?? '',
    policyVersion: p.version ?? 'v1',
    policyCategory: p.category ?? '',
    policyOwner: p.owner ?? '',
    approvalAuthority: p.approvalAuthority ?? '',
    reviewFrequency: p.reviewFrequency ?? '',
    effectiveDate: iso(p.effectiveDate) || today,
    todayDate: today,
  };
}

/** Section HTML with every {{field}} wrapped (filled or not) so the panel can find it. */
export const renderPolicyContent = (
  html: string,
  fields: Record<string, string>,
): string => renderContractBodyMarked(html ?? '', fields);

/** Section titles are plain text — values go in directly, gaps stay as {{token}}. */
export const renderPolicyTitle = (
  title: string,
  fields: Record<string, string>,
): string => renderContractBody(title ?? '', fields);

/**
 * Sets the value of one or more fields everywhere they appear in a piece of
 * policy HTML — what the editor's Merge Fields panel does. A field that is
 * emptied goes back to showing its {{token}}. Text the author typed around a
 * field is never touched.
 */
export function setPolicyFieldValues(
  html: string,
  values: Record<string, string>,
): string {
  const keys = Object.keys(values);
  if (!html || !keys.length) return html ?? '';
  const root = parse(html);
  let touched = false;
  for (const el of root.querySelectorAll('[data-merge]')) {
    const key = el.getAttribute('data-merge') ?? '';
    if (!(key in values)) continue;
    const value = String(values[key] ?? '');
    if (value.trim()) {
      el.removeAttribute('data-empty');
      el.set_content(escapeMergeValue(value));
    } else {
      el.setAttribute('data-empty', 'true');
      el.set_content(`{{${key}}}`);
    }
    touched = true;
  }
  const out = touched ? root.toString() : html;
  // Bare {{tokens}} (text the author typed, or an older policy) get wrapped
  // and filled the same way.
  return renderContractBodyMarked(out, values);
}
