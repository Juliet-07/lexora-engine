import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AdrCase,
  AdrCaseDocument,
  AdrCaseStatus,
  AdrSessionStatus,
  AdrTimelineSource,
} from '../schemas';
import {
  CreateAdrCaseDto,
  UpdateAdrCaseDetailsDto,
  UpdateAdrStageDto,
  AddAdrSessionDto,
  UpdateAdrSessionDto,
  RecordAdrSettlementDto,
  RecordAdrOutcomeDto,
  RestartAdrAsTypeDto,
  WithdrawAdrCaseDto,
  AddAdrTimelineEntryDto,
  AddAdrChecklistItemDto,
  SetAdrChecklistItemDoneDto,
  AddAdrDisbursementDto,
  EscalateToLitigationDto,
} from '../dtos';
import { MandateService } from './mandate.service';
import { TimeEntryService } from './time-entry.service';
import { LitigationCaseService } from './litigation-case.service';

@Injectable()
export class AdrCaseService {
  constructor(
    @InjectModel(AdrCase.name)
    private readonly model: Model<AdrCaseDocument>,
    private readonly mandateService: MandateService,
    private readonly timeEntryService: TimeEntryService,
    private readonly litigationCaseService: LitigationCaseService,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const count = await this.model.countDocuments({ tenantId });
    return `ADR-${String(count + 1).padStart(3, '0')}`;
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
    if (!c) throw new NotFoundException('Case not found');
    return this.withTotals(c as any);
  }

  // Real hours/fees for this dispute specifically, not the whole
  // mandate it may sit under — computed live from TimeEntry records
  // linked via adrCaseId, same reasoning the mandate's own WIP
  // figure uses real time entries rather than a stored number.
  private async withTotals(c: any) {
    const disbursed = (c.disbursements ?? []).reduce(
      (s: number, d: any) => s + d.amount,
      0,
    );
    const entries = await this.timeEntryService.getAll(String(c.tenantId), {
      adrCaseId: String(c._id),
    });
    const hours = entries.reduce((s, e: any) => s + e.hours, 0);
    const fees = entries.reduce((s, e: any) => s + e.hours * e.rate, 0);
    const ageDays = Math.floor(
      (Date.now() - new Date(c.filedOn).getTime()) / 86_400_000,
    );
    return {
      ...c,
      totals: { hours, fees, disbursed, total: fees + disbursed, ageDays },
    };
  }

