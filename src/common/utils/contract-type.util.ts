// The contract form no longer asks for a "type" — it is worked out here so
// the register can still be filtered by it. Platform templates use a
// category enum (Employment, Commercial, NDA…) and a contract uses a
// different, smaller one (MSA, SOW, NDA…), so only the clear matches are
// mapped: a recognisable word in the title first, then the NDA / Property
// categories, then who the contract is with (a vendor is a Supplier
// agreement). Anything else is an MSA — the general-purpose agreement.

import { ContractType } from 'src/modules/crm/tools/schemas/contract.schema';

const BY_TITLE: [RegExp, ContractType][] = [
  [/\b(nda|non[- ]?disclosure|confidentiality)\b/i, ContractType.NDA],
  [/\b(sow|statement of work|work order)\b/i, ContractType.SOW],
  [/\b(lease|tenancy|rental)\b/i, ContractType.LEASE],
  [
    /\b(supplier|supply|procurement|purchase agreement|vendor)\b/i,
    ContractType.SUPPLIER,
  ],
  [
    /\b(msa|master (services|service) agreement|master agreement)\b/i,
    ContractType.MSA,
  ],
];

const BY_CATEGORY: Record<string, ContractType> = {
  NDA: ContractType.NDA,
  Property: ContractType.LEASE,
};

export function inferContractType(input: {
  title?: string;
  templateTitle?: string;
  templateCategory?: string;
  withVendor?: boolean;
}): ContractType {
  for (const text of [input.title, input.templateTitle]) {
    if (!text) continue;
    for (const [re, type] of BY_TITLE) if (re.test(text)) return type;
  }
  if (input.templateCategory && BY_CATEGORY[input.templateCategory]) {
    return BY_CATEGORY[input.templateCategory];
  }
  return input.withVendor ? ContractType.SUPPLIER : ContractType.MSA;
}
