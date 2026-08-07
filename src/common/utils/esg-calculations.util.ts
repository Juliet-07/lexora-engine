// Pure formulas, hand-transcribed with exact fidelity from the
// confirmed prototype (esgStore.ts) — any deviation here is a real
// correctness bug, not a style choice. Shared across services since
// Metrics, Materiality, Framework and Dashboard all need at least
// one of these.

export interface MetricLike {
  value: number;
  baseline: number;
  target: number;
  direction: 'lower' | 'higher';
  intensityBasis: 'none' | 'per employee' | 'per m²' | 'per revenue unit';
  unit: string;
}

export interface OrgContextLike {
  employees: number;
  floorAreaSqm: number;
  revenueMillions: number;
}

/** Progress toward target, 0–100. Handles both directions. */
export function targetProgress(m: MetricLike): number {
  const span = m.baseline - m.target;
  if (span === 0) return m.value === m.target ? 100 : 0;
  const done = (m.baseline - m.value) / span;
  return Math.max(0, Math.min(100, Math.round(done * 100)));
}

/** Year-on-year change, positive = improvement regardless of direction. */
export function improvement(m: MetricLike): number {
  if (!m.baseline) return 0;
  const delta = ((m.value - m.baseline) / Math.abs(m.baseline)) * 100;
  return Number((m.direction === 'lower' ? -delta : delta).toFixed(1));
}

export function intensity(
  m: MetricLike,
  ctx: OrgContextLike,
): { value: number; label: string } | null {
  if (m.intensityBasis === 'none') return null;
  const divisor =
    m.intensityBasis === 'per employee'
      ? ctx.employees
      : m.intensityBasis === 'per m²'
        ? ctx.floorAreaSqm
        : ctx.revenueMillions;
  if (!divisor) return null;
  return {
    value: Number((m.value / divisor).toFixed(3)),
    label: `${m.unit} ${m.intensityBasis}`,
  };
}

export function pillarScore(metrics: MetricLike[]): number {
  if (!metrics.length) return 0;
  const total = metrics.reduce((sum, m) => sum + targetProgress(m), 0);
  return Math.round(total / metrics.length);
}

export function consolidatedScore(e: number, s: number, g: number): number {
  return Math.round(e * 0.35 + s * 0.35 + g * 0.3);
}

export function scoreGrade(score: number): string {
  if (score >= 85) return 'AA';
  if (score >= 70) return 'A';
  if (score >= 55) return 'BBB';
  if (score >= 40) return 'BB';
  return 'B';
}

export interface TopicLike {
  financial: number;
  impact: number;
  priorFinancial: number | null;
  priorImpact: number | null;
}
export type TopicStatus = 'Material' | 'Monitor' | 'Not material';

export function topicStatus(t: TopicLike, threshold: number): TopicStatus {
  const peak = Math.max(t.financial, t.impact);
  if (peak >= threshold) return 'Material';
  if (peak >= threshold - 1) return 'Monitor';
  return 'Not material';
}

export function topicShift(t: TopicLike): number {
  if (t.priorFinancial == null || t.priorImpact == null) return 0;
  return (
    Math.max(t.financial, t.impact) - Math.max(t.priorFinancial, t.priorImpact)
  );
}

export interface IndicatorLike {
  status: string;
}

export function frameworkCoverage(indicators: IndicatorLike[]): {
  signedOff: number;
  total: number;
  pct: number;
} {
  const signedOff = indicators.filter((i) => i.status === 'Signed off').length;
  return {
    signedOff,
    total: indicators.length,
    pct: indicators.length
      ? Math.round((signedOff / indicators.length) * 100)
      : 0,
  };
}
