import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { OnEvent } from '@nestjs/event-emitter';
import {
  BoardMember,
  BoardMemberDocument,
  BoardMemberLifecycleStatus,
  BoardOnboardingStageId,
  SUCCESSION_STAGE_DEFS,
  KNOWLEDGE_TRANSFER_CHECKLIST_DEFAULTS,
  ONBOARDING_CHECKLIST_DEFAULTS,
  OFFBOARDING_CHECKLIST_DEFAULTS,
} from '../schemas';
import {
  CreateBoardMemberDto,
  CreateBoardMemberWithContractDto,
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
import {
  ToolContract,
  ToolContractDocument_,
  ContractType,
  ContractStage,
  SignatureStatus,
  TenantContractTemplate,
  TenantContractTemplateDocument,
  type ContractMergeField,
} from 'src/modules/crm/tools/schemas';
import { PlatformContractTemplateService } from 'src/modules/super_admin/services/contract-template.service';
import {
  renderContractBody,
  formatScopeOfWorkList,
} from 'src/common/utils/contract-fields.util';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';

const TERM_EXPIRING_WINDOW_DAYS = 180;

@Injectable()
export class BoardMemberService {
  constructor(
    @InjectModel(BoardMember.name)
    private readonly boardMemberModel: Model<BoardMemberDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    // ── Direct model injection, not a ContractService import ───────
    // GovernanceModule cannot import ToolsModule: ToolsModule already
    // imports ComplianceModule, which imports GovernanceModule —
    // importing ToolsModule here would close that cycle. Registering
    // these two schemas directly (governance.module.ts) creates no
    // module dependency edge, so the appointment-letter contract is
    // generated with a small, local copy of
    // ContractService.generateFromTemplate's logic instead. Sending
    // it for signature and countersigning it, however, both happen
    // through the ordinary, unmodified ToolContract endpoints
    // (ContractController) — no circularity risk there since those
    // aren't reached through GovernanceModule at all.
    @InjectModel(ToolContract.name)
    private readonly toolContractModel: Model<ToolContractDocument_>,
    @InjectModel(TenantContractTemplate.name)
    private readonly tenantTemplateModel: Model<TenantContractTemplateDocument>,
    private readonly platformTemplateService: PlatformContractTemplateService,
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
      onboardingChecklist: ONBOARDING_CHECKLIST_DEFAULTS.map((d) => ({
        label: d.label,
        stageId: d.stageId,
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

  // ── Create with appointment contract (the real, current flow) ──
  // Mirrors TenantClientsService.createClientWithContract exactly:
  // the director's own login and their appointment-letter contract
  // are created together, atomically. If contract generation fails
  // for any reason, the just-created user is rolled back — a board
  // member is never left behind without a contract already generated
  // for them to sign. Credentials stay unusable (placeholder
  // password, PENDING) until the appointment letter is actually
  // countersigned — see onAppointmentContractCountersigned below.
  async createWithContract(
    tenantId: string,
    dto: CreateBoardMemberWithContractDto,
    addedBy: string,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const email = dto.email.toLowerCase();

    const emailTaken = await this.userModel.findOne({ email });
    if (emailTaken) {
      throw new ConflictException(
        'This email is already registered on the platform',
      );
    }

    const [firstName, ...rest] = dto.name.trim().split(/\s+/);
    const lastName = rest.join(' ') || firstName;

    // Real, genuinely unusable placeholder — nobody can log in with
    // this. A real password is only ever set once, by
    // onAppointmentContractCountersigned below.
    const placeholderPassword = await bcrypt.hash(
      `placeholder-${Date.now()}-${Math.random()}`,
      12,
    );

    const user = await this.userModel.create({
      userType: UserType.BOARD_MEMBER,
      firstName: firstName || dto.name,
      lastName,
      email,
      password: placeholderPassword,
      status: AccountStatus.PENDING,
      tenantId: tId,
      createdBy: new Types.ObjectId(addedBy),
      mustChangePassword: true,
    });

    try {
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
        onboardingChecklist: ONBOARDING_CHECKLIST_DEFAULTS.map((d) => ({
          label: d.label,
          stageId: d.stageId,
          done: false,
          completedAt: null,
        })),
        conflicts: [],
        training: [],
        userId: user._id,
      });

      const contract = await this.generateAppointmentContract(
        tId,
        user._id,
        member,
        dto,
      );

      member.contractId = contract._id as any;
      await member.save();

      const obj = user.toObject();
      delete (obj as any).password;
      return {
        success: true,
        message: 'Board member created and appointment letter generated.',
        data: obj,
        member,
        contract,
      };
    } catch (err) {
      // Real rollback — a board member is never left behind without
      // the appointment contract that was supposed to come with it.
      await this.userModel.deleteOne({ _id: user._id });
      await this.boardMemberModel.deleteOne({ userId: user._id });
      throw err;
    }
  }

  private async nextContractRef(tenantId: Types.ObjectId): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.toolContractModel.countDocuments({
      tenantId,
      ref: new RegExp(`^CTR-${year}-`),
    });
    return `CTR-${year}-${String(count + 1).padStart(2, '0')}`;
  }

  // A small, local copy of ContractService.generateFromTemplate,
  // scoped to what an appointment letter actually needs — see the
  // constructor comment for why this can't just call
  // ContractService directly. The counterparty is always the board
  // member themselves (a real, already-registered user by this
  // point), so this skips resolveCounterparty's client/vendor/
  // external-party branching entirely.
  private async generateAppointmentContract(
    tenantId: Types.ObjectId,
    boardMemberUserId: Types.ObjectId,
    member: BoardMemberDocument,
    dto: CreateBoardMemberWithContractDto,
  ): Promise<ToolContractDocument_> {
    let template: any;
    if (dto.templateSource === 'tenant') {
      template = await this.tenantTemplateModel
        .findOne({ _id: dto.templateId, tenantId })
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

    const businessName = await resolveBusinessName(
      this.userModel,
      String(tenantId),
    );

    const fields: Record<ContractMergeField, string> = {
      title: dto.contractTitle,
      counterpartyName: member.name,
      recipientName: member.name,
      recipientEmail: member.email,
      scopeOfWork: formatScopeOfWorkList(dto.scopeOfWork ?? ''),
      tenantCompanyName: businessName,
      contractValue: dto.value != null ? String(dto.value) : '',
      contractCurrency: dto.currency ?? 'USD',
      effectiveDate: new Date().toISOString().slice(0, 10),
      expiryDate: member.termEnds.toISOString().slice(0, 10),
      todayDate: new Date().toISOString().slice(0, 10),
      tenantCompanyJurisdiction: dto.tenantCompanyJurisdiction ?? '',
      clientJurisdiction: dto.clientJurisdiction ?? '',
      leadProfessionalName: dto.leadProfessionalName ?? '',
      leadProfessionalTitle: dto.leadProfessionalTitle ?? '',
      clientRepresentativeName: dto.clientRepresentativeName ?? '',
      clientRepresentativeTitle: dto.clientRepresentativeTitle ?? '',
      commencementDate: dto.commencementDate ?? '',
      engagementDuration: dto.engagementDuration ?? '',
      tenantRegisteredAddress: dto.tenantRegisteredAddress ?? '',
      clientRegisteredAddress: dto.clientRegisteredAddress ?? '',
      serviceCategory: dto.serviceCategory ?? '',
    };
    const renderedBody = renderContractBody(template.content, fields);

    const ref = await this.nextContractRef(tenantId);

    return this.toolContractModel.create({
      tenantId,
      ref,
      title: dto.contractTitle,
      counterparty: member.name,
      counterpartyEmail: member.email,
      type: ContractType.BOARD_APPOINTMENT,
      stage: ContractStage.DRAFT,
      value: dto.value ?? 0,
      currency: dto.currency ?? 'USD',
      scopeOfWork: dto.scopeOfWork ?? '',
      tenantCompanyJurisdiction: dto.tenantCompanyJurisdiction ?? '',
      clientJurisdiction: dto.clientJurisdiction ?? '',
      leadProfessionalName: dto.leadProfessionalName ?? '',
      leadProfessionalTitle: dto.leadProfessionalTitle ?? '',
      clientRepresentativeName: dto.clientRepresentativeName ?? '',
      clientRepresentativeTitle: dto.clientRepresentativeTitle ?? '',
      commencementDate: dto.commencementDate
        ? new Date(dto.commencementDate)
        : null,
      engagementDuration: dto.engagementDuration ?? '',
      tenantRegisteredAddress: dto.tenantRegisteredAddress ?? '',
      clientRegisteredAddress: dto.clientRegisteredAddress ?? '',
      serviceCategory: dto.serviceCategory ?? '',
      expiresOn: member.termEnds,
      autoRenew: false,
      owner: '',
      clientId: boardMemberUserId,
      vendorId: null,
      mandateId: null,
      mandateName: '',
      templateId: dto.templateSource === 'tenant' ? template._id : null,
      templateName: template.title,
      renderedBody,
      requiresSignature: true,
      signatureStatus: SignatureStatus.NOT_SENT,
      origin: 'board_onboarding',
    });
  }

  // Real, filtered list for the Board Management module's own
  // Contracting view — every appointment-letter contract actually
  // issued to a board member, by the real origin marker set at
  // generation time.
  async getOnboardingContracts(tenantId: string) {
    return this.toolContractModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        origin: 'board_onboarding',
      })
      .sort({ createdAt: -1 })
      .lean();
  }

  // ── Real activation on appointment-letter countersign ──────────
  // Reacts to the same 'client.document.countersigned' event
  // ContractService.countersign already emits for any clientId-linked
  // contract (crm/tools) — no change needed there. Gated to
  // UserType.BOARD_MEMBER so an unrelated client contract
  // countersigned around the same time never touches a board member,
  // and only ever activates one still genuinely PENDING.
  @OnEvent('client.document.countersigned')
  async onAppointmentContractCountersigned(e: {
    tenantId: string;
    clientUserId: string;
    contractId: string;
    title: string;
  }) {
    const user = await this.userModel.findById(e.clientUserId);
    if (!user || user.userType !== UserType.BOARD_MEMBER) return;
    if (user.status !== AccountStatus.PENDING) return;

    const member = await this.boardMemberModel.findOne({
      userId: user._id,
      tenantId: user.tenantId,
    });
    if (!member) return;

    const tempPassword = this.generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    user.password = hashedPassword;
    user.status = AccountStatus.ACTIVE;
    user.mustChangePassword = true;
    await user.save();

    // Auto-complete the one checklist item nobody self-services —
    // the appointment letter is exactly what was just countersigned.
    const acceptItem = member.onboardingChecklist.find(
      (i) => i.stageId === BoardOnboardingStageId.ACCEPT,
    );
    if (acceptItem && !acceptItem.done) {
      acceptItem.done = true;
      acceptItem.completedAt = new Date();
      member.markModified('onboardingChecklist');
      this.applyOnboardingGraduation(member);
      await member.save();
    }

    const businessName = await resolveBusinessName(this.userModel, e.tenantId);

    await this.emailService
      .sendBoardMemberAppointed({
        to: user.email,
        memberName: member.name,
        role: member.role,
        businessName,
        appointedAt: member.appointedAt,
        termEnds: member.termEnds,
        tempPassword,
        loginUrl: `${process.env.BOARD_APP_URL || 'http://localhost:8083'}/login`,
      })
      .catch(() => {});
  }

  // ── Reads ────────────────────────────────────────────────────

  // .lean() skips Mongoose's schema-default hydration, so a board
  // member created before this richer schema existed comes back with
  // the new fields simply absent (not even `[]`/`{}`) rather than
  // defaulted — the same gap hit earlier with audit-folders. Every
  // consumer (list view, director detail — both read off this same
  // getAll() result) calls .length/.map on these fields with no
  // guard, so normalize them here rather than requiring a migration.
  private normalize(m: any) {
    return {
      ...m,
      nationality: m.nationality ?? '',
      idNumber: m.idNumber ?? '',
      taxResidency: m.taxResidency ?? '',
      // A member from before lifecycle status existed was already an
      // established appointment, not mid-onboarding — default to
      // Active rather than Onboarding so they don't appear to
      // regress into a checklist they never had.
      lifecycleStatus: m.lifecycleStatus ?? BoardMemberLifecycleStatus.ACTIVE,
      committees: m.committees ?? [],
      attendancePercentage: m.attendancePercentage ?? 100,
      otherDirectorships: m.otherDirectorships ?? [],
      remuneration: {
        annualRetainer: m.remuneration?.annualRetainer ?? 0,
        committeeChairFee: m.remuneration?.committeeChairFee ?? 0,
        meetingAttendanceFee: m.remuneration?.meetingAttendanceFee ?? 0,
        lastReviewedAt: m.remuneration?.lastReviewedAt ?? null,
      },
      conflicts: (m.conflicts ?? []).map((c: any) => ({
        ...c,
        type: c.type ?? 'Standing',
        resolved: c.resolved ?? false,
      })),
      training: (m.training ?? []).map((t: any) => ({
        ...t,
        type: t.type ?? 'Mandatory',
        provider: t.provider ?? '',
        hours: t.hours ?? 0,
        expiresAt: t.expiresAt ?? null,
      })),
      skills: m.skills ?? [],
      documents: m.documents ?? [],
      onboardingChecklist: m.onboardingChecklist ?? [],
      successionPlan: m.successionPlan ?? null,
      offboarding: m.offboarding ?? null,
      userId: m.userId ?? null,
      contractId: m.contractId ?? null,
    };
  }

  async getAll(tenantId: string) {
    const members = await this.boardMemberModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ appointedAt: -1 })
      .populate('successorId', 'name role')
      .populate('successionPlan.riskAssessment.interimSuccessorId', 'name role')
      .lean();
    return members.map((m) => {
      const normalized = this.normalize(m);
      return { ...normalized, termStatus: this.termStatus(normalized as any) };
    });
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

  // Shared by the tenant-side toggle below, the self-service board
  // portal completion method, and the countersign listener — auto-
  // graduates out of "Onboarding" once every item is checked, and
  // regresses back if one is somehow unchecked again. Matches the
  // reference prototype's induction checklist behaviour. Caller is
  // responsible for markModified('onboardingChecklist') and save().
  private applyOnboardingGraduation(member: BoardMemberDocument) {
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
  }

  async toggleOnboardingItem(tenantId: string, id: string, index: number) {
    const member = await this.getById(tenantId, id);
    const item = member.onboardingChecklist[index];
    if (!item) throw new NotFoundException('Onboarding item not found');
    item.done = !item.done;
    item.completedAt = item.done ? new Date() : null;
    member.markModified('onboardingChecklist');
    this.applyOnboardingGraduation(member);
    await member.save();
    return member;
  }

  // ═══════════════════════════════════════════════════════════
  // BOARD PORTAL — self-service (the board member's own view of
  // their onboarding, reached via lexora-board, UserType.BOARD_MEMBER)
  // ═══════════════════════════════════════════════════════════

  private async getByUserId(userId: string): Promise<BoardMemberDocument> {
    const member = await this.boardMemberModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!member) {
      throw new NotFoundException('No board member record for this account');
    }
    return member;
  }

  async getMyProfile(userId: string) {
    const member = await this.getByUserId(userId);
    return {
      id: member._id,
      name: member.name,
      role: member.role,
      email: member.email,
      appointedAt: member.appointedAt,
      termEnds: member.termEnds,
      lifecycleStatus: member.lifecycleStatus,
    };
  }

  // Real onboarding state for the "My Onboarding" screen — the six
  // portal stages (BoardOnboardingStageId) plus the real checklist,
  // each item tagged with the stage it belongs to. No dummy/mock
  // data: a member fresh out of createWithContract genuinely has
  // every item undone except once their appointment letter is
  // countersigned (see onAppointmentContractCountersigned).
  async getMyOnboarding(userId: string) {
    const member = await this.getByUserId(userId);
    const checklist = member.onboardingChecklist;
    const done = checklist.filter((i) => i.done);
    const startedAt = member.appointedAt;
    const completedAt =
      member.lifecycleStatus === BoardMemberLifecycleStatus.ACTIVE
        ? (done
            .map((i) => i.completedAt)
            .filter(Boolean)
            .sort(
              (a, b) => new Date(b!).getTime() - new Date(a!).getTime(),
            )[0] ?? null)
        : null;
    return {
      lifecycleStatus: member.lifecycleStatus,
      checklist,
      totalItems: checklist.length,
      doneItems: done.length,
      startedAt,
      completedAt,
    };
  }

  // A board member can only ever mark an item DONE, never undone —
  // matches KYC onboarding's own self-service semantics (a client
  // can't un-submit a section either). The one "accept" item
  // (appointment letter) is intentionally excluded — it can only be
  // completed by actually countersigning the contract, which is a
  // different, already-existing flow (ContractController's
  // sign/countersign endpoints), not a checkbox.
  async completeMyOnboardingItem(userId: string, index: number) {
    const member = await this.getByUserId(userId);
    const item = member.onboardingChecklist[index];
    if (!item) throw new NotFoundException('Onboarding item not found');
    if (item.stageId === BoardOnboardingStageId.ACCEPT) {
      throw new BadRequestException(
        'This step is completed automatically once your appointment letter is countersigned.',
      );
    }
    if (item.done) return member;
    item.done = true;
    item.completedAt = new Date();
    member.markModified('onboardingChecklist');
    this.applyOnboardingGraduation(member);
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
