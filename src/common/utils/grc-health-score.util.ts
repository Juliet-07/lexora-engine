// Shared across ESG's Dashboard (Governance pillar), the GRC Overview
// page (top-of-page health score), and the main tenant dashboard's
// "Business pulse" GRC slice — all three need the exact same
// composite so a tenant never sees two different numbers for "how
// healthy is GRC right now" (PO feedback, Oct 2026 — they previously
// didn't, which is the bug this file's second export fixes). Ported
// faithfully from the confirmed prototype's grcHealthScore: risk band
// load, overdue obligations, open incidents, open deficiencies,
// floor/ceiling 0–100.

const BAND_PENALTY: Record<string, number> = {
  Extreme: 8,
  High: 4,
  Medium: 1,
  Low: 0,
};

// Score→band thresholds for a single risk's likelihood×impact number.
// RiskService#scoreToBand (the risk register's own classification) and
// the tenant dashboard both delegate to this, so a risk is never
// "Extreme" on one screen and "High" on another.
const BAND_THRESHOLDS: [number, string][] = [
  [17, 'Extreme'],
  [10, 'High'],
  [5, 'Medium'],
  [1, 'Low'],
];
export function scoreToRiskBand(
  score: number,
): 'Extreme' | 'High' | 'Medium' | 'Low' {
  for (const [min, band] of BAND_THRESHOLDS) {
    if (score >= min) return band as any;
  }
  return 'Low';
}

export function computeGrcHealthScore(params: {
  /** One band string ("Extreme"|"High"|"Medium"|"Low") per open risk. */
  openRiskBands: string[];
  overdueObligations: number;
  openIncidents: number;
  openDeficiencies: number;
}): number {
  const bandPenalty = params.openRiskBands.reduce(
    (acc, band) => acc + (BAND_PENALTY[band] ?? 0),
    0,
  );
  const raw =
    100 -
    bandPenalty -
    params.overdueObligations * 5 -
    params.openIncidents * 3 -
    params.openDeficiencies * 2;
  return Math.max(0, Math.min(100, Math.round(raw)));
}
