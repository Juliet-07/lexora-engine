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
  AdrCaseMessage,
  AdrCaseMessageDocument,
  MessageDirection,
  AdrCaseDraft,
  AdrCaseDraftDocument,
  AdrDraftStatus,
  AdrDocumentEntry,
  AdrDocumentEntryDocument,
  AdrDeadlineRule,
  AdrDeadlineRuleDocument,
  DeadlineTriggerSource,
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
  SendAdrPartyEmailDto,
  CreateMessageDto,
  CreateAdrDraftDto,
  SaveAdrDraftVersionDto,
  UpdateAdrDraftStatusDto,
  CreateAdrDeadlineRuleDto,
  UpdateAdrDeadlineRuleDto,
  RecordAdrClosureDto,
  LinkAdrSettlementDeedDto,
  LogAdrTenantTimeDto,
} from '../dtos';
import { MandateService } from './mandate.service';
import { TimeEntryService } from './time-entry.service';
import { LitigationCaseService } from './litigation-case.service';
import { buildReportPdf } from '../../../../common/utils/pdf/report-builder.util';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmailService } from '../../../../common/utils/mailing/email.service';
import { User, UserDocument } from '../../../auth/schemas/user.schema';
import {
  PlatformContractTemplate,
  PlatformContractTemplateDocument,
} from '../../../super_admin/schemas/contract-template.schema';

