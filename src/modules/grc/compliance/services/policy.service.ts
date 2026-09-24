import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import {
  Policy,
  PolicyDocument,
  PolicyType,
  PolicyStatus,
  ReviewFrequency,
  AckRequirement,
  BoardApprovalDecision,
} from '../schemas';
import {
  Employee,
  EmployeeDocument,
  EmploymentStatus,
} from 'src/modules/hr/schemas/employee.schema';
import {
  PolicyTemplate,
  PolicyTemplateDocument,
  PolicyTemplateStatus,
} from 'src/modules/super_admin/schemas/policy-template.schema';
import {
  CreatePolicyDto,
  UpdatePolicyPropertiesDto,
  UpsertSectionDto,
  PublishPolicyDto,
  DecideBoardApprovalDto,
  AddPolicyCommentDto,
  UploadPolicyDto,
  SubmitBoardAckDto,
} from '../dtos';
import { BoardMemberService } from 'src/modules/grc/governance/services';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';

interface RosterEntry {
  name: string;
  role: string;
  email: string;
  channel: 'employee' | 'board';
}

@Injectable()
export class PolicyService {
  constructor(
    @InjectModel(Policy.name) private readonly model: Model<PolicyDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(PolicyTemplate.name)
    private readonly templateModel: Model<PolicyTemplateDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly boardMemberService: BoardMemberService,
    private readonly emailService: EmailService,
  ) {}

  // ── helpers ──────────────────────────────────────────────────

  private nextDueAfter(from: Date, freq: ReviewFrequency): Date {
    const d = new Date(from);
    if (freq === ReviewFrequency.QUARTERLY) d.setMonth(d.getMonth() + 3);
    else if (freq === ReviewFrequency.SEMI_ANNUAL) d.setMonth(d.getMonth() + 6);
    else if (freq === ReviewFrequency.BIENNIAL)
      d.setFullYear(d.getFullYear() + 2);
    else if (freq === ReviewFrequency.AD_HOC)
      d.setFullYear(d.getFullYear() + 1);
    else d.setFullYear(d.getFullYear() + 1); // Annual
    return d;
  }

  private isOverdue(nextReviewDue: Date | null): boolean {
    if (!nextReviewDue) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(nextReviewDue);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < now.getTime();
  }

