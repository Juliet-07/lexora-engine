import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ComplianceObligation,
  ComplianceObligationDocument,
  ObligationStatus,
  Filing,
  FilingDocument,
  FilingStage,
  Frequency,
  EvidenceCategory,
} from '../schemas';
import { CreateObligationDto, SetFilingStageDto } from '../dtos';

@Injectable()
export class ComplianceObligationService {
  constructor(
    @InjectModel(ComplianceObligation.name)
    private readonly obligationModel: Model<ComplianceObligationDocument>,
    @InjectModel(Filing.name)
    private readonly filingModel: Model<FilingDocument>,
  ) {}

  // ── pure helpers — the single source of truth every consumer must
  // go through, mirroring the original design exactly ────────────

  private daysUntil(date: Date): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - now.getTime()) / 86400000);
  }

  // The reminder ladder scales with how far apart renewals actually
  // are — a 30-day heads-up on a monthly filing is basically the
  // whole period, so monthly starts its countdown much closer in.
  // Longer cycles reuse the same tail and just prepend a further-out
  // first leg. Ad hoc / event-driven have no fixed period to scale
  // off, so they keep the original flat ladder.
  reminderLadderFor(freq: Frequency): number[] {
    switch (freq) {
      case Frequency.MONTHLY:
        return [14, 7, 3];
      case Frequency.QUARTERLY:
        return [30, 14, 7, 3];
      case Frequency.SEMI_ANNUAL:
        return [90, 30, 14, 7, 3];
      case Frequency.ANNUAL:
        return [180, 90, 30, 14, 7, 3];
      default:
        return [90, 60, 30, 14, 7];
    }
  }

  // Status only flips to Due at the *second* leg of the ladder, not
  // the first — e.g. monthly's ladder is [14, 7, 3], so the first
  // reminder at 14 days is a heads-up while still Compliant, and
  // Due only kicks in from 7 days out.
  private dueThreshold(reminderDays: number[]): number {
    const sorted = [...(reminderDays ?? [])].sort((a, b) => b - a);
    if (sorted.length >= 2) return sorted[1];
    if (sorted.length === 1) return sorted[0];
    return 30;
  }

  computeStatus(o: {
    status: ObligationStatus;
    nextDueDate: Date;
    reminderDays: number[];
  }): ObligationStatus {
    if (o.status === ObligationStatus.NOT_APPLICABLE)
      return ObligationStatus.NOT_APPLICABLE;
    const d = this.daysUntil(o.nextDueDate);
    if (d < 0) return ObligationStatus.OVERDUE;
    if (d <= this.dueThreshold(o.reminderDays)) return ObligationStatus.DUE;
    return o.status === ObligationStatus.OVERDUE
      ? ObligationStatus.DUE
      : o.status;
  }

  activeReminder(o: {
    nextDueDate: Date;
    reminderDays: number[];
  }): number | null {
    const d = this.daysUntil(o.nextDueDate);
    if (d < 0) return null;
    const hit = o.reminderDays.filter((r) => d <= r).sort((a, b) => a - b);
    return hit.length ? hit[0] : null;
  }

  private nextDueAfter(from: Date, freq: Frequency): Date {
    const d = new Date(from);
    if (freq === Frequency.MONTHLY) d.setMonth(d.getMonth() + 1);
    else if (freq === Frequency.QUARTERLY) d.setMonth(d.getMonth() + 3);
    else if (freq === Frequency.SEMI_ANNUAL) d.setMonth(d.getMonth() + 6);
    else if (freq === Frequency.ANNUAL) d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d;
  }

  private periodLabelFor(date: Date, freq: Frequency): string {
    if (freq === Frequency.ANNUAL) return `FY ${date.getFullYear()}`;
    if (freq === Frequency.SEMI_ANNUAL)
      return `${date.getMonth() < 6 ? 'H1' : 'H2'} ${date.getFullYear()}`;
    if (freq === Frequency.QUARTERLY)
      return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
    if (freq === Frequency.MONTHLY)
      return date.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
    return date.toISOString().slice(0, 10);
  }

  // ── Obligations ──────────────────────────────────────────────

  async create(
    tenantId: string,
    dto: CreateObligationDto,
    defaultEntity: string,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const count = await this.obligationModel.countDocuments({ tenantId: tId });
    const reference = `OBL-${String(count + 1).padStart(3, '0')}`;
    const nextDueDate = new Date(dto.nextDueDate);

    const obligation = await this.obligationModel.create({
      tenantId: tId,
      reference,
      title: dto.title,
      regulator: dto.regulator,
      entity: dto.entity?.trim() || defaultEntity,
      description: dto.description ?? '',
      legalBasis: dto.legalBasis ?? '',
      frequency: dto.frequency,
      nextDueDate,
      evidenceRequirements: dto.evidenceRequirements ?? '',
      owner: dto.owner ?? '',
      certifier: dto.certifier ?? '',
      reminderDays: this.reminderLadderFor(dto.frequency),
      status: ObligationStatus.COMPLIANT,
      ownerEmail: dto.ownerEmail ?? '',
      lastReminderMilestone: null,
    });

    // Auto-schedules the first filing instance — matches
    // "Create & schedule" exactly.
    await this.filingModel.create({
      tenantId: tId,
      obligationId: obligation._id,
      periodLabel: this.periodLabelFor(nextDueDate, dto.frequency),
      dueDate: nextDueDate,
      stage: FilingStage.NOT_STARTED,
      evidence: [],
    });

    return obligation;
  }

  async getAll(tenantId: string) {
    const obligations = await this.obligationModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
    // reminderDays isn't tenant-editable, so always serve the live
    // ladder for this obligation's frequency rather than whatever
    // happens to be persisted — this is what makes the fix visible
    // immediately for obligations created before this change, rather
    // than waiting on the daily reminder cron to backfill them (see
    // compliance-reminder.service.ts, which does that backfill for
    // the persisted document + every other status consumer).
    return obligations.map((o) => {
      const reminderDays = this.reminderLadderFor(o.frequency);
      const withLadder = { ...o, reminderDays };
      return {
        ...withLadder,
        computedStatus: this.computeStatus(withLadder as any),
        activeReminderDays: this.activeReminder(withLadder as any),
      };
    });
  }

  private async getRawDoc(
    tenantId: string,
    id: string,
  ): Promise<ComplianceObligationDocument> {
    const o = await this.obligationModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!o) throw new NotFoundException('Obligation not found');
    return o;
  }

  // ── Filings ──────────────────────────────────────────────────

  async getAllFilings(tenantId: string) {
    return this.filingModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ dueDate: -1 })
      .lean();
  }

  private async getRawFiling(
    tenantId: string,
    id: string,
  ): Promise<FilingDocument> {
    const f = await this.filingModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!f) throw new NotFoundException('Filing not found');
    return f;
  }

  async setStage(tenantId: string, id: string, dto: SetFilingStageDto) {
    const f = await this.getRawFiling(tenantId, id);
    if (f.certifiedBy) {
      throw new BadRequestException(
        'This filing has already been certified — its stage can no longer be changed manually.',
      );
    }
    f.stage = dto.stage;
    await f.save();
    return f;
  }

  // uploadedBy is resolved server-side from the real logged-in user
  // (passed in by the controller) — never trusted from the client,
  // and never the obligation's nominal owner, so "who was logged in
  // and who did it" is the actual actor, not a configured name.
  async addEvidence(
    tenantId: string,
    id: string,
    files: Express.Multer.File[],
    uploaderName: string,
    category?: EvidenceCategory,
  ) {
    const f = await this.getRawFiling(tenantId, id);
    for (const file of files) {
      f.evidence.push({
        name: file.originalname,
        category: category || EvidenceCategory.DOCUMENT,
        fileUrl: `/uploads/compliance/filings/${file.filename}`,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
        uploadedBy: uploaderName || 'Unassigned',
      } as any);
    }
    if (f.stage === FilingStage.NOT_STARTED)
      f.stage = FilingStage.IN_PREPARATION;
    f.markModified('evidence');
    await f.save();
    return f;
  }

  // certifierName is resolved server-side from the real logged-in
  // user (see controller) — real attribution, not free text.
  async certify(tenantId: string, id: string, certifierName: string) {
    const f = await this.getRawFiling(tenantId, id);
    f.certifiedBy = certifierName;
    f.certifiedAt = new Date();
    f.stage = FilingStage.CERTIFIED;
    await f.save();
    return f;
  }

  // The tick-box that closes the current period and auto-schedules
  // the next one — replaces the old "submission & regulator
  // receipt" step the PO asked to remove. completerName is resolved
  // server-side from the real logged-in user, same as certify().
  async completeFiling(tenantId: string, id: string, completerName: string) {
    const f = await this.getRawFiling(tenantId, id);
    if (f.evidence.length === 0) {
      throw new BadRequestException(
        'Attach evidence before marking this filing complete.',
      );
    }
    if (!f.certifiedBy) {
      throw new BadRequestException(
        'Management certification is required before marking this filing complete.',
      );
    }
    f.completedBy = completerName;
    f.completedAt = new Date();
    f.stage = FilingStage.COMPLETED;
    await f.save();

    const obligation = await this.getRawDoc(
      tenantId,
      f.obligationId.toString(),
    );
    const next = this.nextDueAfter(
      obligation.nextDueDate,
      obligation.frequency,
    );
    obligation.status = ObligationStatus.COMPLIANT;
    obligation.nextDueDate = next;
    obligation.reminderDays = this.reminderLadderFor(obligation.frequency);
    obligation.lastReminderMilestone = null;
    await obligation.save();

    await this.filingModel.create({
      tenantId: new Types.ObjectId(tenantId),
      obligationId: obligation._id,
      periodLabel: this.periodLabelFor(next, obligation.frequency),
      dueDate: next,
      stage: FilingStage.NOT_STARTED,
      evidence: [],
    });

    return { filing: f, obligation };
  }
}
