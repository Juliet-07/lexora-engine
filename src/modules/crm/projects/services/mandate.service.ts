import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Mandate,
  MandateDocument_,
  MandateStage,
  MANDATE_STAGES,
  MANDATE_STAGE_META,
  ConflictCheckStatus,
  DEFAULT_CLOSURE_CHECKLIST,
} from '../schemas';
import {
  CreateMandateDto,
  UpdateMandateDto,
  SetClosureItemDto,
  AddMilestoneDto,
  UpdateMilestoneDto,
} from '../dtos';
import { TimeEntryService } from './time-entry.service';
import { User, UserDocument } from '../../../auth/schemas/user.schema';
import { UserType } from '../../../../common/interfaces/user-role.enum';

// Legal-entity suffixes and generic words that would otherwise make
// almost every company name "match" almost every other one — dropped
// before comparing so the conflict search is looking at the part of
// the name that's actually distinctive.
const NAME_NOISE_WORDS = new Set([
  'the',
  'and',
  'ltd',
  'limited',
  'llc',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'co',
  'company',
  'group',
  'holdings',
  'holding',
  'plc',
  'llp',
  'partners',
  'international',
]);

const normalizeName = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const significantTokens = (raw: string): string[] =>
  normalizeName(raw)
    .split(' ')
    .filter((t) => t.length >= 3 && !NAME_NOISE_WORDS.has(t));

// True when two names are close enough to warrant a partner's eyes:
// exact match once normalized, one fully contains the other, or they
// share at least two distinctive words (or their only distinctive
// word, for short names).
function namesConflict(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length > 4 && nb.length > 4 && (na.includes(nb) || nb.includes(na)))
    return true;
  const ta = significantTokens(a);
  const tb = significantTokens(b);
  if (!ta.length || !tb.length) return false;
  const shared = ta.filter((t) => tb.includes(t));
  const needed = Math.min(ta.length, tb.length) === 1 ? 1 : 2;
  return shared.length >= needed;
}

@Injectable()
export class MandateService {
  constructor(
    @InjectModel(Mandate.name)
    private readonly model: Model<MandateDocument_>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly timeEntryService: TimeEntryService,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.model.countDocuments({
      tenantId,
      ref: new RegExp(`^M-${year}-`),
    });
    return `M-${year}-${String(count + 1).padStart(3, '0')}`;
  }

  // .lean() returns the raw MongoDB document with no schema defaults
  // applied — mandates created before `milestones` existed genuinely
  // have no such key stored, so it comes back undefined here even
  // though the schema says `default: []`. Normalize explicitly
  // rather than relying on every caller to guard for it.
  //
  // wip is no longer a stored value the tenant sets by hand — it's
  // the sum of this mandate's Approved, billable time entries, so
  // this normalization is now async.
  private async normalize(m: any, wip?: number, actualCost?: number) {
    return {
      ...m,
      description: m.description ?? '',
      milestones: m.milestones ?? [],
      customFolders: m.customFolders ?? [],
      wip:
        wip ??
        (await this.timeEntryService.getApprovedBillableValueForMandate(
          String(m.tenantId),
          String(m._id),
        )),
      // Real budget consumption — every approved time entry, with
      // write-downs/write-offs applied — not the stale, manually-set
      // number this field used to hold.
      actualCost:
        actualCost ??
        (await this.timeEntryService.getActualCostForMandate(
          String(m.tenantId),
          String(m._id),
        )),
    };
  }

  // Heals mandates created back when ClosureChecklistItem's schema had
  // `_id: false` — those stored items have no id for the toggle
  // endpoint to address, so Close stays stuck forever until this
  // runs once. Re-creating the subdocuments under the current schema
  // gives each a real auto _id; a no-op once a mandate's already
  // healed. Returns true if it had to write.
  private async healClosureChecklist(m: MandateDocument_): Promise<boolean> {
    const needsHeal = m.closureChecklist.some((c: any) => !c._id);
    if (!needsHeal) return false;
    m.closureChecklist = m.closureChecklist.map((c: any) => ({
      label: c.label,
      done: c.done,
    })) as any;
    await m.save();
    return true;
  }

