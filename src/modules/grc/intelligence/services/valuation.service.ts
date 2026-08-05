import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Valuation, ValuationDocument } from '../schemas';
import {
  UpdateDcfDto,
  AddCompRowDto,
  AddPrecedentRowDto,
  UpdatePrivateDiscountDto,
  UpdateNavDto,
  UpdateDdmDto,
  UpdateBlendEntryDto,
} from '../dtos';
import {
  buildReportPdf,
  ReportDefinition,
} from 'src/common/utils/pdf/report-builder.util';

const METHOD_KEYS = ['DCF', 'Comparables', 'Precedents', 'NAV', 'DDM'] as const;
type MethodKey = (typeof METHOD_KEYS)[number];

@Injectable()
export class ValuationService {
  constructor(
    @InjectModel(Valuation.name)
    private readonly model: Model<ValuationDocument>,
  ) {}

  // ── Pure formulas — hand-transcribed with exact fidelity from the
  // confirmed prototype. Any deviation here is a real correctness
  // bug, not a cosmetic one — this is a financial model. ─────────

  private runDcf(a: any) {
    const years: any[] = [];
    let prevRev = a.baseRevenue;
    for (let i = 1; i <= 5; i++) {
      const revenue = prevRev * (1 + a.growthRate / 100);
      const ebitda = revenue * (a.ebitdaMargin / 100);
      const da = revenue * (a.daPct / 100);
      const ebit = ebitda - da;
      const tax = Math.max(ebit, 0) * (a.taxRate / 100);
      const nopat = ebit - tax;
      const capex = revenue * (a.capexPct / 100);
      const wc = (revenue - prevRev) * (a.wcPct / 100);
      const fcf = nopat + da - capex - wc;
      const df = 1 / Math.pow(1 + a.wacc / 100, i);
      years.push({
        year: i,
        revenue,
        ebitda,
        da,
        ebit,
        tax,
        nopat,
        capex,
        wc,
        fcf,
        df,
        pv: fcf * df,
      });
      prevRev = revenue;
    }
    const last = years[years.length - 1];
    const g = a.terminalGrowth / 100;
    const w = a.wacc / 100;
    const terminalValue = w > g ? (last.fcf * (1 + g)) / (w - g) : 0;
    const pvTerminal = terminalValue * last.df;
    const pvExplicit = years.reduce((s, y) => s + y.pv, 0);
    const ev = pvExplicit + pvTerminal;
    return {
      years,
      terminalValue,
      pvTerminal,
      pvExplicit,
      ev,
      equity: ev - a.netDebt,
    };
  }

