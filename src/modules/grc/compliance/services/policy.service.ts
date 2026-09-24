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
} from '../schemas';
import {
  Employee,
  EmployeeDocument,
  EmploymentStatus,
} from 'src/modules/hr/schemas/employee.schema';
import {
  CreatePolicyDto,
  UpdatePolicyPropertiesDto,
  UpsertSectionDto,
  PublishPolicyDto,
  AddPolicyCommentDto,
  UploadPolicyDto,
  SubmitBoardAckDto,
} from '../dtos';
import { BoardMemberService } from 'src/modules/grc/governance/services';
import { EmailService } from 'src/common/utils/mailing/email.service';

// Starter section sets for the common templates the "New policy or
// procedure" dialog offers — a small, generic scaffold to write
// into, not a substitute for the tenant's actual policy text.
const STARTER_SECTIONS = [
  'Purpose and scope',
  'Regulatory framework',
  'Definitions',
  'Roles and responsibilities',
  'Review and amendment',
];

@Injectable()
export class PolicyService {
  constructor(
    @InjectModel(Policy.name) private readonly model: Model<PolicyDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
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

  private async roster(tenantId: string, requirement: AckRequirement) {
    if (requirement === AckRequirement.NONE) return [];
    // "Department heads only" / "Specific roles" are tracked as a
    // scoping choice on the policy, but assignment still resolves to
    // the tenant's active roster — a tenant this size manages that
    // distinction by who they publish to, not a separate org chart
    // query here.
    return this.employeeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        employmentStatus: {
          $nin: [EmploymentStatus.TERMINATED, EmploymentStatus.RESIGNED],
        },
      })
      .select('firstName lastName email jobTitle')
      .sort({ firstName: 1 })
      .lean();
  }

  private async withComputedFields(tenantId: string, p: any) {
    const roster = await this.roster(tenantId, p.acknowledgementRequirement);
    const ackByEmail = new Map(
      (p.acknowledgments ?? []).map((a: any) => [a.email, a]),
    );
    const rosterStatus = roster.map((e: any) => {
      const ack: any = ackByEmail.get(e.email.toLowerCase());
      const current = !!ack && ack.version === p.version;
      return {
        name: `${e.firstName} ${e.lastName}`,
        role: e.jobTitle || '',
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
    return {
      ...p,
      computedOverdue: this.isOverdue(p.nextReviewDue),
      assignedCount,
      acknowledgedCount,
      ackRate: assignedCount
        ? Math.round((acknowledgedCount / assignedCount) * 100)
        : null,
      rosterStatus,
    };
  }

  // ── New in-app editor flow ──────────────────────────────────

  async create(tenantId: string, dto: CreatePolicyDto) {
    const tId = new Types.ObjectId(tenantId);
    const category = dto.category?.trim() || 'Uncategorised';
    const prefix =
      category
        .split(/\s+/)[0]
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 3)
        .toUpperCase() || 'POL';
    const count = await this.model.countDocuments({ tenantId: tId });
    const documentReference = `POL-${prefix}-${String(count + 1).padStart(3, '0')}`;

    const isCustom = !dto.template || dto.template === 'Custom policy';
    const sections = isCustom
      ? []
      : STARTER_SECTIONS.map((title, i) => ({
          id: `s${i + 1}`,
          title,
          content: '',
          order: i,
        }));

    return this.model.create({
      tenantId: tId,
      title: dto.title,
      category,
      type: PolicyType.ORGANISATION,
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
      sections,
      approvalHistory: [],
      comments: [],
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
  // cycle. Publishing (below) is the only action that bumps the
  // version and appends to approval history.
  async setStatus(tenantId: string, id: string, status: PolicyStatus) {
    const p = await this.getRawDoc(tenantId, id);
    p.status = status;
    await p.save();
    return p;
  }

  // approvedByName resolved server-side from the logged-in user —
  // matches every other real-attribution field in this module.
  async publish(
    tenantId: string,
    id: string,
    dto: PublishPolicyDto,
    approvedByName: string,
  ) {
    const p = await this.getRawDoc(tenantId, id);
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
      approvedBy: approvedByName || p.approvalAuthority || 'Unattributed',
      date: new Date(),
      notes: dto.notes ?? '',
    } as any);
    p.markModified('approvalHistory');
    await p.save();
    return p;
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

  // Emails every roster member who has not acknowledged the current
  // version — "Send reminders to outstanding".
  async sendReminders(tenantId: string, id: string, businessName: string) {
    const p = await this.getRawDoc(tenantId, id);
    const detail = await this.withComputedFields(tenantId, p.toObject());
    const outstanding = detail.rosterStatus.filter(
      (r: any) => r.status === 'Outstanding',
    );
    await Promise.all(
      outstanding.map((r: any) =>
        this.emailService
          .sendPolicyForAcknowledgment({
            to: r.email,
            recipientName: r.name,
            policyTitle: p.title,
            ackLink: `${process.env.TENANT_APP_URL}/grc/compliance/policies/${p._id}`,
            businessName,
          })
          .catch(() => {}),
      ),
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
