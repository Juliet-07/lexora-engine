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
} from '../schemas';
import {
  CreateObligationDto,
  SetFilingStageDto,
  CertifyFilingDto,
  ConfirmReceiptDto,
} from '../dtos';

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

  computeStatus(o: {
    status: ObligationStatus;
    nextDueDate: Date;
  }): ObligationStatus {
    if (o.status === ObligationStatus.NOT_APPLICABLE)
      return ObligationStatus.NOT_APPLICABLE;
    const d = this.daysUntil(o.nextDueDate);
    if (d < 0) return ObligationStatus.OVERDUE;
    if (d <= 30) return ObligationStatus.DUE;
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
    else if (freq === Frequency.ANNUAL) d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d;
  }

  private periodLabelFor(date: Date, freq: Frequency): string {
    if (freq === Frequency.ANNUAL) return `FY ${date.getFullYear()}`;
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
      reminderDays: [90, 60, 30, 14, 7],
      status: ObligationStatus.DUE,
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
    return obligations.map((o) => ({
      ...o,
      computedStatus: this.computeStatus(o as any),
      activeReminderDays: this.activeReminder(o as any),
    }));
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

  // uploadedBy is resolved server-side from the obligation's OWN
  // owner field — never trusted from the client — matching the
  // original design's attribution-by-responsibility exactly.
  async addEvidence(
    tenantId: string,
    id: string,
    files: Express.Multer.File[],
  ) {
    const f = await this.getRawFiling(tenantId, id);
    const obligation = await this.getRawDoc(
      tenantId,
      f.obligationId.toString(),
    );
    for (const file of files) {
      f.evidence.push({
        name: file.originalname,
        fileUrl: `/uploads/compliance/filings/${file.filename}`,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
        uploadedBy: obligation.owner || 'Unassigned',
      } as any);
    }
    if (f.stage === FilingStage.NOT_STARTED)
      f.stage = FilingStage.IN_PREPARATION;
    f.markModified('evidence');
    await f.save();
    return f;
  }

  async certify(tenantId: string, id: string, dto: CertifyFilingDto) {
    const f = await this.getRawFiling(tenantId, id);
    f.certifiedBy = dto.certifiedBy;
    f.certifiedAt = new Date();
    f.stage = FilingStage.CERTIFIED;
    await f.save();
    return f;
  }

  // Closes the current cycle AND auto-schedules the next one —
  // matches "Confirm receipt" exactly.
  async confirmReceipt(tenantId: string, id: string, dto: ConfirmReceiptDto) {
    const f = await this.getRawFiling(tenantId, id);
    if (f.evidence.length === 0) {
      throw new BadRequestException(
        'Attach evidence before confirming receipt.',
      );
    }
    if (!f.certifiedBy) {
      throw new BadRequestException(
        'Management certification is required before confirming receipt.',
      );
    }
    f.receiptRef = dto.receiptRef;
    f.submittedAt = new Date();
    f.stage = FilingStage.RECEIPT_CONFIRMED;
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
