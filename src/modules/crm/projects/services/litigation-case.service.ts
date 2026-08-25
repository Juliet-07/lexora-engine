import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LitigationCase,
  LitigationCaseDocument,
  LitigationCaseStatus,
  LitigationTimelineSource,
  PleadingStatus,
  AdrCase,
  AdrCaseDocument,
} from '../schemas';
import {
  CreateLitigationCaseDto,
  UpdateLitigationDetailsDto,
  UpdateLitigationStageDto,
  AddLitigationPleadingDto,
  UpdateLitigationPleadingDto,
  AddLitigationCourtDateDto,
  AddLitigationDisbursementDto,
  AddLitigationTimelineEntryDto,
  RecordLitigationOutcomeDto,
} from '../dtos';
import { TimeEntryService } from './time-entry.service';

@Injectable()
export class LitigationCaseService {
  constructor(
    @InjectModel(LitigationCase.name)
    private readonly model: Model<LitigationCaseDocument>,
    // Raw model, not AdrCaseService — AdrCaseService creates
    // litigation cases via escalation, so depending on it back here
    // would form a circular dependency. Read-only access to the
    // linked ADR case's own data (for combined totals) only needs
    // the model, not the service.
    @InjectModel(AdrCase.name)
    private readonly adrCaseModel: Model<AdrCaseDocument>,
    private readonly timeEntryService: TimeEntryService,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const count = await this.model.countDocuments({ tenantId });
    return `LIT-${String(count + 1).padStart(3, '0')}`;
  }

  private logTimeline(
    c: LitigationCaseDocument,
    title: string,
    description = '',
    source: LitigationTimelineSource = LitigationTimelineSource.SYSTEM,
  ) {
    c.timeline.push({ at: new Date(), title, description, source } as any);
  }

  // Real combined view across both phases — hours/fees/age computed
  // live from the linked ADR case and this litigation case's own
  // real records, never stored as a static number that could drift.
  private async withCombinedTotals(c: any) {
    const litigationDisbursedTotal = (c.disbursements ?? []).reduce(
      (s: number, d: any) => s + d.amount,
      0,
    );
    const litigationEntries = await this.timeEntryService.getAll(
      String(c.tenantId),
      { litigationCaseId: String(c._id) },
    );
    const litigationHours = litigationEntries.reduce(
      (s, e: any) => s + e.hours,
      0,
    );
    const litigationFees = litigationEntries.reduce(
      (s, e: any) => s + e.hours * e.rate,
      0,
    );

    let adrHours = 0;
    let adrFees = 0;
    let adrDisbursedTotal = 0;
    let adrFiledOn: Date | null = null;
    if (c.adrCaseId) {
      const adrCase = await this.adrCaseModel.findById(c.adrCaseId).lean();
      if (adrCase) {
        adrFiledOn = (adrCase as any).filedOn;
        adrDisbursedTotal = ((adrCase as any).disbursements ?? []).reduce(
          (s: number, d: any) => s + d.amount,
          0,
        );
        const adrEntries = await this.timeEntryService.getAll(
          String(c.tenantId),
          { adrCaseId: String(c.adrCaseId) },
        );
        adrHours = adrEntries.reduce((s, e: any) => s + e.hours, 0);
        adrFees = adrEntries.reduce((s, e: any) => s + e.hours * e.rate, 0);
      }
    }

    const now = Date.now();
    const litigationAgeDays = Math.floor(
      (now - new Date(c.filedOn).getTime()) / 86_400_000,
    );
    const totalAgeDays = adrFiledOn
      ? Math.floor((now - new Date(adrFiledOn).getTime()) / 86_400_000)
      : litigationAgeDays;

    return {
      ...c,
      totals: {
        litigationHours,
        litigationFees,
        litigationDisbursed: litigationDisbursedTotal,
        adrHours,
        adrFees,
        adrDisbursed: adrDisbursedTotal,
        combinedFees: litigationFees + adrFees,
        combinedDisbursed: litigationDisbursedTotal + adrDisbursedTotal,
        combinedTotal:
          litigationFees +
          adrFees +
          litigationDisbursedTotal +
          adrDisbursedTotal,
        litigationAgeDays,
        totalAgeDays,
      },
    };
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getById(tenantId: string, id: string) {
    const c = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!c) throw new NotFoundException('Litigation case not found');
    return this.withCombinedTotals(c);
  }

