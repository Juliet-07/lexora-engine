import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import {
  BoardMember,
  BoardMemberDocument,
  BoardMemberLifecycleStatus,
  SUCCESSION_STAGE_DEFS,
  KNOWLEDGE_TRANSFER_CHECKLIST_DEFAULTS,
  ONBOARDING_CHECKLIST_DEFAULTS,
  OFFBOARDING_CHECKLIST_DEFAULTS,
} from '../schemas';
import {
  CreateBoardMemberDto,
  UpdateBoardMemberDto,
  RecordConflictDto,
  LogTrainingDto,
  AddSkillDto,
  UpdateRemunerationDto,
  SetCommitteesDto,
  UpdateAttendanceDto,
  AddOtherDirectorshipDto,
  InitiateSuccessionDto,
  UpdateSuccessionStageDto,
  UpdateRiskAssessmentDto,
  AddSuccessionCandidateDto,
  InitiateOffboardingDto,
} from '../dtos/index.dto';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { UserType, AccountStatus } from 'src/common/interfaces/user-role.enum';

const TERM_EXPIRING_WINDOW_DAYS = 180;

@Injectable()
export class BoardMemberService {
  constructor(
    @InjectModel(BoardMember.name)
    private readonly boardMemberModel: Model<BoardMemberDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
  ) {}

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const special = '@#$!';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    pass += special.charAt(Math.floor(Math.random() * special.length));
    pass += Math.floor(Math.random() * 9);
    return pass;
  }

  // ── Read-path status derivation — mirrors the compliance obligation
  // pattern: "Term expiring"/"Term expired" are never persisted, so
  // they're always correct against `termEnds` with no migration or
  // daily backfill needed. Onboarding/Active/Offboarded ARE persisted
  // (lifecycleStatus) because they reflect real workflow state, not a
  // pure function of a date.
  termStatus(member: {
    lifecycleStatus: BoardMemberLifecycleStatus;
    termEnds: Date;
  }): string {
    if (member.lifecycleStatus !== BoardMemberLifecycleStatus.ACTIVE) {
      return member.lifecycleStatus;
    }
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(member.termEnds);
    d.setHours(0, 0, 0, 0);
    const daysLeft = Math.round((d.getTime() - now.getTime()) / 86400000);
    if (daysLeft < 0) return 'Term expired';
    if (daysLeft <= TERM_EXPIRING_WINDOW_DAYS) return 'Term expiring';
    return BoardMemberLifecycleStatus.ACTIVE;
  }

  // ── Create ───────────────────────────────────────────────────

  async create(
    tenantId: string,
    dto: CreateBoardMemberDto,
    businessName: string,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const email = dto.email.toLowerCase();

    const emailTaken = await this.userModel.findOne({ email });
    if (emailTaken) {
      throw new ConflictException(
        'This email is already registered on the platform',
      );
    }

    // ── Create the board member's own login — a director is now a
    // first-class Lexora user (UserType.BOARD_MEMBER), even though the
    // dedicated board portal for them to sign into is still being
    // built separately. Creating the account now means nothing needs
    // to be backfilled once that portal ships.
    const tempPassword = this.generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    const [firstName, ...rest] = dto.name.trim().split(/\s+/);
    const lastName = rest.join(' ') || firstName;

    const user = await this.userModel.create({
      userType: UserType.BOARD_MEMBER,
      firstName: firstName || dto.name,
      lastName,
      email,
      password: hashedPassword,
      status: AccountStatus.ACTIVE,
      tenantId: tId,
      mustChangePassword: true,
    });

    const member = await this.boardMemberModel.create({
      tenantId: tId,
      name: dto.name,
      role: dto.role,
      email,
      appointedAt: new Date(dto.appointedAt),
      termEnds: new Date(dto.termEnds),
      bio: dto.bio ?? '',
      nationality: dto.nationality ?? '',
      idNumber: dto.idNumber ?? '',
      taxResidency: dto.taxResidency ?? '',
      otherDirectorships: dto.otherDirectorships ?? [],
      lifecycleStatus: BoardMemberLifecycleStatus.ONBOARDING,
      onboardingChecklist: ONBOARDING_CHECKLIST_DEFAULTS.map((label) => ({
        label,
        done: false,
        completedAt: null,
      })),
      conflicts: [],
      training: [],
      userId: user._id,
    });

    this.emailService
      .sendBoardMemberAppointed({
        to: member.email,
        memberName: member.name,
        role: member.role,
        businessName,
        appointedAt: member.appointedAt,
        termEnds: member.termEnds,
        tempPassword,
        loginUrl:
          process.env.BOARD_PORTAL_APP_URL || process.env.TENANT_APP_URL,
      })
      .catch(() => {});

    return member;
  }

  // ── Reads ────────────────────────────────────────────────────

  async getAll(tenantId: string) {
    const members = await this.boardMemberModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ appointedAt: -1 })
      .populate('successorId', 'name role')
      .populate('successionPlan.riskAssessment.interimSuccessorId', 'name role')
      .lean();
    return members.map((m) => ({
      ...m,
      termStatus: this.termStatus(m as any),
    }));
  }

  async getById(tenantId: string, id: string): Promise<BoardMemberDocument> {
    const member = await this.boardMemberModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!member) throw new NotFoundException('Board member not found');
    return member;
  }

  // The one place other GRC features (Meetings, once built) resolve
  // "who is the current board chair" — a query, not a stored pointer,
  // so there's a single source of truth as directors change over time.
  async getCurrentChair(tenantId: string): Promise<BoardMemberDocument | null> {
    return this.boardMemberModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      role: 'Chair',
      lifecycleStatus: { $ne: BoardMemberLifecycleStatus.OFFBOARDED },
    });
  }

  // ── Core fields ──────────────────────────────────────────────

  async setSuccessor(tenantId: string, id: string, successorId: string | null) {
    const member = await this.getById(tenantId, id);

    if (successorId) {
      if (successorId === id) {
        throw new BadRequestException(
          'A board member cannot be their own successor.',
        );
      }
      const exists = await this.boardMemberModel.exists({
        _id: successorId,
        tenantId: new Types.ObjectId(tenantId),
      });
      if (!exists) {
        throw new NotFoundException(
          'Selected successor is not a valid board member.',
        );
      }
      member.successorId = new Types.ObjectId(successorId);
    } else {
      member.successorId = null;
    }

    await member.save();
    return member;
  }

  async update(tenantId: string, id: string, dto: UpdateBoardMemberDto) {
    const member = await this.getById(tenantId, id);
    if (dto.name !== undefined) member.name = dto.name;
    if (dto.role !== undefined) member.role = dto.role;
    if (dto.email !== undefined) member.email = dto.email.toLowerCase();
    if (dto.termEnds !== undefined) member.termEnds = new Date(dto.termEnds);
    if (dto.bio !== undefined) member.bio = dto.bio;
    if (dto.nationality !== undefined) member.nationality = dto.nationality;
    if (dto.idNumber !== undefined) member.idNumber = dto.idNumber;
    if (dto.taxResidency !== undefined) member.taxResidency = dto.taxResidency;
    if (dto.lifecycleStatus !== undefined)
      member.lifecycleStatus = dto.lifecycleStatus;
    await member.save();
    return member;
  }

  // ── Conflicts ────────────────────────────────────────────────

  async recordConflict(tenantId: string, id: string, dto: RecordConflictDto) {
    const member = await this.getById(tenantId, id);
    member.conflicts.push({
      note: dto.note,
      disclosedAt: new Date(),
      type: dto.type,
      resolved: false,
    } as any);
    member.markModified('conflicts');
    await member.save();
    return member;
  }

  async resolveConflict(tenantId: string, id: string, index: number) {
    const member = await this.getById(tenantId, id);
    if (!member.conflicts[index]) {
      throw new NotFoundException('Conflict disclosure not found');
    }
    member.conflicts[index].resolved = true;
    member.markModified('conflicts');
    await member.save();
    return member;
  }

  // ── Training ─────────────────────────────────────────────────

  async logTraining(tenantId: string, id: string, dto: LogTrainingDto) {
    const member = await this.getById(tenantId, id);
    member.training.push({
      title: dto.title,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : new Date(),
      type: dto.type,
      provider: dto.provider ?? '',
      hours: dto.hours ?? 0,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    } as any);
    member.markModified('training');
    await member.save();
    return member;
  }

  // ── Skills ───────────────────────────────────────────────────

  async addSkill(tenantId: string, id: string, dto: AddSkillDto) {
    const member = await this.getById(tenantId, id);
    member.skills.push({
      name: dto.name,
      category: dto.category,
      level: dto.level,
      yearsExperience: dto.yearsExperience ?? 0,
      qualified: dto.qualified ?? true,
      notes: dto.notes ?? '',
    } as any);
    member.markModified('skills');
    await member.save();
    return member;
  }

  async removeSkill(tenantId: string, id: string, index: number) {
    const member = await this.getById(tenantId, id);
    member.skills.splice(index, 1);
    member.markModified('skills');
    await member.save();
    return member;
  }

  // ── Remuneration ─────────────────────────────────────────────

  async updateRemuneration(
    tenantId: string,
    id: string,
    dto: UpdateRemunerationDto,
  ) {
    const member = await this.getById(tenantId, id);
    if (dto.annualRetainer !== undefined)
      member.remuneration.annualRetainer = dto.annualRetainer;
    if (dto.committeeChairFee !== undefined)
      member.remuneration.committeeChairFee = dto.committeeChairFee;
    if (dto.meetingAttendanceFee !== undefined)
      member.remuneration.meetingAttendanceFee = dto.meetingAttendanceFee;
    if (dto.lastReviewedAt !== undefined)
      member.remuneration.lastReviewedAt = new Date(dto.lastReviewedAt);
    member.markModified('remuneration');
    await member.save();
    return member;
  }

  // ── Committees ───────────────────────────────────────────────

  async setCommittees(tenantId: string, id: string, dto: SetCommitteesDto) {
    const member = await this.getById(tenantId, id);
    member.committees = dto.committees.map((c) => ({
      name: c.name,
      isChair: c.isChair ?? false,
    })) as any;
    member.markModified('committees');
    await member.save();
    return member;
  }

  // ── Attendance ───────────────────────────────────────────────

  async updateAttendance(
    tenantId: string,
    id: string,
    dto: UpdateAttendanceDto,
  ) {
    const member = await this.getById(tenantId, id);
    member.attendancePercentage = dto.attendancePercentage;
    await member.save();
    return member;
  }

  // ── Other directorships ──────────────────────────────────────

  async addOtherDirectorship(
    tenantId: string,
    id: string,
    dto: AddOtherDirectorshipDto,
  ) {
    const member = await this.getById(tenantId, id);
    member.otherDirectorships.push(dto.value);
    member.markModified('otherDirectorships');
    await member.save();
    return member;
  }

  async removeOtherDirectorship(tenantId: string, id: string, index: number) {
    const member = await this.getById(tenantId, id);
    member.otherDirectorships.splice(index, 1);
    member.markModified('otherDirectorships');
    await member.save();
    return member;
  }

  // ── Documents ────────────────────────────────────────────────

  async addDocument(
    tenantId: string,
    id: string,
    file: Express.Multer.File,
    category: string | undefined,
    uploaderName: string,
  ) {
    const member = await this.getById(tenantId, id);
    member.documents.push({
      name: file.originalname,
      category: category || 'Governance Document',
      fileUrl: `/uploads/grc/board-members/documents/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
      uploadedBy: uploaderName || 'Unassigned',
      signedAt: null,
    } as any);
    member.markModified('documents');
    await member.save();
    return member;
  }

  async removeDocument(tenantId: string, id: string, index: number) {
    const member = await this.getById(tenantId, id);
    member.documents.splice(index, 1);
    member.markModified('documents');
    await member.save();
    return member;
  }

  // ── Onboarding ───────────────────────────────────────────────

  async toggleOnboardingItem(tenantId: string, id: string, index: number) {
    const member = await this.getById(tenantId, id);
    const item = member.onboardingChecklist[index];
    if (!item) throw new NotFoundException('Onboarding item not found');
    item.done = !item.done;
    item.completedAt = item.done ? new Date() : null;
    member.markModified('onboardingChecklist');

    // Auto-graduate out of "Onboarding" once every item is checked —
    // matches the reference prototype's induction checklist behaviour.
    const allDone = member.onboardingChecklist.every((i) => i.done);
    if (
      allDone &&
      member.lifecycleStatus === BoardMemberLifecycleStatus.ONBOARDING
    ) {
      member.lifecycleStatus = BoardMemberLifecycleStatus.ACTIVE;
    } else if (
      !allDone &&
      member.lifecycleStatus === BoardMemberLifecycleStatus.ACTIVE
    ) {
      member.lifecycleStatus = BoardMemberLifecycleStatus.ONBOARDING;
    }

    await member.save();
    return member;
  }

  // ── Succession planning ──────────────────────────────────────

  async initiateSuccession(
    tenantId: string,
    id: string,
    dto: InitiateSuccessionDto,
  ) {
    const member = await this.getById(tenantId, id);
    const count = await this.boardMemberModel.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
      successionPlan: { $ne: null },
    });
    member.successionPlan = {
      reference: `SP-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`,
      triggerType: dto.triggerType ?? 'Term expiry (12 months out)',
      triggeredAt: new Date(),
      triggeredBy: dto.triggeredBy ?? '',
      stages: SUCCESSION_STAGE_DEFS.map((s, i) => ({
        name: s.name,
        status: i === 0 ? ('In progress' as any) : ('Pending' as any),
        notes: '',
        completedAt: null,
      })),
      riskAssessment: {
        criticality: '',
        skillsAtRisk: [],
        committeeRolesAtRisk: [],
        regulatoryImpact: '',
        diversityImpact: '',
        institutionalKnowledgeRating: '',
        internalCandidates: 0,
        externalCandidates: 0,
        timeToReplaceEstimate: '',
        interimSuccessorId: null,
        interimNotes: '',
      },
      candidates: [],
      knowledgeTransferChecklist: KNOWLEDGE_TRANSFER_CHECKLIST_DEFAULTS.map(
        (label) => ({ label, done: false, completedAt: null }),
      ),
    } as any;
    member.markModified('successionPlan');
    await member.save();
    return member;
  }

  private requireSuccessionPlan(member: BoardMemberDocument) {
    if (!member.successionPlan) {
      throw new BadRequestException(
        'No succession plan exists for this director yet — start one first.',
      );
    }
    return member.successionPlan;
  }

  async updateSuccessionStage(
    tenantId: string,
    id: string,
    dto: UpdateSuccessionStageDto,
  ) {
    const member = await this.getById(tenantId, id);
    const plan = this.requireSuccessionPlan(member);
    const stage = plan.stages.find((s) => s.name === dto.stageName);
    if (!stage) throw new NotFoundException('Succession stage not found');
    stage.status = dto.status as any;
    if (dto.notes !== undefined) stage.notes = dto.notes;
    if (dto.status === ('Done' as any)) stage.completedAt = new Date();
    member.markModified('successionPlan');
    await member.save();
    return member;
  }

  async updateRiskAssessment(
    tenantId: string,
    id: string,
    dto: UpdateRiskAssessmentDto,
  ) {
    const member = await this.getById(tenantId, id);
    const plan = this.requireSuccessionPlan(member);
    const ra = plan.riskAssessment;
    if (dto.criticality !== undefined) ra.criticality = dto.criticality;
    if (dto.skillsAtRisk !== undefined) ra.skillsAtRisk = dto.skillsAtRisk;
    if (dto.committeeRolesAtRisk !== undefined)
      ra.committeeRolesAtRisk = dto.committeeRolesAtRisk;
    if (dto.regulatoryImpact !== undefined)
      ra.regulatoryImpact = dto.regulatoryImpact;
    if (dto.diversityImpact !== undefined)
      ra.diversityImpact = dto.diversityImpact;
    if (dto.institutionalKnowledgeRating !== undefined)
      ra.institutionalKnowledgeRating = dto.institutionalKnowledgeRating;
    if (dto.internalCandidates !== undefined)
      ra.internalCandidates = dto.internalCandidates;
    if (dto.externalCandidates !== undefined)
      ra.externalCandidates = dto.externalCandidates;
    if (dto.timeToReplaceEstimate !== undefined)
      ra.timeToReplaceEstimate = dto.timeToReplaceEstimate;
    if (dto.interimSuccessorId !== undefined) {
      ra.interimSuccessorId = dto.interimSuccessorId
        ? new Types.ObjectId(dto.interimSuccessorId)
        : null;
    }
    if (dto.interimNotes !== undefined) ra.interimNotes = dto.interimNotes;
    member.markModified('successionPlan');
    await member.save();
    return member;
  }

  async addSuccessionCandidate(
    tenantId: string,
    id: string,
    dto: AddSuccessionCandidateDto,
  ) {
    const member = await this.getById(tenantId, id);
    const plan = this.requireSuccessionPlan(member);
    plan.candidates.push({
      name: dto.name,
      source: dto.source ?? '',
      skillsMatch: dto.skillsMatch ?? [],
      bnrPreCleared: dto.bnrPreCleared ?? false,
      availability: dto.availability ?? '',
      assessmentStatus: dto.assessmentStatus ?? 'Identified',
    } as any);
    member.markModified('successionPlan');
    await member.save();
    return member;
  }

  async removeSuccessionCandidate(tenantId: string, id: string, index: number) {
    const member = await this.getById(tenantId, id);
    const plan = this.requireSuccessionPlan(member);
    plan.candidates.splice(index, 1);
    member.markModified('successionPlan');
    await member.save();
    return member;
  }

  async toggleKnowledgeTransferItem(
    tenantId: string,
    id: string,
    index: number,
  ) {
    const member = await this.getById(tenantId, id);
    const plan = this.requireSuccessionPlan(member);
    const item = plan.knowledgeTransferChecklist[index];
    if (!item) throw new NotFoundException('Checklist item not found');
    item.done = !item.done;
    item.completedAt = item.done ? new Date() : null;
    member.markModified('successionPlan');
    await member.save();
    return member;
  }

  // ── Offboarding ──────────────────────────────────────────────

  async initiateOffboarding(
    tenantId: string,
    id: string,
    dto: InitiateOffboardingDto,
  ) {
    const member = await this.getById(tenantId, id);
    member.offboarding = {
      reason: dto.reason,
      effectiveDate: new Date(dto.effectiveDate),
      notes: dto.notes ?? '',
      checklist: OFFBOARDING_CHECKLIST_DEFAULTS.map((label) => ({
        label,
        done: false,
        completedAt: null,
      })),
      initiatedAt: new Date(),
    } as any;
    member.lifecycleStatus = BoardMemberLifecycleStatus.OFFBOARDED;
    member.markModified('offboarding');
    await member.save();
    return member;
  }

  async toggleOffboardingItem(tenantId: string, id: string, index: number) {
    const member = await this.getById(tenantId, id);
    if (!member.offboarding) {
      throw new BadRequestException(
        'No offboarding process has been initiated for this director.',
      );
    }
    const item = member.offboarding.checklist[index];
    if (!item) throw new NotFoundException('Offboarding item not found');
    item.done = !item.done;
    item.completedAt = item.done ? new Date() : null;
    member.markModified('offboarding');
    await member.save();
    return member;
  }

  // ── Delete ───────────────────────────────────────────────────

  async delete(tenantId: string, id: string): Promise<void> {
    const deleted = await this.boardMemberModel.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Board member not found');
  }
}
