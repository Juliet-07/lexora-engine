import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  GovernanceCode,
  GovernanceCodeDocument,
  GovernanceCodeStatus,
  GovernanceCodeCategory,
  CodeApprovalDecision,
} from '../schemas';
import {
  CreateGovernanceCodeDto,
  UpdateCodeBodyDto,
  DecideCodeBoardApprovalDto,
} from '../dtos/index.dto';
import {
  PolicyTemplate,
  PolicyTemplateDocument,
  PolicyTemplateStatus,
  PolicyTemplateAppliesTo,
} from 'src/modules/super_admin/schemas/policy-template.schema';
import { BoardMemberService } from './board-member.service';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';

@Injectable()
export class GovernanceCodeService {
  constructor(
    @InjectModel(GovernanceCode.name)
    private readonly codeModel: Model<GovernanceCodeDocument>,
    @InjectModel(PolicyTemplate.name)
    private readonly templateModel: Model<PolicyTemplateDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly boardMemberService: BoardMemberService,
    private readonly emailService: EmailService,
  ) {}

  private sectionsToBody(
    title: string,
    sections: { title: string; content: string }[],
  ): string {
    const heading = `<h2>${title.toUpperCase()}</h2>`;
    const body = sections
      .map((s, i) => `<h3>${i + 1}. ${s.title}</h3>${s.content || ''}`)
      .join('');
    return heading + body;
  }

