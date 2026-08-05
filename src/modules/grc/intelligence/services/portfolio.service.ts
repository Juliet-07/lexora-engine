import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PortfolioWorkspace, PortfolioWorkspaceDocument } from '../schemas';
import { Deal, DealDocument } from '../../deals/schemas';
import {
  UpdatePortfolioSettingsDto,
  SetScenarioEnabledDto,
  AddScenarioDealDto,
  SetValueOverrideDto,
} from '../dtos';

export interface PDeal {
  id: string;
  name: string;
  sector: string;
  stage: string;
  value: number;
  feeRate: number;
  feeRecovered: number;
  hypothetical: boolean;
  durationDays: number;
  won: boolean;
  lost: boolean;
}

@Injectable()
export class PortfolioService {
  constructor(
    @InjectModel(PortfolioWorkspace.name)
    private readonly workspaceModel: Model<PortfolioWorkspaceDocument>,
    @InjectModel(Deal.name) private readonly dealModel: Model<DealDocument>,
  ) {}

  private async getOrCreateWorkspace(
    tenantId: string,
  ): Promise<PortfolioWorkspaceDocument> {
    const tId = new Types.ObjectId(tenantId);
    let ws = await this.workspaceModel.findOne({ tenantId: tId });
    if (!ws) ws = await this.workspaceModel.create({ tenantId: tId });
    return ws;
  }

  // Real aggregation, ported faithfully from the confirmed prototype
  // — minus the "Fee Multiple" metric (dropped, see project notes:
  // its original formula never actually used fee data at all), plus
  // real fee recovery computed from actual per-deal feeRecovered.
  private computeMetrics(rows: PDeal[], threshold: number) {
    const total = rows.reduce((s, d) => s + d.value, 0);
    const max = rows.reduce((m, d) => Math.max(m, d.value), 0);
    const sectorKeys = Array.from(new Set(rows.map((d) => d.sector)));
    const bySector = sectorKeys
      .map((key) => {
        const rs = rows.filter((d) => d.sector === key);
        const value = rs.reduce((s, d) => s + d.value, 0);
        const fees = rs.reduce((s, d) => s + d.value * (d.feeRate / 100), 0);
        const recovered = rs.reduce((s, d) => s + d.feeRecovered, 0);
        return {
          key,
          count: rs.length,
          value,
          fees,
          share: total ? (value / total) * 100 : 0,
          recovery: fees ? (recovered / fees) * 100 : 0,
        };
      })
      .sort((a, b) => b.value - a.value);

    const largest = rows.reduce<PDeal | null>(
      (m, d) => (!m || d.value > m.value ? d : m),
      null,
    );
    const largestShare = total && largest ? (largest.value / total) * 100 : 0;
    const closed = rows.filter((d) => d.won || d.lost);
    const winRate = closed.length
      ? (rows.filter((d) => d.won).length / closed.length) * 100
      : 42;
    const fees = rows.reduce((s, d) => s + d.value * (d.feeRate / 100), 0);
    const recoveredTotal = rows.reduce((s, d) => s + d.feeRecovered, 0);
    const avgFee = rows.length ? fees / rows.length : 0;
    const avgDuration = rows.length
      ? Math.round(rows.reduce((s, d) => s + d.durationDays, 0) / rows.length)
      : 0;
    const feeRecovery = fees ? (recoveredTotal / fees) * 100 : 0;

    const alerts: string[] = [];
    bySector.forEach((r) => {
      if (r.share > threshold)
        alerts.push(
          `${r.key} accounts for ${r.share.toFixed(1)}% of pipeline value — above the ${threshold}% sector threshold.`,
        );
    });
    if (largest && largestShare > threshold) {
      alerts.push(
        `${largest.name} alone is ${largestShare.toFixed(1)}% of pipeline value — single-deal dependency above the ${threshold}% threshold.`,
      );
    }

    return {
      total,
      max,
      count: rows.length,
      bySector,
      largest,
      largestShare,
      winRate,
      fees,
      avgFee,
      avgDuration,
      feeRecovery,
      topSectorShare: bySector[0]?.share ?? 0,
      alerts,
    };
  }

