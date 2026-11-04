import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HealthScoreCollector } from './health-score.collector';
import {
  GrcHealthScoreSettings,
  GrcHealthScoreSettingsDocument,
  GrcHealthScoreSnapshot,
  GrcHealthScoreSnapshotDocument,
} from './health-score.schema';
import {
  UpdateHealthScoreCommentaryDto,
  UpdateHealthScoreSettingsDto,
} from './health-score.dto';
import {
  HS_GRADES,
  HS_MODULES,
  computeHealthScore,
  type HsIndicatorDef,
  type HsOverrides,
} from './health-score.model';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const periodOf = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const labelOf = (p: string) => {
  const [y, m] = p.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

@Injectable()
export class HealthScoreService {
  constructor(
    private readonly collector: HealthScoreCollector,
    @InjectModel(GrcHealthScoreSettings.name)
    private readonly settingsModel: Model<GrcHealthScoreSettingsDocument>,
    @InjectModel(GrcHealthScoreSnapshot.name)
    private readonly snapshotModel: Model<GrcHealthScoreSnapshotDocument>,
  ) {}

  private async settings(tenantId: string) {
    return this.settingsModel
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .lean();
  }

  /** The 12 months ending this month, with whatever was recorded in each. */
  private async trend(tenantId: string, now: Date) {
    const periods: string[] = [];
    for (let i = 11; i >= 0; i--)
      periods.push(
        periodOf(
          new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)),
        ),
      );
    const snaps = await this.snapshotModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        period: { $in: periods },
      })
      .lean();
    const by = new Map(snaps.map((s) => [s.period, s]));
    return periods.map((p) => {
      const s = by.get(p);
      return {
        period: p,
        label: labelOf(p),
        composite: s?.composite ?? null,
        modules: (s?.modules ?? {}) as Record<string, number | null>,
      };
    });
  }

  async get(tenantId: string) {
    const now = new Date();
    const [st, measured] = await Promise.all([
      this.settings(tenantId),
      this.collector.collect(tenantId),
    ]);
    const overrides: HsOverrides = {
      moduleWeights: (st?.moduleWeights ?? {}) as HsOverrides['moduleWeights'],
      indicators: st?.indicators ?? {},
    };
    const result = computeHealthScore(measured, overrides);

    // Remember this month's figure so the Trend tab has something to draw.
    const period = periodOf(now);
    if (result.composite !== null) {
      await this.snapshotModel.updateOne(
        { tenantId: new Types.ObjectId(tenantId), period },
        {
          $set: {
            composite: result.composite,
            modules: Object.fromEntries(
              result.modules.map((m) => [m.key, m.score]),
            ),
            measured: result.coverage.measured,
            total: result.coverage.total,
          },
        },
        { upsert: true },
      );
    }
    const trend = await this.trend(tenantId, now);
    // The latest earlier month that has a figure.
    const previous =
      [...trend]
        .reverse()
        .find((t) => t.period < period && t.composite !== null) ?? null;

    // Defaults alongside each indicator, for the Settings tab.
    const defaults = new Map(
      HS_MODULES.flatMap((m) =>
        m.indicators.map((d) => [`${m.key}.${d.key}`, d] as const),
      ),
    );
    const modules = result.modules.map((m) => ({
      ...m,
      defaultWeight: HS_MODULES.find((x) => x.key === m.key)!.weight,
      indicators: m.indicators.map((i) => {
        const d = defaults.get(`${m.key}.${i.key}`)!;
        return {
          ...i,
          defaultWeight: d.weight,
          defaultFloor: d.floor,
          defaultTarget: d.target,
        };
      }),
    }));

    return {
      assessedAt: now.toISOString(),
      period,
      periodLabel: labelOf(period),
      ...result,
      modules,
      grades: HS_GRADES,
      previous: previous
        ? {
            period: previous.period,
            label: previous.label,
            composite: previous.composite,
          }
        : null,
      change:
        previous && result.composite !== null && previous.composite !== null
          ? Math.round((result.composite - previous.composite) * 10) / 10
          : null,
      trend,
      commentary: {
        ceoNote: st?.ceoNote ?? '',
        moduleComments: st?.moduleComments ?? {},
        updatedAt: st?.commentaryUpdatedAt ?? null,
        updatedBy: st?.updatedBy ?? '',
      },
      customised:
        Object.keys(overrides.indicators ?? {}).length > 0 ||
        Object.keys(overrides.moduleWeights ?? {}).length > 0,
    };
  }

  async updateSettings(
    tenantId: string,
    by: string,
    dto: UpdateHealthScoreSettingsDto,
  ) {
    const tid = new Types.ObjectId(tenantId);
    if (dto.reset) {
      await this.settingsModel.updateOne(
        { tenantId: tid },
        { $set: { moduleWeights: {}, indicators: {}, updatedBy: by } },
        { upsert: true },
      );
      return this.get(tenantId);
    }

    const moduleKeys = HS_MODULES.map((m) => m.key as string);
    const moduleWeights: Record<string, number> = {};
    if (dto.moduleWeights) {
      for (const [k, v] of Object.entries(dto.moduleWeights)) {
        if (!moduleKeys.includes(k))
          throw new BadRequestException(`Unknown module "${k}".`);
        const n = num(v);
        if (n === null || n < 0 || n > 100)
          throw new BadRequestException(
            'Each module weight must be between 0 and 100.',
          );
        moduleWeights[k] = n;
      }
      const total = HS_MODULES.reduce(
        (s, m) => s + (moduleWeights[m.key] ?? m.weight),
        0,
      );
      if (Math.abs(total - 100) > 0.01)
        throw new BadRequestException(
          `Module weights must total 100% (they total ${total}%).`,
        );
    }

    const indicators: Record<
      string,
      { weight?: number; floor?: number; target?: number }
    > = {};
    if (dto.indicators) {
      const defs = new Map<string, HsIndicatorDef>(
        HS_MODULES.flatMap((m) =>
          m.indicators.map((d): [string, HsIndicatorDef] => [
            `${m.key}.${d.key}`,
            d,
          ]),
        ),
      );
      for (const [k, v] of Object.entries(dto.indicators)) {
        const d = defs.get(k);
        if (!d) throw new BadRequestException(`Unknown indicator "${k}".`);
        const weight = v?.weight === undefined ? undefined : num(v.weight);
        const floor = v?.floor === undefined ? undefined : num(v.floor);
        const target = v?.target === undefined ? undefined : num(v.target);
        if (weight === null || floor === null || target === null)
          throw new BadRequestException(
            `"${d.label}" needs numbers for weight, floor and target.`,
          );
        if (weight !== undefined && weight < 0)
          throw new BadRequestException(
            `"${d.label}" weight cannot be negative.`,
          );
        if ((floor ?? d.floor) === (target ?? d.target))
          throw new BadRequestException(
            `"${d.label}" needs a floor that differs from its target.`,
          );
        indicators[k] = {
          ...(weight !== undefined ? { weight } : {}),
          ...(floor !== undefined ? { floor } : {}),
          ...(target !== undefined ? { target } : {}),
        };
      }
    }

    await this.settingsModel.updateOne(
      { tenantId: tid },
      {
        $set: {
          ...(dto.moduleWeights ? { moduleWeights } : {}),
          ...(dto.indicators ? { indicators } : {}),
          updatedBy: by,
        },
      },
      { upsert: true },
    );
    return this.get(tenantId);
  }

  async updateCommentary(
    tenantId: string,
    by: string,
    dto: UpdateHealthScoreCommentaryDto,
  ) {
    const set: Record<string, unknown> = {
      commentaryUpdatedAt: new Date(),
      updatedBy: by,
    };
    if (dto.ceoNote !== undefined) set.ceoNote = dto.ceoNote;
    if (dto.moduleComments) {
      for (const [k, v] of Object.entries(dto.moduleComments)) {
        if (!HS_MODULES.some((m) => m.key === k)) continue;
        set[`moduleComments.${k}`] = String(v ?? '').slice(0, 8000);
      }
    }
    await this.settingsModel.updateOne(
      { tenantId: new Types.ObjectId(tenantId) },
      { $set: set },
      { upsert: true },
    );
    const st = await this.settings(tenantId);
    return {
      ceoNote: st?.ceoNote ?? '',
      moduleComments: st?.moduleComments ?? {},
      updatedAt: st?.commentaryUpdatedAt ?? null,
      updatedBy: st?.updatedBy ?? '',
    };
  }
}
