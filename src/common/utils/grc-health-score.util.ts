// Shared across ESG's Dashboard (Governance pillar) and the GRC
// Overview page (top-of-page health score) — both need the exact
// same composite, so it lives here once rather than as two forkable
// copies. Ported faithfully from the confirmed prototype's
// grcHealthScore: risk band load, overdue obligations, open
// incidents, open deficiencies, floor/ceiling 0–100.

const BAND_PENALTY: Record<string, number> = {
  Extreme: 8,
  High: 4,
  Medium: 1,
  Low: 0,
};

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
