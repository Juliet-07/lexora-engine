// ═══════════════════════════════════════════════════════════════
// Redline rendering shared by CRM contracts and deal contracts:
// a word-level diff between a clause as signed and as it now reads,
// and the small "AMD-02" badge that marks a clause a variation changed.
// Output is self-contained HTML with inline styles (it is shown inside
// the app, so no stylesheet is assumed).
// ═══════════════════════════════════════════════════════════════

export const escapeHtml = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const DEL =
  'background:#fde8e8;color:#b42318;text-decoration:line-through;border-radius:2px;';
const INS = 'background:#e3f6ea;color:#067647;border-radius:2px;';

export interface DiffOp {
  t: 'eq' | 'del' | 'ins';
  s: string;
}

// Beyond this many token pairs the exact diff is skipped (the whole text
// is shown as removed then added) so a huge clause can't stall a request.
const MAX_CELLS = 4_000_000;

/** Word-level diff. Whitespace is kept with the words around it. */
export function diffWords(before: string, after: string): DiffOp[] {
  const a = String(before ?? '').match(/\s+|[^\s]+/g) ?? [];
  const b = String(after ?? '').match(/\s+|[^\s]+/g) ?? [];
  if (a.length * b.length > MAX_CELLS) {
    return [
      { t: 'del', s: before },
      { t: 'ins', s: after },
    ];
  }
  // Longest common subsequence over the tokens.
  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = Array.from(
    { length: n + 1 },
    () => new Uint32Array(m + 1),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const raw: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      raw.push({ t: 'eq', s: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ t: 'del', s: a[i++] });
    } else {
      raw.push({ t: 'ins', s: b[j++] });
    }
  }
  while (i < n) raw.push({ t: 'del', s: a[i++] });
  while (j < m) raw.push({ t: 'ins', s: b[j++] });

  // Merge neighbours of the same kind; a lone space between two changes
  // is folded into them so the marked-up text reads as one edit.
  const merged: DiffOp[] = [];
  for (const op of raw) {
    const last = merged[merged.length - 1];
    if (last && last.t === op.t) last.s += op.s;
    else merged.push({ ...op });
  }
  for (let k = 1; k < merged.length - 1; k++) {
    const op = merged[k];
    if (
      op.t === 'eq' &&
      /^\s+$/.test(op.s) &&
      merged[k - 1].t !== 'eq' &&
      merged[k + 1].t !== 'eq'
    ) {
      merged[k - 1].s += op.s;
      merged[k + 1].s = op.s + merged[k + 1].s;
      // Both neighbours (a del/ins pair, in either order) now carry the
      // space, so it shows in the old and the new wording.
      if (merged[k - 1].t === merged[k + 1].t) {
        merged[k - 1].s += merged[k + 1].s;
        merged.splice(k, 2);
      } else {
        merged.splice(k, 1);
      }
      k--;
    }
  }
  return merged;
}

/** The diff as one paragraph: removed text struck through, added text green. */
export function diffHtml(before: string, after: string): string {
  const body = diffWords(before, after)
    .map((op) =>
      op.t === 'eq'
        ? escapeHtml(op.s)
        : `<span style="${op.t === 'del' ? DEL : INS}">${escapeHtml(op.s)}</span>`,
    )
    .join('');
  return `<p style="white-space:pre-line">${body}</p>`;
}

/** "AMD-02" (or "WAV-01 (waive)") pill shown beside a changed clause heading. */
export function badgeHtml(
  variationRef: string,
  action?: string,
  kind: 'change' | 'addendum' = 'change',
): string {
  const colours =
    kind === 'addendum'
      ? 'background:#e6f3fb;color:#1f78a8;'
      : 'background:#eeebfd;color:#5a49c9;';
  const label =
    action && action !== 'amend' ? `${variationRef} (${action})` : variationRef;
  return (
    `<span data-variation-badge="${escapeHtml(variationRef)}" ` +
    `title="Changed by ${escapeHtml(variationRef)}" ` +
    `style="${colours}font-size:10px;font-weight:700;padding:1px 7px;` +
    `border-radius:999px;margin-left:8px;vertical-align:middle;` +
    `font-family:system-ui,sans-serif;">${escapeHtml(label)}</span>`
  );
}

/** Left-bar styling for text a variation changed (Current / Redline views). */
export const CHANGED_BAR =
  'border-left:3px solid #6c5ce7;padding-left:10px;background:rgba(108,92,231,.05);';
export const ADDED_BAR =
  'border-left:3px solid #2d9cdb;padding-left:10px;background:rgba(45,156,219,.05);';
