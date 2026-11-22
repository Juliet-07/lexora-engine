// Pure rules for an approval chain — no Nest, no Mongoose — so they can be
// reasoned about (and tested) alone.
//
// A chain is: the configured reviewer / approver steps in order, then the
// tenant owner, who is always last. The owner has the final say: an owner
// decision at any point settles the whole chain.

export type StepStatus =
  | 'Waiting'
  | 'In review'
  | 'Approved'
  | 'Sent back'
  | 'Skipped';
export type RunStatus =
  | 'Not submitted'
  | 'In approval'
  | 'Approved'
  | 'Sent back';

export interface ChainStep {
  _id?: any;
  name: string;
  kind: 'Reviewer' | 'Approver' | 'Owner';
  userIds: string[];
  userNames: string[];
  status: StepStatus;
  decidedById: string | null;
  decidedByName: string;
  decidedAt: Date | null;
  note: string;
}

export interface ChainEvent {
  at: Date;
  byName: string;
  action: string;
  detail: string;
}

export interface Chain {
  status: RunStatus;
  steps: ChainStep[];
  submittedAt: Date | null;
  submittedById: string | null;
  submittedByName: string;
  sentBackReason: string;
  round: number;
  history: ChainEvent[];
}

export interface ChainActor {
  id: string;
  name: string;
  isOwner: boolean;
}

export interface StepTemplate {
  name: string;
  kind: 'Reviewer' | 'Approver';
  people: { id: string; name: string }[];
}

export const emptyChain = (): Chain => ({
  status: 'Not submitted',
  steps: [],
  submittedAt: null,
  submittedById: null,
  submittedByName: '',
  sentBackReason: '',
  round: 0,
  history: [],
});

const ev = (
  byName: string,
  action: string,
  detail = '',
  at = new Date(),
): ChainEvent => ({ at, byName, action, detail });

// Moves the chain on to the next step that someone has to decide, skipping
// any step nobody is left to decide. Sets the overall status.
function settle(chain: Chain, now: Date) {
  for (const step of chain.steps) {
    if (step.status === 'Approved' || step.status === 'Skipped') continue;
    if (step.status === 'In review') {
      chain.status = 'In approval';
      return;
    }
    if (step.status === 'Waiting') {
      if (step.kind !== 'Owner' && step.userIds.length === 0) {
        step.status = 'Skipped';
        step.note = 'Nobody else is assigned to this step';
        step.decidedAt = now;
        chain.history.push(
          ev('System', 'Skipped', `${step.name}: nobody else is assigned`, now),
        );
        continue;
      }
      step.status = 'In review';
      chain.status = 'In approval';
      return;
    }
  }
  chain.status = 'Approved';
}

/**
 * Starts (or restarts) the chain for a submission. The submitter can never
 * approve their own submission, so they are dropped from every step; an owner
 * submitting needs no one else's approval.
 */
export function startChain(
  previous: Chain | null | undefined,
  templates: StepTemplate[],
  submitter: ChainActor,
  now = new Date(),
): Chain {
  const history = [...(previous?.history ?? [])];
  const round = (previous?.round ?? 0) + 1;
  const steps: ChainStep[] = templates.map((t) => {
    const people = t.people.filter((p) => p.id !== submitter.id);
    return {
      name: t.name,
      kind: t.kind,
      userIds: people.map((p) => p.id),
      userNames: people.map((p) => p.name),
      status: 'Waiting' as StepStatus,
      decidedById: null,
      decidedByName: '',
      decidedAt: null,
      note: '',
    };
  });
  steps.push({
    name: 'Tenant owner',
    kind: 'Owner',
    userIds: [],
    userNames: ['Tenant owner'],
    status: 'Waiting',
    decidedById: null,
    decidedByName: '',
    decidedAt: null,
    note: '',
  });
  const chain: Chain = {
    status: 'In approval',
    steps,
    submittedAt: now,
    submittedById: submitter.id,
    submittedByName: submitter.name,
    sentBackReason: '',
    round,
    history,
  };
  chain.history.push(
    ev(
      submitter.name,
      round > 1 ? 'Resubmitted' : 'Submitted',
      round > 1 ? `Round ${round}` : '',
      now,
    ),
  );

  if (submitter.isOwner) {
    // The owner is the last step; nothing is left for anyone else to do.
    for (const s of steps) {
      if (s.kind === 'Owner') {
        s.status = 'Approved';
        s.decidedById = submitter.id;
        s.decidedByName = submitter.name;
        s.decidedAt = now;
        s.note = 'Submitted by the owner';
      } else {
        s.status = 'Skipped';
        s.decidedAt = now;
        s.note = 'Submitted by the owner';
      }
    }
    chain.status = 'Approved';
    chain.history.push(
      ev(submitter.name, 'Approved', 'Submitted by the owner', now),
    );
    return chain;
  }
  settle(chain, now);
  return chain;
}

