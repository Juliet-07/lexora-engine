// Pure routing rules for the approval of employee-submitted bills and
// quotes. Kept free of Nest/Mongoose so the rules can be tested alone.
//
// The account owner always has the final say: an owner approval
// completes any approval on its own, whatever the tier says.

export interface ApprovalTierLike {
  name?: string;
  min: number;
  max: number | null;
  mode: 'single' | 'dual';
  approverIds: string[];
  backupId?: string;
}

export interface ApprovalRulesLike {
  selfApprovalRestriction?: boolean;
}

export interface ApprovalState {
  tierName: string;
  mode: 'single' | 'dual';
  // Everyone (other than the owner) allowed to approve this item.
  approverIds: string[];
  approverNames: string[];
  approvals: { userId: string; name: string; at: Date }[];
  rejectedReason?: string;
}

export interface RoutingInput {
  amount: number;
  submitterId: string;
  tiers: ApprovalTierLike[];
  rules: ApprovalRulesLike;
  // Employees holding the Finance Manager role.
  financeManagerIds: string[];
  // true for quotes: the payment tiers do not apply, they go to the
  // finance managers (and the owner).
  ignoreTiers?: boolean;
}

export interface RoutingResult {
  tierName: string;
  mode: 'single' | 'dual';
  approverIds: string[];
}

export function pickTier(
  tiers: ApprovalTierLike[],
  amount: number,
): ApprovalTierLike | null {
  const matching = (tiers ?? []).filter(
    (t) =>
      Array.isArray(t.approverIds) &&
      t.approverIds.length > 0 &&
      amount >= (t.min ?? 0) &&
      (t.max === null || t.max === undefined || amount <= t.max),
  );
  if (!matching.length) return null;
  // Highest "from" wins if tiers ever touch at a boundary.
  return matching.sort((a, b) => (b.min ?? 0) - (a.min ?? 0))[0];
}

export function routeApproval(input: RoutingInput): RoutingResult {
  const tier = input.ignoreTiers ? null : pickTier(input.tiers, input.amount);
  let ids: string[];
  let tierName = 'Finance managers';
  let mode: 'single' | 'dual' = 'single';
  if (tier) {
    tierName = tier.name || 'Approval tier';
    mode = tier.mode === 'dual' ? 'dual' : 'single';
    ids = [...tier.approverIds];
    if (tier.backupId) ids.push(tier.backupId);
  } else {
    ids = [...input.financeManagerIds];
  }
  ids = Array.from(new Set(ids.filter(Boolean)));
  if (input.rules?.selfApprovalRestriction !== false) {
    ids = ids.filter((id) => id !== input.submitterId);
  }
  // A dual tier can only ask for as many approvals as there are
  // people who could give them; the owner can always step in.
  if (mode === 'dual' && ids.length < 2) mode = 'single';
  return { tierName, mode, approverIds: ids };
}

export interface ApprovalActor {
  id: string;
  name: string;
  isOwner: boolean;
}

export function canApprove(
  state: ApprovalState,
  actor: ApprovalActor,
  submitterId: string,
  rules: ApprovalRulesLike,
): { ok: boolean; reason?: string } {
  if (actor.isOwner) return { ok: true };
  if (
    rules?.selfApprovalRestriction !== false &&
    submitterId &&
    actor.id === submitterId
  )
    return { ok: false, reason: 'You cannot approve something you submitted.' };
  if (!state.approverIds.includes(actor.id))
    return {
      ok: false,
      reason: 'You are not one of the approvers for this item.',
    };
  if (state.approvals.some((a) => a.userId === actor.id))
    return { ok: false, reason: 'You have already approved this item.' };
  return { ok: true };
}

// Records the approval; `complete` is true when nothing more is needed.
export function recordApproval(
  state: ApprovalState,
  actor: ApprovalActor,
  now = new Date(),
): { state: ApprovalState; complete: boolean } {
  const approvals = [
    ...state.approvals,
    { userId: actor.id, name: actor.name, at: now },
  ];
  const needed = state.mode === 'dual' ? 2 : 1;
  const complete = actor.isOwner || approvals.length >= needed;
  return { state: { ...state, approvals }, complete };
}
