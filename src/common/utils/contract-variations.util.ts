// ═══════════════════════════════════════════════════════════════
// Rules shared by every kind of contract that can be varied (CRM
// contracts and deal contracts): reference numbering, how the clauses a
// user picked are stored, and the order a variation moves through.
// ═══════════════════════════════════════════════════════════════

import { BadRequestException } from '@nestjs/common';
import {
  VARIATION_PREFIX,
  VariationAction,
  VariationStatus,
  VariationType,
} from 'src/modules/crm/tools/schemas/contract.schema';
import { ContractClause, sameText } from './contract-clauses.util';

/** AMD-01, ADD-01, SL-01 … numbered per type, continuing past older logs. */
export function nextVariationRef(
  variations: { ref: string }[] | undefined,
  legacyAmendments: { ref: string }[] | undefined,
  type: VariationType,
): string {
  const prefix = VARIATION_PREFIX[type];
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const r of [
    ...(variations ?? []).map((v) => v.ref),
    ...(legacyAmendments ?? []).map((a) => a.ref),
  ]) {
    const m = re.exec(String(r));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(2, '0')}`;
}

export function variationAction(type: VariationType): VariationAction {
  return type === VariationType.WAIVER
    ? 'waive'
    : type === VariationType.SIDE_LETTER
      ? 'clarify'
      : 'amend';
}

export function variationLabel(type: VariationType): string {
  return {
    [VariationType.AMENDMENT]: 'Amendment',
    [VariationType.ADDENDUM]: 'Addendum',
    [VariationType.SIDE_LETTER]: 'Side letter',
    [VariationType.WAIVER]: 'Waiver',
    [VariationType.EXTENSION]: 'Extension',
  }[type];
}

/**
 * Turn the clauses a user picked into stored clauses, snapshotting the text
 * as it reads now. Every ref must exist and at least one clause must
 * actually change.
 */
export function buildVariationClauses(
  current: ContractClause[],
  type: VariationType,
  picked: { ref: string; amended: string }[],
) {
  if (!current.length) {
    throw new BadRequestException(
      'This contract has no clause text to change. Use an addendum to add terms instead.',
    );
  }
  if (!picked.length) {
    throw new BadRequestException('Select at least one clause to change.');
  }
  const seen = new Set<string>();
  let changed = 0;
  const out = picked.map((p) => {
    const cur = current.find((x) => x.ref === p.ref);
    if (!cur) {
      throw new BadRequestException(
        `Clause ${p.ref} does not exist in the current contract text.`,
      );
    }
    if (seen.has(p.ref)) {
      throw new BadRequestException(`Clause ${p.ref} is listed twice.`);
    }
    seen.add(p.ref);
    const amended = String(p.amended ?? '').trim();
    if (!amended) {
      throw new BadRequestException(
        `Clause ${p.ref} needs the text it should read afterwards.`,
      );
    }
    if (!sameText(amended, cur.text)) changed += 1;
    return {
      ref: cur.ref,
      title: cur.title,
      action: variationAction(type),
      original: cur.text,
      amended,
    };
  });
  if (!changed) {
    throw new BadRequestException(
      'None of the selected clauses has been changed yet.',
    );
  }
  return out;
}

export function buildAddendumClauses(
  list: { ref?: string; title: string; text: string }[],
) {
  const out = (list ?? [])
    .map((x, i) => ({
      ref: (x.ref ?? '').trim() || `Schedule ${i + 1}`,
      title: String(x.title ?? '').trim(),
      text: String(x.text ?? '').trim(),
    }))
    .filter((x) => x.title || x.text);
  if (!out.length) {
    throw new BadRequestException('Add at least one clause to the addendum.');
  }
  for (const x of out) {
    if (!x.title || !x.text) {
      throw new BadRequestException(
        `${x.ref} needs both a title and its text.`,
      );
    }
  }
  return out;
}

export const variationHistory = (user: string, action: string) => ({
  at: new Date(),
  user,
  action,
});

/** draft → review → approved → executed; review/approved can go back to draft. */
export const VARIATION_FLOW: Record<string, VariationStatus[]> = {
  [VariationStatus.DRAFT]: [VariationStatus.REVIEW],
  [VariationStatus.REVIEW]: [VariationStatus.DRAFT, VariationStatus.APPROVED],
  [VariationStatus.APPROVED]: [VariationStatus.DRAFT, VariationStatus.EXECUTED],
  [VariationStatus.EXECUTED]: [],
};

export const VARIATION_STATUS_LABEL: Record<string, string> = {
  draft: 'Returned to draft',
  review: 'Submitted for review',
  approved: 'Approved',
  executed: 'Executed and applied to the contract',
};