  // The acknowledgement audience: ORGANISATION reaches active
  // employees (per acknowledgementRequirement) *and* the whole
  // board; BOARD reaches only the board. "No acknowledgement
  // required" empties the roster regardless of type.
  private async roster(
    tenantId: string,
    type: PolicyType,
    requirement: AckRequirement,
  ): Promise<RosterEntry[]> {
    if (requirement === AckRequirement.NONE) return [];

    const boardMembers = await this.boardMemberService.getAll(tenantId);
    const boardEntries: RosterEntry[] = (boardMembers as any[])
      .filter((b) => b.isActive)
      .map((b) => ({
        name: b.name,
        role: b.role,
        email: String(b.email).toLowerCase(),
        channel: 'board',
      }));

    if (type === PolicyType.BOARD) return boardEntries;

    // "Department heads only" / "Specific roles" are tracked as a
    // scoping choice on the policy, but assignment still resolves to
    // the tenant's active employee roster — a tenant this size
    // manages that distinction by who they publish to, not a
    // separate org chart query here.
    const employees = await this.employeeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        employmentStatus: {
          $nin: [EmploymentStatus.TERMINATED, EmploymentStatus.RESIGNED],
        },
      })
      .select('firstName lastName email jobTitle')
      .sort({ firstName: 1 })
      .lean();
    const employeeEntries: RosterEntry[] = employees.map((e: any) => ({
      name: `${e.firstName} ${e.lastName}`,
      role: e.jobTitle || '',
      email: String(e.email).toLowerCase(),
      channel: 'employee',
    }));

    return [...employeeEntries, ...boardEntries];
  }

  private async withComputedFields(tenantId: string, p: any) {
    const roster = await this.roster(
      tenantId,
      p.type,
      p.acknowledgementRequirement,
    );
    const ackByEmail = new Map(
      (p.acknowledgments ?? []).map((a: any) => [a.email, a]),
    );
    const rosterStatus = roster.map((e) => {
      const ack: any = ackByEmail.get(e.email);
      const current = !!ack && ack.version === p.version;
      return {
        name: e.name,
        role: e.role,
        email: e.email,
        versionAcknowledged: current ? ack.version : null,
        dateAcknowledged: current ? ack.ackedAt : null,
        method: current
          ? ack.source === 'employee'
            ? 'In-app'
            : 'Email link'
          : null,
        status: current ? 'Acknowledged' : 'Outstanding',
      };
    });
    const assignedCount = roster.length;
    const acknowledgedCount = rosterStatus.filter(
      (r) => r.status === 'Acknowledged',
    ).length;

    const boardApprovalSummary = p.boardApprovalRequired
      ? {
          total: (p.boardApprovals ?? []).length,
          approved: (p.boardApprovals ?? []).filter(
            (r: any) => r.decision === BoardApprovalDecision.APPROVED,
          ).length,
          rejected: (p.boardApprovals ?? []).filter(
            (r: any) => r.decision === BoardApprovalDecision.REJECTED,
          ).length,
          pending: (p.boardApprovals ?? []).filter(
            (r: any) => r.decision === BoardApprovalDecision.PENDING,
          ).length,
          rows: (p.boardApprovals ?? []).map((r: any) => ({
            name: r.name,
            email: r.email,
            decision: r.decision,
            notes: r.notes,
            decidedAt: r.decidedAt,
            requestedAt: r.requestedAt,
          })),
        }
      : null;

    return {
      ...p,
      computedOverdue: this.isOverdue(p.nextReviewDue),
      assignedCount,
      acknowledgedCount,
      ackRate: assignedCount
        ? Math.round((acknowledgedCount / assignedCount) * 100)
        : null,
      rosterStatus,
      boardApprovalSummary,
    };
  }

  // ── New in-app editor flow ──────────────────────────────────

  async create(tenantId: string, dto: CreatePolicyDto) {
    const tId = new Types.ObjectId(tenantId);

    let template: PolicyTemplateDocument | null = null;
    if (dto.templateId && Types.ObjectId.isValid(dto.templateId)) {
      template = await this.templateModel.findOne({
        _id: dto.templateId,
        status: PolicyTemplateStatus.PUBLISHED,
      });
    }

    const category =
      dto.category?.trim() || template?.category || 'Uncategorised';
    const prefix =
      category
        .split(/\s+/)[0]
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 3)
        .toUpperCase() || 'POL';
    const count = await this.model.countDocuments({ tenantId: tId });
    const documentReference = `POL-${prefix}-${String(count + 1).padStart(3, '0')}`;

    const sections = template
      ? template.sections.map((s, i) => ({
          id: `s${i + 1}`,
          title: s.title,
          content: s.content ?? '',
          order: i,
        }))
      : [];

    return this.model.create({
      tenantId: tId,
      title: dto.title,
      category,
      type: dto.type ?? PolicyType.ORGANISATION,
      status: PolicyStatus.DRAFT,
      version: 'v1',
      documentReference,
      owner: dto.owner ?? '',
      approvalAuthority: dto.approvalAuthority ?? '',
      reviewFrequency: dto.reviewFrequency ?? ReviewFrequency.ANNUAL,
      acknowledgementRequirement:
        dto.acknowledgementRequirement ?? AckRequirement.ALL_STAFF,
      description: dto.description ?? '',
      linkedRegulationsOrStandards: dto.linkedRegulationsOrStandards
        ? dto.linkedRegulationsOrStandards
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      boardApprovalRequired: dto.boardApprovalRequired ?? false,
      templateId: template?._id ?? null,
      sections,
      approvalHistory: [],
      comments: [],
      boardApprovals: [],
      acknowledgments: [],
      ackTokens: [],
    });
  }

  async getAll(tenantId: string) {
    const policies = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
    return Promise.all(
      policies.map((p) => this.withComputedFields(tenantId, p)),
    );
  }

  async getStats(tenantId: string) {
    const all = await this.getAll(tenantId);
    const published = all.filter((p) => p.status === 'Published').length;
    const draft = all.filter((p) => p.status === 'Draft').length;
    const underReview = all.filter((p) => p.status === 'Under review').length;
    const overdue = all.filter((p) => p.computedOverdue);
    const withRoster = all.filter((p) => p.assignedCount > 0);
    const avgAck = withRoster.length
      ? Math.round(
          withRoster.reduce((s, p) => s + (p.ackRate ?? 0), 0) /
            withRoster.length,
        )
      : 0;

    const gaps = new Map<string, string>(); // email -> name
    all.forEach((p) => {
      p.rosterStatus.forEach((r: any) => {
        if (r.status === 'Outstanding') gaps.set(r.email, r.name);
      });
    });

    return {
      totalPolicies: all.length,
      published,
      draft,
      underReview,
      overdueCount: overdue.length,
      overdueTitles: overdue.map((p) => p.title),
      avgAcknowledgement: avgAck,
      staffWithGaps: gaps.size,
    };
  }

  // Flat cross-policy acknowledgement roster — feeds the main page's
  // "Export acknowledgement report" (the frontend turns this into a
  // CSV; nothing here is Lexora-specific enough to warrant a
  // server-generated file).
  async getRosterReport(tenantId: string) {
    const all = await this.getAll(tenantId);
    const rows: {
      policyTitle: string;
      policyReference: string;
      staffName: string;
      role: string;
      status: string;
      versionAcknowledged: string | null;
      dateAcknowledged: string | null;
    }[] = [];
    all.forEach((p) => {
      p.rosterStatus.forEach((r: any) => {
        rows.push({
          policyTitle: p.title,
          policyReference: p.documentReference,
          staffName: r.name,
          role: r.role,
          status: r.status,
          versionAcknowledged: r.versionAcknowledged,
          dateAcknowledged: r.dateAcknowledged,
        });
      });
    });
    return rows;
  }

  private async getRawDoc(
    tenantId: string,
    id: string,
  ): Promise<PolicyDocument> {
    const p = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!p) throw new NotFoundException('Policy not found');
    return p;
  }

  async getOne(tenantId: string, id: string) {
    const p = await this.getRawDoc(tenantId, id);
    return this.withComputedFields(tenantId, p.toObject());
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const deleted = await this.model.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Policy not found');
  }

  async updateProperties(
    tenantId: string,
    id: string,
    dto: UpdatePolicyPropertiesDto,
  ) {
    const p = await this.getRawDoc(tenantId, id);
    if (dto.title !== undefined) p.title = dto.title;
    if (dto.category !== undefined) p.category = dto.category;
    if (dto.documentReference !== undefined)
      p.documentReference = dto.documentReference;
    if (dto.effectiveDate !== undefined)
      p.effectiveDate = new Date(dto.effectiveDate);
    if (dto.supersedes !== undefined) p.supersedes = dto.supersedes;
    if (dto.relatedPolicies !== undefined)
      p.relatedPolicies = dto.relatedPolicies;
    if (dto.owner !== undefined) p.owner = dto.owner;
    if (dto.approvalAuthority !== undefined)
      p.approvalAuthority = dto.approvalAuthority;
    if (dto.reviewFrequency !== undefined)
      p.reviewFrequency = dto.reviewFrequency;
    if (dto.acknowledgementRequirement !== undefined)
      p.acknowledgementRequirement = dto.acknowledgementRequirement;
    if (dto.description !== undefined) p.description = dto.description;
    if (dto.linkedRegulationsOrStandards !== undefined)
      p.linkedRegulationsOrStandards = dto.linkedRegulationsOrStandards;
    if (dto.type !== undefined) p.type = dto.type;
    if (dto.boardApprovalRequired !== undefined)
      p.boardApprovalRequired = dto.boardApprovalRequired;
    await p.save();
    return p;
  }

  async addSection(tenantId: string, id: string, dto: UpsertSectionDto) {
    const p = await this.getRawDoc(tenantId, id);
    p.sections.push({
      id: `s${Date.now().toString(36)}`,
      title: dto.title || 'Untitled section',
      content: dto.content ?? '',
      order: p.sections.length,
    } as any);
    p.markModified('sections');
    await p.save();
    return p;
  }

  async updateSection(
    tenantId: string,
    id: string,
    sectionId: string,
    dto: UpsertSectionDto,
  ) {
    const p = await this.getRawDoc(tenantId, id);
    const section = p.sections.find((s) => s.id === sectionId);
    if (!section) throw new NotFoundException('Section not found');
    if (dto.title !== undefined) section.title = dto.title;
    if (dto.content !== undefined) section.content = dto.content;
    p.markModified('sections');
    await p.save();
    return p;
  }

  async deleteSection(tenantId: string, id: string, sectionId: string) {
    const p = await this.getRawDoc(tenantId, id);
    p.sections = p.sections.filter((s) => s.id !== sectionId) as any;
    p.markModified('sections');
    await p.save();
    return p;
  }

  // Draft <-> Under review — kicking off (or resuming) a review
  // cycle. Approving (below) is the only action that bumps the
  // version and appends to approval history.
  async setStatus(tenantId: string, id: string, status: PolicyStatus) {
    const p = await this.getRawDoc(tenantId, id);
    p.status = status;
    await p.save();
    return p;
  }

  // ── Approval (tenant, and — when required — the board) ─────────

  // approvedByName resolved server-side from the logged-in user —
  // matches every other real-attribution field in this module. When
  // the policy doesn't require board sign-off this behaves exactly
  // like the old single-step "publish"; when it does, it records the
  // tenant's approval, opens board approval requests, and leaves
  // publishing to decideBoardApproval once everyone has signed off.
  async approve(
    tenantId: string,
    id: string,
    dto: PublishPolicyDto,
    approvedByName: string,
  ) {
    const p = await this.getRawDoc(tenantId, id);
    const businessName = await resolveBusinessName(this.userModel, tenantId);

    if (p.boardApprovalRequired) {
      p.tenantApprovedBy = approvedByName || 'Unattributed';
      p.tenantApprovedAt = new Date();
      p.tenantApprovalNotes = dto.notes ?? '';
      p.status = PolicyStatus.PENDING_BOARD_APPROVAL;
      await this.openBoardApprovalRound(tenantId, p, businessName);
      return p;
    }

    return this.finalizePublish(
      tenantId,
      p,
      approvedByName || p.approvalAuthority || 'Unattributed',
      dto.notes ?? '',
      businessName,
    );
  }

  private async openBoardApprovalRound(
    tenantId: string,
    p: PolicyDocument,
    businessName: string,
  ) {
    const boardMembers = await this.boardMemberService.getAll(tenantId);
    const active = (boardMembers as any[]).filter((b) => b.isActive);
    if (!active.length) {
      throw new BadRequestException(
        'This policy requires board approval, but the tenant has no active board members to ask. Add board members under Board Management first.',
      );
    }
    p.boardApprovals = active.map(
      (b) =>
        ({
          boardMemberId: b._id,
          name: b.name,
          email: String(b.email).toLowerCase(),
          token: randomBytes(24).toString('hex'),
          decision: BoardApprovalDecision.PENDING,
          notes: '',
          decidedAt: null,
          requestedAt: new Date(),
        }) as any,
    );
    p.markModified('boardApprovals');
    await p.save();

    await Promise.all(
      p.boardApprovals.map((row) =>
        this.emailService
          .sendPolicyForAcknowledgment({
            to: row.email,
            recipientName: row.name,
            policyTitle: p.title,
            ackLink: `${process.env.TENANT_APP_URL}/policy-approval/${row.token}`,
            businessName,
          })
          .catch(() => {}),
      ),
    );
  }

  private async finalizePublish(
    tenantId: string,
    p: PolicyDocument,
    approvedByName: string,
    notes: string,
    businessName: string,
  ) {
    const wasPublishedBefore = p.approvalHistory.length > 0;
    const nextVersion = wasPublishedBefore
      ? `v${p.approvalHistory.length + 1}`
      : 'v1';

    p.version = nextVersion;
    p.status = PolicyStatus.PUBLISHED;
    p.lastReviewed = new Date();
    p.nextReviewDue = this.nextDueAfter(new Date(), p.reviewFrequency);
    p.approvalHistory.push({
      version: nextVersion,
      approvedBy: approvedByName,
      date: new Date(),
      notes,
    } as any);
    p.markModified('approvalHistory');
    await this.ensureBoardAckTokens(tenantId, p, businessName);
    await p.save();
    return p;
  }

  // Makes sure every board member currently in the acknowledgement
  // audience has a standing ack token, and notifies them the
  // document is ready to acknowledge — mirrors the legacy
  // uploadDocument flow, now reused for the editor-published path
  // for both BOARD and ORGANISATION policies.
  private async ensureBoardAckTokens(
    tenantId: string,
    p: PolicyDocument,
    businessName: string,
  ) {
    const roster = await this.roster(
      tenantId,
      p.type,
      p.acknowledgementRequirement,
    );
    const boardEntries = roster.filter((r) => r.channel === 'board');
    if (!boardEntries.length) return;

    const existingByEmail = new Map(
      p.ackTokens.map((t) => [t.recipientEmail, t]),
    );
    const toNotify: { email: string; name: string; token: string }[] = [];
    boardEntries.forEach((b) => {
      let row = existingByEmail.get(b.email);
      if (!row) {
        row = {
          token: randomBytes(24).toString('hex'),
          recipientEmail: b.email,
          recipientName: b.name,
          createdAt: new Date(),
        } as any;
        p.ackTokens.push(row as any);
        existingByEmail.set(b.email, row!);
      }
      toNotify.push({ email: b.email, name: b.name, token: row!.token });
    });
    p.markModified('ackTokens');

    await Promise.all(
      toNotify.map(({ email, name, token }) =>
        this.emailService
          .sendPolicyForAcknowledgment({
            to: email,
            recipientName: name,
            policyTitle: p.title,
            ackLink: `${process.env.TENANT_APP_URL}/policy-ack/${token}`,
            businessName,
          })
          .catch(() => {}),
      ),
    );
  }

  // Public — a board member approving or rejecting via their emailed
  // link. Rejecting sends the policy back to Under review (with a
  // system comment recording why); once every assigned board member
  // has approved, this finishes the publish the tenant started.
  async decideBoardApproval(token: string, dto: DecideBoardApprovalDto) {
    const p = await this.model.findOne({ 'boardApprovals.token': token });
    if (!p) throw new NotFoundException('This approval link is invalid.');
    const row = p.boardApprovals.find((r) => r.token === token);
    if (!row) throw new NotFoundException('This approval link is invalid.');
    if (row.decision !== BoardApprovalDecision.PENDING) {
      throw new BadRequestException('This approval has already been recorded.');
    }

    row.decision = dto.decision;
    row.notes = dto.notes ?? '';
    row.decidedAt = new Date();
    p.markModified('boardApprovals');

    if (dto.decision === BoardApprovalDecision.REJECTED) {
      p.status = PolicyStatus.UNDER_REVIEW;
      p.comments.push({
        id: `c${Date.now().toString(36)}`,
        author: row.name,
        authorRole: 'Board',
        date: new Date(),
        content: row.notes
          ? `Declined board approval: ${row.notes}`
          : 'Declined board approval.',
        parentId: null,
      } as any);
      p.markModified('comments');
      await p.save();
      return { success: true, outcome: 'rejected' as const };
    }

    const allApproved = p.boardApprovals.every(
      (r) => r.decision === BoardApprovalDecision.APPROVED,
    );
    if (allApproved) {
      const tenantId = p.tenantId.toString();
      const businessName = await resolveBusinessName(this.userModel, tenantId);
      await this.finalizePublish(
        tenantId,
        p,
        p.tenantApprovedBy || 'Unattributed',
        p.tenantApprovalNotes,
        businessName,
      );
      return { success: true, outcome: 'published' as const };
    }

    await p.save();
    return { success: true, outcome: 'pending' as const };
  }

  async getBoardApprovalSnapshot(token: string) {
    const policy = await this.model
      .findOne({ 'boardApprovals.token': token })
      .lean();
    if (!policy) throw new NotFoundException('This approval link is invalid.');
    const row = (policy.boardApprovals as any[]).find((r) => r.token === token);
    return {
      title: policy.title,
      category: policy.category,
      description: policy.description,
      version: policy.version,
      sections: policy.sections ?? [],
      fileName: policy.fileName,
      fileUrl: policy.fileUrl,
      mimeType: policy.mimeType,
      prefillName: row.name,
      decision: row.decision,
      notes: row.notes,
      alreadyDecided: row.decision !== BoardApprovalDecision.PENDING,
    };
  }

  async sendBoardApprovalReminders(
    tenantId: string,
    id: string,
    businessName: string,
  ) {
    const p = await this.getRawDoc(tenantId, id);
    const outstanding = p.boardApprovals.filter(
      (r) => r.decision === BoardApprovalDecision.PENDING,
    );
    await Promise.all(
      outstanding.map((r) =>
        this.emailService
          .sendPolicyForAcknowledgment({
            to: r.email,
            recipientName: r.name,
            policyTitle: p.title,
            ackLink: `${process.env.TENANT_APP_URL}/policy-approval/${r.token}`,
            businessName,
          })
          .catch(() => {}),
      ),
    );
    return { remindersSent: outstanding.length };
  }

  async addComment(
    tenantId: string,
    id: string,
    dto: AddPolicyCommentDto,
    authorName: string,
    authorRole: string,
  ) {
    const p = await this.getRawDoc(tenantId, id);
    p.comments.push({
      id: `c${Date.now().toString(36)}`,
      author: authorName || 'You',
      authorRole: authorRole || '',
      date: new Date(),
      content: dto.content,
      parentId: dto.parentId ?? null,
    } as any);
    p.markModified('comments');
    await p.save();
    return p;
  }

  // Emails every roster member (employee or board) who has not
  // acknowledged the current version — "Send reminders to
  // outstanding". Employees are pointed at their in-app policy list;
  // board members reuse their standing ack-token link.
  async sendReminders(tenantId: string, id: string, businessName: string) {
    const p = await this.getRawDoc(tenantId, id);
    const roster = await this.roster(
      tenantId,
      p.type,
      p.acknowledgementRequirement,
    );
    const ackByEmail = new Map(p.acknowledgments.map((a) => [a.email, a]));
    const outstanding = roster.filter((r) => {
      const a = ackByEmail.get(r.email);
      return !(a && a.version === p.version);
    });
    const tokenByEmail = new Map(
      p.ackTokens.map((t) => [t.recipientEmail, t.token]),
    );

    await Promise.all(
      outstanding.map((r) => {
        const ackLink =
          r.channel === 'employee'
            ? `${process.env.TENANT_APP_URL}/my/policies`
            : tokenByEmail.has(r.email)
              ? `${process.env.TENANT_APP_URL}/policy-ack/${tokenByEmail.get(r.email)}`
              : null;
        if (!ackLink) return Promise.resolve();
        return this.emailService
          .sendPolicyForAcknowledgment({
            to: r.email,
            recipientName: r.name,
            policyTitle: p.title,
            ackLink,
            businessName,
          })
          .catch(() => {});
      }),
    );
    return { remindersSent: outstanding.length };
  }

  // ── Legacy single-file-upload flow ──────────────────────────

  async uploadDocument(
    tenantId: string,
    dto: UploadPolicyDto,
    file: Express.Multer.File,
    businessName: string,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const policy = await this.model.create({
      tenantId: tId,
      title: dto.title,
      category: dto.category ?? '',
      type: dto.type,
      status: PolicyStatus.PUBLISHED,
      fileName: file.originalname,
      fileUrl: `/uploads/grc/policies/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      acknowledgments: [],
      ackTokens: [],
    });

    if (dto.type === PolicyType.BOARD) {
      const boardMembers = await this.boardMemberService.getAll(tenantId);
      const tokens = boardMembers.map((m: any) => ({
        token: randomBytes(24).toString('hex'),
        recipientEmail: m.email.toLowerCase(),
        recipientName: m.name,
        createdAt: new Date(),
      }));
      policy.ackTokens = tokens as any;
      policy.markModified('ackTokens');
      await policy.save();

      await Promise.all(
        tokens.map((t) =>
          this.emailService
            .sendPolicyForAcknowledgment({
              to: t.recipientEmail,
              recipientName: t.recipientName,
              policyTitle: policy.title,
              ackLink: `${process.env.TENANT_APP_URL}/policy-ack/${t.token}`,
              businessName,
            })
            .catch(() => {}),
        ),
      );
    }

    return policy;
  }

  // Identity resolved server-side by the controller (real logged-in
  // user) — never trusted from the request body.
  async acknowledgeAsEmployee(
    tenantId: string,
    policyId: string,
    email: string,
    name: string,
    signature: string,
  ) {
    const policy = await this.getRawDoc(tenantId, policyId);
    if (policy.type !== PolicyType.ORGANISATION) {
      throw new BadRequestException(
        'Only organisation policies are acknowledged this way.',
      );
    }
    const normalizedEmail = email.toLowerCase();
    if (
      policy.acknowledgments.some(
        (a) => a.email === normalizedEmail && a.version === policy.version,
      )
    ) {
      throw new BadRequestException(
        'You have already acknowledged this version of the policy.',
      );
    }
    policy.acknowledgments.push({
      name,
      email: normalizedEmail,
      signature,
      ackedAt: new Date(),
      source: 'employee',
      version: policy.version,
    } as any);
    policy.markModified('acknowledgments');
    await policy.save();
    return policy;
  }

  // ── Public — board policy acknowledgment, no auth ─────────────

  async getAckSnapshot(token: string) {
    const policy = await this.model
      .findOne({ 'ackTokens.token': token })
      .lean();
    if (!policy)
      throw new NotFoundException('This acknowledgement link is invalid.');
    const tokenEntry = (policy.ackTokens as any[]).find(
      (t) => t.token === token,
    );
    const already = (policy.acknowledgments as any[]).some(
      (a) =>
        a.email === tokenEntry.recipientEmail && a.version === policy.version,
    );
    return {
      title: policy.title,
      category: policy.category,
      fileName: policy.fileName,
      fileUrl: policy.fileUrl,
      mimeType: policy.mimeType,
      sections: policy.sections ?? [],
      uploadedAt: (policy as any).createdAt,
      prefillName: tokenEntry.recipientName,
      alreadyAcknowledged: already,
    };
  }

  async submitBoardAck(token: string, dto: SubmitBoardAckDto) {
    const policy = await this.model.findOne({ 'ackTokens.token': token });
    if (!policy)
      throw new NotFoundException('This acknowledgement link is invalid.');
    const tokenEntry = policy.ackTokens.find((t) => t.token === token);
    if (!tokenEntry)
      throw new NotFoundException('This acknowledgement link is invalid.');
    if (
      policy.acknowledgments.some(
        (a) =>
          a.email === tokenEntry.recipientEmail && a.version === policy.version,
      )
    ) {
      throw new BadRequestException(
        'This policy has already been acknowledged.',
      );
    }
    policy.acknowledgments.push({
      name: dto.name || tokenEntry.recipientName,
      email: tokenEntry.recipientEmail,
      signature: dto.signature,
      ackedAt: new Date(),
      source: 'external',
      version: policy.version,
    } as any);
    policy.markModified('acknowledgments');
    await policy.save();
    return { success: true };
  }
}
