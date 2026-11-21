import { computeHealthScore, HS_MODULES } from './health-score.model';

describe('computeHealthScore', () => {
  it('starts at 0 with no grade when nothing is measured', () => {
    const r = computeHealthScore({});
    expect(r.composite).toBe(0);
    expect(r.grade).toBeNull();
    expect(r.coverage.measured).toBe(0);
    expect(r.modules.every((m) => m.score === 0 && m.grade === null)).toBe(
      true,
    );
  });

  it('counts unmeasured indicators as 0 but keeps their weight', () => {
    const hr = HS_MODULES.find((m) => m.key === 'hr')!;
    const first = hr.indicators[0];
    const total = hr.indicators.reduce((s, i) => s + i.weight, 0);
    const r = computeHealthScore({
      [`hr.${first.key}`]: { value: first.target, basis: 'x', sample: 1 },
    });
    const m = r.modules.find((x) => x.key === 'hr')!;
    expect(m.score).toBeCloseTo((first.weight / total) * 100, 0);
    expect(r.composite).toBeGreaterThan(0);
    expect(r.composite).toBeLessThan(20);
  });

  it('reaches 100 / A+ only when everything is measured at target', () => {
    const all: Record<string, any> = {};
    for (const m of HS_MODULES)
      for (const i of m.indicators)
        all[`${m.key}.${i.key}`] = { value: i.target, basis: 'x', sample: 5 };
    const r = computeHealthScore(all);
    expect(r.composite).toBe(100);
    expect(r.grade).toBe('A+');
  });
});