export function currentStep(chain: Chain | null | undefined) {
  return chain?.steps.find((s) => s.status === 'In review') ?? null;
}

export function canDecide(
  chain: Chain | null | undefined,
  actor: ChainActor,
): { ok: boolean; reason?: string; step?: ChainStep } {
  if (!chain || chain.status !== 'In approval')
    return { ok: false, reason: 'This is not waiting for approval.' };
  const step = currentStep(chain);
  if (!step) return { ok: false, reason: 'This is not waiting for approval.' };
  if (actor.isOwner) return { ok: true, step };
  if (step.kind === 'Owner')
    return {
      ok: false,
      reason: 'Only the account owner can decide this step.',
    };
  if (!step.userIds.includes(actor.id))
    return {
      ok: false,
      reason: `This is with ${step.userNames.join(', ') || 'another reviewer'} (${step.name}). Only they, or the owner, can decide it.`,
    };
  return { ok: true, step };
}

/**
 * Records a decision. Approving advances to the next step; an owner approval
 * settles the whole chain. Sending back needs a reason and stops the chain
 * until the drafter resubmits.
 */
export function decideChain(
  chain: Chain,
  actor: ChainActor,
  decision: 'Approved' | 'Sent back',
  note: string,
  now = new Date(),
): Chain {
  const check = canDecide(chain, actor);
  if (!check.ok) throw new Error(check.reason);
  const step = check.step!;
  const text = (note ?? '').trim();
  if (decision === 'Sent back' && !text)
    throw new Error('Say why it is being sent back.');

  step.status = decision;
  step.decidedById = actor.id;
  step.decidedByName = actor.name;
  step.decidedAt = now;
  step.note = text;
  chain.history.push(
    ev(
      actor.name,
      decision === 'Approved' ? 'Approved' : 'Sent back',
      [step.name, text].filter(Boolean).join(': '),
      now,
    ),
  );

  if (decision === 'Sent back') {
    chain.status = 'Sent back';
    chain.sentBackReason = text;
    return chain;
  }
  if (actor.isOwner) {
    // Owner has the final say — nothing after (or before) is still needed.
    for (const s of chain.steps) {
      if (s.status !== 'Waiting') continue;
      if (s.kind === 'Owner') {
        s.status = 'Approved';
        s.decidedById = actor.id;
        s.decidedByName = actor.name;
        s.note = 'Settled by the owner';
      } else {
        s.status = 'Skipped';
        s.note = 'Settled by the owner';
      }
      s.decidedAt = now;
    }
  }
  settle(chain, now);
  return chain;
}

/** An edit after approval makes the approval void; edits mid-review are refused. */
export function voidApproval(
  chain: Chain,
  byName: string,
  reason: string,
  now = new Date(),
): Chain {
  const history = [
    ...chain.history,
    ev(byName, 'Approval voided', reason, now),
  ];
  return { ...emptyChain(), round: chain.round, history };
}

/** Plain-object form of a stored run (Mongoose doc or lean), ids as strings. */
export function toChain(run: any): Chain {
  if (!run) return emptyChain();
  const o = typeof run.toObject === 'function' ? run.toObject() : run;
  return {
    status: o.status ?? 'Not submitted',
    steps: (o.steps ?? []).map((s: any) => ({
      name: s.name,
      kind: s.kind,
      userIds: (s.userIds ?? []).map(String),
      userNames: s.userNames ?? [],
      status: s.status,
      decidedById: s.decidedById ? String(s.decidedById) : null,
      decidedByName: s.decidedByName ?? '',
      decidedAt: s.decidedAt ?? null,
      note: s.note ?? '',
    })),
    submittedAt: o.submittedAt ?? null,
    submittedById: o.submittedById ? String(o.submittedById) : null,
    submittedByName: o.submittedByName ?? '',
    sentBackReason: o.sentBackReason ?? '',
    round: o.round ?? 0,
    history: (o.history ?? []).map((h: any) => ({
      at: h.at,
      byName: h.byName ?? '',
      action: h.action ?? '',
      detail: h.detail ?? '',
    })),
  };
}
