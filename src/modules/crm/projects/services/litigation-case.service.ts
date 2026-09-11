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
  LitigationStage,
  LITIGATION_STAGES,
  LitigationCaseMessage,
  LitigationCaseMessageDocument,
  MessageDirection,
  LitigationCaseDraft,
  LitigationCaseDraftDocument,
  AdrDraftStatus,
  LitigationDocumentEntry,
  LitigationDocumentEntryDocument,
  LitigationDeadlineRule,
  LitigationDeadlineRuleDocument,
  LitigationDeadlineTriggerSource,
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
  SendLitigationPartyEmailDto,
  CreateMessageDto,
  CreateLitigationDraftDto,
  SaveLitigationDraftVersionDto,
  UpdateLitigationDraftStatusDto,
  CreateLitigationFolderDto,
  CreateLitigationDeadlineRuleDto,
  UpdateLitigationDeadlineRuleDto,
  LogLitigationTenantTimeDto,
} from '../dtos';
import { TimeEntryService } from './time-entry.service';
import { MandateService } from './mandate.service';
import { buildReportPdf } from '../../../../common/utils/pdf/report-builder.util';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmailService } from '../../../../common/utils/mailing/email.service';
import { User, UserDocument } from '../../../auth/schemas/user.schema';
import {
  PlatformContractTemplate,
  PlatformContractTemplateDocument,
} from '../../../super_admin/schemas/contract-template.schema';

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
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(LitigationCaseMessage.name)
    private readonly messageModel: Model<LitigationCaseMessageDocument>,
    @InjectModel(LitigationCaseDraft.name)
    private readonly draftModel: Model<LitigationCaseDraftDocument>,
    @InjectModel(LitigationDocumentEntry.name)
    private readonly documentModel: Model<LitigationDocumentEntryDocument>,
    @InjectModel(LitigationDeadlineRule.name)
    private readonly deadlineRuleModel: Model<LitigationDeadlineRuleDocument>,
    @InjectModel(PlatformContractTemplate.name)
    private readonly templateModel: Model<PlatformContractTemplateDocument>,
    private readonly timeEntryService: TimeEntryService,
    private readonly mandateService: MandateService,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
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

  // ═══════════════════════════════════════════════════════════
  // REPORTING — real, server-computed register stats, mirroring
  // ADR's reporting exactly (same house style, same reasoning).
  // ═══════════════════════════════════════════════════════════

  private async computeReport(tenantId: string) {
    const cases = await this.getAll(tenantId);
    const active = cases.filter(
      (c) => c.status === LitigationCaseStatus.ACTIVE,
    );
    const escalatedFromAdr = cases.filter((c) => c.adrCaseId);
    const claimValueActive = active.reduce(
      (sum, c) => sum + (c.claimValue ?? 0),
      0,
    );
    const courtFeesPaid = cases.reduce(
      (sum, c) => sum + (c.courtFeesPaid ?? 0),
      0,
    );
    const byStage = LITIGATION_STAGES.map((s) => ({
      stage: s,
      count: cases.filter((c) => c.stage === s).length,
    }));

    return {
      total: cases.length,
      active,
      escalatedFromAdr,
      claimValueActive,
      courtFeesPaid,
      byStage,
    };
  }

  async getReport(tenantId: string) {
    return this.computeReport(tenantId);
  }

  async exportReportPdf(tenantId: string): Promise<Buffer> {
    const r = await this.computeReport(tenantId);
    return buildReportPdf({
      title: 'Litigation Case Register',
      subtitle: 'CRM · Litigation',
      summary: [
        { label: 'Active cases', value: r.active.length },
        { label: 'Escalated from ADR', value: r.escalatedFromAdr.length },
        { label: 'Claim value active', value: r.claimValueActive },
        { label: 'Court fees paid', value: r.courtFeesPaid },
      ],
      sections: [
        {
          heading: 'Cases by stage',
          columns: ['Stage', 'Cases'],
          rows: r.byStage.map((s) => [s.stage, s.count]),
        },
      ],
    });
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
        email: p.email,
        userId: p.userId ? new Types.ObjectId(p.userId) : null,
      })),
      claimValue: dto.claimValue ?? 0,
      currency: dto.currency ?? 'USD',
      filedOn: new Date(),
      court: dto.court ?? '',
      courtDivision: dto.courtDivision ?? '',
      registry: dto.registry ?? '',
      teamId: dto.teamId ? new Types.ObjectId(dto.teamId) : null,
      teamName: dto.teamName ?? '',
      timeline: [
        {
          at: new Date(),
          title: dto.openingTimelineTitle ?? 'Case filed',
          description: dto.openingTimelineDescription ?? '',
          source: LitigationTimelineSource.SYSTEM,
        },
      ],
    });

    // Real client notification — same rule as ADR: only fires when
    // the case is genuinely linked to a mandate that has a
    // registered client.
    if (dto.mandateId) {
      const mandate: any = await this.mandateService.getById(
        tenantId,
        dto.mandateId,
      );
      if (mandate.clientUserId) {
        await this.notifyClientOfCase(
          tenantId,
          String(mandate.clientUserId),
          created.toObject(),
        );
      }
    }

    // Real party notification — independent of any mandate link,
    // since a litigation matter's parties (opposing counsel, the
    // other side) are frequently not the mandate's own client.
    const tenantForParties = await this.userModel
      .findById(tenantId)
      .select('tenantProfile.businessName')
      .lean();
    const tenantBusinessName =
      (tenantForParties as any)?.tenantProfile?.businessName || 'Your Provider';
    for (const party of created.parties) {
      if (!party.email) continue;
      await this.emailService.sendPartyCaseNotice({
        to: party.email,
        partyName: party.name,
        tenantBusinessName,
        caseTitle: created.title,
        caseRef: created.ref,
        partyRole: party.role,
        caseType: 'Litigation',
      });
    }

    return created.toObject();
  }

  private async notifyClientOfCase(
    tenantId: string,
    clientUserId: string,
    createdCase: any,
  ) {
    const [client, tenant] = await Promise.all([
      this.userModel.findById(clientUserId).select('firstName email').lean(),
      this.userModel
        .findById(tenantId)
        .select('tenantProfile.businessName')
        .lean(),
    ]);
    if (!client?.email) return;

    const tenantBusinessName =
      (tenant as any)?.tenantProfile?.businessName || 'Your Provider';

    await this.emailService.sendCaseNotice({
      to: client.email,
      firstName: client.firstName,
      tenantBusinessName,
      caseType: 'Litigation',
      caseTitle: createdCase.title,
      caseRef: createdCase.ref,
      mandateName: createdCase.mandateName,
      loginUrl: `${process.env.CLIENT_APP_URL}/login`,
    });

    this.eventEmitter.emit('client.case.filed', {
      tenantId,
      clientUserId,
      caseType: 'Litigation',
      caseTitle: createdCase.title,
      caseRef: createdCase.ref,
    });
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
    if (dto.teamId !== undefined)
      c.teamId = dto.teamId ? (new Types.ObjectId(dto.teamId) as any) : null;
    if (dto.teamName !== undefined) c.teamName = dto.teamName;
    if (dto.parties) {
      c.parties = dto.parties.map((p) => ({
        name: p.name,
        role: p.role,
        organisation: p.organisation ?? '',
        email: p.email,
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

    await this.notifyCourtDateScheduled(tenantId, c);

    return c.toObject();
  }

  private async notifyCourtDateScheduled(tenantId: string, c: any) {
    const courtDate = c.courtDates[c.courtDates.length - 1];
    const tenant = await this.userModel
      .findById(tenantId)
      .select('tenantProfile.businessName')
      .lean();
    const tenantBusinessName =
      (tenant as any)?.tenantProfile?.businessName || 'Your Provider';

    for (const party of c.parties) {
      if (!party.email) continue;
      await this.emailService.sendSessionNotice({
        to: party.email,
        recipientName: party.name,
        tenantBusinessName,
        caseTitle: c.title,
        caseRef: c.ref,
        sessionDate: courtDate.date,
        startTime: courtDate.time,
        mode: 'In-person — Court',
        venue: courtDate.location,
      });
    }

    if (c.mandateId) {
      const mandate: any = await this.mandateService
        .getById(tenantId, String(c.mandateId))
        .catch(() => null);
      if (mandate?.clientUserId) {
        const client = await this.userModel
          .findById(mandate.clientUserId)
          .select('firstName email')
          .lean();
        if (client?.email) {
          await this.emailService.sendSessionNotice({
            to: client.email,
            recipientName: client.firstName,
            tenantBusinessName,
            caseTitle: c.title,
            caseRef: c.ref,
            sessionDate: courtDate.date,
            startTime: courtDate.time,
            mode: 'In-person — Court',
            venue: courtDate.location,
            loginUrl: `${process.env.CLIENT_APP_URL}/login`,
          });
        }
        this.eventEmitter.emit('client.case.session_scheduled', {
          tenantId,
          clientUserId: String(mandate.clientUserId),
          caseType: 'Litigation',
          caseTitle: c.title,
          caseRef: c.ref,
          sessionDate: courtDate.date,
        });
      }
    }
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

  async getDisbursementSumForMandate(
    tenantId: string,
    mandateId: string,
  ): Promise<number> {
    const cases = await this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        mandateId: new Types.ObjectId(mandateId),
      })
      .select('disbursements')
      .lean();
    return cases.reduce(
      (s, c: any) =>
        s + (c.disbursements ?? []).reduce((s2, d) => s2 + d.amount, 0),
      0,
    );
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

  // ═══════════════════════════════════════════════════════════
  // COMMUNICATION — same two real channels as ADR: a tenant↔client
  // thread, and ad-hoc outbound emails to case parties.
  // ═══════════════════════════════════════════════════════════

  async getMessages(tenantId: string, caseId: string) {
    return this.messageModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        caseId: new Types.ObjectId(caseId),
      })
      .sort({ createdAt: 1 })
      .lean();
  }

  async addMessage(
    tenantId: string,
    caseId: string,
    direction: MessageDirection,
    dto: CreateMessageDto,
  ) {
    const created = await this.messageModel.create({
      tenantId: new Types.ObjectId(tenantId),
      caseId: new Types.ObjectId(caseId),
      direction,
      author: dto.author,
      body: dto.body,
    });

    const c = await this.model.findById(caseId).lean();
    if (!c) return created.toObject();

    if (direction === MessageDirection.TENANT && c.mandateId) {
      const mandate: any = await this.mandateService
        .getById(tenantId, String(c.mandateId))
        .catch(() => null);
      if (mandate?.clientUserId) {
        const client = await this.userModel
          .findById(mandate.clientUserId)
          .select('email firstName')
          .lean();
        if (client?.email) {
          const tenant = await this.userModel
            .findById(tenantId)
            .select('tenantProfile.businessName')
            .lean();
          await this.emailService.sendCaseNotice({
            to: client.email,
            firstName: client.firstName,
            tenantBusinessName:
              (tenant as any)?.tenantProfile?.businessName || 'Your Provider',
            caseType: 'Litigation',
            caseTitle: c.title,
            caseRef: c.ref,
            mandateName: c.mandateName,
            loginUrl: `${process.env.CLIENT_APP_URL}/login`,
          });
        }
        this.eventEmitter.emit('client.case.message', {
          tenantId,
          clientUserId: String(mandate.clientUserId),
          caseType: 'Litigation',
          caseTitle: c.title,
          caseRef: c.ref,
        });
      }
    }

    if (direction === MessageDirection.CLIENT) {
      this.eventEmitter.emit('tenant.case.client_replied', {
        tenantId,
        caseId,
        caseType: 'Litigation',
        caseTitle: c.title,
        caseRef: c.ref,
      });
    }

    return created.toObject();
  }

  async sendPartyEmail(
    tenantId: string,
    caseId: string,
    dto: SendLitigationPartyEmailDto,
  ) {
    const c = await this.getRawDoc(tenantId, caseId);
    const targets = c.parties.filter(
      (p: any) => dto.partyIds.includes(String(p._id)) && p.email,
    );
    if (!targets.length) {
      throw new NotFoundException(
        'None of the selected parties have an email on file',
      );
    }

    const tenant = await this.userModel
      .findById(tenantId)
      .select('tenantProfile.businessName')
      .lean();
    const tenantBusinessName =
      (tenant as any)?.tenantProfile?.businessName || 'Your Provider';

    for (const party of targets) {
      await this.emailService.sendPartyCommunication({
        to: party.email,
        partyName: party.name,
        tenantBusinessName,
        caseRef: c.ref,
        subject: dto.subject,
        body: dto.body,
      });
    }

    c.timeline.push({
      at: new Date(),
      title: `Email sent to ${targets.map((p) => p.name).join(', ')}`,
      description: dto.subject,
      source: LitigationTimelineSource.SYSTEM,
    } as any);
    await c.save();

    return { success: true, sentTo: targets.map((p) => p.name) };
  }

  // ═══════════════════════════════════════════════════════════
  // DRAFTING — same real templates, real rich-text content, real
  // version history as ADR.
  // ═══════════════════════════════════════════════════════════

  async getDrafts(tenantId: string, caseId: string) {
    return this.draftModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        caseId: new Types.ObjectId(caseId),
      })
      .sort({ createdAt: -1 })
      .lean();
  }

  async createDraft(
    tenantId: string,
    caseId: string,
    dto: CreateLitigationDraftDto,
  ) {
    let content = '';
    let sourceTemplateTitle = '';
    if (dto.templateId) {
      const template = await this.templateModel.findById(dto.templateId).lean();
      if (!template) throw new NotFoundException('Template not found');
      content = (template as any).content ?? '';
      sourceTemplateTitle = (template as any).title ?? '';
    }

    const created = await this.draftModel.create({
      tenantId: new Types.ObjectId(tenantId),
      caseId: new Types.ObjectId(caseId),
      title: dto.title,
      content,
      sourceTemplateId: dto.templateId ?? '',
      sourceTemplateTitle,
      versions: [
        {
          versionNumber: 1,
          content,
          savedBy: 'System',
          savedAt: new Date(),
        },
      ],
      currentVersion: 1,
    });
    return created.toObject();
  }

  async saveDraftVersion(
    tenantId: string,
    caseId: string,
    draftId: string,
    savedBy: string,
    dto: SaveLitigationDraftVersionDto,
  ) {
    const d = await this.draftModel.findOne({
      _id: draftId,
      tenantId: new Types.ObjectId(tenantId),
      caseId: new Types.ObjectId(caseId),
    });
    if (!d) throw new NotFoundException('Draft not found');

    const nextVersion = d.currentVersion + 1;
    d.versions.push({
      versionNumber: nextVersion,
      content: dto.content,
      savedBy,
      savedAt: new Date(),
    } as any);
    d.content = dto.content;
    d.currentVersion = nextVersion;
    await d.save();
    return d.toObject();
  }

  async updateDraftStatus(
    tenantId: string,
    caseId: string,
    draftId: string,
    dto: UpdateLitigationDraftStatusDto,
  ) {
    const d = await this.draftModel.findOne({
      _id: draftId,
      tenantId: new Types.ObjectId(tenantId),
      caseId: new Types.ObjectId(caseId),
    });
    if (!d) throw new NotFoundException('Draft not found');

    d.status = dto.status as AdrDraftStatus;

    if (dto.status === AdrDraftStatus.FINAL && !d.documentId) {
      const c = await this.getRawDoc(tenantId, caseId);
      if (!c.folders.some((f) => f.toLowerCase() === 'drafts')) {
        c.folders.push('Drafts');
      }
      const doc = await this.documentModel.create({
        tenantId: new Types.ObjectId(tenantId),
        caseId: new Types.ObjectId(caseId),
        folder: 'Drafts',
        name: d.title,
        content: d.content,
        uploadedBy: 'System',
        sourceDraftId: d._id,
      });
      d.documentId = doc._id as any;

      c.timeline.push({
        at: new Date(),
        title: `Document finalised — ${d.title}`,
        description: `Filed to Documents from drafting.`,
        source: LitigationTimelineSource.SYSTEM,
      } as any);
      await c.save();
    }

    await d.save();
    return d.toObject();
  }

  // ── Documents / Folders ────────────────────────────────────────
  async getFolders(tenantId: string, caseId: string) {
    const c = await this.model
      .findOne({ _id: caseId, tenantId: new Types.ObjectId(tenantId) })
      .select('folders')
      .lean();
    if (!c) throw new NotFoundException('Case not found');
    return c.folders ?? ['General'];
  }

  async createFolder(tenantId: string, caseId: string, name: string) {
    const c = await this.getRawDoc(tenantId, caseId);
    const trimmed = name.trim();
    if (!trimmed) throw new NotFoundException('Folder name is required');
    if (!c.folders.some((f) => f.toLowerCase() === trimmed.toLowerCase())) {
      c.folders.push(trimmed);
      await c.save();
    }
    return c.folders;
  }

  async getDocuments(tenantId: string, caseId: string) {
    return this.documentModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        caseId: new Types.ObjectId(caseId),
      })
      .sort({ createdAt: -1 })
      .lean();
  }

  async uploadDocument(
    tenantId: string,
    caseId: string,
    folder: string,
    uploadedBy: string,
    file: Express.Multer.File,
  ) {
    const c = await this.getRawDoc(tenantId, caseId);
    const targetFolder = folder || 'General';
    if (
      !c.folders.some((f) => f.toLowerCase() === targetFolder.toLowerCase())
    ) {
      throw new NotFoundException(
        `Folder "${targetFolder}" doesn't exist on this case yet — create it first.`,
      );
    }
    const created = await this.documentModel.create({
      tenantId: new Types.ObjectId(tenantId),
      caseId: new Types.ObjectId(caseId),
      folder: targetFolder,
      name: file.originalname,
      fileUrl: `/uploads/crm/litigation-cases/${file.filename}`,
      size: file.size,
      mimeType: file.mimetype,
      uploadedBy,
    });
    return created.toObject();
  }

  // ═══════════════════════════════════════════════════════════
  // DEADLINE RULES — same computed-not-typed shape as ADR, with a
  // court date in place of a session date.
  // ═══════════════════════════════════════════════════════════

  private async resolveTriggerDate(
    c: any,
    rule: any,
    depth = 0,
  ): Promise<Date | null> {
    if (depth > 5) return null;
    switch (rule.triggerSource) {
      case LitigationDeadlineTriggerSource.CASE_FILED:
        return c.filedOn;
      case LitigationDeadlineTriggerSource.COURT_DATE: {
        const courtDate = c.courtDates?.[rule.triggerCourtDateIndex];
        return courtDate ? courtDate.date : null;
      }
      case LitigationDeadlineTriggerSource.OUTCOME:
        return c.outcome ? (c.updatedAt ?? null) : null;
      case LitigationDeadlineTriggerSource.CUSTOM:
        return rule.customTriggerDate;
      case LitigationDeadlineTriggerSource.CASCADE: {
        if (!rule.cascadeFromRuleId) return null;
        const parent = await this.deadlineRuleModel
          .findById(rule.cascadeFromRuleId)
          .lean();
        if (!parent) return null;
        const parentTrigger = await this.resolveTriggerDate(
          c,
          parent,
          depth + 1,
        );
        if (!parentTrigger) return null;
        return new Date(
          new Date(parentTrigger).getTime() +
            parent.windowDays * 24 * 60 * 60 * 1000,
        );
      }
      default:
        return null;
    }
  }

  private computeRuleView(c: any, rule: any, triggerDate: Date | null) {
    const dueDate = triggerDate
      ? new Date(
          new Date(triggerDate).getTime() +
            rule.windowDays * 24 * 60 * 60 * 1000,
        )
      : null;
    let status: 'not_triggered' | 'due' | 'overdue' | 'met';
    if (!triggerDate) status = 'not_triggered';
    else if (rule.metAt) status = 'met';
    else if (dueDate && dueDate.getTime() < Date.now()) status = 'overdue';
    else status = 'due';

    return { ...rule, triggerDate, dueDate, status };
  }

  async getDeadlineRules(tenantId: string, caseId: string) {
    const c = await this.model
      .findOne({ _id: caseId, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!c) throw new NotFoundException('Case not found');

    const rules = await this.deadlineRuleModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        caseId: new Types.ObjectId(caseId),
      })
      .sort({ createdAt: 1 })
      .lean();

    const views = [];
    for (const rule of rules) {
      const triggerDate = await this.resolveTriggerDate(c, rule);
      views.push(this.computeRuleView(c, rule, triggerDate));
    }
    return views;
  }

  async createDeadlineRule(
    tenantId: string,
    caseId: string,
    dto: CreateLitigationDeadlineRuleDto,
  ) {
    await this.getRawDoc(tenantId, caseId);
    const created = await this.deadlineRuleModel.create({
      tenantId: new Types.ObjectId(tenantId),
      caseId: new Types.ObjectId(caseId),
      triggerLabel: dto.triggerLabel,
      triggerSource: dto.triggerSource,
      triggerCourtDateIndex: dto.triggerCourtDateIndex ?? null,
      cascadeFromRuleId: dto.cascadeFromRuleId
        ? new Types.ObjectId(dto.cascadeFromRuleId)
        : null,
      customTriggerDate: dto.customTriggerDate
        ? new Date(dto.customTriggerDate)
        : null,
      ruleLabel: dto.ruleLabel,
      windowDays: dto.windowDays,
    });
    return created.toObject();
  }

  async updateDeadlineRule(
    tenantId: string,
    caseId: string,
    ruleId: string,
    dto: UpdateLitigationDeadlineRuleDto,
  ) {
    const rule = await this.deadlineRuleModel.findOne({
      _id: ruleId,
      tenantId: new Types.ObjectId(tenantId),
      caseId: new Types.ObjectId(caseId),
    });
    if (!rule) throw new NotFoundException('Deadline rule not found');

    if (dto.triggerLabel !== undefined) rule.triggerLabel = dto.triggerLabel;
    if (dto.triggerSource !== undefined)
      rule.triggerSource = dto.triggerSource as LitigationDeadlineTriggerSource;
    if (dto.triggerCourtDateIndex !== undefined)
      rule.triggerCourtDateIndex = dto.triggerCourtDateIndex;
    if (dto.cascadeFromRuleId !== undefined)
      rule.cascadeFromRuleId = dto.cascadeFromRuleId
        ? (new Types.ObjectId(dto.cascadeFromRuleId) as any)
        : null;
    if (dto.customTriggerDate !== undefined)
      rule.customTriggerDate = dto.customTriggerDate
        ? new Date(dto.customTriggerDate)
        : null;
    if (dto.ruleLabel !== undefined) rule.ruleLabel = dto.ruleLabel;
    if (dto.windowDays !== undefined) rule.windowDays = dto.windowDays;
    await rule.save();
    return rule.toObject();
  }

  async markDeadlineRuleMet(tenantId: string, caseId: string, ruleId: string) {
    const rule = await this.deadlineRuleModel.findOne({
      _id: ruleId,
      tenantId: new Types.ObjectId(tenantId),
      caseId: new Types.ObjectId(caseId),
    });
    if (!rule) throw new NotFoundException('Deadline rule not found');
    rule.metAt = new Date();
    await rule.save();

    const c = await this.getRawDoc(tenantId, caseId);
    this.logTimeline(c, 'Deadline met', rule.ruleLabel);
    await c.save();

    return rule.toObject();
  }

  // ═══════════════════════════════════════════════════════════
  // AUDIT TRAIL — the case's real timeline, exported as a real PDF.
  // ═══════════════════════════════════════════════════════════

  async exportAuditTrailPdf(tenantId: string, caseId: string): Promise<Buffer> {
    const c = await this.model
      .findOne({ _id: caseId, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!c) throw new NotFoundException('Case not found');

    const entries = [...c.timeline].sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    );

    return buildReportPdf({
      title: `Audit Trail — ${c.title}`,
      subtitle: `${c.ref} · CRM · Litigation`,
      summary: [
        { label: 'Case reference', value: c.ref },
        { label: 'Stage', value: c.stage },
        { label: 'Status', value: c.status },
        { label: 'Filed on', value: new Date(c.filedOn).toLocaleDateString() },
        { label: 'Total events', value: entries.length },
      ],
      sections: [
        {
          heading: 'Event log',
          columns: ['Date & time', 'Event', 'Detail', 'Source'],
          rows: entries.map((e) => [
            new Date(e.at).toLocaleString(),
            e.title,
            e.description || '—',
            e.source,
          ]),
          note: 'A complete, chronological record of every recorded event on this case.',
        },
      ],
    });
  }

  // Tenant logging their own time on a case — same real linkage as
  // the employee path (requires a mandate).
  async logTenantTime(
    tenantId: string,
    caseId: string,
    dto: LogLitigationTenantTimeDto,
  ) {
    const c = await this.getRawDoc(tenantId, caseId);
    if (!c.mandateId) {
      throw new NotFoundException(
        "This case isn't linked to a mandate yet, so time can't be logged against it.",
      );
    }
    const mandate: any = await this.mandateService
      .getById(tenantId, String(c.mandateId))
      .catch(() => null);
    if (!mandate) {
      throw new NotFoundException('The linked mandate no longer exists');
    }
    const tenant = await this.userModel
      .findById(tenantId)
      .select('firstName lastName')
      .lean();
    const tenantName = tenant
      ? `${(tenant as any).firstName} ${(tenant as any).lastName}`.trim()
      : 'Tenant';

    return this.timeEntryService.create(tenantId, {
      memberUserId: tenantId,
      member: tenantName,
      mandateId: String(c.mandateId),
      mandateName: mandate.name,
      litigationCaseId: String(c._id),
      narrative: dto.narrative,
      date: dto.date,
      hours: dto.hours,
      billable: dto.billable,
      rate: dto.billable === false ? 0 : dto.rate,
      currency: c.currency,
    });
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
