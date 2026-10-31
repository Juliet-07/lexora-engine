// ═══════════════════════════════════════════════════════════════
// Supplies the COMMON merge fields (see contract-merge-common-fields.ts)
// for every contract pipeline — CRM / KYC, HR, board appointments, GRC
// deals — so a template written with {{partyBName}}, {{effectiveDate}},
// {{tenantCompanyRegistrationNumber}}… renders the same wherever it is
// drafted. A pipeline passes what it knows; anything it doesn't stays an
// empty string, which the renderers leave visible as {{token}} (a gap is
// never silent).
// ═══════════════════════════════════════════════════════════════

import { Model } from 'mongoose';
import { formatScopeOfWorkList } from './contract-fields.util';

export interface TenantCompany {
  name: string;
  registeredAddress: string;
  jurisdiction: string;
  registrationNumber: string;
  taxId: string;
  email: string;
  phone: string;
  /** The profile's contact person — the default signatory for Party A. */
  representative: string;
  representativeTitle: string;
}

export interface PartyInfo {
  name?: string;
  address?: string;
  email?: string;
  representative?: string;
  representativeTitle?: string;
}

const today = () => new Date().toISOString().slice(0, 10);

/** The workspace's own company details, read from its tenant profile. */
export async function loadTenantCompany(
  userModel: Model<any>,
  tenantId: string,
): Promise<TenantCompany> {
  const u: any = await userModel
    .findById(tenantId)
    .select('tenantProfile firstName lastName email phone')
    .lean();
  const p = u?.tenantProfile ?? {};
  const a = p.address ?? {};
  const c = p.contactPerson ?? {};
  return {
    name: p.businessName || u?.firstName || 'Your Provider',
    registeredAddress: [a.street, a.city, a.state, a.postalCode, a.country]
      .filter(Boolean)
      .join(', '),
    jurisdiction: a.country ?? '',
    registrationNumber: p.registrationNumber ?? '',
    taxId: p.taxId ?? '',
    email: c.email || u?.email || '',
    phone: c.phone || u?.phone || '',
    representative: [c.firstName, c.lastName].filter(Boolean).join(' '),
    representativeTitle: c.position ?? '',
  };
}

export interface CommonFieldsInput {
  tenant: TenantCompany;
  title?: string;
  reference?: string;
  governingLaw?: string;
  /** One deliverable per line — expanded into a numbered list. */
  scopeOfWork?: string;
  /** Party A defaults to the workspace's own company. */
  partyA?: PartyInfo;
  partyB?: PartyInfo;
  /** ISO dates (YYYY-MM-DD). effectiveDate defaults to today. */
  effectiveDate?: string;
  expiryDate?: string;
  value?: number | string | null;
  currency?: string;
}

/** Keeps only the entries that actually have a value. */
export function nonEmpty(
  fields: Record<string, string | undefined | null>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v != null && String(v).trim() !== '') out[k] = String(v);
  }
  return out;
}

/**
 * Later maps win, but an empty value never overwrites a real one — so a
 * pipeline's own (possibly blank) form value doesn't blank out what the
 * company profile already knows.
 */
export function overlayNonEmpty(
  ...maps: Record<string, string | undefined | null>[]
): Record<string, string> {
  return Object.assign({}, ...maps.map(nonEmpty));
}

export function buildCommonMergeFields(
  i: CommonFieldsInput,
): Record<string, string> {
  const t = i.tenant;
  // Party A is "us" unless a different party was named. Fields the caller
  // left blank fall back to the company profile only while Party A *is* us.
  const aIsUs = !i.partyA?.name || i.partyA.name === t.name;
  const a: PartyInfo = aIsUs
    ? {
        name: t.name,
        address: i.partyA?.address || t.registeredAddress,
        email: i.partyA?.email || t.email,
        representative: i.partyA?.representative || t.representative,
        representativeTitle:
          i.partyA?.representativeTitle || t.representativeTitle,
      }
    : i.partyA!;
  const b: PartyInfo = i.partyB ?? {};
  const bName = b.name ?? '';

  return {
    title: i.title ?? '',
    contractReference: i.reference ?? '',
    governingLaw: i.governingLaw ?? '',
    scopeOfWork: formatScopeOfWorkList(i.scopeOfWork ?? ''),

    partyAName: a.name ?? '',
    partyAAddress: a.address ?? '',
    partyARepresentative: a.representative ?? '',
    partyARepresentativeTitle: a.representativeTitle ?? '',
    partyBName: bName,
    partyBAddress: b.address ?? '',
    partyBEmail: b.email ?? '',
    partyBRepresentative: b.representative ?? '',
    partyBRepresentativeTitle: b.representativeTitle ?? '',

    tenantCompanyName: t.name,
    tenantRegisteredAddress: t.registeredAddress,
    tenantCompanyJurisdiction: t.jurisdiction,
    tenantCompanyRegistrationNumber: t.registrationNumber,
    tenantCompanyTaxId: t.taxId,
    tenantCompanyEmail: t.email,
    tenantCompanyPhone: t.phone,

    effectiveDate: i.effectiveDate || today(),
    expiryDate: i.expiryDate ?? '',
    todayDate: today(),

    contractValue: i.value != null && i.value !== '' ? String(i.value) : '',
    contractCurrency: i.currency ?? '',

    // Older names for the party fields — templates written with them keep
    // rendering (they are hidden from the editors' field lists).
    counterpartyName: bName,
    recipientName: bName,
    recipientEmail: b.email ?? '',
    clientRegisteredAddress: b.address ?? '',
    clientRepresentativeName: b.representative ?? '',
    clientRepresentativeTitle: b.representativeTitle ?? '',
    leadProfessionalName: a.representative ?? '',
    leadProfessionalTitle: a.representativeTitle ?? '',
  };
}
