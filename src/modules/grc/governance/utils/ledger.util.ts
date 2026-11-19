// Pure share-ledger maths — no database access, so the same rules are
// applied identically by the cap-table service, the org-structure
// guards (a node that still holds shares can't lose its Shareholder
// role or be deleted) and the smoke tests.
//
// The share register starts out belonging to the COMPANY and is shared
// out to shareholders. Holdings are never stored; they are the running
// total of the transaction ledger:
//   Issuance  company → holder      (+ to; counts against the authorised cap)
//   Transfer  holder  → holder      (− from, + to)
//             company → holder      (resale of treasury shares: fromNodeId empty)
//   Buyback   holder  → company     (− from; the shares go back to the
//                                    company as treasury shares — they are
//                                    NOT cancelled and NOT spread across the
//                                    other shareholders)
//   Valuation sets a price only; no shares move.
//
// Shares the company holds (bought back, not yet resold) stay in the
// register total, so no other holder's percentage moves when a holder
// sells back. They carry no vote and are not valued as owned by anyone
// else.

export interface LedgerTx {
  type: string;
  date?: Date | string;
  fromNodeId?: any;
  toNodeId?: any;
  shareClassId?: any;
  shares?: number;
  pricePerShare?: number;
}

const str = (v: any): string | null => (v ? String(v) : null);

export const holdingKey = (nodeId: string, classId: string) =>
  `${nodeId}|${classId}`;

/** Sorts oldest-first, with createdAt-style stability for equal dates. */
export function chronological<T extends LedgerTx>(txs: T[]): T[] {
  return txs
    .map((t, i) => ({ t, i }))
    .sort(
      (a, b) =>
        new Date(a.t.date ?? 0).getTime() - new Date(b.t.date ?? 0).getTime() ||
        a.i - b.i,
    )
    .map((x) => x.t);
}

/** Shares held per (node, class), zero/negative rows dropped. The company
 *  itself is not a node — see `computeTreasury`. */
export function computeHoldings(txs: LedgerTx[]): Map<string, number> {
  const held = new Map<string, number>();
  const add = (node: string | null, cls: string | null, n: number) => {
    if (!node || !cls) return;
    const k = holdingKey(node, cls);
    held.set(k, (held.get(k) ?? 0) + n);
  };
  for (const t of chronological(txs)) {
    const n = t.shares ?? 0;
    const cls = str(t.shareClassId);
    if (t.type === 'Issuance') add(str(t.toNodeId), cls, n);
    else if (t.type === 'Transfer') {
      add(str(t.fromNodeId), cls, -n);
      add(str(t.toNodeId), cls, n);
    } else if (t.type === 'Buyback') add(str(t.fromNodeId), cls, -n);
  }
  for (const [k, v] of [...held]) if (v <= 0) held.delete(k);
  return held;
}

/**
 * Shares the company itself holds, per class: everything bought back from
 * shareholders, less any it has resold (a Transfer with no seller).
 */
export function computeTreasury(txs: LedgerTx[]): Map<string, number> {
  const treasury = new Map<string, number>();
  const add = (cls: string | null, n: number) => {
    if (!cls) return;
    treasury.set(cls, (treasury.get(cls) ?? 0) + n);
  };
  for (const t of chronological(txs)) {
    const n = t.shares ?? 0;
    const cls = str(t.shareClassId);
    if (t.type === 'Buyback') add(cls, n);
    else if (t.type === 'Transfer' && !str(t.fromNodeId)) add(cls, -n);
  }
  for (const [k, v] of [...treasury]) if (v <= 0) treasury.delete(k);
  return treasury;
}

/**
 * Shares in issue per class — everything issued out of the authorised
 * amount, including shares now held by the company as treasury. A buyback
 * does not take shares out of issue; it moves them to the company.
 */
export function computeIssuedByClass(txs: LedgerTx[]): Map<string, number> {
  const issued = new Map<string, number>();
  for (const t of txs) {
    const cls = str(t.shareClassId);
    if (!cls) continue;
    if (t.type === 'Issuance')
      issued.set(cls, (issued.get(cls) ?? 0) + (t.shares ?? 0));
  }
  return issued;
}

/** Total shares a node holds across every class. */
export function sharesHeldBy(txs: LedgerTx[], nodeId: string): number {
  let total = 0;
  for (const [k, v] of computeHoldings(txs)) {
    if (k.startsWith(`${nodeId}|`)) total += v;
  }
  return total;
}

/** Latest price-per-share mark (Valuation, else the last priced trade). */
export function latestPrice(txs: LedgerTx[]): number {
  const ordered = chronological(txs);
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (ordered[i].type === 'Valuation' && (ordered[i].pricePerShare ?? 0) > 0)
      return ordered[i].pricePerShare as number;
  }
  for (let i = ordered.length - 1; i >= 0; i--) {
    if ((ordered[i].pricePerShare ?? 0) > 0)
      return ordered[i].pricePerShare as number;
  }
  return 0;
}

/**
 * Whole months elapsed from `from` to `to` (calendar months, day of
 * month respected — Jan 31 → Feb 28 is 0 months, → Mar 31 is 2).
 */
export function monthsBetween(from: Date, to: Date): number {
  let m =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) m -= 1;
  return Math.max(0, m);
}

/**
 * Linear vesting with a cliff: nothing before the cliff; at the cliff
 * the time already served vests in one go; then evenly per month to
 * the end of the period.
 */
export function vestedShares(
  total: number,
  grantDate: Date,
  cliffMonths: number,
  periodMonths: number,
  asOf: Date = new Date(),
): number {
  const elapsed = monthsBetween(grantDate, asOf);
  if (elapsed < cliffMonths) return 0;
  if (elapsed >= periodMonths) return total;
  return Math.floor((total * elapsed) / periodMonths);
}
