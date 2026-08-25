import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { Comment, CommentDocument, CommentSubjectType } from '../schemas';
import { AddCommentDto, EditCommentDto, ToggleReactionDto } from '../dtos';
import { EmployeeService } from 'src/modules/hr/services/employee.service';
import {
  ToolContract,
  ToolContractDocument_,
  ContractStage,
  CONTRACT_STAGES,
  TenantContractTemplate,
  TenantContractTemplateDocument,
  TenantTemplateSourceType,
  TenantLetterhead,
  TenantLetterheadDocument,
  ToolContractSigningToken,
  ToolContractSigningTokenDocument,
  ToolContractInteractionType,
  SignatureStatus,
  ApprovalStepStatus,
  ClauseChangeStatus,
} from '../schemas';
import {
  CreateContractDto,
  ExecuteContractDto,
  AddNegotiationRoundDto,
  UpdateClauseChangeStatusDto,
  AddAmendmentDto,
  AddObligationDto,
  SetObligationDoneDto,
  GenerateFromTemplateDto,
  SendForSignatureDto,
  TenantRespondToCommentDto,
  EditRenderedBodyDto,
  CountersignToolContractDto,
  SubmitContractSignatureDto,
  UpdateContractGovernanceDto,
  AddConditionPrecedentDto,
  SetConditionPrecedentSatisfiedDto,
  SetApprovalChainDto,
  DecideApprovalStepDto,
} from '../dtos';
import {
  PlatformContractTemplateService,
  PlatformTemplateFolderService,
} from 'src/modules/super_admin/services/contract-template.service';
import { ToolContractPdfService } from './contract-pdf.service';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { renderContractBody } from 'src/common/utils/contract-fields.util';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import {
  ClientProfileRecord,
  ClientProfileDocument,
} from 'src/modules/tenant/schemas/client-profile.schema';
import {
  PortfolioRisk,
  PortfolioRiskDocument,
} from 'src/modules/crm/projects/schemas/portfolio-risk.schema';
import {
  Clause,
  ClauseDocument,
} from 'src/modules/grc/deals/schemas/clause.schema';

const DEFAULT_SIGNING_EXPIRY_HOURS = 168; // 7 days

@Injectable()
export class CommentService {
  constructor(
    @InjectModel(Comment.name)
    private readonly model: Model<CommentDocument>,
    private readonly employeeService: EmployeeService,
  ) {}