  async getAll(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const docs = await this.model.find({ tenantId: tId }).sort({
      createdAt: -1,
    });
    await Promise.all(docs.map((d) => this.healClosureChecklist(d)));
    const rows = docs.map((d) => d.toObject());
    const [wipMap, actualCostMap] = await Promise.all([
      this.timeEntryService.getApprovedBillableValueByMandateIds(
        tenantId,
        rows.map((r) => String(r._id)),
      ),
      this.timeEntryService.getActualCostByMandateIds(
        tenantId,
        rows.map((r) => String(r._id)),
      ),
    ]);
    return Promise.all(
      rows.map((m) =>
        this.normalize(
          m,
          wipMap.get(String(m._id)) ?? 0,
          actualCostMap.get(String(m._id)) ?? 0,
        ),
      ),
    );
  }

  async getById(tenantId: string, id: string) {
    const m = await this.getRawDoc(tenantId, id);
    return this.normalize(m.toObject());
  }

  private async getRawDoc(tenantId: string, id: string) {
    const m = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!m) throw new NotFoundException('Mandate not found');
    await this.healClosureChecklist(m);
    return m;
  }

  async create(tenantId: string, dto: CreateMandateDto) {
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const parties = (dto.parties ?? []).map((p) => p.trim()).filter(Boolean);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      name: dto.name,
      description: dto.description ?? '',
      clientUserId: new Types.ObjectId(dto.clientUserId),
      clientName: dto.clientName,
      type: dto.type,
      manager: dto.manager ?? '',
      teamId: dto.teamId ? new Types.ObjectId(dto.teamId) : null,
      teamName: dto.teamName ?? '',
      team: [],
      startDate: new Date(),
      targetDate: new Date(dto.targetDate),
      budget: dto.budget,
      feeStructure: dto.feeStructure,
      currency: dto.currency ?? 'USD',
      parties,
      closureChecklist: DEFAULT_CLOSURE_CHECKLIST.map((label) => ({
        label,
        done: false,
      })),
    });
    await this.runConflictSearch(tId, created);
    // A brand-new mandate has no time entries yet — 0 without a query.
    return this.normalize(created.toObject(), 0, 0);
  }

  // The real check the product owner asked for: cross-references this
  // mandate's client + named parties against every other client on
  // the tenant and every other mandate's client/parties, rather than
  // a button that just flips Pending → Cleared with nothing behind
  // it. Clears automatically when nothing matches; leaves it Pending
  // with the hits recorded for a partner to review when something
  // does, so `clearConflictCheck` remains a real, informed decision.
  private async runConflictSearch(
    tenantId: Types.ObjectId,
    m: MandateDocument_,
  ): Promise<void> {
    const searchNames = [m.clientName, ...(m.parties ?? [])].filter(Boolean);
    if (!searchNames.length) return;

    const [clients, otherMandates] = await Promise.all([
      this.userModel
        .find({
          tenantId,
          userType: UserType.CLIENT,
          _id: { $ne: m.clientUserId },
        })
        .select('_id businessName firstName lastName')
        .lean(),
      this.model
        .find({ tenantId, _id: { $ne: m._id } })
        .select('_id ref clientName parties')
        .lean(),
    ]);

    const hits: any[] = [];
    for (const needle of searchNames) {
      for (const c of clients) {
        const candidateName =
          (c as any).businessName ||
          [(c as any).firstName, (c as any).lastName].filter(Boolean).join(' ');
        if (candidateName && namesConflict(needle, candidateName)) {
          hits.push({
            matchedAgainst: needle,
            source: 'client',
            matchedName: candidateName,
            clientUserId: String((c as any)._id),
          });
        }
      }
      for (const om of otherMandates) {
        const candidates = [om.clientName, ...(om.parties ?? [])].filter(
          Boolean,
        );
        for (const candidateName of candidates) {
          if (namesConflict(needle, candidateName)) {
            hits.push({
              matchedAgainst: needle,
              source: 'mandate',
              matchedName: candidateName,
              mandateId: String(om._id),
              mandateRef: om.ref,
            });
          }
        }
      }
    }

    m.conflictHits = hits as any;
    m.conflictCheck = hits.length
      ? ConflictCheckStatus.PENDING
      : ConflictCheckStatus.CLEARED;
    await m.save();
  }

  // Lets a partner re-run the search on demand — e.g. after editing
  // the mandate's parties, or simply to double-check before clearing.
  async rerunConflictCheck(tenantId: string, id: string) {
    const m = await this.getRawDoc(tenantId, id);
    await this.runConflictSearch(new Types.ObjectId(tenantId), m);
    return this.normalize(m.toObject());
  }

  async update(tenantId: string, id: string, dto: UpdateMandateDto) {
    const m = await this.getRawDoc(tenantId, id);
    if (dto.name !== undefined) m.name = dto.name;
    if (dto.description !== undefined) m.description = dto.description;
    if (dto.rag !== undefined) m.rag = dto.rag;
    if (dto.manager !== undefined) m.manager = dto.manager;
    if (dto.teamId !== undefined) m.teamId = new Types.ObjectId(dto.teamId);
    if (dto.teamName !== undefined) m.teamName = dto.teamName;
    if (dto.team !== undefined) m.team = dto.team;
    if (dto.targetDate !== undefined) m.targetDate = new Date(dto.targetDate);
    if (dto.budget !== undefined) m.budget = dto.budget;
    if (dto.billed !== undefined) m.billed = dto.billed;
    // wip and actualCost intentionally not settable here anymore —
    // both are derived from real Approved time entries. See
    // UpdateMandateDto.
    if (dto.feeStructure !== undefined) m.feeStructure = dto.feeStructure;
    if (dto.progress !== undefined) m.progress = dto.progress;
    if (dto.parties !== undefined) m.parties = dto.parties;
    await m.save();
    return this.normalize(m.toObject());
  }

  // Same gate as the confirmed prototype: can't reach Setup with an
  // uncleared conflict check.
  async advanceStage(tenantId: string, id: string) {
    const m = await this.getRawDoc(tenantId, id);
    const idx = MANDATE_STAGES.indexOf(m.stage);
    if (idx === MANDATE_STAGES.length - 1) {
      throw new BadRequestException('Mandate is already at its final stage');
    }
    const next = MANDATE_STAGES[idx + 1];
    if (
      next === MandateStage.SETUP &&
      m.conflictCheck !== ConflictCheckStatus.CLEARED
    ) {
      throw new BadRequestException(
        'Clear the conflict check before moving to Setup',
      );
    }
    m.stage = next;
    await m.save();
    const normalized = await this.normalize(m.toObject());
    return { ...normalized, stageTrigger: MANDATE_STAGE_META[next].trigger };
  }

  async clearConflictCheck(tenantId: string, id: string) {
    const m = await this.getRawDoc(tenantId, id);
    m.conflictCheck = ConflictCheckStatus.CLEARED;
    await m.save();
    return this.normalize(m.toObject());
  }

  async setClosureItem(
    tenantId: string,
    id: string,
    itemId: string,
    dto: SetClosureItemDto,
  ) {
    const m = await this.getRawDoc(tenantId, id);
    const item = m.closureChecklist.id(itemId);
    if (!item) throw new NotFoundException('Closure checklist item not found');
    item.done = dto.done;
    await m.save();
    return this.normalize(m.toObject());
  }

  // Only closeable once every checklist item is done — same rule as
  // the confirmed prototype's disabled Close button.
  async close(tenantId: string, id: string) {
    const m = await this.getRawDoc(tenantId, id);
    if (!m.closureChecklist.every((c) => c.done)) {
      throw new BadRequestException(
        'All closure checklist items must be complete first',
      );
    }
    m.stage = MandateStage.CLOSE;
    m.progress = 100;
    await m.save();
    return this.normalize(m.toObject());
  }

  async addCustomFolder(tenantId: string, id: string, folder: string) {
    const m = await this.getRawDoc(tenantId, id);
    if (!m.customFolders.includes(folder)) {
      m.customFolders.push(folder);
      await m.save();
    }
    return this.normalize(m.toObject());
  }

  // ── Milestones ───────────────────────────────────────────────

  async addMilestone(tenantId: string, id: string, dto: AddMilestoneDto) {
    const m = await this.getRawDoc(tenantId, id);
    m.milestones.push({
      name: dto.name,
      date: new Date(dto.date),
    } as any);
    await m.save();
    return this.normalize(m.toObject());
  }

  async updateMilestone(
    tenantId: string,
    id: string,
    milestoneId: string,
    dto: UpdateMilestoneDto,
  ) {
    const m = await this.getRawDoc(tenantId, id);
    const milestone = m.milestones.id(milestoneId);
    if (!milestone) throw new NotFoundException('Milestone not found');
    if (dto.name !== undefined) milestone.name = dto.name;
    if (dto.date !== undefined) milestone.date = new Date(dto.date);
    if (dto.status !== undefined) milestone.status = dto.status as any;
    await m.save();
    return this.normalize(m.toObject());
  }

  async deleteMilestone(tenantId: string, id: string, milestoneId: string) {
    const m = await this.getRawDoc(tenantId, id);
    const milestone = m.milestones.id(milestoneId);
    if (!milestone) throw new NotFoundException('Milestone not found');
    milestone.deleteOne();
    await m.save();
    return this.normalize(m.toObject());
  }
}