@Injectable()
export class AdrCaseService {
  constructor(
    @InjectModel(AdrCase.name)
    private readonly model: Model<AdrCaseDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(AdrCaseMessage.name)
    private readonly messageModel: Model<AdrCaseMessageDocument>,
    @InjectModel(AdrCaseDraft.name)
    private readonly draftModel: Model<AdrCaseDraftDocument>,
    @InjectModel(AdrDocumentEntry.name)
    private readonly documentModel: Model<AdrDocumentEntryDocument>,
    @InjectModel(PlatformContractTemplate.name)
    private readonly templateModel: Model<PlatformContractTemplateDocument>,
    @InjectModel(AdrDeadlineRule.name)
    private readonly deadlineRuleModel: Model<AdrDeadlineRuleDocument>,
    private readonly mandateService: MandateService,
    private readonly timeEntryService: TimeEntryService,
    private readonly litigationCaseService: LitigationCaseService,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
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

  // ═══════════════════════════════════════════════════════════
  // REPORTING — real, server-computed register stats, the
  // authoritative source for the exported document rather than
  // trusting client-computed numbers for an official export.
  // ═══════════════════════════════════════════════════════════

  private async computeReport(tenantId: string) {
    const cases = await this.getAll(tenantId);
    const active = cases.filter((c) => c.status === AdrCaseStatus.ACTIVE);
    const resolved = cases.filter((c) => c.status === AdrCaseStatus.RESOLVED);
    const escalated = cases.filter((c) => c.status === AdrCaseStatus.ESCALATED);
    const withdrawn = cases.filter((c) => c.status === AdrCaseStatus.WITHDRAWN);
    const closedTotal = resolved.length + escalated.length + withdrawn.length;

    const avgResolutionDays = resolved.length
      ? Math.round(
          resolved.reduce((sum, c) => {
            const days =
              (new Date((c as any).updatedAt).getTime() -
                new Date(c.filedOn).getTime()) /
              86_400_000;
            return sum + Math.max(0, days);
          }, 0) / resolved.length,
        )
      : 0;

    const claimAtStake = active.reduce(
      (sum, c) => sum + (c.claimValue ?? 0),
      0,
    );

    const typeBreakdown = new Map<string, number>();
    for (const c of active) {
      typeBreakdown.set(c.type, (typeBreakdown.get(c.type) ?? 0) + 1);
    }

    const now = new Date();
    const upcomingSessions = cases.reduce(
      (sum, c) =>
        sum +
        (c.sessions ?? []).filter(
          (s: any) => s.status === 'Scheduled' && new Date(s.date) > now,
        ).length,
      0,
    );

    return {
      active,
      resolved,
      escalated,
      withdrawn,
      closedTotal,
      resolutionRate: closedTotal
        ? Math.round((resolved.length / closedTotal) * 100)
        : 0,
      avgResolutionDays,
      claimAtStake,
      typeBreakdown: Array.from(typeBreakdown.entries()),
      upcomingSessions,
    };
  }

  async getReport(tenantId: string) {
    return this.computeReport(tenantId);
  }

  async exportReportPdf(tenantId: string): Promise<Buffer> {
    const r = await this.computeReport(tenantId);
    return buildReportPdf({
      title: 'ADR Case Register',
      subtitle: 'CRM · Alternative Dispute Resolution',
      summary: [
        { label: 'Active cases', value: r.active.length },
        {
          label: 'Resolution rate',
          value: r.closedTotal ? `${r.resolutionRate}%` : '—',
        },
        {
          label: 'Avg. resolution time',
          value: r.resolved.length ? `${r.avgResolutionDays} days` : '—',
        },
        { label: 'Claim value at stake', value: r.claimAtStake },
      ],
      sections: [
        {
          heading: 'Case breakdown',
          columns: ['Category', 'Count'],
          rows: [
            ...r.typeBreakdown.map(([t, n]) => [`Active — ${t}`, n]),
            ['Upcoming sessions', r.upcomingSessions],
            ['Resolved', r.resolved.length],
            ['Escalated to litigation', r.escalated.length],
            ['Withdrawn', r.withdrawn.length],
          ],
        },
      ],
    });
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
    let mandate: any = null;
    if (dto.mandateId) {
      mandate = await this.mandateService.getById(tenantId, dto.mandateId);
      mandateName = mandate.name;
    }

    const created = await this.model.create({
      tenantId: tId,
      ref,
      title: dto.title,
      type: dto.type,
      mandateId: dto.mandateId ? new Types.ObjectId(dto.mandateId) : null,
      mandateName,
      teamId: dto.teamId ? new Types.ObjectId(dto.teamId) : null,
      teamName: dto.teamName ?? '',
      parties: (dto.parties ?? []).map((p) => ({
        name: p.name,
        role: p.role,
        organisation: p.organisation ?? '',
        email: p.email ?? '',
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

    // Real client notification — only fires when the case is
    // genuinely linked to a mandate that has a registered client,
    // matching exactly what was asked: a case linked to a mandate
    // notifies the client that mandate is for, by email and portal.
    if (mandate?.clientUserId) {
      await this.notifyClientOfCase(
        tenantId,
        String(mandate.clientUserId),
        created.toObject(),
      );
    }

    // Real party notification — independent of any mandate link,
    // since a case's parties (the other side, outside counsel, a
    // neutral) are frequently not the mandate's own client at all.
    // Every party with an email on file gets notified directly.
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
        caseType: 'ADR',
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
      caseType: 'ADR',
      caseTitle: createdCase.title,
      caseRef: createdCase.ref,
      mandateName: createdCase.mandateName,
      loginUrl: `${process.env.CLIENT_APP_URL}/login`,
    });

    this.eventEmitter.emit('client.case.filed', {
      tenantId,
      clientUserId,
      caseType: 'ADR',
      caseTitle: createdCase.title,
      caseRef: createdCase.ref,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // COMMUNICATION — two real, separate channels. A tenant↔client
  // thread (same shape as MandateMessage, visible in the portal),
  // and ad-hoc outbound emails to case parties (who frequently
  // aren't the mandate's own client and may have no portal account
  // at all) — logged to the timeline, not a two-way conversation.
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
            caseType: 'ADR',
            caseTitle: c.title,
            caseRef: c.ref,
            mandateName: c.mandateName,
            loginUrl: `${process.env.CLIENT_APP_URL}/login`,
          });
        }
        this.eventEmitter.emit('client.case.message', {
          tenantId,
          clientUserId: String(mandate.clientUserId),
          caseType: 'ADR',
          caseTitle: c.title,
          caseRef: c.ref,
        });
      }
    }

    if (direction === MessageDirection.CLIENT) {
      this.eventEmitter.emit('tenant.case.client_replied', {
        tenantId,
        caseId,
        caseType: 'ADR',
        caseTitle: c.title,
        caseRef: c.ref,
      });
    }

    return created.toObject();
  }

  async sendPartyEmail(
    tenantId: string,
    caseId: string,
    dto: SendAdrPartyEmailDto,
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
      source: AdrTimelineSource.SYSTEM,
    } as any);
    await c.save();

