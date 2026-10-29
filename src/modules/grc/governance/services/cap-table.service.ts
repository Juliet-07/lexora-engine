import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createReadStream, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import {
  OrgStructureNode,
  OrgStructureNodeDocument,
  OrgStructureNodeType,
  ShareClass,
  ShareClassDocument,
  ShareTransaction,
  ShareTransactionDocument,
  ShareTransactionType,
  VestingSchedule,
  VestingScheduleDocument,
  ConvertibleInstrument,
  ConvertibleInstrumentDocument,
  ShareholderDocument,
  ShareholderDocumentDocument,
  ShareholderDocAccessLog,
  ShareholderDocAccessLogDocument,
} from '../schemas';
import { User, UserDocument } from 'src/modules/auth/schemas';
import { ExchangeRateService } from 'src/modules/hr/services/exchange-rate.service';
import {
  AddShareholderDto,
  CreateConvertibleDto,
  CreateShareClassDto,
  CreateShareholderDocumentDto,
  CreateShareTransactionDto,
  CreateVestingDto,
  UpdateConvertibleDto,
  UpdateShareClassDto,
  UpdateShareholderDocumentDto,
  UpdateVestingDto,
} from '../dtos/cap-table.dto';
import {
  LedgerTx,
  chronological,
  computeHoldings,
  computeIssuedByClass,
  latestPrice,
  vestedShares,
} from '../utils/ledger.util';

const oid = (v: string | Types.ObjectId) => new Types.ObjectId(String(v));
const fmt = (n: number) => n.toLocaleString('en-US');

// Where shareholder documents live. Deliberately OUTSIDE the
// publicly served `uploads/` folder (see main.ts useStaticAssets) so a
// stored file can never be fetched by guessing a URL — the only way
// out is the authenticated, logged download endpoint.
export const SHAREHOLDER_DOC_DIR = join(
  process.cwd(),
  'private-uploads',
  'grc',
  'shareholder-documents',
);

// Governance → Organisation Structure → Cap Table & Share Register.
// See ownership.schema.ts for the model: holdings are derived from the
// transaction ledger, never stored.
@Injectable()
export class CapTableService {
  constructor(
    @InjectModel(ShareClass.name)
    private readonly classModel: Model<ShareClassDocument>,
    @InjectModel(ShareTransaction.name)
    private readonly txModel: Model<ShareTransactionDocument>,
    @InjectModel(VestingSchedule.name)
    private readonly vestingModel: Model<VestingScheduleDocument>,
    @InjectModel(ConvertibleInstrument.name)
    private readonly convModel: Model<ConvertibleInstrumentDocument>,
    @InjectModel(ShareholderDocument.name)
    private readonly docModel: Model<ShareholderDocumentDocument>,
    @InjectModel(ShareholderDocAccessLog.name)
    private readonly logModel: Model<ShareholderDocAccessLogDocument>,
    @InjectModel(OrgStructureNode.name)
    private readonly nodeModel: Model<OrgStructureNodeDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly exchangeRates: ExchangeRateService,
  ) {}

  // ── Currency ────────────────────────────────────────────────────
  // Every money figure is stored in the tenant's base currency. The
  // UI can show another currency; it asks here for the rate.
  private async baseCurrency(tenantId: string): Promise<string> {
    const tenant = await this.userModel
      .findById(tenantId)
      .select('tenantProfile.baseCurrency')
      .lean();
    return (
      (tenant as any)?.tenantProfile?.baseCurrency || 'USD'
    ).toUpperCase();
  }

  async getFx(tenantId: string, currency?: string) {
    const baseCurrency = await this.baseCurrency(tenantId);
    const target = (currency || baseCurrency).toUpperCase();
    if (target === baseCurrency) {
      return { baseCurrency, currency: target, rate: 1, stale: false };
    }
    const { rate, stale } = await this.exchangeRates.getRate(
      baseCurrency,
      target,
    );
    return { baseCurrency, currency: target, rate, stale };
  }

