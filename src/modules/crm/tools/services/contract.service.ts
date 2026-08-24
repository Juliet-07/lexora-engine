import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import * as mammoth from 'mammoth';
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
} from '../schemas';
import {
  CreateContractDto,
  ExecuteContractDto,
  AddNegotiationRoundDto,
  AddAmendmentDto,
  AddObligationDto,
  SetObligationDoneDto,
  CreateTenantTemplateDto,
  UpdateTenantTemplateDto,
  UploadTenantTemplateDto,
  GenerateFromTemplateDto,
  SendForSignatureDto,
  TenantRespondToCommentDto,
  EditRenderedBodyDto,
  CountersignToolContractDto,
  SubmitContractSignatureDto,
} from '../dtos';
import { PlatformContractTemplateService } from 'src/modules/super_admin/services/contract-template.service';
import { ToolContractPdfService } from './contract-pdf.service';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { renderContractBody } from 'src/common/utils/contract-fields.util';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';

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
    private readonly letterheadService: TenantLetterheadService,
    private readonly platformTemplateService: PlatformContractTemplateService,
    private readonly pdfService: ToolContractPdfService,
    private readonly emailService: EmailService,
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
    return c;
  }

  async create(tenantId: string, dto: CreateContractDto) {
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      title: dto.title,
      counterparty: dto.counterparty,
      counterpartyEmail: dto.counterpartyEmail,
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
    } as any);
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

  private async resolveClientDisplay(
    clientId: string | undefined,
  ): Promise<{ name: string; email: string } | null> {
    if (!clientId) return null;
    const client = await this.userModel.findById(clientId).lean();
    if (!client) throw new NotFoundException('Client not found');
    const name =
      [client.firstName, client.lastName].filter(Boolean).join(' ') ||
      client.clientProfile?.companyName ||
      client.email;
    return { name, email: client.email };
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

    // Real merge-field substitution for both — an uploaded template's
    // content is now real, extracted HTML (via mammoth at upload
    // time), not a placeholder, so it gets the same treatment an
    // authored template's content does.
    const fields: Record<string, string> = {
      counterpartyName: dto.counterparty,
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
      counterparty: dto.counterparty,
      counterpartyEmail: dto.counterpartyEmail,
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
    await contract.save();

    const token = await this.issueSigningToken(
      contract,
      dto.expiresInHours ?? DEFAULT_SIGNING_EXPIRY_HOURS,
    );

    const baseUrl = process.env.TENANT_APP_URL;
    if (!baseUrl) {
      throw new Error(
        'TENANT_APP_URL is not configured — cannot build a valid signing link',
      );
    }
    try {
      // Real PDF of the contract as it stands right now, attached
      // alongside the signing link — so the counterparty has a real
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
          signingUrl: `${baseUrl}/sign-tool-contract/${token}`,
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

// Real docx-to-HTML extraction — an uploaded Word document's real
// text becomes real, editable content (the same field authored
// templates use), so a tenant can preview and edit it, and it can
// be merge-field substituted the same way an authored template is
// when generating a contract. A corrupt/unusual .docx shouldn't
// block the upload outright — falls back to an honest note instead
// of failing the whole request.
async function extractDocxHtml(filePath: string): Promise<string> {
  try {
    const result = await mammoth.convertToHtml({ path: filePath });
    return result.value;
  } catch (err: any) {
    console.error(
      `Failed to extract content from ${filePath}: ${err?.message}`,
    );
    return "<p><em>This document's content could not be automatically extracted. Download the original file to view it.</em></p>";
  }
}

// ── Tenant's own contract templates — same authored-or-uploaded
// shape as the platform's, but tenant-scoped. getAvailableTemplates
// is the real picker: merges the tenant's own templates with
// platform-published ones (via PlatformContractTemplateService,
// injected from super_admin), each tagged with a real source so the
// frontend knows where it came from. ──────────────────────────────

@Injectable()
export class TenantContractTemplateService {
  constructor(
    @InjectModel(TenantContractTemplate.name)
    private readonly model: Model<TenantContractTemplateDocument>,
    private readonly platformTemplateService: PlatformContractTemplateService,
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

  async create(tenantId: string, dto: CreateTenantTemplateDto) {
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      type: dto.type,
      jurisdiction: dto.jurisdiction ?? '',
      description: dto.description ?? '',
      sourceType: TenantTemplateSourceType.AUTHORED,
      content: dto.content,
    });
    return created.toObject();
  }

  async upload(
    tenantId: string,
    file: Express.Multer.File,
    dto: UploadTenantTemplateDto,
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const content = await extractDocxHtml(file.path);
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      type: dto.type,
      jurisdiction: dto.jurisdiction ?? '',
      description: dto.description ?? '',
      sourceType: TenantTemplateSourceType.UPLOADED,
      content,
      fileUrl: toFileUrl(file.path),
      fileName: file.originalname,
      fileMimeType: file.mimetype,
      filePath: file.path,
    });
    return created.toObject();
  }

  async replaceFile(tenantId: string, id: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const t = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!t) throw new NotFoundException('Template not found');
    if (t.sourceType !== TenantTemplateSourceType.UPLOADED) {
      throw new BadRequestException(
        'This template is authored, not uploaded — edit its content instead of replacing a file.',
      );
    }
    if (t.filePath && fs.existsSync(t.filePath)) {
      fs.unlinkSync(t.filePath);
    }
    t.fileUrl = toFileUrl(file.path);
    t.fileName = file.originalname;
    t.fileMimeType = file.mimetype;
    t.filePath = file.path;
    t.content = await extractDocxHtml(file.path);
    await t.save();
    return t.toObject();
  }

  async update(tenantId: string, id: string, dto: UpdateTenantTemplateDto) {
    const t = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!t) throw new NotFoundException('Template not found');
    if (t.sourceType !== TenantTemplateSourceType.AUTHORED) {
      throw new BadRequestException(
        'This template was uploaded as a file — replace the file instead of editing content.',
      );
    }
    t.title = dto.title;
    t.type = dto.type;
    t.jurisdiction = dto.jurisdiction ?? '';
    t.description = dto.description ?? '';
    t.content = dto.content;
    await t.save();
    return t.toObject();
  }

  async delete(tenantId: string, id: string) {
    const t = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!t) throw new NotFoundException('Template not found');
    if (t.filePath && fs.existsSync(t.filePath)) {
      fs.unlinkSync(t.filePath);
    }
    await t.deleteOne();
    return { deleted: true };
  }

  // The real picker — merges real platform-published templates with
  // the tenant's own real templates. Only Published platform
  // templates are ever included; a tenant never sees another
  // tenant's own templates, since getAll is already tenant-scoped.
  async getAvailableTemplates(tenantId: string) {
    const [platform, own] = await Promise.all([
      this.platformTemplateService.getAll(),
      this.getAll(tenantId),
    ]);
    const publishedPlatform = (platform as any[]).filter(
      (t) => t.status === 'Published',
    );
    return [
      ...publishedPlatform.map((t) => ({ ...t, source: 'platform' as const })),
      ...(own as any[]).map((t) => ({ ...t, source: 'tenant' as const })),
    ];
  }
}
