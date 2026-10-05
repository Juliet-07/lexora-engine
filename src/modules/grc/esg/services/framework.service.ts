import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import {
  EsgFramework,
  EsgFrameworkDocument,
  STANDARD_FRAMEWORKS,
  ReportIndicator,
  ReportIndicatorDocument,
  IndicatorStatus,
  EsgApprovalDecision,
  EsgReport,
  EsgReportDocument,
  EsgReportStatus,
} from '../schemas';
import {
  CreateFrameworkDto,
  UpdateFrameworkDto,
  SetFrameworkActiveDto,
  ReorderFrameworksDto,
  CreateIndicatorDto,
  UpdateIndicatorResponseDto,
  UpdateIndicatorRequirementDto,
  UpdateIndicatorApplicabilityDto,
  SendForEsgApprovalDto,
  DecideEsgChairApprovalDto,
  DecideBoardChairApprovalDto,
  CompileReportDto,
} from '../dtos';
import { frameworkCoverage } from 'src/common/utils/esg-calculations.util';
import { CommitteeMemberRole } from '../../governance/schemas';
import {
  BoardMemberService,
  CommitteeService,
} from '../../governance/services';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';

const slugify = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '');

@Injectable()
export class EsgFrameworkService {
  constructor(
    @InjectModel(EsgFramework.name)
    private readonly frameworkModel: Model<EsgFrameworkDocument>,
    @InjectModel(ReportIndicator.name)
    private readonly indicatorModel: Model<ReportIndicatorDocument>,
    @InjectModel(EsgReport.name)
    private readonly reportModel: Model<EsgReportDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly boardMemberService: BoardMemberService,
    private readonly committeeService: CommitteeService,
    private readonly emailService: EmailService,
  ) {}

  // ── Frameworks — seed once, then fully tenant-owned ─────────

  // Seeds the 6 standard frameworks the first time a tenant touches
  // Reporting. Matches on `key`, so it's safe to call on every
  // getAll() — a tenant who has already renamed, deactivated or
  // deleted one of these never gets it silently recreated, because
  // deletion removes the row (see `remove` below) but re-seeding
  // only fires for keys that are entirely absent from day one.
  private async ensureSeeded(tenantId: string): Promise<void> {
    const tId = new Types.ObjectId(tenantId);
    const existing = await this.frameworkModel
      .find({ tenantId: tId })
      .select('key')
      .lean();
    if (existing.length > 0) return; // already seeded at least once — never re-seed
    await this.frameworkModel.insertMany(
      STANDARD_FRAMEWORKS.map((f, i) => ({
        tenantId: tId,
        key: f.key,
        label: f.label,
        description: f.description,
        isStandard: true,
        isActive: true,
        order: i,
      })),
    );
  }

  async getAllFrameworks(tenantId: string, includeInactive = true) {
    await this.ensureSeeded(tenantId);
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (!includeInactive) query.isActive = true;
    return this.frameworkModel.find(query).sort({ order: 1, label: 1 }).lean();
  }