  async create(tenantId: string, dto: CreateGovernanceCodeDto) {
    let body = dto.body ?? '';
    let templateId: Types.ObjectId | null = null;

    if (dto.templateId && Types.ObjectId.isValid(dto.templateId)) {
      const template = await this.templateModel.findOne({
        _id: dto.templateId,
        status: PolicyTemplateStatus.PUBLISHED,
        appliesTo: PolicyTemplateAppliesTo.GOVERNANCE_CODE,
      });
      if (template) {
        body = this.sectionsToBody(dto.title, template.sections);
        templateId = template._id as Types.ObjectId;
      }
    }

    return this.codeModel.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      category: dto.category,
      body,
      documents: [],
      version: 1,
      status: GovernanceCodeStatus.DRAFT,
      templateId,
      boardApprovals: [],
    });
  }

  // .lean() reads skip schema defaults for fields a document simply
  // doesn't have stored yet — real for any code created before this
  // round added boardApprovals/templateId. Backfilled here so the
  // frontend never has to guard against a missing array.
  private normalize(c: any) {
    return {
      ...c,
      boardApprovals: c.boardApprovals ?? [],
      templateId: c.templateId ?? null,
    };
  }

  async getAll(tenantId: string) {
    const codes = await this.codeModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ updatedAt: -1 })
      .lean();
    return codes.map((c) => this.normalize(c));
  }

  async getById(tenantId: string, id: string): Promise<GovernanceCodeDocument> {
    const code = await this.codeModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!code) throw new NotFoundException('Governance code not found');
    return code;
  }

  async updateBody(tenantId: string, id: string, dto: UpdateCodeBodyDto) {
    const code = await this.getById(tenantId, id);
    code.body = dto.body;
    await code.save();
    return code;
  }

  async addDocument(tenantId: string, id: string, file: Express.Multer.File) {
    const code = await this.getById(tenantId, id);
    code.documents.push({
      name: file.originalname,
      fileUrl: `/uploads/grc/governance-codes/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    } as any);
    code.markModified('documents');
    await code.save();
    return code;
  }

  async removeDocument(tenantId: string, id: string, index: number) {
    const code = await this.getById(tenantId, id);
    code.documents.splice(index, 1);
    code.markModified('documents');
    await code.save();
    return code;
  }

  async publish(tenantId: string, id: string) {
    const code = await this.getById(tenantId, id);
    if (code.status !== GovernanceCodeStatus.DRAFT) {
      throw new BadRequestException('Only a draft can be published.');
    }
    code.status = GovernanceCodeStatus.PUBLISHED;
    await code.save();
    return code;
  }

  // ── Approval workflow ───────────────────────────────────────────
  // Draft -> Internal review -> Board / Committee approval -> Published.
  // A code cannot skip straight from Draft/Internal review to
  // Published via `publish()` above in normal use — the tenant UI now
  // drives codes through sendForReview/sendForBoardApproval instead.

  async sendForReview(tenantId: string, id: string) {
    const code = await this.getById(tenantId, id);
    if (code.status !== GovernanceCodeStatus.DRAFT) {
      throw new BadRequestException(
        'Only a draft can be sent for internal review.',
      );
    }
    code.status = GovernanceCodeStatus.INTERNAL_REVIEW;
    await code.save();
    return code;
  }

  private async finalizePublish(code: GovernanceCodeDocument) {
    code.status = GovernanceCodeStatus.PUBLISHED;
    await code.save();
    return code;
  }

  // Opens a board approval round — one row per currently-active board
  // member, decided in-app from the Board Portal. Exception: a Board
  // Charter with no active board members yet publishes immediately
  // instead of blocking, since there's no board to ask (the charter
  // is often what establishes one in the first place). Every other
  // category with zero active board members is blocked, same as
  // Policy's equivalent guard.
  async sendForBoardApproval(tenantId: string, id: string) {
    const code = await this.getById(tenantId, id);
    if (code.status !== GovernanceCodeStatus.INTERNAL_REVIEW) {
      throw new BadRequestException(
        'Only a code under internal review can be sent for board approval.',
      );
    }

    const boardMembers = await this.boardMemberService.getAll(tenantId);
    const active = (boardMembers as any[]).filter((b) => b.isActive);

    if (!active.length) {
      if (code.category === GovernanceCodeCategory.BOARD_CHARTER) {
        return this.finalizePublish(code);
      }
      throw new BadRequestException(
        'This code requires board approval, but the tenant has no active board members to ask. Add board members under Board Management first.',
      );
    }

    code.boardApprovals = active.map(
      (b) =>
        ({
          boardMemberId: b._id,
          name: b.name,
          email: String(b.email).toLowerCase(),
          decision: CodeApprovalDecision.PENDING,
          notes: '',
          decidedAt: null,
          requestedAt: new Date(),
        }) as any,
    );
    code.status = GovernanceCodeStatus.PENDING_BOARD_APPROVAL;
    code.markModified('boardApprovals');
    await code.save();

    const businessName = await resolveBusinessName(this.userModel, tenantId);
    await Promise.all(
      active.map((b) =>
        this.emailService
          .sendPolicyForAcknowledgment({
            to: String(b.email).toLowerCase(),
            recipientName: b.name,
            policyTitle: code.title,
            ackLink: `${process.env.BOARD_APP_URL || 'http://localhost:8083'}/governance-codes`,
            businessName,
          })
          .catch(() => {}),
      ),
    );

    return code;
  }

  // ── Board Portal — the signed-in board member's own view ────────

  async getPendingForBoardMember(userId: string) {
    const { boardMemberId, tenantId } =
      await this.boardMemberService.resolveBoardMember(userId);
    const codes = await this.codeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        'boardApprovals.boardMemberId': new Types.ObjectId(boardMemberId),
      })
      .sort({ updatedAt: -1 })
      .lean();

    return codes.map((c: any) => {
      const mine = (c.boardApprovals ?? []).find(
        (r: any) => r.boardMemberId?.toString() === boardMemberId,
      );
      return {
        id: c._id,
        title: c.title,
        category: c.category,
        version: c.version,
        status: c.status,
        body: c.body,
        myDecision: mine?.decision ?? null,
        myNotes: mine?.notes ?? '',
        myDecidedAt: mine?.decidedAt ?? null,
      };
    });
  }

  async decideBoardApproval(
    userId: string,
    id: string,
    dto: DecideCodeBoardApprovalDto,
  ) {
    const { boardMemberId, tenantId } =
      await this.boardMemberService.resolveBoardMember(userId);
    const code = await this.getById(tenantId, id);
    const row = code.boardApprovals.find(
      (r) => r.boardMemberId.toString() === boardMemberId,
    );
    if (!row) {
      throw new ForbiddenException(
        'You have not been asked to approve this code.',
      );
    }
    if (row.decision !== CodeApprovalDecision.PENDING) {
      throw new BadRequestException('This approval has already been recorded.');
    }

    row.decision = dto.decision;
    row.notes = dto.notes ?? '';
    row.decidedAt = new Date();
    code.markModified('boardApprovals');

    if (dto.decision === CodeApprovalDecision.REJECTED) {
      code.status = GovernanceCodeStatus.INTERNAL_REVIEW;
      await code.save();
      return code;
    }

    const allApproved = code.boardApprovals.every(
      (r) => r.decision === CodeApprovalDecision.APPROVED,
    );
    if (allApproved) {
      await this.finalizePublish(code);
    } else {
      await code.save();
    }
    return code;
  }

  // Matches the actual UI exactly — bumps version and reopens the
  // SAME record for editing. No version chain, no new document.
  async startNewVersion(tenantId: string, id: string) {
    const code = await this.getById(tenantId, id);
    if (code.status !== GovernanceCodeStatus.PUBLISHED) {
      throw new BadRequestException(
        'Start a new version only from a published code.',
      );
    }
    code.status = GovernanceCodeStatus.DRAFT;
    code.version += 1;
    await code.save();
    return code;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const deleted = await this.codeModel.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Governance code not found');
  }
}