  private async getRawDoc(tenantId: string, id: string) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Case not found');
    return c;
  }

  // The real dependency-tracking mechanism — every meaningful
  // transition appends a dated, narrated entry, so the reasoning
  // behind where a case is and how it got there is always on the
  // record, not just the current stage in isolation.
  private logTimeline(
    c: AdrCaseDocument,
    title: string,
    description = '',
    source: AdrTimelineSource = AdrTimelineSource.SYSTEM,
  ) {
    c.timeline.push({
      at: new Date(),
      title,
      description,
      source,
    } as any);
  }

  async create(tenantId: string, dto: CreateAdrCaseDto) {
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);

    // Real mandate name, resolved server-side — never trusted from
    // the request body, same discipline the contract/invoice
    // modules already use for denormalized names.
    let mandateName = '';
    if (dto.mandateId) {
      const mandate: any = await this.mandateService.getById(
        tenantId,
        dto.mandateId,
      );
      mandateName = mandate.name;
    }

    const created = await this.model.create({
      tenantId: tId,
      ref,
      title: dto.title,
      type: dto.type,
      mandateId: dto.mandateId ? new Types.ObjectId(dto.mandateId) : null,
      mandateName,
      parties: (dto.parties ?? []).map((p) => ({
        name: p.name,
        role: p.role,
        organisation: p.organisation ?? '',
        userId: p.userId ? new Types.ObjectId(p.userId) : null,
      })),
      neutralUserId: dto.neutralUserId
        ? new Types.ObjectId(dto.neutralUserId)
        : null,
      neutral: dto.neutral ?? '',
      claimValue: dto.claimValue ?? 0,
      currency: dto.currency ?? 'USD',
      filedOn: new Date(),
      category: dto.category ?? '',
      settlementTargetMin: dto.settlementTargetMin ?? null,
      settlementTargetMax: dto.settlementTargetMax ?? null,
      venue: dto.venue ?? '',
      governingLaw: dto.governingLaw ?? '',
      adrClause: dto.adrClause ?? '',
      escalationPath: dto.escalationPath ?? '',
      timeline: [
        {
          at: new Date(),
          title: 'Case registered',
          description: `${dto.type} filed${mandateName ? ` under mandate ${mandateName}` : ''}.`,
          source: AdrTimelineSource.SYSTEM,
        },
      ],
    });
    return created.toObject();
  }

  async updateDetails(
    tenantId: string,
    id: string,
    dto: UpdateAdrCaseDetailsDto,
  ) {
    const c = await this.getRawDoc(tenantId, id);
    if (dto.category !== undefined) c.category = dto.category;
    if (dto.settlementTargetMin !== undefined)
      c.settlementTargetMin = dto.settlementTargetMin;
    if (dto.settlementTargetMax !== undefined)
      c.settlementTargetMax = dto.settlementTargetMax;
    if (dto.venue !== undefined) c.venue = dto.venue;
    if (dto.governingLaw !== undefined) c.governingLaw = dto.governingLaw;
    if (dto.adrClause !== undefined) c.adrClause = dto.adrClause;
    if (dto.escalationPath !== undefined) c.escalationPath = dto.escalationPath;
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

  async setStage(tenantId: string, id: string, dto: UpdateAdrStageDto) {
    const c = await this.getRawDoc(tenantId, id);
    if (c.status !== AdrCaseStatus.ACTIVE) {
      throw new ConflictException(
        `This case is ${c.status.toLowerCase()} and can no longer move stages.`,
      );
    }
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

  async addSession(tenantId: string, id: string, dto: AddAdrSessionDto) {
    const c = await this.getRawDoc(tenantId, id);
    c.sessions.push({
      date: new Date(dto.date),
      startTime: dto.startTime ?? '',
      endTime: dto.endTime ?? '',
      mode: dto.mode,
      venue: dto.venue ?? '',
      status: AdrSessionStatus.SCHEDULED,
      outcome: '',
    } as any);
    this.logTimeline(
      c,
      'Session scheduled',
      `${dto.mode} session on ${dto.date}${dto.venue ? ` at ${dto.venue}` : ''}.`,
    );
    await c.save();
    return c.toObject();
  }

  async updateSession(
    tenantId: string,
    id: string,
    sessionId: string,
    dto: UpdateAdrSessionDto,
  ) {
    const c = await this.getRawDoc(tenantId, id);
    const session = (c.sessions as any).id(sessionId);
    if (!session) throw new NotFoundException('Session not found');
    if (dto.status) session.status = dto.status;
    if (dto.outcome !== undefined) session.outcome = dto.outcome;
    c.markModified('sessions');
    if (dto.status === AdrSessionStatus.COMPLETED) {
      this.logTimeline(
        c,
        'Session held',
        dto.outcome || 'Session concluded — no outcome recorded.',
      );
    } else if (dto.status === AdrSessionStatus.CANCELLED) {
      this.logTimeline(c, 'Session cancelled', dto.outcome || '');
    }
    await c.save();
    return c.toObject();
  }

  // Amount and terms are genuinely negotiated — not auto-computed
  // from a fixed percentage of the claim value.
  async recordSettlement(
    tenantId: string,
    id: string,
    dto: RecordAdrSettlementDto,
  ) {
    const c = await this.getRawDoc(tenantId, id);
    c.settlement = {
      amount: dto.amount,
      date: new Date(),
      terms: dto.terms ?? '',
    } as any;
    c.stage = 'Resolution' as any;
    c.status = AdrCaseStatus.RESOLVED;
    this.logTimeline(
      c,
      'Settlement reached',
      `Settled at ${dto.amount} ${c.currency}.${dto.terms ? ` ${dto.terms}` : ''}`,
    );
    await c.save();
    return c.toObject();
  }

  async recordOutcome(tenantId: string, id: string, dto: RecordAdrOutcomeDto) {
    const c = await this.getRawDoc(tenantId, id);
    c.outcome = dto.outcome;
    c.stage = 'Resolution' as any;
    c.status = AdrCaseStatus.RESOLVED;
    this.logTimeline(c, 'Award / outcome recorded', dto.outcome);
    await c.save();
    return c.toObject();
  }

  // Real workflow transition matching "if mediation fails, restart
  // as arbitration (back to Notice stage)" — the ADR type genuinely
  // changes and the case re-enters the process, not a label change.
  async restartAsType(tenantId: string, id: string, dto: RestartAdrAsTypeDto) {
    const c = await this.getRawDoc(tenantId, id);
    if (c.status !== AdrCaseStatus.ACTIVE) {
      throw new ConflictException(
        `This case is ${c.status.toLowerCase()} and cannot be restarted.`,
      );
    }
    const fromType = c.type;
    c.type = dto.newType as any;
    c.stage = 'Notice' as any;
    this.logTimeline(
      c,
      `${fromType} failed — restarted as ${dto.newType}`,
      dto.reason,
    );
    await c.save();
    return c.toObject();
  }

  async withdraw(tenantId: string, id: string, dto: WithdrawAdrCaseDto) {
    const c = await this.getRawDoc(tenantId, id);
    c.status = AdrCaseStatus.WITHDRAWN;
    this.logTimeline(c, 'Case withdrawn', dto.reason || '');
    await c.save();
    return c.toObject();
  }

  async addTimelineEntry(
    tenantId: string,
    id: string,
    dto: AddAdrTimelineEntryDto,
  ) {
    const c = await this.getRawDoc(tenantId, id);
    c.timeline.push({
      at: dto.at ? new Date(dto.at) : new Date(),
      title: dto.title,
      description: dto.description ?? '',
      source: AdrTimelineSource.MANUAL,
    } as any);
    await c.save();
    return c.toObject();
  }

  async addChecklistItem(
    tenantId: string,
    id: string,
    dto: AddAdrChecklistItemDto,
  ) {
    const c = await this.getRawDoc(tenantId, id);
    c.checklist.push({ label: dto.label, done: false } as any);
    await c.save();
    return c.toObject();
  }

  async setChecklistItemDone(
    tenantId: string,
    id: string,
    itemId: string,
    dto: SetAdrChecklistItemDoneDto,
  ) {
    const c = await this.getRawDoc(tenantId, id);
    const item = (c.checklist as any).id(itemId);
    if (!item) throw new NotFoundException('Checklist item not found');
    item.done = dto.done;
    c.markModified('checklist');
    await c.save();
    return c.toObject();
  }

  async addDisbursement(
    tenantId: string,
    id: string,
    dto: AddAdrDisbursementDto,
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

  // The real link between the two phases the product owner asked
  // for — escalation is a real, reasoned event, not a status flip.
  // A new LitigationCase is created and linked both ways: forward
  // via litigationCaseId here, back via adrCaseId there, so the
  // full ADR history stays reachable and combined age/fees can be
  // computed live from both real records.
  async escalateToLitigation(
    tenantId: string,
    id: string,
    dto: EscalateToLitigationDto,
  ) {
    const c = await this.getRawDoc(tenantId, id);
    if (c.status !== AdrCaseStatus.ACTIVE) {
      throw new ConflictException(
        `This case is ${c.status.toLowerCase()} and cannot be escalated.`,
      );
    }

    // Neutrals (mediator/arbitrator) don't carry over — a judge is a
    // real, separate court appointment, not a continuation of the
    // ADR neutral's role. Counsel defaults to plaintiff-side, since
    // the tenant's own client was almost always the ADR claimant
    // too; the tenant can correct this on the litigation case after.
    const roleMap: Record<string, string> = {
      Claimant: 'Plaintiff',
      Respondent: 'Defendant',
      Counsel: 'Plaintiff counsel',
      Expert: 'Other',
      Other: 'Other',
    };
    const litigationParties = c.parties
      .filter((p) => p.role !== 'Mediator' && p.role !== 'Arbitrator')
      .map((p) => ({
        name: p.name,
        role: (roleMap[p.role] ?? 'Other') as any,
        organisation: p.organisation,
        userId: p.userId ? String(p.userId) : undefined,
      }));

    const litigationCase = await this.litigationCaseService.create(tenantId, {
      title: c.title,
      adrCaseId: String(c._id),
      mandateId: c.mandateId ? String(c.mandateId) : undefined,
      mandateName: c.mandateName,
      parties: litigationParties as any,
      claimValue: c.claimValue,
      currency: c.currency,
      court: dto.court,
      courtDivision: dto.courtDivision,
      registry: dto.registry,
      openingTimelineTitle: `Escalated from ADR: ${c.type} concluded without resolution`,
      openingTimelineDescription: dto.reason,
    });

    c.status = AdrCaseStatus.ESCALATED;
    c.litigationCaseId = new Types.ObjectId((litigationCase as any)._id);
    this.logTimeline(c, 'Escalated to litigation', dto.reason);
    await c.save();

    return { adrCase: c.toObject(), litigationCase };
  }
}
