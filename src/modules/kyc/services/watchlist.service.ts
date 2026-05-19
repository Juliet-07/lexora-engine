import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import axios from 'axios';
import {
  WatchlistEntry,
  WatchlistEntryDocument,
  WatchlistType,
  WatchlistEntityType,
} from '../schemas/watchlist.schema';
import {
  AddWatchlistEntryDto,
  AdHocScreeningDto,
  WatchlistFilterDto,
} from '../dto/kyc.dto';
import { paginate, PaginationDto } from '../../../common/pagination.dto';

@Injectable()
export class WatchlistService {
  private readonly apiKey = process.env.OPENSANCTIONS_API_KEY;

  constructor(
    @InjectModel(WatchlistEntry.name)
    private readonly watchlistModel: Model<WatchlistEntryDocument>,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════

  async getStats(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const [total, byType] = await Promise.all([
      this.watchlistModel.countDocuments({ tenantId: tId, isActive: true }),
      this.watchlistModel.aggregate([
        { $match: { tenantId: tId, isActive: true } },
        { $group: { _id: '$listType', count: { $sum: 1 } } },
      ]),
    ]);

    const typeMap = byType.reduce(
      (m, b) => ({ ...m, [b._id]: b.count }),
      {} as Record<string, number>,
    );

    return {
      total,
      sanctions:    typeMap[WatchlistType.SANCTIONS]      ?? 0,
      pep:          typeMap[WatchlistType.PEP]            ?? 0,
      adverseMedia: typeMap[WatchlistType.ADVERSE_MEDIA]  ?? 0,
      internalBlock:typeMap[WatchlistType.INTERNAL_BLOCK] ?? 0,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // LIST ENTRIES
  // ═══════════════════════════════════════════════════════════

  async getEntries(
    tenantId: string,
    pagination: PaginationDto,
    filters: WatchlistFilterDto,
  ) {
    const { skip, limit, page } = pagination;
    const query: any = { tenantId: new Types.ObjectId(tenantId) };

    if (filters.listType)   query.listType   = filters.listType;
    if (filters.entityType) query.entityType = filters.entityType;
    if (filters.isActive !== undefined) query.isActive = filters.isActive;
    if (filters.search) {
      query.$or = [
        { name:    { $regex: filters.search, $options: 'i' } },
        { aliases: { $regex: filters.search, $options: 'i' } },
        { country: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.watchlistModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .populate('addedBy', 'firstName lastName email')
        .lean(),
      this.watchlistModel.countDocuments(query),
    ]);

    return paginate(items, total, page, limit);
  }

  // ═══════════════════════════════════════════════════════════
  // ADD ENTRY MANUALLY
  // ═══════════════════════════════════════════════════════════

  async addEntry(
    tenantId: string,
    addedBy: string,
    dto: AddWatchlistEntryDto,
  ) {
    const count = await this.watchlistModel.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
    });
    const entryId = `WL${String(count + 1).padStart(3, '0')}`;

    return this.watchlistModel.create({
      ...dto,
      entryId,
      tenantId: new Types.ObjectId(tenantId),
      addedBy:  new Types.ObjectId(addedBy),
    });
  }

  // ═══════════════════════════════════════════════════════════
  // DELETE ENTRY
  // ═══════════════════════════════════════════════════════════

  async deleteEntry(entryId: string, tenantId: string) {
    const entry = await this.watchlistModel.findOneAndUpdate(
      { _id: entryId, tenantId: new Types.ObjectId(tenantId) },
      { isActive: false },
      { new: true },
    );
    if (!entry) throw new NotFoundException('Watchlist entry not found');
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════
  // IMPORT CSV
  // Parses CSV text and bulk-inserts entries
  // Expected columns: name,entityType,listType,country,source,reason,aliases
  // ═══════════════════════════════════════════════════════════

  async importCsv(tenantId: string, addedBy: string, csvText: string) {
    const lines = csvText.split('\n').filter((l) => l.trim());
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const rows    = lines.slice(1);

    const get = (row: string[], field: string) => {
      const idx = headers.indexOf(field);
      return idx >= 0 ? row[idx]?.trim() ?? null : null;
    };

    let count = await this.watchlistModel.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
    });

    const entries = rows
      .filter((r) => r.trim())
      .map((row) => {
        const cols = row.split(',');
        count++;
        return {
          entryId:    `WL${String(count).padStart(3, '0')}`,
          tenantId:   new Types.ObjectId(tenantId),
          addedBy:    new Types.ObjectId(addedBy),
          name:       get(cols, 'name') ?? 'Unknown',
          aliases:    get(cols, 'aliases'),
          entityType: (get(cols, 'entitytype') as WatchlistEntityType) ?? WatchlistEntityType.INDIVIDUAL,
          listType:   (get(cols, 'listtype')   as WatchlistType)       ?? WatchlistType.INTERNAL_BLOCK,
          country:    get(cols, 'country'),
          source:     get(cols, 'source'),
          reason:     get(cols, 'reason'),
          isActive:   true,
        };
      });

    if (entries.length === 0) {
      throw new BadRequestException('No valid rows found in CSV');
    }

    await this.watchlistModel.insertMany(entries);
    return { imported: entries.length };
  }

  // ═══════════════════════════════════════════════════════════
  // SYNC FROM OPENSANCTIONS
  // Fetches latest data and upserts into the tenant's watchlist
  // ═══════════════════════════════════════════════════════════

  async syncFromOpenSanctions(tenantId: string, addedBy: string) {
    const datasets = [
      { dataset: 'us_ofac_sdn',         listType: WatchlistType.SANCTIONS, source: 'OFAC SDN'         },
      { dataset: 'eu_fsf',              listType: WatchlistType.SANCTIONS, source: 'EU Consolidated'  },
      { dataset: 'un_sc_sanctions',     listType: WatchlistType.SANCTIONS, source: 'UN Security Council' },
      { dataset: 'gb_hmt_sanctions',    listType: WatchlistType.SANCTIONS, source: 'UK HMT'           },
      { dataset: 'everypolitician',     listType: WatchlistType.PEP,       source: 'EveryPolitician'  },
    ];

    let totalSynced = 0;

    for (const ds of datasets) {
      try {
        const response = await axios.get(
          `https://api.opensanctions.org/entities/?dataset=${ds.dataset}&schema=Person&limit=100`,
          {
            headers: { Authorization: `ApiKey ${this.apiKey}` },
            timeout: 20000,
          },
        );

        const entities = response.data?.results ?? [];

        for (const entity of entities) {
          const name    = entity.caption ?? entity.properties?.name?.[0] ?? 'Unknown';
          const country = entity.properties?.nationality?.[0]
            ?? entity.properties?.country?.[0]
            ?? null;

          let count = await this.watchlistModel.countDocuments({
            tenantId: new Types.ObjectId(tenantId),
          });

          await this.watchlistModel.findOneAndUpdate(
            {
              tenantId:   new Types.ObjectId(tenantId),
              externalId: entity.id,
            },
            {
              $setOnInsert: {
                entryId:    `WL${String(count + 1).padStart(3, '0')}`,
                tenantId:   new Types.ObjectId(tenantId),
                addedBy:    new Types.ObjectId(addedBy),
              },
              $set: {
                name,
                aliases:    entity.properties?.alias?.join(', ') ?? null,
                entityType: WatchlistEntityType.INDIVIDUAL,
                listType:   ds.listType,
                country,
                source:     ds.source,
                reason:     entity.properties?.notes?.[0] ?? null,
                externalId: entity.id,
                isActive:   true,
              },
            },
            { upsert: true },
          );
          totalSynced++;
        }
      } catch (err) {
        console.error(`Failed to sync dataset ${ds.dataset}:`, err.message);
      }
    }

    return { synced: totalSynced, syncedAt: new Date() };
  }

  // ═══════════════════════════════════════════════════════════
  // AD-HOC SCREENING
  // Screen a name against the tenant's local watchlist
  // ═══════════════════════════════════════════════════════════

  async adHocScreen(tenantId: string, dto: AdHocScreeningDto) {
    const tId = new Types.ObjectId(tenantId);
    const nameRegex = new RegExp(dto.name.replace(/\s+/g, '.*'), 'i');

    // Check local watchlist first
    const localMatches = await this.watchlistModel
      .find({
        tenantId: tId,
        isActive: true,
        $or: [
          { name:    nameRegex },
          { aliases: nameRegex },
        ],
        ...(dto.listType && { listType: dto.listType }),
      })
      .lean();

    // Also screen live against OpenSanctions if requested
    let liveMatches: any[] = [];
    if (dto.checkLive) {
      try {
        const entity = {
          schema: 'Person',
          properties: { name: [dto.name] },
        };
        const response = await axios.post(
          'https://api.opensanctions.org/match/default',
          { queries: { q: entity } },
          {
            headers: {
              Authorization:  `ApiKey ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          },
        );
        liveMatches = (response.data?.responses?.q?.results ?? []).filter(
          (m: any) => m.score >= 0.7,
        );
      } catch (err) {
        console.error('Live OpenSanctions check failed:', err.message);
      }
    }

    return {
      name:         dto.name,
      localMatches,
      liveMatches,
      totalHits:    localMatches.length + liveMatches.length,
      screenedAt:   new Date(),
    };
  }
}