  private async getRawDoc(tenantId: string, id: string) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Litigation case not found');
    return c;
  }

  // Direct filing — no prior ADR phase. Used by
  // AdrCaseService.escalateToLitigation for the far more common
  // escalation path, which builds the same create() call internally
  // with adrCaseId/mandateId/parties/claimValue seeded from the real
  // ADR case rather than asking the caller to re-supply them.
  async create(
    tenantId: string,
    dto: CreateLitigationCaseDto & {
      adrCaseId?: string;
      mandateName?: string;
      openingTimelineTitle?: string;
      openingTimelineDescription?: string;
    },
  ) {
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      title: dto.title,
      adrCaseId: dto.adrCaseId ? new Types.ObjectId(dto.adrCaseId) : null,
      mandateId: dto.mandateId ? new Types.ObjectId(dto.mandateId) : null,
      mandateName: dto.mandateName ?? '',
      parties: (dto.parties ?? []).map((p) => ({
        name: p.name,
        role: p.role,
        organisation: p.organisation ?? '',
        userId: p.userId ? new Types.ObjectId(p.userId) : null,
      })),
      claimValue: dto.claimValue ?? 0,
      currency: dto.currency ?? 'USD',
      filedOn: new Date(),
      court: dto.court ?? '',
      courtDivision: dto.courtDivision ?? '',
      registry: dto.registry ?? '',
      timeline: [
        {
          at: new Date(),
          title: dto.openingTimelineTitle ?? 'Case filed',
          description: dto.openingTimelineDescription ?? '',
          source: LitigationTimelineSource.SYSTEM,
        },
      ],
    });
    return created.toObject();
  }

  async updateDetails(
    tenantId: string,
    id: string,
    dto: UpdateLitigationDetailsDto,
  ) {
    const c = await this.getRawDoc(tenantId, id);
    if (dto.court !== undefined) c.court = dto.court;
    if (dto.courtDivision !== undefined) c.courtDivision = dto.courtDivision;
    if (dto.courtCaseNumber !== undefined) {
      c.courtCaseNumber = dto.courtCaseNumber;
      this.logTimeline(c, 'Court case number assigned', dto.courtCaseNumber);
    }
    if (dto.judge !== undefined) c.judge = dto.judge;
    if (dto.registry !== undefined) c.registry = dto.registry;
    if (dto.courtFeesPaid !== undefined) c.courtFeesPaid = dto.courtFeesPaid;
    if (dto.courtFeesCurrency !== undefined)
      c.courtFeesCurrency = dto.courtFeesCurrency;
    if (dto.claimValue !== undefined) c.claimValue = dto.claimValue;
    if (dto.parties) {
      c.parties = dto.parties.map((p) => ({
        name: p.name,
        role: p.role,
        organisation: p.organisation ?? '',
        userId: p.userId ? new Types.ObjectId(p.userId) : null,
      })) as any;
    }
    await c.save();
    return c.toObject();
  }

  async setStage(tenantId: string, id: string, dto: UpdateLitigationStageDto) {
    const c = await this.getRawDoc(tenantId, id);
    const from = c.stage;
    c.stage = dto.stage;
    this.logTimeline(
      c,
      `Moved to ${dto.stage}`,
      dto.note || `Advanced from ${from} to ${dto.stage}.`,
    );
    await c.save();
    return c.toObject();
  }

  async addPleading(
    tenantId: string,
    id: string,
    dto: AddLitigationPleadingDto,
  ) {
    const c = await this.getRawDoc(tenantId, id);
    c.pleadings.push({
      type: dto.type,
      label: dto.label ?? '',
      status: dto.dueOn ? PleadingStatus.DUE : PleadingStatus.PENDING,
      dueOn: dto.dueOn ? new Date(dto.dueOn) : null,
      filedOn: null,
      note: dto.note ?? '',
    } as any);
    await c.save();
    return c.toObject();
  }

  async updatePleading(
    tenantId: string,
    id: string,
    pleadingId: string,
    dto: UpdateLitigationPleadingDto,
  ) {
    const c = await this.getRawDoc(tenantId, id);
    const pleading = (c.pleadings as any).id(pleadingId);
    if (!pleading) throw new NotFoundException('Pleading not found');
    if (dto.status) pleading.status = dto.status;
    if (dto.filedOn !== undefined) {
      pleading.filedOn = dto.filedOn ? new Date(dto.filedOn) : null;
      if (dto.filedOn) pleading.status = PleadingStatus.FILED;
    }
    if (dto.note !== undefined) pleading.note = dto.note;
    c.markModified('pleadings');
    if (pleading.status === PleadingStatus.FILED) {
      this.logTimeline(c, `${pleading.type} filed`, pleading.note || '');
    }
    await c.save();
    return c.toObject();
  }

  async addCourtDate(
    tenantId: string,
    id: string,
    dto: AddLitigationCourtDateDto,
  ) {
    const c = await this.getRawDoc(tenantId, id);
    c.courtDates.push({
      date: new Date(dto.date),
      title: dto.title,
      time: dto.time ?? '',
      location: dto.location ?? '',
      note: dto.note ?? '',
    } as any);
    this.logTimeline(
      c,
      `${dto.title} scheduled`,
      `${dto.date}${dto.time ? ` at ${dto.time}` : ''}.`,
    );
    await c.save();
    return c.toObject();
  }

  async addDisbursement(
    tenantId: string,
    id: string,
    dto: AddLitigationDisbursementDto,
  ) {
    const c = await this.getRawDoc(tenantId, id);
    c.disbursements.push({
      label: dto.label,
      category: dto.category ?? 'Other',
      amount: dto.amount,
      currency: dto.currency ?? c.currency,
      date: dto.date ? new Date(dto.date) : new Date(),
    } as any);
    await c.save();
    return c.toObject();
  }

  async addTimelineEntry(
    tenantId: string,
    id: string,
    dto: AddLitigationTimelineEntryDto,
  ) {
    const c = await this.getRawDoc(tenantId, id);
    c.timeline.push({
      at: dto.at ? new Date(dto.at) : new Date(),
      title: dto.title,
      description: dto.description ?? '',
      source: LitigationTimelineSource.MANUAL,
    } as any);
    await c.save();
    return c.toObject();
  }

  async recordOutcome(
    tenantId: string,
    id: string,
    dto: RecordLitigationOutcomeDto,
  ) {
    const c = await this.getRawDoc(tenantId, id);
    c.outcome = dto.outcome;
    c.stage = 'Judgment' as any;
    c.status = LitigationCaseStatus.JUDGMENT_ISSUED;
    this.logTimeline(c, 'Judgment issued', dto.outcome);
    await c.save();
    return c.toObject();
  }

  // Settlement reached mid-litigation — a consent judgment, per the
  // product owner's spec ("settlement remains possible at any
  // stage; if agreed, consent judgment filed and case closed").
  async recordConsentJudgment(tenantId: string, id: string, terms: string) {
    const c = await this.getRawDoc(tenantId, id);
    c.status = LitigationCaseStatus.SETTLED;
    this.logTimeline(c, 'Consent judgment filed', terms);
    await c.save();
    return c.toObject();
  }

  async withdraw(tenantId: string, id: string, reason?: string) {
    const c = await this.getRawDoc(tenantId, id);
    c.status = LitigationCaseStatus.WITHDRAWN;
    this.logTimeline(c, 'Case withdrawn', reason || '');
    await c.save();
    return c.toObject();
  }
}