  // ── Ledger validation ───────────────────────────────────────────
  // Walks the whole ledger oldest-first and refuses any state where a
  // holder would go below zero or a class would exceed its authorised
  // cap — at ANY point in time, so a backdated entry that would have
  // broken history is refused too.
  private validateLedger(
    txs: LedgerTx[],
    classes: ShareClassDocument[],
    names: Map<string, string>,
  ) {
    const classById = new Map(classes.map((c) => [String(c._id), c]));
    const bal = new Map<string, number>();
    const issued = new Map<string, number>();
    const key = (n: any, c: any) => `${String(n)}|${String(c)}`;

    for (const t of chronological(txs)) {
      if (t.type === ShareTransactionType.VALUATION) continue;
      const n = t.shares ?? 0;
      const cls = classById.get(String(t.shareClassId));
      if (!cls) throw new BadRequestException('Share class not found.');
      const when = new Date(t.date as any).toISOString().slice(0, 10);

      if (t.type === ShareTransactionType.ISSUANCE) {
        const total = (issued.get(String(cls._id)) ?? 0) + n;
        if (total > cls.authorised) {
          throw new BadRequestException(
            `Issuing ${fmt(n)} ${cls.name} shares${when ? ` (${when})` : ''} would take issued shares to ${fmt(total)}, above the ${fmt(cls.authorised)} authorised. Increase the authorised amount first.`,
          );
        }
        issued.set(String(cls._id), total);
        bal.set(
          key(t.toNodeId, cls._id),
          (bal.get(key(t.toNodeId, cls._id)) ?? 0) + n,
        );
      } else {
        const k = key(t.fromNodeId, cls._id);
        const have = bal.get(k) ?? 0;
        if (have < n) {
          throw new BadRequestException(
            `${names.get(String(t.fromNodeId)) ?? 'The seller'} only holds ${fmt(have)} ${cls.name} shares${when ? ` on ${when}` : ''}, so ${fmt(n)} can't be ${t.type === ShareTransactionType.BUYBACK ? 'bought back' : 'transferred'}.`,
          );
        }
        bal.set(k, have - n);
        if (t.type === ShareTransactionType.TRANSFER) {
          const k2 = key(t.toNodeId, cls._id);
          bal.set(k2, (bal.get(k2) ?? 0) + n);
        } else {
          issued.set(String(cls._id), (issued.get(String(cls._id)) ?? 0) - n);
        }
      }
    }
  }

  private async nodeNames(tenantId: Types.ObjectId) {
    const nodes = await this.nodeModel.find({ tenantId }).lean();
    return {
      nodes,
      names: new Map(nodes.map((n) => [String(n._id), n.name])),
    };
  }