  // Reconstructs the real nested tree the frontend expects from a
  // flat collection with real parentId references — Mongo doesn't
  // handle arbitrarily deep nested subdocuments well, so replies are
  // never stored nested, only presented that way.
  private buildTree(flat: any[]): any[] {
    const byId = new Map(
      flat.map((c) => [String(c._id), { ...c, replies: [] as any[] }]),
    );
    const roots: any[] = [];
    for (const c of flat) {
      const node = byId.get(String(c._id));
      if (c.parentId) {
        const parent = byId.get(String(c.parentId));
        // A parent that's been hard-deleted (shouldn't normally
        // happen, since delete is soft) falls back to top-level
        // rather than silently vanishing the reply.
        if (parent) parent.replies.push(node);
        else roots.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async getThread(
    tenantId: string,
    subjectType: CommentSubjectType,
    subjectId: string,
  ) {
    const flat = await this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        subjectType,
        subjectId: new Types.ObjectId(subjectId),
      })
      .sort({ createdAt: 1 })
      .lean();
    return this.buildTree(
      flat.map((c) => ({
        ...c,
        reactions: c.reactions ? Object.fromEntries(c.reactions as any) : {},
      })),
    );
  }

  async addComment(
    tenantId: string,
    subjectType: CommentSubjectType,
    subjectId: string,
    dto: AddCommentDto,
  ) {
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      subjectType,
      subjectId: new Types.ObjectId(subjectId),
      parentId: dto.parentId ? new Types.ObjectId(dto.parentId) : null,
      author: dto.author,
      body: dto.body,
    });
    return created.toObject();
  }

  async editComment(tenantId: string, commentId: string, dto: EditCommentDto) {
    const c = await this.model.findOne({
      _id: commentId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Comment not found');
    c.body = dto.body;
    c.edited = true;
    await c.save();
    return c.toObject();
  }

  // Soft delete — the thread structure (replies to this comment)
  // stays intact, matching the mockup's own "This comment was
  // deleted" placeholder rather than orphaning real replies.
  async deleteComment(tenantId: string, commentId: string) {
    const c = await this.model.findOne({
      _id: commentId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Comment not found');
    c.deleted = true;
    c.deletedAt = new Date();
    await c.save();
    return c.toObject();
  }

  async toggleReaction(
    tenantId: string,
    commentId: string,
    dto: ToggleReactionDto,
  ) {
    const c = await this.model.findOne({
      _id: commentId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Comment not found');
    const current = c.reactions.get(dto.emoji) ?? [];
    const next = current.includes(dto.author)
      ? current.filter((u) => u !== dto.author)
      : [...current, dto.author];
    c.reactions.set(dto.emoji, next);
    c.markModified('reactions');
    await c.save();
    return c.toObject();
  }

  // Real employee directory for @mention autocomplete — no fake
  // online/away/DND presence, since there's no real presence system
  // anywhere in this platform to back that with.
  async getMentionDirectory(tenantId: string) {
    const employees = await this.employeeService.getEmployeeDirectory(tenantId);
    return employees.map((e) => ({
      name: `${e.firstName} ${e.lastName}`,
      role: e.jobTitle,
    }));
  }
}

// ── Letterhead — one real uploaded image per tenant, used at the
// top of generated contract PDFs in a later stage. Re-uploading
// replaces the existing real file on disk, same discipline the
// engagement letter upload already follows. ───────────────────────

@Injectable()
export class TenantLetterheadService {
  constructor(
    @InjectModel(TenantLetterhead.name)
    private readonly model: Model<TenantLetterheadDocument>,
  ) {}

  async getMine(tenantId: string) {
    return this.model
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .lean();
  }

  async upload(tenantId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const tId = new Types.ObjectId(tenantId);
    const existing = await this.model.findOne({ tenantId: tId });
    if (existing) {
      if (existing.imagePath && fs.existsSync(existing.imagePath)) {
        fs.unlinkSync(existing.imagePath);
      }
      existing.imageUrl = toFileUrl(file.path);
      existing.imagePath = file.path;
      existing.imageMimeType = file.mimetype;
      await existing.save();
      return existing.toObject();
    }
    const created = await this.model.create({
      tenantId: tId,
      imageUrl: toFileUrl(file.path),
      imagePath: file.path,
      imageMimeType: file.mimetype,
    });
    return created.toObject();
  }

  async delete(tenantId: string) {
    const existing = await this.model.findOne({
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!existing) throw new NotFoundException('No letterhead uploaded.');
    if (existing.imagePath && fs.existsSync(existing.imagePath)) {
      fs.unlinkSync(existing.imagePath);
    }
    await existing.deleteOne();
    return { deleted: true };
  }
}

@Injectable()
export class ContractService {
  constructor(
    @InjectModel(ToolContract.name)
    private readonly model: Model<ToolContractDocument_>,
    @InjectModel(TenantContractTemplate.name)
    private readonly templateModel: Model<TenantContractTemplateDocument>,
    @InjectModel(ToolContractSigningToken.name)
    private readonly tokenModel: Model<ToolContractSigningTokenDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(ClientProfileRecord.name)
    private readonly clientProfileModel: Model<ClientProfileDocument>,
    private readonly letterheadService: TenantLetterheadService,
    private readonly platformTemplateService: PlatformContractTemplateService,
    private readonly pdfService: ToolContractPdfService,
    private readonly emailService: EmailService,
    @InjectModel(PortfolioRisk.name)
    private readonly portfolioRiskModel: Model<PortfolioRiskDocument>,
    @InjectModel(Clause.name)
    private readonly clauseModel: Model<ClauseDocument>,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.model.countDocuments({
      tenantId,
      ref: new RegExp(`^CTR-${year}-`),
    });
    return `CTR-${year}-${String(count + 1).padStart(2, '0')}`;
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
    if (!c) throw new NotFoundException('Contract not found');
    return this.withLiveGovernanceData(tenantId, c as any);
  }

  // Real cross-references computed live at read time — never stored
  // on the contract itself, so they can never drift from the actual
  // client/mandate/tenant records they describe. Replaces what used
  // to be entirely fabricated placeholder data (fake KYC status, a
  // hardcoded tenant name, made-up risk records) with the genuine
  // thing wherever a real link exists, and honestly omits it
  // (null/empty) where no real link exists rather than inventing one.
  private async withLiveGovernanceData(tenantId: string, c: any) {
    const tenantBusinessName = await resolveBusinessName(
      this.userModel,
      tenantId,
    );

    let counterpartyKycStatus: string | null = null;
    let counterpartyRegistrationNumber: string | null = null;
    if (c.clientId) {
      const profile = await this.clientProfileModel
        .findOne({ userId: c.clientId })
        .lean();
      if (profile) {
        counterpartyKycStatus = (profile as any).kycStatus ?? null;
        counterpartyRegistrationNumber =
          (profile as any).entityProfile?.companyRegistrationNumber ?? null;
      }
    }

    let linkedRisks: any[] = [];
    if (c.mandateId) {
      linkedRisks = await this.portfolioRiskModel
        .find({
          tenantId: new Types.ObjectId(tenantId),
          mandateId: c.mandateId,
        })
        .lean();
    }

    return {
      ...c,
      tenantBusinessName,
      counterpartyKycStatus,
      counterpartyRegistrationNumber,
      linkedRisks,
    };
  }

  async create(tenantId: string, dto: CreateContractDto) {
    const tId = new Types.ObjectId(tenantId);
    const { counterparty, counterpartyEmail } = await this.resolveCounterparty(
      tenantId,
      dto.clientId,
      dto.counterparty,
      dto.counterpartyEmail,
    );
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      title: dto.title,
      counterparty,
      counterpartyEmail,
      type: dto.type,
      value: dto.value ?? 0,
      currency: dto.currency ?? 'USD',
      expiresOn: new Date(dto.expiresOn),
      autoRenew: dto.autoRenew ?? false,
      owner: dto.owner ?? '',
      clientId: dto.clientId ? new Types.ObjectId(dto.clientId) : null,
      mandateId: dto.mandateId ? new Types.ObjectId(dto.mandateId) : null,
      mandateName: dto.mandateName ?? '',
      // Real, directly-authored content — a contract doesn't need a
      // template to have real text a tenant can review, edit, and
      // eventually send for signature.
      renderedBody: dto.content ?? '',
      requiresSignature: true,
      signatureStatus: SignatureStatus.NOT_SENT,
    });
    return created.toObject();
  }

  // Simple forward progression through the real stage sequence — no
  // skipping, matching a real contract's own lifecycle discipline.
  async advanceStage(tenantId: string, id: string) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    const i = CONTRACT_STAGES.indexOf(c.stage);
    if (i === CONTRACT_STAGES.length - 1) {
      throw new BadRequestException(
        'This contract is already at its final stage',
      );
    }
    c.stage = CONTRACT_STAGES[i + 1];
    await c.save();
    return c.toObject();
  }

  // Execution is a real, distinct event — capturing signature,
  // moving straight to Active and setting real executed/effective
  // dates, not just another generic stage advance. Only valid from
  // Execution, since a contract can't be signed before it's reached
  // that stage.
  async executeContract(tenantId: string, id: string, dto: ExecuteContractDto) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    if (c.stage !== ContractStage.EXECUTION) {
      throw new BadRequestException(
        'Only a contract in Execution can be marked executed',
      );
    }
    c.stage = ContractStage.ACTIVE;
    c.executedOn = new Date(dto.executedOn);
    c.effectiveOn = new Date(dto.effectiveOn);
    await c.save();
    return c.toObject();
  }

  async initiateRenewal(tenantId: string, id: string) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    c.stage = ContractStage.RENEWAL;
    await c.save();
    return c.toObject();
  }

  async toggleAutoRenew(tenantId: string, id: string) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    c.autoRenew = !c.autoRenew;
    await c.save();
    return c.toObject();
  }

  async addNegotiationRound(
    tenantId: string,
    id: string,
    dto: AddNegotiationRoundDto,
  ) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    c.rounds.push({
      round: c.rounds.length + 1,
      by: dto.by,
      at: new Date(dto.at),
      summary: dto.summary,
      changes: (dto.changes ?? []).map((ch) => ({
        clauseRef: ch.clauseRef,
        change: ch.change,
        note: ch.note ?? '',
        status: ClauseChangeStatus.PENDING,
      })),
    } as any);
    await c.save();
    return c.toObject();
  }

  async updateClauseChangeStatus(
    tenantId: string,
    id: string,
    roundId: string,
    changeId: string,
    dto: UpdateClauseChangeStatusDto,
  ) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    const round = (c.rounds as any).id(roundId);
    if (!round) throw new NotFoundException('Negotiation round not found');
    const change = (round.changes as any).id(changeId);
    if (!change) throw new NotFoundException('Clause change not found');
    change.status = dto.status;
    c.markModified('rounds');
    await c.save();
    return c.toObject();
  }

  // Real edit — when newBody is provided, the amendment doesn't
  // just log a summary, it directly replaces the contract's real
  // renderedBody. The amendment record is the audit trail of what
  // changed, not a substitute for the change itself.
  async addAmendment(tenantId: string, id: string, dto: AddAmendmentDto) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    const ref = `AMD-${String(c.amendments.length + 1).padStart(2, '0')}`;
    c.amendments.push({ ref, at: new Date(), summary: dto.summary } as any);
    if (dto.newBody != null) {
      c.renderedBody = dto.newBody;
    }
    await c.save();
    return c.toObject();
  }

  async addObligation(tenantId: string, id: string, dto: AddObligationDto) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    c.obligations.push({
      label: dto.label,
      due: new Date(dto.due),
      type: dto.type,
      leadDays: dto.leadDays ?? 14,
      done: false,
      doneAt: null,
    } as any);
    await c.save();
    return c.toObject();
  }

  async setObligationDone(
    tenantId: string,
    id: string,
    obligationId: string,
    dto: SetObligationDoneDto,
  ) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    const obligation = (c.obligations as any).id(obligationId);
    if (!obligation) throw new NotFoundException('Obligation not found');
    obligation.done = dto.done;
    obligation.doneAt = dto.done ? new Date() : null;
    await c.save();
    return c.toObject();
  }

  // ── Governance panel — real, tenant-entered fields. ────────────
  async updateGovernance(
    tenantId: string,
    id: string,
    dto: UpdateContractGovernanceDto,
  ) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    if (dto.governingLaw !== undefined) c.governingLaw = dto.governingLaw;
    if (dto.adrClause !== undefined) c.adrClause = dto.adrClause;
    if (dto.leadDrafterUserId !== undefined) {
      c.leadDrafterUserId = dto.leadDrafterUserId as any;
    }
    if (dto.leadDrafterName !== undefined)
      c.leadDrafterName = dto.leadDrafterName;
    if (dto.noticeDays !== undefined) c.noticeDays = dto.noticeDays;
    if (dto.conflictCheckStatus !== undefined)
      c.conflictCheckStatus = dto.conflictCheckStatus;
    if (dto.riskClassification !== undefined)
      c.riskClassification = dto.riskClassification;
    await c.save();
    return this.withLiveGovernanceData(tenantId, c.toObject());
  }

  // ── Conditions precedent — real, tenant-defined checklist. ─────
  async addConditionPrecedent(
    tenantId: string,
    id: string,
    dto: AddConditionPrecedentDto,
  ) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    c.conditionsPrecedent.push({
      label: dto.label,
      detail: dto.detail ?? '',
      satisfied: false,
    } as any);
    await c.save();
    return c.toObject();
  }

  async setConditionPrecedentSatisfied(
    tenantId: string,
    id: string,
    conditionId: string,
    dto: SetConditionPrecedentSatisfiedDto,
  ) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    const condition = (c.conditionsPrecedent as any).id(conditionId);
    if (!condition) throw new NotFoundException('Condition not found');
    condition.satisfied = dto.satisfied;
    await c.save();
    return c.toObject();
  }

  // ── Approval chain — a real, sequential internal workflow. ─────
  // Setting the chain (re)starts it: the first step becomes "In
  // review", every other step resets to "Waiting" — a genuinely new
  // chain, not a partial edit of one already in progress.
  async setApprovalChain(
    tenantId: string,
    id: string,
    dto: SetApprovalChainDto,
  ) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    c.approvalChain = dto.steps.map((s, i) => ({
      userId: s.userId ? (s.userId as any) : null,
      name: s.name,
      role: s.role,
      status:
        i === 0 ? ApprovalStepStatus.IN_REVIEW : ApprovalStepStatus.WAITING,
      decidedAt: null,
      note: '',
    })) as any;
    await c.save();
    return c.toObject();
  }

  // Only the step currently "In review" can be decided — a real
  // sequential gate, not just a status label anyone can flip. On
  // approval, the next Waiting step becomes In review; on rejection,
  // the chain stops there (no further step auto-advances).
  async decideApprovalStep(
    tenantId: string,
    id: string,
    stepId: string,
    dto: DecideApprovalStepDto,
  ) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    const steps = c.approvalChain as any;
    const step = steps.id(stepId);
    if (!step) throw new NotFoundException('Approval step not found');
    if (step.status !== ApprovalStepStatus.IN_REVIEW) {
      throw new ConflictException(
        'Only the step currently in review can be decided.',
      );
    }
    step.status = dto.decision;
    step.decidedAt = new Date();
    step.note = dto.note ?? '';
    if (dto.decision === ApprovalStepStatus.APPROVED) {
      const idx = c.approvalChain.findIndex(
        (s: any) => String(s._id) === String(stepId),
      );
      const next = c.approvalChain[idx + 1] as any;
      if (next && next.status === ApprovalStepStatus.WAITING) {
        next.status = ApprovalStepStatus.IN_REVIEW;
      }
    }
    c.markModified('approvalChain');
    await c.save();
    return c.toObject();
  }

  // Real clause library — the same tenant-scoped collection the
  // Deals & Transactions module manages, exposed here under a
  // CRM-gated route so a tenant without the Deals module enabled
  // can still browse it when drafting a contract. Queries the model
  // directly rather than depending on ClauseService as an injected
  // provider, since that requires DealsModule's exports to reach
  // this module cleanly — a real dependency to avoid when a direct,
  // read-only query does the same job.
  async getClauseLibrary(tenantId: string) {
    return this.clauseModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ category: 1, title: 1 })
      .lean();
  }

  // Real, live-computed views — never separately stored, so they
  // can never drift from the contracts they're derived from.
  async getExpiring(tenantId: string, withinDays = 90) {
    const cutoff = new Date(Date.now() + withinDays * 86400000);
    return this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        expiresOn: { $gte: new Date(), $lte: cutoff },
      })
      .sort({ expiresOn: 1 })
      .lean();
  }

  async getObligationsDue(tenantId: string, withinDays = 90) {
    const contracts = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .lean();
    const cutoff = new Date(Date.now() + withinDays * 86400000);
    const due: any[] = [];
    for (const c of contracts) {
      for (const o of c.obligations) {
        if (!o.done && o.due <= cutoff) {
          due.push({
            ...o,
            contractId: c._id,
            contractTitle: c.title,
            contractRef: c.ref,
          });
        }
      }
    }
    return due.sort((a, b) => a.due.getTime() - b.due.getTime());
  }

  // ── E-signature workflow (Stage 3) ──────────────────────────

  // Real, tenant-scoped client lookup — without the tenantId check
  // a tenant could pass another tenant's client id and pull their
  // real name/email into a contract that isn't theirs.
  private async resolveClientDisplay(
    tenantId: string,
    clientId: string | undefined,
  ): Promise<{ name: string; email: string } | null> {
    if (!clientId) return null;
    const client = await this.userModel
      .findOne({ _id: clientId, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!client) throw new NotFoundException('Client not found');
    const name =
      [client.firstName, client.lastName].filter(Boolean).join(' ') ||
      client.clientProfile?.companyName ||
      client.email;
    return { name, email: client.email };
  }

  // Two real, distinct paths for who a contract is with — a
  // registered client (name/email derived from the real client
  // record, authoritative, never trusted from the request body) or
  // an external party (a vendor/consultant who isn't a platform
  // user at all, whose name/email genuinely can only come from what
  // the tenant typed in). Exactly one of these must be real.
  private async resolveCounterparty(
    tenantId: string,
    clientId: string | undefined,
    fallbackName: string | undefined,
    fallbackEmail: string | undefined,
  ): Promise<{ counterparty: string; counterpartyEmail: string }> {
    const client = await this.resolveClientDisplay(tenantId, clientId);
    if (client) {
      return { counterparty: client.name, counterpartyEmail: client.email };
    }
    if (!fallbackName || !fallbackEmail) {
      throw new BadRequestException(
        'Pick a registered client, or provide both a name and email for an external party.',
      );
    }
    return { counterparty: fallbackName, counterpartyEmail: fallbackEmail };
  }

  // Real generation from a real template — authored or uploaded,
  // either a tenant's own or a published platform one. Authored
  // templates get real merge-field substitution; uploaded ones
  // (no text content to substitute) get an honest placeholder body
  // the tenant is expected to fill in themselves — see the edit
  // guard below, which allows editing immediately, before sending.
  async generateFromTemplate(
    tenantId: string,
    dto: GenerateFromTemplateDto,
  ): Promise<ToolContractDocument_> {
    const tId = new Types.ObjectId(tenantId);

    let template: any;
    if (dto.templateSource === 'tenant') {
      template = await this.templateModel
        .findOne({ _id: dto.templateId, tenantId: tId })
        .lean();
      if (!template) throw new NotFoundException('Template not found');
    } else {
      template = await this.platformTemplateService.getById(dto.templateId);
      if (template.status !== 'Published') {
        throw new BadRequestException(
          'This platform template is not published and cannot be used.',
        );
      }
    }

    const businessName = await resolveBusinessName(this.userModel, tenantId);
    const { counterparty, counterpartyEmail } = await this.resolveCounterparty(
      tenantId,
      dto.clientId,
      dto.counterparty,
      dto.counterpartyEmail,
    );

    // Real merge-field substitution for both — an uploaded template's
    // content is now real, extracted HTML (via mammoth at upload
    // time), not a placeholder, so it gets the same treatment an
    // authored template's content does.
    const fields: Record<string, string> = {
      counterpartyName: counterparty,
      tenantCompanyName: businessName,
      contractValue: dto.value != null ? String(dto.value) : '',
      contractCurrency: dto.currency ?? 'USD',
      effectiveDate: new Date().toISOString().slice(0, 10),
      expiryDate: dto.expiresOn,
      todayDate: new Date().toISOString().slice(0, 10),
    };
    const renderedBody = renderContractBody(template.content, fields);

    const ref = await this.nextRef(tId);

    const created = await this.model.create({
      tenantId: tId,
      ref,
      title: dto.title,
      counterparty,
      counterpartyEmail,
      type: dto.type,
      stage: ContractStage.DRAFT,
      value: dto.value ?? 0,
      currency: dto.currency ?? 'USD',
      expiresOn: new Date(dto.expiresOn),
      autoRenew: dto.autoRenew ?? false,
      owner: dto.owner ?? '',
      clientId: dto.clientId ? new Types.ObjectId(dto.clientId) : null,
      mandateId: dto.mandateId ? new Types.ObjectId(dto.mandateId) : null,
      mandateName: dto.mandateName ?? '',
      templateId: dto.templateSource === 'tenant' ? template._id : null,
      templateName: template.title,
      renderedBody,
      requiresSignature: true,
      signatureStatus: SignatureStatus.NOT_SENT,
    });
    return created;
  }

  private async issueSigningToken(
    contract: ToolContractDocument_,
    expiresInHours: number,
  ): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    await this.tokenModel.create({
      contractId: contract._id,
      token,
      expiresAt,
      issuedToEmail: contract.counterpartyEmail,
    });
    return token;
  }

  async sendForSignature(
    tenantId: string,
    contractId: string,
    dto: SendForSignatureDto,
  ): Promise<ToolContractDocument_> {
    const contract = await this.model.findOne({
      _id: contractId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (!contract.renderedBody) {
      throw new BadRequestException(
        'This contract has no content yet — add content or generate it from a template first.',
      );
    }
    if (!contract.counterpartyEmail) {
      throw new BadRequestException(
        'This contract has no counterparty email on file — add one before sending.',
      );
    }
    if (
      contract.signatureStatus === SignatureStatus.SIGNED ||
      contract.signatureStatus === SignatureStatus.COUNTERSIGNED
    ) {
      throw new ConflictException('This contract has already been signed.');
    }

    const wasAlreadySent = contract.signatureStatus === SignatureStatus.SENT;
    contract.signatureStatus = SignatureStatus.SENT;
    contract.interactions.push({
      type: wasAlreadySent
        ? ToolContractInteractionType.RESENT
        : ToolContractInteractionType.SENT,
      occurredAt: new Date(),
      actor: 'tenant',
      message: null,
      tenantUserId: null,
    } as any);

    // Two real, distinct delivery paths. A registered client signs
    // through their own authenticated portal — no token needed, so
    // none is issued for this path, and the email links to the
    // client app rather than a public link. An external party (no
    // clientId) genuinely has no platform account to log into, so
    // they keep the real, token-gated public signing link.
    const isRegisteredClient = !!contract.clientId;
    let signingUrl: string;
    if (isRegisteredClient) {
      const clientBaseUrl = process.env.CLIENT_APP_URL;
      if (!clientBaseUrl) {
        throw new Error(
          'CLIENT_APP_URL is not configured — cannot build a valid contract link',
        );
      }
      signingUrl = `${clientBaseUrl}/contracts`;
    } else {
      const tenantBaseUrl = process.env.TENANT_APP_URL;
      if (!tenantBaseUrl) {
        throw new Error(
          'TENANT_APP_URL is not configured — cannot build a valid signing link',
        );
      }
      const token = await this.issueSigningToken(
        contract,
        dto.expiresInHours ?? DEFAULT_SIGNING_EXPIRY_HOURS,
      );
      signingUrl = `${tenantBaseUrl}/sign-tool-contract/${token}`;
    }

    await contract.save();

    try {
      // Real PDF of the contract as it stands right now, attached
      // alongside the link — so the counterparty has a real
      // document in hand, not just a link to click through.
      const businessName = await resolveBusinessName(this.userModel, tenantId);
      const letterhead = await this.letterheadService.getMine(tenantId);
      const pdfBuffer = await this.pdfService.buildDraftContractPdf(
        contract.renderedBody,
        contract.title,
        businessName,
        (letterhead as any)?.imagePath ?? null,
      );
      await this.emailService.sendContractForSignature(
        {
          to: contract.counterpartyEmail,
          signerName: contract.counterparty,
          signingUrl,
        },
        pdfBuffer,
      );
    } catch (err) {
      console.error(`Failed to send contract email for ${contractId}:`, err);
    }
    return contract;
  }

  async respondToComment(
    tenantId: string,
    contractId: string,
    tenantUserId: string,
    dto: TenantRespondToCommentDto,
  ): Promise<ToolContractDocument_> {
    const contract = await this.model.findOne({
      _id: contractId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!contract) throw new NotFoundException('Contract not found');
    contract.interactions.push({
      type: ToolContractInteractionType.TENANT_RESPONSE,
      occurredAt: new Date(),
      actor: 'tenant',
      message: dto.message,
      tenantUserId: new Types.ObjectId(tenantUserId),
    } as any);
    await contract.save();
    return contract;
  }

  // Allowed while Not Sent or Sent — a tenant should be able to
  // review and edit content immediately after generating, not only
  // after sending it. Blocked once Signed/Countersigned/Declined,
  // since real recipients may already have real copies by then.
  async editRenderedBody(
    tenantId: string,
    contractId: string,
    dto: EditRenderedBodyDto,
  ): Promise<ToolContractDocument_> {
    const contract = await this.model.findOne({
      _id: contractId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (
      contract.signatureStatus !== SignatureStatus.NOT_SENT &&
      contract.signatureStatus !== SignatureStatus.SENT
    ) {
      throw new ConflictException(
        contract.signatureStatus === SignatureStatus.SIGNED ||
          contract.signatureStatus === SignatureStatus.COUNTERSIGNED
          ? 'This contract has already been signed and can no longer be edited.'
          : 'This contract was declined and can no longer be edited.',
      );
    }
    contract.renderedBody = dto.renderedBody;
    contract.interactions.push({
      type: ToolContractInteractionType.UPDATED,
      occurredAt: new Date(),
      actor: 'tenant',
      message: dto.changeNote ?? null,
      tenantUserId: null,
    } as any);
    await contract.save();
    return contract;
  }

  async countersign(
    tenantId: string,
    contractId: string,
    signedByUserId: string,
    dto: CountersignToolContractDto,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<ToolContractDocument_> {
    const contract = await this.model.findOne({
      _id: contractId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.signatureStatus !== SignatureStatus.SIGNED) {
      throw new ConflictException(
        contract.signatureStatus === SignatureStatus.COUNTERSIGNED
          ? 'This contract has already been fully executed.'
          : 'The counterparty must sign first before you can countersign.',
      );
    }

    const signedAt = new Date();
    contract.tenantSignature = {
      signedAt,
      signerName: dto.signerName,
      signedByUserId: new Types.ObjectId(signedByUserId),
      signatureImageData: dto.signatureImageData ?? null,
      stampImageData: dto.stampImageData ?? null,
      ipAddress,
      userAgent,
    } as any;
    contract.signatureStatus = SignatureStatus.COUNTERSIGNED;
    contract.interactions.push({
      type: ToolContractInteractionType.COUNTERSIGNED,
      occurredAt: signedAt,
      actor: 'tenant',
      message: null,
      tenantUserId: new Types.ObjectId(signedByUserId),
    } as any);
    if (!contract.executedOn) contract.executedOn = signedAt;
    if (!contract.effectiveOn) contract.effectiveOn = signedAt;
    if (contract.stage !== ContractStage.ACTIVE) {
      contract.stage = ContractStage.ACTIVE;
    }

    await contract.save();
    return contract;
  }

  async sendSignedCopy(
    tenantId: string,
    contractId: string,
  ): Promise<ToolContractDocument_> {
    const contract = await this.model.findOne({
      _id: contractId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.signatureStatus !== SignatureStatus.COUNTERSIGNED) {
      throw new ConflictException(
        'Both parties must sign before the fully-executed copy can be sent.',
      );
    }
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    const letterhead = await this.letterheadService.getMine(tenantId);
    const pdfBuffer = await this.pdfService.buildSignedContractPdf(
      contract,
      businessName,
      (letterhead as any)?.imagePath ?? null,
    );

    try {
      await this.emailService.sendSignedContractCopy(
        {
          to: contract.counterpartyEmail,
          signerName: contract.counterparty,
          contractBody: contract.renderedBody,
          signerSignatureName: contract.signature!.signerName,
          signerSignedAt: contract.signature!.signedAt,
          tenantSignatureName: contract.tenantSignature!.signerName,
          tenantSignedAt: contract.tenantSignature!.signedAt,
          tenantSignatureImageData:
            contract.tenantSignature!.signatureImageData,
          tenantStampImageData: contract.tenantSignature!.stampImageData,
        },
        pdfBuffer,
      );
    } catch (err) {
      console.error(
        `Failed to send signed copy for contract ${contractId}:`,
        err,
      );
      throw err;
    }

    contract.signedCopySentAt = new Date();
    contract.interactions.push({
      type: ToolContractInteractionType.SIGNED_COPY_SENT,
      occurredAt: contract.signedCopySentAt,
      actor: 'tenant',
      message: null,
      tenantUserId: null,
    } as any);
    await contract.save();
    return contract;
  }

  async getSignedContractPdf(
    tenantId: string,
    contractId: string,
  ): Promise<Buffer> {
    const contract = await this.getById(tenantId, contractId);
    if (contract.signatureStatus !== SignatureStatus.COUNTERSIGNED) {
      throw new ConflictException(
        'Only a fully executed (countersigned) contract can be downloaded as PDF.',
      );
    }
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    const letterhead = await this.letterheadService.getMine(tenantId);
    return this.pdfService.buildSignedContractPdf(
      contract,
      businessName,
      (letterhead as any)?.imagePath ?? null,
    );
  }

  // Real preview of the contract as a document — works at any
  // status, so a tenant can see exactly what will be sent (real
  // letterhead, real content) before it ever goes out. Same
  // unsigned-layout PDF the send-for-signature email attaches, just
  // available on demand rather than only at send time.
  async getPreviewPdf(tenantId: string, contractId: string): Promise<Buffer> {
    const contract = await this.getById(tenantId, contractId);
    if (!contract.renderedBody) {
      throw new BadRequestException(
        'This contract has no content yet — add content or generate it from a template first.',
      );
    }
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    const letterhead = await this.letterheadService.getMine(tenantId);
    return this.pdfService.buildDraftContractPdf(
      contract.renderedBody,
      contract.title,
      businessName,
      (letterhead as any)?.imagePath ?? null,
    );
  }

  // ── SIGNER-FACING (public, token-gated) ──

  async getContractByToken(token: string): Promise<ToolContractDocument_> {
    const tokenDoc = await this.tokenModel.findOne({ token });
    if (!tokenDoc)
      throw new NotFoundException('Invalid or unknown signing link.');
    if (tokenDoc.expiresAt < new Date()) {
      throw new BadRequestException(
        'This signing link has expired. Ask the sender to resend it.',
      );
    }
    const contract = await this.model.findById(tokenDoc.contractId);
    if (!contract) throw new NotFoundException('Contract not found.');
    return contract;
  }

  async recordView(token: string): Promise<void> {
    const contract = await this.getContractByToken(token);
    contract.interactions.push({
      type: ToolContractInteractionType.VIEWED,
      occurredAt: new Date(),
      actor: 'signer',
      message: null,
      tenantUserId: null,
    } as any);
    await contract.save();
  }

  async submitComment(
    token: string,
    message: string,
  ): Promise<ToolContractDocument_> {
    const contract = await this.getContractByToken(token);
    if (
      contract.signatureStatus === SignatureStatus.SIGNED ||
      contract.signatureStatus === SignatureStatus.COUNTERSIGNED ||
      contract.signatureStatus === SignatureStatus.DECLINED
    ) {
      throw new ConflictException(
        'This contract is already finalized and can no longer receive comments.',
      );
    }
    contract.interactions.push({
      type: ToolContractInteractionType.COMMENT,
      occurredAt: new Date(),
      actor: 'signer',
      message,
      tenantUserId: null,
    } as any);
    await contract.save();
    return contract;
  }

  async sign(
    token: string,
    dto: SubmitContractSignatureDto,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<ToolContractDocument_> {
    const tokenDoc = await this.tokenModel.findOne({ token });
    if (!tokenDoc)
      throw new NotFoundException('Invalid or unknown signing link.');
    if (tokenDoc.expiresAt < new Date()) {
      throw new BadRequestException(
        'This signing link has expired. Ask the sender to resend it.',
      );
    }
    if (tokenDoc.consumedAt) {
      throw new ConflictException('This signing link has already been used.');
    }

    const contract = await this.model.findById(tokenDoc.contractId);
    if (!contract) throw new NotFoundException('Contract not found.');
    if (
      contract.signatureStatus === SignatureStatus.SIGNED ||
      contract.signatureStatus === SignatureStatus.COUNTERSIGNED
    ) {
      throw new ConflictException('This contract has already been signed.');
    }
    if (contract.signatureStatus === SignatureStatus.DECLINED) {
      throw new ConflictException(
        'This contract was declined and can no longer be signed.',
      );
    }

    const signedAt = new Date();
    contract.signatureStatus = SignatureStatus.SIGNED;
    contract.signature = {
      signedAt,
      signerName: dto.signerName,
      signatureImageData: dto.signatureImageData ?? null,
      ipAddress,
      userAgent,
    } as any;
    contract.interactions.push({
      type: ToolContractInteractionType.SIGNED,
      occurredAt: signedAt,
      actor: 'signer',
      message: null,
      tenantUserId: null,
    } as any);
    await contract.save();

    tokenDoc.consumedAt = signedAt;
    await tokenDoc.save();

    try {
      await this.emailService.sendContractSignedConfirmation({
        to: contract.counterpartyEmail,
        signerName: contract.counterparty,
      });
    } catch (err) {
      console.error(
        `Failed to send signed-confirmation email for contract ${contract._id}:`,
        err,
      );
    }
    return contract;
  }

  async decline(
    token: string,
    reason: string | undefined,
  ): Promise<ToolContractDocument_> {
    const contract = await this.getContractByToken(token);
    if (
      contract.signatureStatus === SignatureStatus.SIGNED ||
      contract.signatureStatus === SignatureStatus.COUNTERSIGNED
    ) {
      throw new ConflictException('This contract has already been signed.');
    }
    contract.signatureStatus = SignatureStatus.DECLINED;
    contract.declinedAt = new Date();
    contract.declineReason = reason ?? null;
    contract.interactions.push({
      type: ToolContractInteractionType.DECLINED,
      occurredAt: new Date(),
      actor: 'signer',
      message: reason ?? null,
      tenantUserId: null,
    } as any);
    await contract.save();
    return contract;
  }
}

// Same real conversion PlatformContractTemplateService and
// EngagementLetterService already use — filePath may be absolute or
// relative, so only the part from 'uploads/' onwards is kept, then
// prefixed with the real configured APP_URL.
function toFileUrl(filePath: string): string {
  const rawPath = filePath.replace(/\\/g, '/');
  const uploadsIndex = rawPath.indexOf('uploads/');
  const relativePath =
    uploadsIndex !== -1 ? rawPath.slice(uploadsIndex) : rawPath;
  return `${process.env.APP_URL}/${relativePath}`;
}

// ── Tenant's own contract templates — template CREATION was
// retired for tenants (see below); this schema/model is kept only
// so contracts already generated from a tenant-authored template
// built before that change stay fully readable. ───────────────────

// Template creation was retired for tenants — every template a
// tenant can pick from now comes from the super admin's real,
// folder-organized library. getAll/getById are kept, read-only, so
// contracts already generated from a tenant-authored template built
// before this change stay fully readable — no data is deleted, the
// ability to create more is just gone.
@Injectable()
export class TenantContractTemplateService {
  constructor(
    @InjectModel(TenantContractTemplate.name)
    private readonly model: Model<TenantContractTemplateDocument>,
    private readonly platformTemplateService: PlatformContractTemplateService,
    private readonly platformFolderService: PlatformTemplateFolderService,
  ) {}

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getById(tenantId: string, id: string) {
    const t = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!t) throw new NotFoundException('Template not found');
    return t;
  }

  // The real picker for generating a new contract — published
  // platform templates only, each carrying its real folderId so the
  // tenant UI can group them exactly the way the super admin
  // organized them. Legacy tenant-authored templates (from before
  // creation was retired) are deliberately left out of this list —
  // they still exist and remain readable via getAll/getById for any
  // contract already generated from one, but a tenant can no longer
  // start a new contract from one going forward.
  async getAvailableTemplates(_tenantId: string) {
    const platform = await this.platformTemplateService.getAll();
    return (platform as any[])
      .filter((t) => t.status === 'Published')
      .map((t) => ({ ...t, source: 'platform' as const }));
  }

  async getAvailableFolders() {
    return this.platformFolderService.getAll();
  }
}

// ── Client-facing — a registered client viewing, signing, and
// commenting on contracts sent to them, through their own
// authenticated client-portal session. No token involved at all:
// identity comes from the real, logged-in clientId, matching the
// established crm/client-* pattern (ClientInvoiceService,
// ClientNewsletterService). This is the counterpart to the public,
// token-gated signing controller — that one exists specifically
// because an external party (vendor, consultant) has no platform
// account to log into; a registered client always does. ───────────

@Injectable()
export class ClientToolContractService {
  constructor(
    @InjectModel(ToolContract.name)
    private readonly model: Model<ToolContractDocument_>,
    private readonly emailService: EmailService,
  ) {}

  private sanitizeForClient(c: any) {
    return {
      _id: c._id,
      ref: c.ref,
      title: c.title,
      type: c.type,
      renderedBody: c.renderedBody,
      signatureStatus: c.signatureStatus,
      interactions: c.interactions,
      signature: c.signature,
      tenantSignature: c.tenantSignature,
      expiresOn: c.expiresOn,
      declinedAt: c.declinedAt,
      declineReason: c.declineReason,
    };
  }

  // Real ownership check on every call — a client only ever sees
  // their own real contracts, and only once the tenant has actually
  // sent it (a draft they haven't received yet stays invisible).
  private async getOwnedContract(
    tenantId: string,
    clientUserId: string,
    contractId: string,
  ): Promise<ToolContractDocument_> {
    const contract = await this.model.findOne({
      _id: contractId,
      tenantId: new Types.ObjectId(tenantId),
      clientId: new Types.ObjectId(clientUserId),
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.signatureStatus === SignatureStatus.NOT_SENT) {
      throw new ForbiddenException(
        'This contract has not been sent to you yet.',
      );
    }
    return contract;
  }

  async getMyContracts(tenantId: string, clientUserId: string) {
    const contracts = await this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        clientId: new Types.ObjectId(clientUserId),
        signatureStatus: { $ne: SignatureStatus.NOT_SENT },
      })
      .sort({ updatedAt: -1 })
      .lean();
    return contracts.map((c) => this.sanitizeForClient(c));
  }

  async getMyContract(tenantId: string, clientUserId: string, id: string) {
    const contract = await this.getOwnedContract(tenantId, clientUserId, id);
    contract.interactions.push({
      type: ToolContractInteractionType.VIEWED,
      occurredAt: new Date(),
      actor: 'signer',
      message: null,
      tenantUserId: null,
    } as any);
    await contract.save();
    return this.sanitizeForClient(contract.toObject());
  }

  async submitComment(
    tenantId: string,
    clientUserId: string,
    id: string,
    message: string,
  ) {
    const contract = await this.getOwnedContract(tenantId, clientUserId, id);
    if (
      contract.signatureStatus === SignatureStatus.SIGNED ||
      contract.signatureStatus === SignatureStatus.COUNTERSIGNED ||
      contract.signatureStatus === SignatureStatus.DECLINED
    ) {
      throw new ConflictException(
        'This contract is already finalized and can no longer receive comments.',
      );
    }
    contract.interactions.push({
      type: ToolContractInteractionType.COMMENT,
      occurredAt: new Date(),
      actor: 'signer',
      message,
      tenantUserId: null,
    } as any);
    await contract.save();
    return this.sanitizeForClient(contract.toObject());
  }

  async sign(
    tenantId: string,
    clientUserId: string,
    id: string,
    dto: SubmitContractSignatureDto,
    ipAddress: string | null,
    userAgent: string | null,
  ) {
    const contract = await this.getOwnedContract(tenantId, clientUserId, id);
    if (
      contract.signatureStatus === SignatureStatus.SIGNED ||
      contract.signatureStatus === SignatureStatus.COUNTERSIGNED
    ) {
      throw new ConflictException('This contract has already been signed.');
    }
    if (contract.signatureStatus === SignatureStatus.DECLINED) {
      throw new ConflictException(
        'This contract was declined and can no longer be signed.',
      );
    }

    const signedAt = new Date();
    contract.signatureStatus = SignatureStatus.SIGNED;
    contract.signature = {
      signedAt,
      signerName: dto.signerName,
      signatureImageData: dto.signatureImageData ?? null,
      ipAddress,
      userAgent,
    } as any;
    contract.interactions.push({
      type: ToolContractInteractionType.SIGNED,
      occurredAt: signedAt,
      actor: 'signer',
      message: null,
      tenantUserId: null,
    } as any);
    await contract.save();

    try {
      await this.emailService.sendContractSignedConfirmation({
        to: contract.counterpartyEmail,
        signerName: contract.counterparty,
      });
    } catch (err) {
      console.error(
        `Failed to send signed-confirmation email for contract ${id}:`,
        err,
      );
    }
    return this.sanitizeForClient(contract.toObject());
  }

  async decline(
    tenantId: string,
    clientUserId: string,
    id: string,
    reason: string | undefined,
  ) {
    const contract = await this.getOwnedContract(tenantId, clientUserId, id);
    if (
      contract.signatureStatus === SignatureStatus.SIGNED ||
      contract.signatureStatus === SignatureStatus.COUNTERSIGNED
    ) {
      throw new ConflictException('This contract has already been signed.');
    }
    contract.signatureStatus = SignatureStatus.DECLINED;
    contract.declinedAt = new Date();
    contract.declineReason = reason ?? null;
    contract.interactions.push({
      type: ToolContractInteractionType.DECLINED,
      occurredAt: new Date(),
      actor: 'signer',
      message: reason ?? null,
      tenantUserId: null,
    } as any);
    await contract.save();
    return this.sanitizeForClient(contract.toObject());
  }
}