  private toPDeals(deals: any[], defaultFeeRate: number): PDeal[] {
    return deals.map((d) => ({
      id: d._id.toString(),
      name: d.name,
      sector: d.type,
      stage: d.stage,
      value: d.value,
      feeRate: d.feeRate ?? defaultFeeRate,
      feeRecovered: d.feeRecovered ?? 0,
      hypothetical: false,
      durationDays: Math.max(
        1,
        Math.round(
          (new Date(d.targetClose).getTime() -
            new Date(d.startDate).getTime()) /
            86400000,
        ),
      ),
      won: d.status === 'Completed',
      lost: d.status === 'Lost',
    }));
  }

  async getPortfolio(tenantId: string) {
    const ws = await this.getOrCreateWorkspace(tenantId);
    const deals = await this.dealModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .lean();
    const live = this.toPDeals(deals, ws.settings.defaultFeeRate);

    const effective: PDeal[] = !ws.scenario.enabled
      ? live
      : [
          ...live
            .filter((d) => !ws.scenario.removedDealIds.includes(d.id))
            .map((d) => ({
              ...d,
              value: ws.scenario.valueOverrides[d.id] ?? d.value,
            })),
          ...ws.scenario.added.map((a, i) => ({
            id: `scenario_${i}`,
            name: a.name,
            sector: a.sector,
            stage: a.stage,
            value: a.value,
            feeRate: a.feeRate,
            feeRecovered: 0,
            hypothetical: true,
            durationDays: 120,
            won: false,
            lost: false,
          })),
        ];

    return {
      settings: ws.settings,
      scenario: {
        enabled: ws.scenario?.enabled ?? false,
        added: ws.scenario?.added ?? [],
        removedDealIds: ws.scenario?.removedDealIds ?? [],
        valueOverrides: ws.scenario?.valueOverrides ?? {},
      },
      liveDeals: live,
      effectiveDeals: effective,
      liveMetrics: this.computeMetrics(
        live,
        ws.settings.concentrationThreshold,
      ),
      metrics: this.computeMetrics(
        effective,
        ws.settings.concentrationThreshold,
      ),
    };
  }

  async updateSettings(tenantId: string, dto: UpdatePortfolioSettingsDto) {
    const ws = await this.getOrCreateWorkspace(tenantId);
    Object.assign(ws.settings, dto);
    await ws.save();
    return this.getPortfolio(tenantId);
  }

  async setScenarioEnabled(tenantId: string, dto: SetScenarioEnabledDto) {
    const ws = await this.getOrCreateWorkspace(tenantId);
    ws.scenario.enabled = dto.enabled;
    await ws.save();
    return this.getPortfolio(tenantId);
  }

  async resetScenario(tenantId: string) {
    const ws = await this.getOrCreateWorkspace(tenantId);
    ws.scenario = {
      enabled: false,
      added: [],
      removedDealIds: [],
      valueOverrides: {},
    } as any;
    await ws.save();
    return this.getPortfolio(tenantId);
  }

  async addScenarioDeal(tenantId: string, dto: AddScenarioDealDto) {
    const ws = await this.getOrCreateWorkspace(tenantId);
    ws.scenario.enabled = true;
    ws.scenario.added.push({
      name: dto.name,
      sector: dto.sector,
      stage: dto.stage,
      value: dto.value ?? 0,
      feeRate: dto.feeRate ?? 0,
    } as any);
    await ws.save();
    return this.getPortfolio(tenantId);
  }

  async removeScenarioDeal(tenantId: string, index: number) {
    const ws = await this.getOrCreateWorkspace(tenantId);
    ws.scenario.added.splice(index, 1);
    await ws.save();
    return this.getPortfolio(tenantId);
  }

  async toggleRemovedDeal(tenantId: string, dealId: string) {
    const ws = await this.getOrCreateWorkspace(tenantId);
    ws.scenario.enabled = true;
    ws.scenario.removedDealIds = ws.scenario.removedDealIds.includes(dealId)
      ? ws.scenario.removedDealIds.filter((x) => x !== dealId)
      : [...ws.scenario.removedDealIds, dealId];
    ws.markModified('scenario');
    await ws.save();
    return this.getPortfolio(tenantId);
  }

  async setValueOverride(
    tenantId: string,
    dealId: string,
    dto: SetValueOverrideDto,
  ) {
    const ws = await this.getOrCreateWorkspace(tenantId);
    ws.scenario.enabled = true;
    if (!ws.scenario.valueOverrides) ws.scenario.valueOverrides = {};
    ws.scenario.valueOverrides[dealId] = dto.value;
    ws.markModified('scenario');
    await ws.save();
    return this.getPortfolio(tenantId);
  }
}