  // ── Overview (the Share Register tab) ───────────────────────────
  async getOverview(tenantId: string) {
    const tId = oid(tenantId);
    const [classes, txs, { nodes }, schedules, baseCurrency] =
      await Promise.all([
        this.classModel.find({ tenantId: tId }).sort({ createdAt: 1 }).lean(),
        this.txModel.find({ tenantId: tId }).lean(),
        this.nodeNames(tId),
        this.vestingModel.find({ tenantId: tId }).lean(),
        this.baseCurrency(tenantId),
      ]);

    const price = latestPrice(txs as any[]);
    const holdings = computeHoldings(txs as any[]);
    const issuedBy = computeIssuedByClass(txs as any[]);
    const classById = new Map(classes.map((c) => [String(c._id), c]));

    const totalIssued = [...issuedBy.values()].reduce((a, b) => a + b, 0);
    const votingIssued = [...issuedBy].reduce(
      (a, [cid, n]) => a + (classById.get(cid)?.votingRights ? n : 0),
      0,
    );
    const totalAuthorised = classes.reduce((a, c) => a + c.authorised, 0);

    const isShareholder = (n: any) =>
      (n.types?.length ? n.types : [n.type]).includes(
        OrgStructureNodeType.SHAREHOLDER,
      );
    const now = new Date();

    const holders = nodes
      .map((n) => {
        const id = String(n._id);
        const rows = [...holdings]
          .filter(([k]) => k.startsWith(`${id}|`))
          .map(([k, shares]) => {
            const cls = classById.get(k.split('|')[1]);
            return {
              classId: k.split('|')[1],
              className: cls?.name ?? 'Unknown',
              shares,
              voting: !!cls?.votingRights,
            };
          });
        const total = rows.reduce((a, r) => a + r.shares, 0);
        if (!isShareholder(n) && total === 0) return null;
        const voteShares = rows.reduce(
          (a, r) => a + (r.voting ? r.shares : 0),
          0,
        );
        const mine = schedules.filter((s) => String(s.holderNodeId) === id);
        const vestTotal = mine.reduce((a, s) => a + s.totalShares, 0);
        const vested = mine.reduce(
          (a, s) =>
            a +
            vestedShares(
              s.totalShares,
              s.grantDate,
              s.cliffMonths,
              s.periodMonths,
              now,
            ),
          0,
        );
        return {
          nodeId: id,
          name: n.name,
          email: n.email ?? null,
          types: n.types?.length ? n.types : [n.type],
          holdings: rows,
          totalShares: total,
          votingShares: voteShares,
          pct: totalIssued ? (total / totalIssued) * 100 : 0,
          votingPct: votingIssued ? (voteShares / votingIssued) * 100 : 0,
          value: total * price,
          vesting: mine.length ? { total: vestTotal, vested } : null,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.totalShares - a.totalShares);

    return {
      baseCurrency,
      pricePerShare: price,
      stats: {
        authorised: totalAuthorised,
        issued: totalIssued,
        unissued: Math.max(0, totalAuthorised - totalIssued),
        shareholders: holders.filter((h: any) => h.totalShares > 0).length,
        valuation: totalIssued * price,
      },
      classes: classes.map((c) => ({
        id: String(c._id),
        name: c.name,
        authorised: c.authorised,
        parValue: c.parValue,
        voting: c.voting ?? (c.votingRights ? 'Yes' : 'No'),
        votingRights: c.votingRights,
        votingNote: c.votingNote,
        dividendType: c.dividendType ?? 'Pro rata',
        dividendRate: c.dividendRate ?? null,
        liquidation: c.liquidation,
        conversion: c.conversion ?? 'None',
        rights: c.rights,
        issued: issuedBy.get(String(c._id)) ?? 0,
        holders: [...holdings].filter(
          ([k]) => k.split('|')[1] === String(c._id),
        ).length,
      })),
      holders,
    };
  }

  // ── Share classes ───────────────────────────────────────────────
  async createClass(tenantId: string, dto: CreateShareClassDto) {
    const tId = oid(tenantId);
    const name = dto.name.trim();
    if (await this.classModel.exists({ tenantId: tId, name })) {
      throw new BadRequestException(`A share class "${name}" already exists.`);
    }
    const voting = dto.voting ?? 'Yes';
    const dividendType = dto.dividendType ?? 'Pro rata';
    return this.classModel.create({
      tenantId: tId,
      name,
      authorised: dto.authorised,
      parValue: dto.parValue ?? 0,
      voting,
      votingRights: voting === 'Yes',
      votingNote: dto.votingNote ?? '',
      dividendType,
      dividendRate: dividendType.includes('preferred')
        ? (dto.dividendRate ?? null)
        : null,
      liquidation: dto.liquidation ?? 'Pari passu',
      conversion: dto.conversion ?? 'None',
      rights: dto.rights ?? [],
    });
  }

  async updateClass(tenantId: string, id: string, dto: UpdateShareClassDto) {
    const tId = oid(tenantId);
    const cls = await this.classModel.findOne({ _id: id, tenantId: tId });
    if (!cls) throw new NotFoundException('Share class not found');
    if (dto.name !== undefined && dto.name.trim() !== cls.name) {
      if (
        await this.classModel.exists({
          tenantId: tId,
          name: dto.name.trim(),
          _id: { $ne: cls._id },
        })
      ) {
        throw new BadRequestException(
          `A share class "${dto.name.trim()}" already exists.`,
        );
      }
      cls.name = dto.name.trim();
    }
    if (dto.authorised !== undefined) {
      const issued =
        computeIssuedByClass(
          (await this.txModel.find({ tenantId: tId }).lean()) as any[],
        ).get(String(cls._id)) ?? 0;
      if (dto.authorised < issued) {
        throw new BadRequestException(
          `${fmt(issued)} ${cls.name} shares are already in issue — authorised can't be lowered below that.`,
        );
      }
      cls.authorised = dto.authorised;
    }
    for (const f of [
      'parValue',
      'votingNote',
      'liquidation',
      'conversion',
      'rights',
    ] as const) {
      if ((dto as any)[f] !== undefined) (cls as any)[f] = (dto as any)[f];
    }
    if (dto.voting !== undefined) {
      cls.voting = dto.voting;
      cls.votingRights = dto.voting === 'Yes';
    }
    if (dto.dividendType !== undefined) cls.dividendType = dto.dividendType;
    if (dto.dividendRate !== undefined) cls.dividendRate = dto.dividendRate;
    if (!cls.dividendType.includes('preferred')) cls.dividendRate = null;
    await cls.save();
    return cls;
  }

  async deleteClass(tenantId: string, id: string) {
    const tId = oid(tenantId);
    const used =
      (await this.txModel.exists({ tenantId: tId, shareClassId: id })) ||
      (await this.vestingModel.exists({ tenantId: tId, shareClassId: id }));
    if (used) {
      throw new BadRequestException(
        'This class has transactions or vesting schedules against it, so it can’t be deleted.',
      );
    }
    const res = await this.classModel.deleteOne({ _id: id, tenantId: tId });
    if (!res.deletedCount) throw new NotFoundException('Share class not found');
    return { success: true };
  }

  // ── Transactions ────────────────────────────────────────────────
  async listTransactions(tenantId: string) {
    const tId = oid(tenantId);
    const [txs, classes, { names }] = await Promise.all([
      this.txModel
        .find({ tenantId: tId })
        .sort({ date: -1, createdAt: -1 })
        .lean(),
      this.classModel.find({ tenantId: tId }).lean(),
      this.nodeNames(tId),
    ]);
    const cn = new Map(classes.map((c) => [String(c._id), c.name]));
    return txs.map((t) => ({
      id: String(t._id),
      date: t.date,
      type: t.type,
      fromNodeId: t.fromNodeId ? String(t.fromNodeId) : null,
      from:
        t.type === ShareTransactionType.ISSUANCE
          ? 'Company'
          : t.fromNodeId
            ? (names.get(String(t.fromNodeId)) ?? 'Removed holder')
            : null,
      toNodeId: t.toNodeId ? String(t.toNodeId) : null,
      to:
        t.type === ShareTransactionType.BUYBACK
          ? 'Company'
          : t.toNodeId
            ? (names.get(String(t.toNodeId)) ?? 'Removed holder')
            : null,
      shareClassId: t.shareClassId ? String(t.shareClassId) : null,
      className: t.shareClassId
        ? (cn.get(String(t.shareClassId)) ?? null)
        : null,
      shares: t.shares,
      pricePerShare: t.pricePerShare,
      value: (t.shares ?? 0) * (t.pricePerShare ?? 0),
      note: t.note,
      reference: t.reference ?? '',
    }));
  }

  private isShareholderNode(n: any) {
    return (n.types?.length ? n.types : [n.type]).includes(
      OrgStructureNodeType.SHAREHOLDER,
    );
  }

  async createTransaction(tenantId: string, dto: CreateShareTransactionDto) {
    const tId = oid(tenantId);
    const [classes, existing, { nodes, names }] = await Promise.all([
      this.classModel.find({ tenantId: tId }),
      this.txModel.find({ tenantId: tId }).lean(),
      this.nodeNames(tId),
    ]);
    const nodeById = new Map(nodes.map((n) => [String(n._id), n]));
    const needNode = (id: string | undefined, label: string) => {
      const n = id ? nodeById.get(id) : undefined;
      if (!n) throw new BadRequestException(`Choose the ${label}.`);
      return n;
    };

    const tx: any = {
      tenantId: tId,
      date: new Date(dto.date),
      type: dto.type,
      fromNodeId: null,
      toNodeId: null,
      shareClassId: null,
      shares: 0,
      pricePerShare: dto.pricePerShare ?? 0,
      note: dto.note ?? '',
      reference: dto.reference ?? '',
    };

    if (dto.type === ShareTransactionType.VALUATION) {
      if (!(tx.pricePerShare > 0)) {
        throw new BadRequestException('Enter the price per share.');
      }
    } else {
      if (!dto.shares || dto.shares < 1) {
        throw new BadRequestException('Enter the number of shares.');
      }
      if (!dto.shareClassId) {
        throw new BadRequestException('Choose the share class.');
      }
      tx.shares = dto.shares;
      tx.shareClassId = oid(dto.shareClassId);
      if (dto.type === ShareTransactionType.ISSUANCE) {
        const to = needNode(dto.toNodeId, 'shareholder receiving the shares');
        if (!this.isShareholderNode(to)) {
          throw new BadRequestException(
            `${to.name} isn't a shareholder yet — add the Shareholder role first.`,
          );
        }
        tx.toNodeId = to._id;
      } else if (dto.type === ShareTransactionType.TRANSFER) {
        const from = needNode(dto.fromNodeId, 'seller');
        const to = needNode(dto.toNodeId, 'buyer');
        if (String(from._id) === String(to._id)) {
          throw new BadRequestException(
            'Seller and buyer can’t be the same holder.',
          );
        }
        if (!this.isShareholderNode(to)) {
          throw new BadRequestException(
            `${to.name} isn't a shareholder yet — add the Shareholder role first.`,
          );
        }
        tx.fromNodeId = from._id;
        tx.toNodeId = to._id;
      } else {
        tx.fromNodeId = needNode(dto.fromNodeId, 'holder selling back')._id;
      }
    }

    this.validateLedger([...(existing as any[]), tx], classes, names);
    return this.txModel.create(tx);
  }

  async deleteTransaction(tenantId: string, id: string) {
    const tId = oid(tenantId);
    const [classes, all, { names }] = await Promise.all([
      this.classModel.find({ tenantId: tId }),
      this.txModel.find({ tenantId: tId }).lean(),
      this.nodeNames(tId),
    ]);
    if (!all.some((t) => String(t._id) === id)) {
      throw new NotFoundException('Transaction not found');
    }
    try {
      this.validateLedger(
        all.filter((t) => String(t._id) !== id) as any[],
        classes,
        names,
      );
    } catch (e: any) {
      throw new BadRequestException(
        `This entry can't be removed because later transactions depend on it. ${e.message}`,
      );
    }
    await this.txModel.deleteOne({ _id: id, tenantId: tId });
    return { success: true };
  }

  // Add shareholder — creates (or promotes) the org-structure node and
  // optionally records the first issuance in the same step.
  async addShareholder(tenantId: string, dto: AddShareholderDto) {
    const tId = oid(tenantId);
    let node: OrgStructureNodeDocument | null;

    if (dto.nodeId) {
      node = await this.nodeModel.findOne({ _id: dto.nodeId, tenantId: tId });
      if (!node) throw new NotFoundException('Person not found');
      const roles = node.types?.length ? node.types : [node.type];
      if (!roles.includes(OrgStructureNodeType.SHAREHOLDER)) {
        node.types = [...roles, OrgStructureNodeType.SHAREHOLDER] as any;
        node.type = node.types[0];
      }
      if (dto.email && !node.email) node.email = dto.email;
      await node.save();
    } else {
      if (!dto.name?.trim()) {
        throw new BadRequestException('Enter the shareholder’s name.');
      }
      const parentIds = [...new Set(dto.parentIds ?? [])];
      if (parentIds.length) {
        const found = await this.nodeModel.countDocuments({
          _id: { $in: parentIds },
          tenantId: tId,
        });
        if (found !== parentIds.length) {
          throw new NotFoundException(
            'One or more parent nodes were not found',
          );
        }
      }
      const types = [
        OrgStructureNodeType.SHAREHOLDER,
        ...(dto.alsoTypes ?? []).filter(
          (t) => t !== OrgStructureNodeType.SHAREHOLDER,
        ),
      ];
      node = await this.nodeModel.create({
        tenantId: tId,
        type: types[0],
        types,
        email: dto.email ?? null,
        name: dto.name.trim(),
        subtitle: dto.subtitle?.trim() || null,
        parentIds: parentIds.map((p) => oid(p)),
        order: await this.nodeModel.countDocuments({
          tenantId: tId,
          parentIds: parentIds[0] ? oid(parentIds[0]) : { $size: 0 },
        }),
      });
    }

    let transaction: any = null;
    if (dto.shares && dto.shares > 0) {
      try {
        transaction = await this.createTransaction(tenantId, {
          type: ShareTransactionType.ISSUANCE,
          date: dto.date ?? new Date().toISOString(),
          toNodeId: String(node._id),
          shareClassId: dto.shareClassId,
          shares: dto.shares,
          pricePerShare: dto.pricePerShare,
          reference: dto.reference,
        } as any);
      } catch (e) {
        // Don't leave a half-created node behind when the issuance is
        // what failed (a brand-new node only).
        if (!dto.nodeId) await this.nodeModel.deleteOne({ _id: node._id });
        throw e;
      }
    }
    return { node, transaction };
  }

  // ── Vesting ─────────────────────────────────────────────────────
  async listVesting(tenantId: string) {
    const tId = oid(tenantId);
    const [rows, { names }, classes, txs] = await Promise.all([
      this.vestingModel.find({ tenantId: tId }).sort({ grantDate: -1 }).lean(),
      this.nodeNames(tId),
      this.classModel.find({ tenantId: tId }).lean(),
      this.txModel.find({ tenantId: tId }).lean(),
    ]);
    const cn = new Map(classes.map((c) => [String(c._id), c.name]));
    const price = latestPrice(txs as any[]);
    const now = new Date();
    return rows.map((s) => {
      const vested = vestedShares(
        s.totalShares,
        s.grantDate,
        s.cliffMonths,
        s.periodMonths,
        now,
      );
      const cliffDate = new Date(s.grantDate);
      cliffDate.setMonth(cliffDate.getMonth() + s.cliffMonths);
      const endDate = new Date(s.grantDate);
      endDate.setMonth(endDate.getMonth() + s.periodMonths);
      return {
        id: String(s._id),
        holderNodeId: String(s.holderNodeId),
        holder: names.get(String(s.holderNodeId)) ?? 'Removed holder',
        shareClassId: s.shareClassId ? String(s.shareClassId) : null,
        className: s.shareClassId
          ? (cn.get(String(s.shareClassId)) ?? null)
          : null,
        grantDate: s.grantDate,
        totalShares: s.totalShares,
        cliffMonths: s.cliffMonths,
        periodMonths: s.periodMonths,
        cliffDate,
        endDate,
        vested,
        unvested: s.totalShares - vested,
        vestedPct: s.totalShares ? (vested / s.totalShares) * 100 : 0,
        vestedValue: vested * price,
      };
    });
  }

  private async assertHolderAndClass(
    tId: Types.ObjectId,
    holderNodeId: string,
    shareClassId?: string | null,
  ) {
    const node = await this.nodeModel.findOne({
      _id: holderNodeId,
      tenantId: tId,
    });
    if (!node) throw new NotFoundException('Holder not found');
    if (!this.isShareholderNode(node)) {
      throw new BadRequestException(
        `${node.name} isn't a shareholder — add the Shareholder role first.`,
      );
    }
    if (
      shareClassId &&
      !(await this.classModel.exists({ _id: shareClassId, tenantId: tId }))
    ) {
      throw new NotFoundException('Share class not found');
    }
  }

  async createVesting(tenantId: string, dto: CreateVestingDto) {
    const tId = oid(tenantId);
    await this.assertHolderAndClass(tId, dto.holderNodeId, dto.shareClassId);
    const cliff = dto.cliffMonths ?? 12;
    const period = dto.periodMonths ?? 36;
    if (cliff > period) {
      throw new BadRequestException(
        'The cliff can’t be longer than the vesting period.',
      );
    }
    return this.vestingModel.create({
      tenantId: tId,
      holderNodeId: oid(dto.holderNodeId),
      shareClassId: dto.shareClassId ? oid(dto.shareClassId) : null,
      grantDate: new Date(dto.grantDate),
      totalShares: dto.totalShares,
      cliffMonths: cliff,
      periodMonths: period,
    });
  }

  async updateVesting(tenantId: string, id: string, dto: UpdateVestingDto) {
    const tId = oid(tenantId);
    const v = await this.vestingModel.findOne({ _id: id, tenantId: tId });
    if (!v) throw new NotFoundException('Vesting schedule not found');
    if (dto.grantDate !== undefined) v.grantDate = new Date(dto.grantDate);
    if (dto.totalShares !== undefined) v.totalShares = dto.totalShares;
    if (dto.cliffMonths !== undefined) v.cliffMonths = dto.cliffMonths;
    if (dto.periodMonths !== undefined) v.periodMonths = dto.periodMonths;
    if (v.cliffMonths > v.periodMonths) {
      throw new BadRequestException(
        'The cliff can’t be longer than the vesting period.',
      );
    }
    await v.save();
    return v;
  }

  async deleteVesting(tenantId: string, id: string) {
    const res = await this.vestingModel.deleteOne({
      _id: id,
      tenantId: oid(tenantId),
    });
    if (!res.deletedCount)
      throw new NotFoundException('Vesting schedule not found');
    return { success: true };
  }

  // ── Convertible instruments ─────────────────────────────────────
  async listConvertibles(tenantId: string) {
    return this.convModel
      .find({ tenantId: oid(tenantId) })
      .sort({ dateIssued: -1 })
      .lean();
  }

  async createConvertible(tenantId: string, dto: CreateConvertibleDto) {
    return this.convModel.create({
      tenantId: oid(tenantId),
      ...dto,
      valuationCap: dto.valuationCap ?? 0,
      discount: dto.discount ?? 0,
      dateIssued: new Date(dto.dateIssued),
      maturityDate: dto.maturityDate ? new Date(dto.maturityDate) : null,
      interestRate:
        dto.type === 'Convertible Note' ? (dto.interestRate ?? 0) : null,
    });
  }

  async updateConvertible(
    tenantId: string,
    id: string,
    dto: UpdateConvertibleDto,
  ) {
    const c = await this.convModel.findOne({
      _id: id,
      tenantId: oid(tenantId),
    });
    if (!c) throw new NotFoundException('Instrument not found');
    const { dateIssued, maturityDate, ...rest } = dto as any;
    Object.assign(c, rest);
    if (dateIssued) c.dateIssued = new Date(dateIssued);
    if (maturityDate !== undefined)
      c.maturityDate = maturityDate ? new Date(maturityDate) : null;
    if (c.type !== 'Convertible Note') {
      c.interestRate = null;
    }
    await c.save();
    return c;
  }

  async deleteConvertible(tenantId: string, id: string) {
    const res = await this.convModel.deleteOne({
      _id: id,
      tenantId: oid(tenantId),
    });
    if (!res.deletedCount) throw new NotFoundException('Instrument not found');
    return { success: true };
  }

  async addConvertibleDocument(
    tenantId: string,
    id: string,
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Choose a file to upload.');
    const c = await this.convModel.findOne({
      _id: id,
      tenantId: oid(tenantId),
    });
    if (!c) throw new NotFoundException('Instrument not found');
    c.documents.push({
      name: file.originalname,
      fileUrl: `/uploads/grc/convertibles/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    });
    c.markModified('documents');
    await c.save();
    return c;
  }

  async removeConvertibleDocument(tenantId: string, id: string, index: number) {
    const c = await this.convModel.findOne({
      _id: id,
      tenantId: oid(tenantId),
    });
    if (!c) throw new NotFoundException('Instrument not found');
    c.documents.splice(index, 1);
    c.markModified('documents');
    await c.save();
    return c;
  }

  // ── Shareholder documents ───────────────────────────────────────
  private async actor(userId: string) {
    const u = await this.userModel
      .findById(userId)
      .select('firstName lastName businessName email')
      .lean();
    const name = [(u as any)?.firstName, (u as any)?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    return (
      name || (u as any)?.businessName || (u as any)?.email || 'Unknown user'
    );
  }

  private async logAccess(
    tenantId: Types.ObjectId,
    doc: { _id?: any; title: string },
    action: 'Uploaded' | 'Viewed' | 'Downloaded' | 'Deleted',
    userId: string,
    ip: string,
  ) {
    await this.logModel.create({
      tenantId,
      documentId: doc._id ?? null,
      documentTitle: doc.title,
      userName: await this.actor(userId),
      userId,
      action,
      ip,
      at: new Date(),
    });
  }

  async listDocuments(tenantId: string) {
    const tId = oid(tenantId);
    const [docs, { names }] = await Promise.all([
      this.docModel
        .find({ tenantId: tId })
        .sort({ date: -1, createdAt: -1 })
        .lean(),
      this.nodeNames(tId),
    ]);
    return docs.map((d) => ({
      id: String(d._id),
      category: d.category,
      title: d.title,
      shareholderNodeId: d.shareholderNodeId
        ? String(d.shareholderNodeId)
        : null,
      shareholder: d.shareholderNodeId
        ? (names.get(String(d.shareholderNodeId)) ?? 'Removed holder')
        : 'All shareholders',
      access: d.access,
      date: d.date,
      refNo: d.refNo,
      notes: d.notes,
      // storedName is never exposed.
      files: d.files.map((f, index) => ({
        index,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        uploadedAt: f.uploadedAt,
      })),
    }));
  }

  private async assertHolderOrNull(tId: Types.ObjectId, id?: string | null) {
    if (!id) return null;
    if (!(await this.nodeModel.exists({ _id: id, tenantId: tId }))) {
      throw new NotFoundException('Shareholder not found');
    }
    return oid(id);
  }

  async createDocument(
    tenantId: string,
    userId: string,
    ip: string,
    dto: CreateShareholderDocumentDto,
    file?: Express.Multer.File,
  ) {
    const tId = oid(tenantId);
    const holder = await this.assertHolderOrNull(tId, dto.shareholderNodeId);
    const doc = await this.docModel.create({
      tenantId: tId,
      category: dto.category.trim(),
      title: dto.title.trim(),
      shareholderNodeId: holder,
      access: dto.access ?? 'Private',
      date: dto.date ? new Date(dto.date) : new Date(),
      refNo: dto.refNo ?? '',
      notes: dto.notes ?? '',
      files: file
        ? [
            {
              name: file.originalname,
              storedName: file.filename,
              mimeType: file.mimetype,
              size: file.size,
              uploadedAt: new Date(),
            },
          ]
        : [],
    });
    await this.logAccess(tId, doc, 'Uploaded', userId, ip);
    return doc;
  }

  async updateDocument(
    tenantId: string,
    id: string,
    dto: UpdateShareholderDocumentDto,
  ) {
    const tId = oid(tenantId);
    const doc = await this.docModel.findOne({ _id: id, tenantId: tId });
    if (!doc) throw new NotFoundException('Document not found');
    if (dto.shareholderNodeId !== undefined) {
      doc.shareholderNodeId = await this.assertHolderOrNull(
        tId,
        dto.shareholderNodeId || null,
      );
    }
    for (const f of [
      'category',
      'title',
      'access',
      'refNo',
      'notes',
    ] as const) {
      if ((dto as any)[f] !== undefined) (doc as any)[f] = (dto as any)[f];
    }
    if (dto.date) doc.date = new Date(dto.date);
    await doc.save();
    return doc;
  }

  async addDocumentFile(
    tenantId: string,
    userId: string,
    ip: string,
    id: string,
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Choose a file to upload.');
    const tId = oid(tenantId);
    const doc = await this.docModel.findOne({ _id: id, tenantId: tId });
    if (!doc) {
      this.removeStored(file.filename);
      throw new NotFoundException('Document not found');
    }
    doc.files.push({
      name: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    });
    doc.markModified('files');
    await doc.save();
    await this.logAccess(tId, doc, 'Uploaded', userId, ip);
    return doc;
  }

  private removeStored(storedName: string) {
    try {
      const p = join(SHAREHOLDER_DOC_DIR, storedName);
      if (existsSync(p)) unlinkSync(p);
    } catch {
      /* best effort */
    }
  }

  async deleteDocument(
    tenantId: string,
    userId: string,
    ip: string,
    id: string,
  ) {
    const tId = oid(tenantId);
    const doc = await this.docModel.findOne({ _id: id, tenantId: tId });
    if (!doc) throw new NotFoundException('Document not found');
    doc.files.forEach((f) => this.removeStored(f.storedName));
    await this.docModel.deleteOne({ _id: doc._id });
    await this.logAccess(tId, doc, 'Deleted', userId, ip);
    return { success: true };
  }

  /** Authenticated, logged access to one stored file. */
  async openDocumentFile(
    tenantId: string,
    userId: string,
    ip: string,
    id: string,
    index: number,
    action: 'Viewed' | 'Downloaded',
  ) {
    const tId = oid(tenantId);
    const doc = await this.docModel.findOne({ _id: id, tenantId: tId });
    const file = doc?.files?.[index];
    if (!doc || !file) throw new NotFoundException('File not found');
    const path = join(SHAREHOLDER_DOC_DIR, file.storedName);
    if (!existsSync(path)) {
      throw new NotFoundException(
        'The stored file is missing from the server.',
      );
    }
    await this.logAccess(tId, doc, action, userId, ip);
    return {
      stream: createReadStream(path),
      name: file.name,
      mimeType: file.mimeType,
    };
  }

  async accessLog(tenantId: string) {
    const rows = await this.logModel
      .find({ tenantId: oid(tenantId) })
      .sort({ at: -1 })
      .limit(500)
      .lean();
    return rows.map((r) => ({
      id: String(r._id),
      documentId: r.documentId ? String(r.documentId) : null,
      documentTitle: r.documentTitle,
      userName: r.userName,
      action: r.action,
      ip: r.ip,
      at: r.at,
    }));
  }
}
