// Pure share-ledger maths — no database access, so the same rules are
// applied identically by the cap-table service, the org-structure
// guards (a node that still holds shares can't lose its Shareholder
// role or be deleted) and the smoke tests.
//
// Holdings are never stored. They are the running total of the
// transaction ledger:
//   Issuance  company → holder      (+ to)
//   Transfer  holder  → holder      (− from, + to)
//   Buyback   holder  → company     (− from)
//   Valuation sets a price only; no shares move.

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

/** Shares held per (node, class), zero/negative rows dropped. */
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

/** Shares in issue per class (issued − bought back). */
export function computeIssuedByClass(txs: LedgerTx[]): Map<string, number> {
  const issued = new Map<string, number>();
  for (const t of txs) {
    const cls = str(t.shareClassId);
    if (!cls) continue;
    if (t.type === 'Issuance')
      issued.set(cls, (issued.get(cls) ?? 0) + (t.shares ?? 0));
    if (t.type === 'Buyback')
      issued.set(cls, (issued.get(cls) ?? 0) - (t.shares ?? 0));
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