    return { success: true, sentTo: targets.map((p) => p.name) };
  }

  // ═══════════════════════════════════════════════════════════
  // DRAFTING — real platform templates, real rich-text content,
  // real version history. A finalised draft files a real document,
  // matching "finalised drafts move into Documents and lock a
  // version" exactly.
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

  async createDraft(tenantId: string, caseId: string, dto: CreateAdrDraftDto) {
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
    dto: SaveAdrDraftVersionDto,
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
    dto: UpdateAdrDraftStatusDto,
  ) {
    const d = await this.draftModel.findOne({
      _id: draftId,
      tenantId: new Types.ObjectId(tenantId),
      caseId: new Types.ObjectId(caseId),
    });
    if (!d) throw new NotFoundException('Draft not found');

    d.status = dto.status as AdrDraftStatus;

    // Real filing — a Final draft becomes a real document exactly
    // once, the moment it first reaches Final. Re-saving an
    // already-final draft's status doesn't file a duplicate.
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
        source: AdrTimelineSource.SYSTEM,
      } as any);
      await c.save();
    }

    await d.save();
    return d.toObject();
  }

  // ── Documents ─────────────────────────────────────────────────
  // ── Folders — real, named buckets that exist independently of any
  // document being filed into them yet. ──
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

  // ═══════════════════════════════════════════════════════════
  // DEADLINE RULES — the due date is always computed, never typed
  // in. Trigger dates are resolved live from real case data on
  // every read, so nothing here can silently go stale.
  // ═══════════════════════════════════════════════════════════

  // Resolves one rule's real trigger date from the case's actual
  // data. Returns null when the trigger genuinely hasn't happened
  // yet (e.g. the session it tracks doesn't exist, or the cascade
  // rule it depends on hasn't itself triggered).
  private async resolveTriggerDate(
    c: any,
    rule: any,
    depth = 0,
  ): Promise<Date | null> {
    if (depth > 5) return null; // real, simple guard against a cascade cycle
    switch (rule.triggerSource) {
      case DeadlineTriggerSource.CASE_FILED:
        return c.filedOn;
      case DeadlineTriggerSource.SESSION_DATE: {
        const session = c.sessions?.[rule.triggerSessionIndex];
        return session ? session.date : null;
      }
      case DeadlineTriggerSource.SETTLEMENT:
        return c.settlement ? c.settlement.date : null;
      case DeadlineTriggerSource.CUSTOM:
        return rule.customTriggerDate;
      case DeadlineTriggerSource.CASCADE: {
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
        // The cascade fires exactly when the parent rule's own
        // window elapses — its due date, not its trigger date.
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

    return {
      ...rule,
      triggerDate,
      dueDate,
      status,
    };
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
    dto: CreateAdrDeadlineRuleDto,
  ) {
    await this.getRawDoc(tenantId, caseId); // real existence + tenant check
    const created = await this.deadlineRuleModel.create({
      tenantId: new Types.ObjectId(tenantId),
      caseId: new Types.ObjectId(caseId),
      triggerLabel: dto.triggerLabel,
      triggerSource: dto.triggerSource,
      triggerSessionIndex: dto.triggerSessionIndex ?? null,
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
    dto: UpdateAdrDeadlineRuleDto,
  ) {
    const rule = await this.deadlineRuleModel.findOne({
      _id: ruleId,
      tenantId: new Types.ObjectId(tenantId),
      caseId: new Types.ObjectId(caseId),
    });
    if (!rule) throw new NotFoundException('Deadline rule not found');

    if (dto.triggerLabel !== undefined) rule.triggerLabel = dto.triggerLabel;
    if (dto.triggerSource !== undefined)
      rule.triggerSource = dto.triggerSource as DeadlineTriggerSource;
    if (dto.triggerSessionIndex !== undefined)
      rule.triggerSessionIndex = dto.triggerSessionIndex;
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
  // AUDIT TRAIL — the case's real timeline, which already records
  // every meaningful event on the case (filing, sessions, stage
  // moves, settlement, party emails, drafts finalised, deadlines
  // met). Not a separate log — the same record shown elsewhere,
  // exported as a real, house-style PDF.
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
      subtitle: `${c.ref} · CRM · Alternative Dispute Resolution`,
      summary: [
        { label: 'Case reference', value: c.ref },
        { label: 'Type', value: c.type },
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
    // Real filing discipline — a document can only be filed into a
    // folder that genuinely exists on this case, not an arbitrary
    // string typed into a query param.
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
      fileUrl: `/uploads/crm/adr-cases/${file.filename}`,
      size: file.size,
      mimeType: file.mimetype,
      uploadedBy,
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
    if (dto.teamId !== undefined)
      c.teamId = dto.teamId ? (new Types.ObjectId(dto.teamId) as any) : null;
    if (dto.teamName !== undefined) c.teamName = dto.teamName;
    if (dto.parties) {
      c.parties = dto.parties.map((p) => ({
        name: p.name,
        role: p.role,
        organisation: p.organisation ?? '',
        email: p.email ?? '',
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

    await this.notifySessionScheduled(tenantId, c);

    return c.toObject();
  }

  private async notifySessionScheduled(tenantId: string, c: any) {
    const session = c.sessions[c.sessions.length - 1];
    const tenant = await this.userModel
      .findById(tenantId)
      .select('tenantProfile.businessName')
      .lean();
    const tenantBusinessName =
      (tenant as any)?.tenantProfile?.businessName || 'Your Provider';

    // Every party with an email gets notified directly — independent
    // of any mandate link, same discipline as filing notifications.
    for (const party of c.parties) {
      if (!party.email) continue;
      await this.emailService.sendSessionNotice({
        to: party.email,
        recipientName: party.name,
        tenantBusinessName,
        caseTitle: c.title,
        caseRef: c.ref,
        sessionDate: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        mode: session.mode,
        venue: session.venue,
      });
    }

    // The mandate's client, if this case has one — email + a real
    // portal notification, matching how case filing already works.
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
            sessionDate: session.date,
            startTime: session.startTime,
            endTime: session.endTime,
            mode: session.mode,
            venue: session.venue,
            loginUrl: `${process.env.CLIENT_APP_URL}/login`,
          });
        }
        this.eventEmitter.emit('client.case.session_scheduled', {
          tenantId,
          clientUserId: String(mandate.clientUserId),
          caseType: 'ADR',
          caseTitle: c.title,
          caseRef: c.ref,
          sessionDate: session.date,
        });
      }
    }
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
      deedDocumentId: null,
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

  async linkSettlementDeed(
    tenantId: string,
    id: string,
    dto: LinkAdrSettlementDeedDto,
  ) {
    const c = await this.getRawDoc(tenantId, id);
    if (!c.settlement) {
      throw new NotFoundException(
        'Record a settlement before linking its deed',
      );
    }
    // Real check — the document must genuinely be filed on this
    // case, not any document id in the system.
    const doc = await this.documentModel.findOne({
      _id: dto.documentId,
      tenantId: new Types.ObjectId(tenantId),
      caseId: new Types.ObjectId(id),
    });
    if (!doc) {
      throw new NotFoundException(
        "That document isn't filed on this case's Documents tab",
      );
    }
    c.settlement.deedDocumentId = new Types.ObjectId(dto.documentId) as any;
    this.logTimeline(c, 'Settlement deed linked', doc.name);
    await c.save();
    return c.toObject();
  }

  async recordClosure(tenantId: string, id: string, dto: RecordAdrClosureDto) {
    const c = await this.getRawDoc(tenantId, id);
    if (c.status === AdrCaseStatus.ACTIVE) {
      throw new NotFoundException(
        'Closure details can only be recorded once the case has ended',
      );
    }
    c.closure = {
      clientSatisfaction:
        dto.clientSatisfaction ?? c.closure?.clientSatisfaction ?? '',
      clientSatisfactionNotes:
        dto.clientSatisfactionNotes ?? c.closure?.clientSatisfactionNotes ?? '',
      lessonsLearned: dto.lessonsLearned ?? c.closure?.lessonsLearned ?? '',
      precedentValue: dto.precedentValue ?? c.closure?.precedentValue ?? false,
      precedentNotes: dto.precedentNotes ?? c.closure?.precedentNotes ?? '',
      recordedBy: 'You',
      recordedAt: new Date(),
    } as any;
    this.logTimeline(c, 'Closure details recorded', '');
    await c.save();
    return c.toObject();
  }

  // Tenant logging their own time on a case — same real linkage as
  // the employee path (requires a mandate, since TimeEntry.mandateId
  // is required on the schema), but the tenant values it directly
  // since they have no rate card of their own.
  async logTenantTime(
    tenantId: string,
    caseId: string,
    dto: LogAdrTenantTimeDto,
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
      mandateName: (mandate as any).name,
      adrCaseId: String(c._id),
      narrative: dto.narrative,
      date: dto.date,
      hours: dto.hours,
      billable: dto.billable,
      rate: dto.billable === false ? 0 : dto.rate,
      currency: c.currency,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // MANDATE BUDGET CONSUMPTION — real spend, computed from
  // committed time (Approved or further along — draft/submitted
  // work isn't confirmed yet) and real disbursements recorded on
  // this mandate's ADR cases. Not a stored, driftable number.
  // ═══════════════════════════════════════════════════════════

  async getMandateSpend(tenantId: string, mandateId: string) {
    const mandate: any = await this.mandateService.getById(tenantId, mandateId);

    const entries = await this.timeEntryService.getAll(tenantId, {
      mandateId,
    });
    const committed = entries.filter(
      (e: any) => e.status !== 'Draft' && e.status !== 'Rejected',
    );
    const timeSpent = committed.reduce(
      (s: number, e: any) => s + e.hours * e.rate,
      0,
    );

    const cases = await this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        mandateId: new Types.ObjectId(mandateId),
      })
      .select('disbursements')
      .lean();
    const adrDisbursementSpent = cases.reduce(
      (s, c: any) =>
        s + (c.disbursements ?? []).reduce((s2, d) => s2 + d.amount, 0),
      0,
    );
    const litigationDisbursementSpent =
      await this.litigationCaseService.getDisbursementSumForMandate(
        tenantId,
        mandateId,
      );
    const disbursementSpent =
      adrDisbursementSpent + litigationDisbursementSpent;

    const totalSpent = timeSpent + disbursementSpent;
    const budget = mandate.budget ?? 0;

    return {
      budget,
      timeSpent,
      disbursementSpent,
      totalSpent,
      remaining: budget - totalSpent,
      percentUsed: budget > 0 ? (totalSpent / budget) * 100 : 0,
      currency: mandate.currency ?? 'USD',
    };
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
        email: p.email ?? '',
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