  private compsStats(rows: any[]) {
    const evRev = rows
      .map((r) => (r.revenue ? r.marketCap / r.revenue : 0))
      .filter(Boolean);
    const evEbitda = rows
      .map((r) => (r.ebitda ? r.marketCap / r.ebitda : 0))
      .filter(Boolean);
    const mean = (n: number[]) =>
      n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0;
    const median = (n: number[]) => {
      if (!n.length) return 0;
      const s = [...n].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    return {
      evRevMean: mean(evRev),
      evRevMedian: median(evRev),
      evEbitdaMean: mean(evEbitda),
      evEbitdaMedian: median(evEbitda),
    };
  }

  private runComps(v: any) {
    const st = this.compsStats(v.comps);
    const targetRev = v.dcf.baseRevenue;
    const targetEbitda = targetRev * (v.dcf.ebitdaMargin / 100);
    const raw =
      (st.evEbitdaMedian * targetEbitda + st.evRevMedian * targetRev) / 2;
    const ev = raw * (1 - v.privateDiscount / 100);
    return { ...st, ev, targetEbitda };
  }

  // Deliberately NOT a true median for even-length arrays (matches
  // the confirmed prototype exactly — sorted[floor(n/2)], not an
  // average of the two middle values, unlike compsStats' median()).
  private runPrecedents(v: any) {
    const mult = v.precedents
      .map((p: any) => (p.ebitda ? p.value / p.ebitda : 0))
      .filter(Boolean);
    const med = mult.length
      ? [...mult].sort((a: number, b: number) => a - b)[
          Math.floor(mult.length / 2)
        ]
      : 0;
    const targetEbitda = v.dcf.baseRevenue * (v.dcf.ebitdaMargin / 100);
    return { medianMultiple: med, ev: med * targetEbitda };
  }

  private runNav(v: any) {
    const equity =
      v.nav.bookAssets +
      v.nav.ppeUplift -
      v.nav.intangibleWriteDown -
      v.nav.liabilities;
    return { equity, ev: equity + v.dcf.netDebt };
  }

  private runDdm(v: any) {
    const r = v.ddm.requiredReturn / 100;
    const g = v.ddm.growth / 100;
    const equity = r > g ? (v.ddm.dividend * (1 + g)) / (r - g) : 0;
    return { equity, ev: equity + v.dcf.netDebt };
  }

  private methodEv(v: any, k: MethodKey): number {
    switch (k) {
      case 'DCF':
        return this.runDcf(v.dcf).ev;
      case 'Comparables':
        return this.runComps(v).ev;
      case 'Precedents':
        return this.runPrecedents(v).ev;
      case 'NAV':
        return this.runNav(v).ev;
      case 'DDM':
        return this.runDdm(v).ev;
    }
  }

  private methodRange(v: any, k: MethodKey) {
    const mid = this.methodEv(v, k);
    return { low: mid * 0.85, mid, high: mid * 1.15 };
  }

  private blendedValuation(v: any) {
    const active = METHOD_KEYS.filter((k) => v.blend[k].enabled);
    const totalWeight = active.reduce((s, k) => s + v.blend[k].weight, 0) || 1;
    const ev = active.reduce(
      (s, k) => s + this.methodEv(v, k) * (v.blend[k].weight / totalWeight),
      0,
    );
    const equity = ev - v.dcf.netDebt;
    const lows = active.map((k) => this.methodRange(v, k).low);
    const highs = active.map((k) => this.methodRange(v, k).high);
    const sorted = [...lows, ...highs].sort((a, b) => a - b);
    const p25 = sorted.length ? sorted[Math.floor(sorted.length * 0.25)] : 0;
    const targetEbitda = v.dcf.baseRevenue * (v.dcf.ebitdaMargin / 100);
    return {
      totalWeight,
      ev,
      equity,
      low: ev * 0.9,
      high: ev * 1.1,
      negotiationFloor: p25,
      negotiationCeiling: ev * 1.15,
      perShare: v.dcf.sharesOutstanding ? equity / v.dcf.sharesOutstanding : 0,
      impliedEvEbitda: targetEbitda ? ev / targetEbitda : 0,
      impliedEvRev: v.dcf.baseRevenue ? ev / v.dcf.baseRevenue : 0,
    };
  }

  private withComputed(v: any) {
    return {
      ...v,
      dcfResult: this.runDcf(v.dcf),
      compsResult: this.runComps(v),
      precedentsResult: this.runPrecedents(v),
      navResult: this.runNav(v),
      ddmResult: this.runDdm(v),
      blendResult: this.blendedValuation(v),
    };
  }

  // ── CRUD ─────────────────────────────────────────────────────

  async create(tenantId: string) {
    const v = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      history: [
        {
          version: 1,
          at: new Date().toISOString().slice(0, 10),
          change: 'Model initiated.',
          blendedEv: 0,
        },
      ],
    });
    return this.withComputed(v.toObject());
  }

  async getAll(tenantId: string) {
    const rows = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
    return rows.map((v) => this.withComputed(v));
  }

  async getById(tenantId: string, id: string) {
    const v = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!v) throw new NotFoundException('Valuation not found');
    return this.withComputed(v);
  }

  private async getRawDoc(
    tenantId: string,
    id: string,
  ): Promise<ValuationDocument> {
    const v = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!v) throw new NotFoundException('Valuation not found');
    return v;
  }

  private appendHistory(v: ValuationDocument, change: string) {
    v.history.push({
      version: v.history.length + 1,
      at: new Date().toISOString().slice(0, 10),
      change,
      blendedEv: this.blendedValuation(v.toObject()).ev,
    } as any);
  }

  async updateDcf(tenantId: string, id: string, dto: UpdateDcfDto) {
    const v = await this.getRawDoc(tenantId, id);
    Object.assign(v.dcf, dto);
    await v.save();
    return this.withComputed(v.toObject());
  }

  async addComp(tenantId: string, id: string, dto: AddCompRowDto) {
    const v = await this.getRawDoc(tenantId, id);
    v.comps.push({
      company: dto.company,
      country: dto.country ?? '',
      sector: dto.sector ?? '',
      marketCap: dto.marketCap ?? 0,
      revenue: dto.revenue ?? 0,
      ebitda: dto.ebitda ?? 0,
    } as any);
    this.appendHistory(v, `Added peer ${dto.company}`);
    await v.save();
    return this.withComputed(v.toObject());
  }

  async removeComp(tenantId: string, id: string, index: number) {
    const v = await this.getRawDoc(tenantId, id);
    const row = v.comps[index];
    if (!row) throw new NotFoundException('Comparable not found');
    const name = row.company;
    v.comps.splice(index, 1);
    this.appendHistory(v, `Removed peer ${name}`);
    await v.save();
    return this.withComputed(v.toObject());
  }

  async updatePrivateDiscount(
    tenantId: string,
    id: string,
    dto: UpdatePrivateDiscountDto,
  ) {
    const v = await this.getRawDoc(tenantId, id);
    v.privateDiscount = dto.privateDiscount;
    await v.save();
    return this.withComputed(v.toObject());
  }

  // Precedent add/remove — a real gap-fill: the confirmed prototype
  // only ever displayed seeded precedent rows, with no add/remove
  // UI at all, unlike Comparables which has both.
  async addPrecedent(tenantId: string, id: string, dto: AddPrecedentRowDto) {
    const v = await this.getRawDoc(tenantId, id);
    v.precedents.push({
      target: dto.target,
      acquirer: dto.acquirer ?? '',
      year: dto.year ?? new Date().getFullYear(),
      value: dto.value ?? 0,
      revenue: dto.revenue ?? 0,
      ebitda: dto.ebitda ?? 0,
      sector: dto.sector ?? '',
    } as any);
    this.appendHistory(v, `Added precedent ${dto.target}`);
    await v.save();
    return this.withComputed(v.toObject());
  }

  async removePrecedent(tenantId: string, id: string, index: number) {
    const v = await this.getRawDoc(tenantId, id);
    const row = v.precedents[index];
    if (!row) throw new NotFoundException('Precedent not found');
    const name = row.target;
    v.precedents.splice(index, 1);
    this.appendHistory(v, `Removed precedent ${name}`);
    await v.save();
    return this.withComputed(v.toObject());
  }

  async updateNav(tenantId: string, id: string, dto: UpdateNavDto) {
    const v = await this.getRawDoc(tenantId, id);
    Object.assign(v.nav, dto);
    await v.save();
    return this.withComputed(v.toObject());
  }

  async updateDdm(tenantId: string, id: string, dto: UpdateDdmDto) {
    const v = await this.getRawDoc(tenantId, id);
    Object.assign(v.ddm, dto);
    await v.save();
    return this.withComputed(v.toObject());
  }

  async updateBlendEntry(
    tenantId: string,
    id: string,
    method: MethodKey,
    dto: UpdateBlendEntryDto,
  ) {
    const v = await this.getRawDoc(tenantId, id);
    const entry = v.blend[method];
    if (!entry) throw new NotFoundException('Method not found');
    const wasEnabled = entry.enabled;
    if (dto.weight !== undefined) entry.weight = dto.weight;
    if (dto.rationale !== undefined) entry.rationale = dto.rationale;
    if (dto.confidence !== undefined) entry.confidence = dto.confidence;
    if (dto.enabled !== undefined && dto.enabled !== wasEnabled) {
      entry.enabled = dto.enabled;
      this.appendHistory(
        v,
        `${method} ${dto.enabled ? 'included in' : 'excluded from'} blend`,
      );
    }
    await v.save();
    return this.withComputed(v.toObject());
  }

  async snapshotVersion(tenantId: string, id: string) {
    const v = await this.getRawDoc(tenantId, id);
    this.appendHistory(v, 'Blend assumptions committed to version history');
    await v.save();
    return this.withComputed(v.toObject());
  }

  async getReportPdf(
    tenantId: string,
    id: string,
    businessName: string,
  ): Promise<Buffer> {
    const raw = await this.getRawDoc(tenantId, id);
    const v = raw.toObject();

    const dcf = this.runDcf(v.dcf);
    const comps = this.runComps(v);
    const prec = this.runPrecedents(v);
    const nav = this.runNav(v);
    const ddm = this.runDdm(v);
    const blend = this.blendedValuation(v);

    const money = (n: number) => {
      const abs = Math.abs(n);
      const sign = n < 0 ? '-' : '';
      const cur = v.currency === 'USD' ? '$' : `${v.currency} `;
      if (abs >= 1_000_000_000)
        return `${sign}${cur}${(abs / 1_000_000_000).toFixed(1)}b`;
      if (abs >= 1_000_000)
        return `${sign}${cur}${(abs / 1_000_000).toFixed(1)}m`;
      if (abs >= 1_000) return `${sign}${cur}${(abs / 1_000).toFixed(1)}k`;
      return `${sign}${cur}${Math.round(abs)}`;
    };

    const def: ReportDefinition = {
      title: 'Company Valuation Report',
      subtitle: businessName,
      summary: [
        { label: 'Blended EV', value: money(blend.ev) },
        { label: 'Equity value', value: money(blend.equity) },
        { label: 'Value/share', value: money(blend.perShare) },
        {
          label: 'Negotiation range',
          value: `${money(blend.negotiationFloor)} – ${money(blend.negotiationCeiling)}`,
        },
        { label: 'EV/EBITDA', value: `${blend.impliedEvEbitda.toFixed(1)}x` },
        { label: 'EV/Revenue', value: `${blend.impliedEvRev.toFixed(2)}x` },
      ],
      sections: [
        {
          heading: 'DCF — 5-Year Free Cash Flow',
          columns: ['Line', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5'],
          rows: [
            ['Revenue', ...dcf.years.map((y: any) => money(y.revenue))],
            ['EBITDA', ...dcf.years.map((y: any) => money(y.ebitda))],
            ['Free cash flow', ...dcf.years.map((y: any) => money(y.fcf))],
            ['PV of FCF', ...dcf.years.map((y: any) => money(y.pv))],
          ],
          note: `Terminal value ${money(dcf.terminalValue)} · DCF enterprise value ${money(dcf.ev)} · WACC ${v.dcf.wacc}% · Terminal growth ${v.dcf.terminalGrowth}%`,
        },
        {
          heading: 'Comparable Companies',
          columns: [
            'Company',
            'Country',
            'Market Cap',
            'Revenue',
            'EBITDA',
            'EV/Rev',
            'EV/EBITDA',
          ],
          rows: v.comps.map((c: any) => [
            c.company,
            c.country,
            money(c.marketCap),
            money(c.revenue),
            money(c.ebitda),
            c.revenue ? `${(c.marketCap / c.revenue).toFixed(2)}x` : '—',
            c.ebitda ? `${(c.marketCap / c.ebitda).toFixed(1)}x` : '—',
          ]),
          note: `Median EV/EBITDA ${comps.evEbitdaMedian.toFixed(1)}x · Private discount ${v.privateDiscount}% · Comparables EV ${money(comps.ev)}`,
        },
        {
          heading: 'Precedent Transactions',
          columns: [
            'Target',
            'Acquirer',
            'Year',
            'Deal Value',
            'EBITDA',
            'EV/EBITDA',
          ],
          rows: v.precedents.map((p: any) => [
            p.target,
            p.acquirer,
            p.year,
            money(p.value),
            money(p.ebitda),
            p.ebitda ? `${(p.value / p.ebitda).toFixed(1)}x` : '—',
          ]),
          note: `Median transaction multiple ${prec.medianMultiple.toFixed(1)}x · Precedent EV ${money(prec.ev)}`,
        },
        {
          heading: 'NAV & DDM',
          columns: ['Method', 'Equity Value', 'Enterprise Value'],
          rows: [
            ['Net Asset Value', money(nav.equity), money(nav.ev)],
            ['Dividend Discount Model', money(ddm.equity), money(ddm.ev)],
          ],
        },
        {
          heading: 'Weighted Blend & Rationale',
          columns: ['Method', 'Included', 'Weight', 'Confidence', 'Rationale'],
          rows: (
            ['DCF', 'Comparables', 'Precedents', 'NAV', 'DDM'] as const
          ).map((k) => {
            const m = v.blend[k];
            return [
              k,
              m.enabled ? 'Yes' : 'No',
              `${m.weight}%`,
              m.confidence,
              m.rationale || '—',
            ];
          }),
          note: `Blended enterprise value ${money(blend.ev)} · Less net debt (${money(v.dcf.netDebt)}) · Equity value ${money(blend.equity)}`,
        },
        {
          heading: 'Version History',
          columns: ['Version', 'Date', 'Blended EV', 'Change'],
          rows: [...v.history]
            .reverse()
            .map((h: any) => [
              `v${h.version}`,
              h.at,
              money(h.blendedEv),
              h.change,
            ]),
        },
      ],
    };

    return buildReportPdf(def);
  }
}