  private async getRawFramework(tenantId: string, id: string) {
    const f = await this.frameworkModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!f) throw new NotFoundException('Framework not found');
    return f;
  }

  // A wholly custom framework — for licensing-tied requirements that
  // don't fit a generic international standard (e.g. a Capital
  // Markets Authority corporate governance code, or a central bank's
  // licensing conditions). isStandard stays false, so it's never
  // touched by re-seeding logic and behaves identically to the
  // built-in six from here on.
  async createFramework(tenantId: string, dto: CreateFrameworkDto) {
    const tId = new Types.ObjectId(tenantId);
    const count = await this.frameworkModel.countDocuments({ tenantId: tId });
    let key = slugify(dto.label) || `CUSTOM_${Date.now()}`;
    // Guard against a custom label colliding with an existing key
    // (including a standard one, if the tenant named it that).
    let suffix = 0;
    while (
      await this.frameworkModel.exists({
        tenantId: tId,
        key: `${key}${suffix ? `_${suffix}` : ''}`,
      })
    ) {
      suffix += 1;
    }
    if (suffix) key = `${key}_${suffix}`;

    const created = await this.frameworkModel.create({
      tenantId: tId,
      key,
      label: dto.label,
      description: dto.description ?? '',
      isStandard: false,
      isActive: true,
      order: count,
    });
    return created.toObject();
  }

  async updateFramework(tenantId: string, id: string, dto: UpdateFrameworkDto) {
    const f = await this.getRawFramework(tenantId, id);
    if (dto.label !== undefined) f.label = dto.label;
    if (dto.description !== undefined) f.description = dto.description;
    await f.save();
    return f.toObject();
  }

  // Hides the tab without touching any of its indicators or reports
  // — reversible, and the safer default for "we don't use this one".
  async setActive(tenantId: string, id: string, dto: SetFrameworkActiveDto) {
    const f = await this.getRawFramework(tenantId, id);
    f.isActive = dto.isActive;
    await f.save();
    return f.toObject();
  }

  async reorder(tenantId: string, dto: ReorderFrameworksDto) {
    const tId = new Types.ObjectId(tenantId);
    await Promise.all(
      dto.frameworkIds.map((id, order) =>
        this.frameworkModel.updateOne(
          { _id: id, tenantId: tId },
          { $set: { order } },
        ),
      ),
    );
    return this.getAllFrameworks(tenantId);
  }

  // Permanently removes a framework the tenant genuinely never wants
  // back — including a standard one. Its indicators go with it;
  // compiled reports referencing it are left as historical record.
  // deactivate (setActive false) is the reversible alternative and
  // should be the one the frontend defaults to.
  async deleteFramework(tenantId: string, id: string) {
    const tId = new Types.ObjectId(tenantId);
    await this.getRawFramework(tenantId, id); // 404s if not found/not owned
    await Promise.all([
      this.frameworkModel.deleteOne({ _id: id, tenantId: tId }),
      this.indicatorModel.deleteMany({ frameworkId: id, tenantId: tId }),
    ]);
    return { deleted: true };
  }

  // ── Indicators ───────────────────────────────────────────────

  async getIndicators(tenantId: string, frameworkId: string) {
    const rows = await this.indicatorModel
      .find({ tenantId: new Types.ObjectId(tenantId), frameworkId })
      .sort({ code: 1 })
      .lean();
    // .lean() skips Mongoose's schema-default hydration, so an
    // indicator created before this round's approval-chain fields
    // existed comes back with them missing entirely rather than
    // their defaults — normalize here, same read-path-normalization
    // pattern used throughout this codebase (audit folders, Board
    // Management fields, Governance Codes boardApprovals, …).
    return rows.map((i: any) => this.normalizeIndicator(i));
  }

  private normalizeIndicator(i: any) {
    return {
      ...i,
      requirement: i.requirement ?? '',
      isApplicable: i.isApplicable ?? true,
      applicabilityNote: i.applicabilityNote ?? '',
      esgChairApproval: {
        committeeId: null,
        boardMemberId: null,
        name: '',
        email: '',
        decision: EsgApprovalDecision.PENDING,
        notes: '',
        decidedAt: null,
        requestedAt: null,
        token: null,
        ...(i.esgChairApproval ?? {}),
      },
      boardChairApproval: {
        boardMemberId: null,
        name: '',
        email: '',
        decision: EsgApprovalDecision.PENDING,
        notes: '',
        decidedAt: null,
        requestedAt: null,
        ...(i.boardChairApproval ?? {}),
      },
    };
  }

  async coverageFor(tenantId: string, frameworkId: string) {
    const rows = await this.getIndicators(tenantId, frameworkId);
    return frameworkCoverage(rows);
  }

  async coverageForAll(tenantId: string) {
    const frameworks = await this.getAllFrameworks(tenantId, false);
    const out: Record<
      string,
      { signedOff: number; total: number; pct: number }
    > = {};
    for (const f of frameworks) {
      out[String(f._id)] = await this.coverageFor(tenantId, String(f._id));
    }
    return out;
  }

  async addIndicator(
    tenantId: string,
    frameworkId: string,
    dto: CreateIndicatorDto,
  ) {
    await this.getRawFramework(tenantId, frameworkId); // 404s if framework doesn't belong to tenant
    const created = await this.indicatorModel.create({
      tenantId: new Types.ObjectId(tenantId),
      frameworkId,
      code: dto.code,
      title: dto.title,
      owner: dto.owner ?? 'Unassigned',
      response: '',
      evidence: [],
      status: IndicatorStatus.NOT_STARTED,
      signedOffBy: null,
      signedOffAt: null,
    });
    return created.toObject();
  }

  private async getRawIndicator(tenantId: string, id: string) {
    const i = await this.indicatorModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!i) throw new NotFoundException('Indicator not found');
    return i;
  }

  async updateResponse(
    tenantId: string,
    id: string,
    dto: UpdateIndicatorResponseDto,
  ) {
    const i = await this.getRawIndicator(tenantId, id);
    i.response = dto.response;
    if (i.status === IndicatorStatus.NOT_STARTED) {
      i.status = IndicatorStatus.IN_PROGRESS;
    }
    await i.save();
    return i.toObject();
  }

  async addEvidence(
    tenantId: string,
    id: string,
    files: Express.Multer.File[],
  ) {
    const i = await this.getRawIndicator(tenantId, id);
    for (const file of files) {
      i.evidence.push({
        name: file.originalname,
        fileUrl: `/uploads/esg/indicators/${file.filename}`,
        mimeType: file.mimetype,
        size: file.size,
      } as any);
    }
    if (i.status === IndicatorStatus.NOT_STARTED) {
      i.status = IndicatorStatus.IN_PROGRESS;
    }
    await i.save();
    return i.toObject();
  }

  async submitForSignOff(tenantId: string, id: string) {
    const i = await this.getRawIndicator(tenantId, id);
    if (!i.response.trim()) {
      throw new BadRequestException('Add a response before submitting');
    }
    i.status = IndicatorStatus.AWAITING_SIGN_OFF;
    await i.save();
    return i.toObject();
  }

  async signOff(tenantId: string, id: string, signedOffBy: string) {
    const i = await this.getRawIndicator(tenantId, id);
    i.status = IndicatorStatus.SIGNED_OFF;
    i.signedOffBy = signedOffBy;
    i.signedOffAt = new Date();
    await i.save();
    return i.toObject();
  }

  // ── Applicability & Requirement ─────────────────────────────
  // Tenant-editable, same as `response` — not derived from any fixed
  // catalog, since frameworks/indicators here are seeded starting
  // points the tenant owns from then on (see STANDARD_FRAMEWORKS).

  async updateApplicability(
    tenantId: string,
    id: string,
    dto: UpdateIndicatorApplicabilityDto,
  ) {
    const i = await this.getRawIndicator(tenantId, id);
    i.isApplicable = dto.isApplicable;
    i.applicabilityNote = dto.applicabilityNote ?? '';
    await i.save();
    return i.toObject();
  }

  async updateRequirement(
    tenantId: string,
    id: string,
    dto: UpdateIndicatorRequirementDto,
  ) {
    const i = await this.getRawIndicator(tenantId, id);
    i.requirement = dto.requirement;
    await i.save();
    return i.toObject();
  }

  // ── Two-party approval chain ────────────────────────────────
  // ESG Committee Chair signs externally (emailed token, mirrors
  // PolicyService#openBoardApprovalRound — they have no portal
  // login). Board Chair signs in-app via the board portal (mirrors
  // GovernanceCodeService#getPendingForBoardMember/decideBoardApproval
  // — they're already an authenticated BoardPortalController caller).
  // The Board Chair's row is hard-gated server-side on the ESG
  // Committee Chair's row already being Approved — "one cannot sign
  // if the other hasn't[, yet]" from the PO's own framing.

  async sendForApproval(
    tenantId: string,
    id: string,
    dto: SendForEsgApprovalDto,
  ) {
    const i = await this.getRawIndicator(tenantId, id);
    if (!i.response.trim()) {
      throw new BadRequestException(
        'Add a disclosure response before sending for approval.',
      );
    }

    const committee = await this.committeeService.getById(
      tenantId,
      dto.committeeId,
    );
    const chairMember = committee.members.find(
      (m) => m.role === CommitteeMemberRole.CHAIR,
    );
    if (!chairMember) {
      throw new BadRequestException(
        `"${committee.name}" has no Chair assigned yet — assign one under Governance → Committees before sending for approval.`,
      );
    }

    const boardChair = await this.boardMemberService.getCurrentChair(tenantId);
    if (!boardChair) {
      throw new BadRequestException(
        'No active Board Chair is set — assign a director the "Chair" role under Board Management before sending for approval.',
      );
    }

    const now = new Date();
    i.esgChairApproval = {
      committeeId: committee._id,
      boardMemberId: chairMember.boardMemberId ?? null,
      name: chairMember.name,
      email: String(chairMember.email).toLowerCase(),
      decision: EsgApprovalDecision.PENDING,
      notes: '',
      decidedAt: null,
      requestedAt: now,
      token: randomBytes(24).toString('hex'),
    } as any;
    i.boardChairApproval = {
      boardMemberId: boardChair._id,
      name: boardChair.name,
      email: String(boardChair.email).toLowerCase(),
      decision: EsgApprovalDecision.PENDING,
      notes: '',
      decidedAt: null,
      requestedAt: now,
    } as any;
    i.status = IndicatorStatus.AWAITING_SIGN_OFF;
    i.markModified('esgChairApproval');
    i.markModified('boardChairApproval');
    await i.save();

    const businessName = await resolveBusinessName(this.userModel, tenantId);
    await this.emailService
      .sendPolicyForAcknowledgment({
        to: i.esgChairApproval.email,
        recipientName: i.esgChairApproval.name,
        policyTitle: `${i.code} — ${i.title}`,
        ackLink: `${process.env.TENANT_APP_URL}/esg-approve/${i.esgChairApproval.token}`,
        businessName,
      })
      .catch(() => {});
    // The Board Chair is notified now too, so they know it's coming —
    // but their own board-portal docket (getPendingForBoardChair)
    // only lists it once the ESG Committee Chair has actually
    // approved, so there's nothing for them to act on yet.
    await this.emailService
      .sendPolicyForAcknowledgment({
        to: i.boardChairApproval.email,
        recipientName: i.boardChairApproval.name,
        policyTitle: `${i.code} — ${i.title}`,
        ackLink: `${process.env.BOARD_APP_URL || 'http://localhost:8083'}/e-signing`,
        businessName,
      })
      .catch(() => {});

    return i.toObject();
  }

  // Public — the ESG Committee Chair's own emailed link.
  async getEsgChairApprovalSnapshot(token: string) {
    const i = await this.indicatorModel
      .findOne({ 'esgChairApproval.token': token })
      .lean();
    if (!i) throw new NotFoundException('This approval link is invalid.');
    const framework = await this.frameworkModel
      .findById((i as any).frameworkId)
      .select('label key')
      .lean();
    const n = this.normalizeIndicator(i);
    return {
      id: n._id,
      code: n.code,
      title: n.title,
      requirement: n.requirement,
      isApplicable: n.isApplicable,
      applicabilityNote: n.applicabilityNote,
      response: n.response,
      evidence: n.evidence ?? [],
      frameworkLabel: framework?.label ?? '',
      myDecision: n.esgChairApproval.decision,
      myNotes: n.esgChairApproval.notes,
      myDecidedAt: n.esgChairApproval.decidedAt,
    };
  }

  async decideEsgChairApproval(token: string, dto: DecideEsgChairApprovalDto) {
    const i = await this.indicatorModel.findOne({
      'esgChairApproval.token': token,
    });
    if (!i) throw new NotFoundException('This approval link is invalid.');
    if (i.esgChairApproval.decision !== EsgApprovalDecision.PENDING) {
      throw new BadRequestException('This approval has already been recorded.');
    }

    i.esgChairApproval.decision = dto.decision;
    i.esgChairApproval.notes = dto.notes ?? '';
    i.esgChairApproval.decidedAt = new Date();
    i.markModified('esgChairApproval');

    if (dto.decision === EsgApprovalDecision.DECLINED) {
      i.status = IndicatorStatus.IN_PROGRESS;
      await i.save();
      return i.toObject();
    }

    await i.save();
    return i.toObject();
  }

  // ── Board Portal — the signed-in Board Chair's own view ──────

  async getPendingForBoardChair(userId: string) {
    const { boardMemberId, tenantId } =
      await this.boardMemberService.resolveBoardMember(userId);
    const rows = await this.indicatorModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        'boardChairApproval.boardMemberId': new Types.ObjectId(boardMemberId),
        // Only ever offered once the ESG Committee Chair has signed —
        // belt-and-suspenders alongside the server-side gate in
        // decideBoardChairApproval below.
        'esgChairApproval.decision': EsgApprovalDecision.APPROVED,
      })
      .sort({ updatedAt: -1 })
      .lean();

    const frameworkIds = [
      ...new Set(rows.map((r: any) => String(r.frameworkId))),
    ];
    const frameworks = await this.frameworkModel
      .find({ _id: { $in: frameworkIds } })
      .select('label')
      .lean();
    const labelFor = (id: any) =>
      frameworks.find((f) => String(f._id) === String(id))?.label ?? '';

    return rows.map((r: any) => {
      const n = this.normalizeIndicator(r);
      return {
        id: n._id,
        code: n.code,
        title: n.title,
        requirement: n.requirement,
        response: n.response,
        evidence: n.evidence ?? [],
        frameworkLabel: labelFor(n.frameworkId),
        esgChairDecidedAt: n.esgChairApproval.decidedAt,
        esgChairName: n.esgChairApproval.name,
        myDecision: n.boardChairApproval.decision,
        myNotes: n.boardChairApproval.notes,
        myDecidedAt: n.boardChairApproval.decidedAt,
      };
    });
  }

  async decideBoardChairApproval(
    userId: string,
    id: string,
    dto: DecideBoardChairApprovalDto,
  ) {
    const { boardMemberId, tenantId } =
      await this.boardMemberService.resolveBoardMember(userId);
    const i = await this.getRawIndicator(tenantId, id);
    if (
      !i.boardChairApproval.boardMemberId ||
      i.boardChairApproval.boardMemberId.toString() !== boardMemberId
    ) {
      throw new ForbiddenException(
        'You have not been asked to approve this disclosure.',
      );
    }
    if (i.esgChairApproval.decision !== EsgApprovalDecision.APPROVED) {
      throw new BadRequestException(
        'The ESG Committee Chair has not reviewed this disclosure yet.',
      );
    }
    if (i.boardChairApproval.decision !== EsgApprovalDecision.PENDING) {
      throw new BadRequestException('This approval has already been recorded.');
    }

    i.boardChairApproval.decision = dto.decision;
    i.boardChairApproval.notes = dto.notes ?? '';
    i.boardChairApproval.decidedAt = new Date();
    i.markModified('boardChairApproval');

    if (dto.decision === EsgApprovalDecision.DECLINED) {
      i.status = IndicatorStatus.IN_PROGRESS;
      await i.save();
      return i.toObject();
    }

    i.status = IndicatorStatus.SIGNED_OFF;
    i.signedOffBy = i.boardChairApproval.name;
    i.signedOffAt = i.boardChairApproval.decidedAt;
    await i.save();
    return i.toObject();
  }

  // ── Reports ──────────────────────────────────────────────────

  async getReports(tenantId: string) {
    return this.reportModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async compile(tenantId: string, frameworkId: string, dto: CompileReportDto) {
    const framework = await this.getRawFramework(tenantId, frameworkId);
    const indicators = await this.getIndicators(tenantId, frameworkId);
    const pending = indicators.filter(
      (i) => i.status !== IndicatorStatus.SIGNED_OFF,
    );
    const period = dto.period ?? String(new Date().getFullYear());

    const created = await this.reportModel.create({
      tenantId: new Types.ObjectId(tenantId),
      frameworkId,
      title: `${framework.label} Report ${period}`,
      period,
      status: EsgReportStatus.COMPILED,
      compiledAt: new Date(),
      publishedAt: null,
      note: `Auto-assembled from ${indicators.length} indicators (${indicators.length - pending.length} signed off).`,
    });
    return {
      report: created.toObject(),
      pendingCount: pending.length,
    };
  }

  async publish(tenantId: string, id: string) {
    const r = await this.reportModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      { $set: { status: EsgReportStatus.PUBLISHED, publishedAt: new Date() } },
      { new: true },
    );
    if (!r) throw new NotFoundException('Report not found');
    return r.toObject();
  }
}
