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
  BoardSignableDocument,
  SUCCESSION_STAGE_DEFS,
  KNOWLEDGE_TRANSFER_CHECKLIST_DEFAULTS,
  ONBOARDING_CHECKLIST_DEFAULTS,
  OFFBOARDING_CHECKLIST_DEFAULTS,
  GovernanceCode,
  GovernanceCodeDocument,
  GovernanceCodeStatus,
  GovernanceCodeCategory,
  BoardOnboardingTrainingModule,
  BoardOnboardingTrainingModuleDocument,
  TrainingType,
  GovernanceMeeting,
  GovernanceMeetingDocument,
  MeetingAudienceType,
} from '../schemas';
import {
  CreateBoardMemberDto,
  CreateBoardMemberWithContractDto,
  UpdateBoardMemberDto,
  RecordConflictDto,
  LogTrainingDto,
  AddSkillDto,
  UpdateRemunerationDto,
  UpdateAttendanceDto,
  AddOtherDirectorshipDto,
  InitiateSuccessionDto,
  UpdateSuccessionStageDto,
  UpdateRiskAssessmentDto,
  AddSuccessionCandidateDto,
  InitiateOffboardingDto,
  SubmitFitProperDto,
  SubmitDocumentsCoiDto,
  SubmitOnboardingTrainingDto,
  SubmitInductionDto,
  AddDocumentFolderDto,
  SetDocumentsToSignDto,
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
// Imported directly from its own file, not the services barrel — the
// barrel also re-exports this service, so importing it that way here
// would be a circular module reference. One-directional otherwise:
// CommitteeService only injects the BoardMember *model*, never this
// service, so there's no real dependency cycle, just an import-path
// one to avoid.
import { CommitteeService } from './committee.service';

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
    // Same module (governance.module.ts already registers this schema
    // for GovernanceCodeService), so no circularity risk injecting it
    // directly here — lets a director's documentsToSign be resolved
    // from the tenant's published Governance Codes without importing
    // GovernanceCodeService itself.
    @InjectModel(GovernanceCode.name)
    private readonly governanceCodeModel: Model<GovernanceCodeDocument>,
    // Same module (governance.module.ts registers this schema too), so
    // no circularity risk — lets Step 4's required-module list and
    // validation come from the tenant's own real training catalog
    // instead of the old fixed 3-item id list.
    @InjectModel(BoardOnboardingTrainingModule.name)
    private readonly trainingModuleModel: Model<BoardOnboardingTrainingModuleDocument>,
    // Same module (governance.module.ts registers this schema for
    // MeetingService too), so no circularity risk — lets the board
    // portal's own "Board of Directors" overview compute a director's
    // real board-meeting attendance from actual GovernanceMeeting
    // records instead of a manually-typed percentage (see
    // getBoardOverview below).
    @InjectModel(GovernanceMeeting.name)
    private readonly meetingModel: Model<GovernanceMeetingDocument>,
    private readonly platformTemplateService: PlatformContractTemplateService,
    private readonly emailService: EmailService,
    // Real committee ⇄ board member link — see committee.schema.ts.
    // Used to compute a director's actual committee memberships on
    // read (getAll/getByIdForDisplay) and to serve their own
    // "My Committees" board-portal view (getMyCommittees).
    private readonly committeeService: CommitteeService,
  ) {}

  // ── Resolve tenant-picked Governance Code ids into signable-document
  // snapshots (title/category/body/fileUrl/version) at the moment
  // they're assigned to a director — see BoardSignableDocument. Only
  // currently Published codes belonging to this tenant are eligible;
  // anything else in the list is silently dropped rather than
  // erroring, so a code someone unpublished between selection and
  // submission doesn't block appointing the director.
  private async resolveDocumentsToSign(
    tenantId: Types.ObjectId,
    documentIds: string[] | undefined,
  ): Promise<BoardSignableDocument[]> {
    if (!documentIds?.length) return [];
    const codes = await this.governanceCodeModel.find({
      _id: { $in: documentIds.map((id) => new Types.ObjectId(id)) },
      tenantId,
      status: GovernanceCodeStatus.PUBLISHED,
    });
    return codes.map(
      (c) =>
        ({
          title: c.title,
          category: c.category,
          sourceCodeId: c._id,
          body: c.body ?? '',
          fileUrl: c.documents?.[0]?.fileUrl ?? null,
          version: c.version,
        }) as any,
    );
  }

  // ── Gate: a director shouldn't be appointed into an onboarding
  // journey with nothing real to complete. Per explicit product
  // requirement, both a training catalog and a published Board
  // Charter must exist before a new director can be created — a
  // training-less Step 4 or a document-less Step 3 would otherwise
  // silently skip themselves ("nothing configured, nothing
  // required"), which is fine for later additions but not for the
  // very first director. Enforced here (both create paths) as well
  // as client-side on the New Director entry point, so this can never
  // be bypassed by calling the API directly.
  private async assertOnboardingPrerequisites(tenantId: Types.ObjectId) {
    const [trainingCount, hasBoardCharter] = await Promise.all([
      this.trainingModuleModel.countDocuments({ tenantId }),
      this.governanceCodeModel.exists({
        tenantId,
        category: GovernanceCodeCategory.BOARD_CHARTER,
        status: GovernanceCodeStatus.PUBLISHED,
      }),
    ]);
    const missing: string[] = [];
    if (!trainingCount) missing.push('at least one mandatory training module');
    if (!hasBoardCharter) missing.push('a published Board Charter');
    if (missing.length) {
      throw new BadRequestException(
        `Set up ${missing.join(' and ')} before appointing a director (Board Onboarding → Training Modules, and Governance → Codes).`,
      );
    }
  }

  // Dropped from ONBOARDING_CHECKLIST_DEFAULTS at the PO's request —
  // kept here (not just deleted from the defaults) so a board member
  // whose checklist was already seeded with one of these before this
  // change can have it pruned on next read, with no DB migration
  // needed. Same read-path-normalization pattern used throughout this
  // codebase for a schema/content change that already-existing data
  // predates (the reminder ladder, the isActive fix, etc.).
  private static readonly RETIRED_ONBOARDING_CHECKLIST_LABELS = [
    'Code of Conduct and Ethics signed',
    'Confidentiality and non-disclosure agreement signed',
  ];

  // Removes any retired checklist item still present on this member,
  // marking the document modified if it changed anything. Does not
  // save — callers that only read (getByUserId/getById) save it
  // themselves so the prune persists past this one request; callers
  // that go on to make their own changes fold it into their own save.
  private pruneRetiredChecklistItems(member: BoardMemberDocument): boolean {
    const before = member.onboardingChecklist.length;
    member.onboardingChecklist = member.onboardingChecklist.filter(
      (i) =>
        !BoardMemberService.RETIRED_ONBOARDING_CHECKLIST_LABELS.includes(
          i.label,
        ),
    ) as any;
    if (member.onboardingChecklist.length !== before) {
      member.markModified('onboardingChecklist');
      return true;
    }
    return false;
  }

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
    await this.assertOnboardingPrerequisites(tId);
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

    const documentsToSign = await this.resolveDocumentsToSign(
      tId,
      dto.documentIds,
    );

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
      documentsToSign,
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
    await this.assertOnboardingPrerequisites(tId);
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
      const documentsToSign = await this.resolveDocumentsToSign(
        tId,
        dto.documentIds,
      );

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
        documentsToSign,
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
      documents: (m.documents ?? []).map((d: any) => ({
        ...d,
        folder: d.folder ?? '',
      })),
      documentFolders: m.documentFolders ?? [],
      // `body` is new on this snapshot — a director assigned a
      // document before this round has none stored, so back it in
      // with an empty string rather than leaving it undefined.
      documentsToSign: (m.documentsToSign ?? []).map((d: any) => ({
        ...d,
        body: d.body ?? '',
      })),
      inductionPack: m.inductionPack ?? [],
      inductionAcknowledgement: m.inductionAcknowledgement
        ? {
            ...m.inductionAcknowledgement,
            acknowledgedDocumentIds:
              m.inductionAcknowledgement.acknowledgedDocumentIds ?? [],
          }
        : null,
      // Filters out the two retired items even before a member's own
      // document has been individually opened (and so actually
      // pruned+saved by getById/getByUserId) — display-only here,
      // since this read goes through .lean() and is never saved.
      onboardingChecklist: (m.onboardingChecklist ?? []).filter(
        (i: any) =>
          !BoardMemberService.RETIRED_ONBOARDING_CHECKLIST_LABELS.includes(
            i.label,
          ),
      ),
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
    const mapped = members.map((m) => {
      const normalized = this.normalize(m);
      return {
        ...normalized,
        termStatus: this.termStatus(normalized as any),
        // Real "active board member" flag — GovernanceCodeService and
        // PolicyService both already filter this list by `.isActive`
        // for their board-approval gates, but it was never actually
        // populated here, so every such filter silently saw zero
        // active members regardless of real board size (Board Charter
        // always bootstrap-published, every other category always
        // blocked). Fixed as part of this round's bootstrap-publish
        // work — "active" mirrors getCurrentChair()'s own definition.
        isActive:
          normalized.lifecycleStatus !== BoardMemberLifecycleStatus.OFFBOARDED,
      };
    });
    // Real committee memberships, replacing the stale stored/typed
    // `committees` field (see CommitteeMembership's schema comment) —
    // batched into one query rather than one per director.
    const membershipsMap = await this.committeeService.getMembershipsMap(
      tenantId,
      mapped.map((m) => m._id.toString()),
    );
    return mapped.map((m) => ({
      ...m,
      committees: membershipsMap.get(m._id.toString()) ?? [],
    }));
  }

  // A member's `accept` checklist item can only ever be completed by
  // onAppointmentContractCountersigned below (see requireStageDone's
  // caller in submitFitProper etc.) — so "accept not yet done" is
  // exactly "still waiting on the appointment letter to be signed",
  // and "accept done" is exactly "account activated, now filling in
  // the rest of onboarding themselves". Operates on the same plain,
  // normalize()'d shape getAll() already returns (not a Mongoose
  // document), so the two listing endpoints below can just filter
  // getAll()'s result rather than re-querying/re-normalizing.
  private acceptStageDone(m: {
    onboardingChecklist: { stageId: string | null; done: boolean }[];
  }): boolean {
    const items = m.onboardingChecklist.filter((i) => i.stageId === 'accept');
    return items.length > 0 && items.every((i) => i.done);
  }

  // ── Board Onboarding monitoring page — mirrors
  // TenantClientService#getPendingApprovals/getOnboardingInProgress
  // for Client KYC onboarding, per the PO's explicit ask to replicate
  // that flow here. Board membership has no pre-creation "not started"
  // state the way a client record does (a director isn't created
  // until the appointment wizard runs, at which point their contract
  // already exists) — so "awaiting appointment" is this feature's
  // equivalent of "Not Started": the contract has been generated but
  // not yet countersigned, so the account isn't active and nothing
  // else can happen yet. Both are tenant counts across the whole
  // board, not paginated — a board is a handful of directors, never
  // client-collection scale.
  async getAwaitingAppointment(tenantId: string) {
    const all = await this.getAll(tenantId);
    return all.filter(
      (m) =>
        m.lifecycleStatus === BoardMemberLifecycleStatus.ONBOARDING &&
        !this.acceptStageDone(m),
    );
  }

  async getOnboardingInProgress(tenantId: string) {
    const all = await this.getAll(tenantId);
    return all.filter(
      (m) =>
        m.lifecycleStatus === BoardMemberLifecycleStatus.ONBOARDING &&
        this.acceptStageDone(m),
    );
  }

  async getById(tenantId: string, id: string): Promise<BoardMemberDocument> {
    const member = await this.boardMemberModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!member) throw new NotFoundException('Board member not found');
    if (this.pruneRetiredChecklistItems(member)) {
      this.applyOnboardingGraduation(member);
      await member.save();
    }
    return member;
  }

  // What the controller's `GET :id` actually serves — getById() above
  // stays a real Mongoose document for every mutation method that
  // calls it internally, so this wraps it with the same real-committee
  // computation getAll() does, without touching the persisted document.
  async getByIdForDisplay(tenantId: string, id: string) {
    const member = await this.getById(tenantId, id);
    const committees = await this.committeeService.getMembershipsForBoardMember(
      tenantId,
      id,
    );
    return { ...member.toObject(), committees };
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
    const wasOffboarded =
      member.lifecycleStatus === BoardMemberLifecycleStatus.OFFBOARDED;
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

    // Same login gate as initiateOffboarding below — this is the other
    // path a director's lifecycleStatus can reach/leave Offboarded
    // from (a direct edit rather than the offboarding flow). Keep the
    // login in sync either direction: deactivated the moment they
    // become Offboarded here too, and restored if a tenant reverses
    // an offboarding by editing the status back off it.
    const isOffboarded =
      member.lifecycleStatus === BoardMemberLifecycleStatus.OFFBOARDED;
    if (member.userId && isOffboarded !== wasOffboarded) {
      await this.userModel.findByIdAndUpdate(member.userId, {
        status: isOffboarded ? AccountStatus.INACTIVE : AccountStatus.ACTIVE,
      });
    }

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

  // Committee membership is no longer set here — it's written from
  // the Committee side (CommitteeService.addMember/removeMember*),
  // triggered from either this director's own page or the committee's
  // own page, and read back here (getAll/getByIdForDisplay) rather
  // than stored on the board member at all. See committee.schema.ts.

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
    folder?: string,
  ) {
    const member = await this.getById(tenantId, id);
    let folderName = '';
    if (folder) {
      const f = member.documentFolders.find((fo: any) => fo.name === folder);
      if (!f) throw new BadRequestException('Unknown folder.');
      folderName = f.name;
    }
    member.documents.push({
      name: file.originalname,
      category: category || 'Governance Document',
      fileUrl: `/uploads/grc/board-members/documents/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
      uploadedBy: uploaderName || 'Unassigned',
      signedAt: null,
      folder: folderName,
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

  // ── Document folders — mirrors AuditService.addFolder/removeFolder
  // exactly: a folder is created up front, then picked (not retyped)
  // when uploading; BoardDocument.folder stores a name snapshot, so
  // removal is blocked while any document still references it. ──────

  async addDocumentFolder(
    tenantId: string,
    id: string,
    dto: AddDocumentFolderDto,
  ) {
    const member = await this.getById(tenantId, id);
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Folder name is required.');
    if (
      member.documentFolders.some(
        (f: any) => f.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      throw new BadRequestException('A folder with this name already exists.');
    }
    member.documentFolders.push({ name } as any);
    member.markModified('documentFolders');
    await member.save();
    return member;
  }

  async removeDocumentFolder(tenantId: string, id: string, folderId: string) {
    const member = await this.getById(tenantId, id);
    const folder = (member.documentFolders as any).id(folderId);
    if (!folder) throw new NotFoundException('Folder not found');
    const inUse = member.documents.some((d: any) => d.folder === folder.name);
    if (inUse) {
      throw new BadRequestException(
        `Cannot remove "${folder.name}" — it already has documents in it.`,
      );
    }
    member.documentFolders = member.documentFolders.filter(
      (f: any) => f._id.toString() !== folderId,
    ) as any;
    member.markModified('documentFolders');
    await member.save();
    return member;
  }

  // ── Documents to sign (Step 3 of onboarding) ────────────────────
  // Lets the tenant (re)configure which of their published Governance
  // Codes this director must sign, any time — not just at creation.

  async setDocumentsToSign(
    tenantId: string,
    id: string,
    dto: SetDocumentsToSignDto,
  ) {
    const member = await this.getById(tenantId, id);
    member.documentsToSign = (await this.resolveDocumentsToSign(
      new Types.ObjectId(tenantId),
      dto.documentIds,
    )) as any;
    member.markModified('documentsToSign');
    await member.save();
    return member;
  }

  // ── Induction pack (Step 5) — how the tenant actually sends it: by
  // uploading the real files here. They appear to the director in the
  // board portal's Step 5 as soon as they're uploaded, whenever that
  // is relative to the rest of onboarding; the director downloads and
  // then acknowledges receipt (submitInduction). ─────────────────────

  async addInductionPackItem(
    tenantId: string,
    id: string,
    file: Express.Multer.File,
    uploaderName: string,
  ) {
    const member = await this.getById(tenantId, id);
    member.inductionPack.push({
      name: file.originalname,
      fileUrl: `/uploads/grc/board-members/induction/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedBy: uploaderName || 'Unassigned',
    } as any);
    member.markModified('inductionPack');
    await member.save();
    return member;
  }

  async removeInductionPackItem(tenantId: string, id: string, index: number) {
    const member = await this.getById(tenantId, id);
    member.inductionPack.splice(index, 1);
    member.markModified('inductionPack');
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

  // Marks every onboardingChecklist item belonging to a given portal
  // stage as done — used by each real self-service submission below
  // (a stage is submitted as one action, e.g. "Submit documents &
  // declaration", not item-by-item). Caller still calls
  // applyOnboardingGraduation + save() itself afterward.
  private markStageDone(
    member: BoardMemberDocument,
    stageId: BoardOnboardingStageId,
  ) {
    let changed = false;
    for (const item of member.onboardingChecklist) {
      if (item.stageId === stageId && !item.done) {
        item.done = true;
        item.completedAt = new Date();
        changed = true;
      }
    }
    if (changed) member.markModified('onboardingChecklist');
  }

  private stageDone(
    member: BoardMemberDocument,
    stageId: BoardOnboardingStageId,
  ): boolean {
    const items = member.onboardingChecklist.filter(
      (i) => i.stageId === stageId,
    );
    return items.length > 0 && items.every((i) => i.done);
  }

  // Server-side step ordering — the reference build's own stepper
  // only lets the *current* step be edited (everything after is
  // "Locked"), so this enforces the same real gate here rather than
  // trusting the frontend to keep the user in order.
  private requireStageDone(
    member: BoardMemberDocument,
    stageId: BoardOnboardingStageId,
    whatComesFirst: string,
  ) {
    if (!this.stageDone(member, stageId)) {
      throw new BadRequestException(
        `Please ${whatComesFirst} before this step.`,
      );
    }
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
    if (this.pruneRetiredChecklistItems(member)) {
      this.applyOnboardingGraduation(member);
      await member.save();
    }
    return member;
  }

  // Small public resolver for other governance services that need to
  // scope a board-portal request to the caller's own board member
  // record and tenant — e.g. GovernanceCodeService.decideBoardApproval,
  // which (unlike this service's own onboarding endpoints) needs the
  // tenantId too since it queries the GovernanceCode collection
  // directly rather than through BoardMemberService. `name`/`email`
  // added for MeetingService's board-portal endpoints, which need the
  // caller's own identity to match against a meeting's attendees/
  // action-item assignees — never trusted from the request body.
  async resolveBoardMember(userId: string): Promise<{
    boardMemberId: string;
    tenantId: string;
    name: string;
    email: string;
  }> {
    const member = await this.getByUserId(userId);
    return {
      boardMemberId: member._id.toString(),
      tenantId: member.tenantId.toString(),
      name: member.name,
      email: member.email,
    };
  }

  // Board portal, self-service — "receive everything pertaining to
  // that committee... on their board portal": every real committee
  // this director belongs to, with its mandate, cadence, members
  // count, chair, and its own tasks.
  async getMyCommittees(userId: string) {
    const { boardMemberId, tenantId } = await this.resolveBoardMember(userId);
    return this.committeeService.getForBoardMemberPortal(
      tenantId,
      boardMemberId,
    );
  }

  async getMyProfile(userId: string) {
    const member = await this.getByUserId(userId);
    const tenantCompanyName = await resolveBusinessName(
      this.userModel,
      member.tenantId.toString(),
    );
    return {
      id: member._id,
      name: member.name,
      role: member.role,
      email: member.email,
      appointedAt: member.appointedAt,
      termEnds: member.termEnds,
      lifecycleStatus: member.lifecycleStatus,
      // Tenant-provided at creation time — surfaced here so the board
      // portal's own onboarding form can prefill Step 2 with these
      // instead of asking the director to retype what the tenant
      // already captured. Blank when the tenant genuinely left them
      // empty at creation.
      nationality: member.nationality ?? '',
      idNumber: member.idNumber ?? '',
      // The real tenant that appointed this director — the board
      // portal's onboarding questions/declarations reference this by
      // name instead of the platform's own name ("Lexora Africa"),
      // since the director is being onboarded by, and declaring to,
      // this specific tenant, not the platform itself.
      tenantCompanyName,
      // Real training/CPD log (tenant-logged manually, or pushed here
      // automatically as onboarding training modules are completed —
      // see submitOnboardingTraining) — surfaced so the board portal's
      // own dashboard can show real CPD hours instead of a fabricated
      // figure. Not paginated: a director's own log is never large.
      training: member.training ?? [],
    };
  }

  // Board portal, self-service — the "Board of Directors" overview
  // card on the My Committees page: this director's own role/status,
  // how many active board members the tenant currently has, their own
  // Board-meeting attendance (computed from real GovernanceMeeting
  // attendance records, not a manually-typed percentage — matches the
  // "computed over typed" convention used elsewhere in this module),
  // and the tenant's current published Board Charter (a Governance
  // Code with category = BOARD_CHARTER; there's no separate Board
  // Charter entity — see governance-code.schema.ts).
  async getBoardOverview(userId: string) {
    const member = await this.getByUserId(userId);
    const tenantId = member.tenantId;

    const [totalActiveMembers, charterCode, boardMeetings] = await Promise.all([
      this.boardMemberModel.countDocuments({
        tenantId,
        lifecycleStatus: BoardMemberLifecycleStatus.ACTIVE,
      }),
      this.governanceCodeModel
        .findOne({
          tenantId,
          category: GovernanceCodeCategory.BOARD_CHARTER,
          status: GovernanceCodeStatus.PUBLISHED,
        })
        .sort({ version: -1, updatedAt: -1 })
        .lean(),
      this.meetingModel
        .find({
          tenantId,
          type: MeetingAudienceType.BOARD,
          attendanceRecordedAt: { $ne: null },
        })
        .lean(),
    ]);

    // A meeting only counts toward this director's attendance if they
    // were actually invited to it (appear in its attendees list,
    // matched by email — the same identity attendees are recorded
    // under). "Present" is either the meeting-wide allPresent flag or
    // their own attendee index being in attendancePresentIndices.
    let eligible = 0;
    let present = 0;
    for (const meeting of boardMeetings) {
      const idx = (meeting.attendees ?? []).findIndex(
        (a) => a.email?.toLowerCase() === member.email.toLowerCase(),
      );
      if (idx === -1) continue;
      eligible += 1;
      const wasPresent = meeting.attendanceAllPresent
        ? true
        : (meeting.attendancePresentIndices ?? []).includes(idx);
      if (wasPresent) present += 1;
    }

    return {
      name: 'Board of Directors',
      role: member.role,
      status: member.lifecycleStatus,
      totalMembers: totalActiveMembers,
      attendance:
        eligible > 0
          ? {
              pct: Math.round((present / eligible) * 100),
              present,
              eligible,
            }
          : null,
      charter: charterCode
        ? {
            id: charterCode._id,
            title: charterCode.title,
            version: charterCode.version,
            body: charterCode.body,
            publishedAt: (charterCode as any).updatedAt ?? null,
          }
        : null,
    };
  }

  // The director's real induction pack (Step 5) — every entry in
  // BoardMember.documents (whichever tab the tenant uploaded it
  // through: "Documents" or the "Induction pack" card both write
  // there now), plus anything left over in the legacy `inductionPack`
  // array from before that unification. See the schema comments on
  // BoardDocument/InductionPackItem for why. Shape matches what the
  // board portal has always rendered here.
  private effectiveInductionPack(member: {
    documents: {
      _id?: any;
      name: string;
      fileUrl: string | null;
      mimeType: string | null;
      size: number;
      uploadedBy: string;
    }[];
    inductionPack: {
      _id?: any;
      name: string;
      fileUrl: string | null;
      mimeType: string | null;
      size: number;
      uploadedBy: string;
    }[];
  }) {
    const map = (d: any) => ({
      _id: d._id?.toString?.() ?? '',
      name: d.name,
      fileUrl: d.fileUrl,
      mimeType: d.mimeType,
      size: d.size,
      uploadedBy: d.uploadedBy,
    });
    return [
      ...(member.documents ?? []).map(map),
      ...(member.inductionPack ?? []).map(map),
    ];
  }

  // Real onboarding state for the "My Onboarding" screen — the real
  // checklist (each item tagged with the stage it belongs to) plus,
  // for each of the five real stages, whether it's done and — for the
  // four that collect real data — the actual submission on file, so a
  // reload shows what was really submitted rather than losing it to
  // browser-only state. No dummy/mock data: a member fresh out of
  // createWithContract genuinely has every item undone except once
  // their appointment letter is countersigned (see
  // onAppointmentContractCountersigned).
  async getMyOnboarding(userId: string) {
    const member = await this.getByUserId(userId);
    // Real, tenant-authored training modules (Step 4) — whatever the
    // tenant currently has configured, not a fixed reference list.
    const trainingModules = await this.trainingModuleModel
      .find({ tenantId: member.tenantId })
      .sort({ order: 1, createdAt: 1 })
      .lean();
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
      stages: {
        accept: { done: this.stageDone(member, BoardOnboardingStageId.ACCEPT) },
        fitProper: {
          done: this.stageDone(member, BoardOnboardingStageId.FIT_PROPER),
          submission: member.fitProperDeclaration ?? null,
        },
        documentsCoi: {
          done: this.stageDone(member, BoardOnboardingStageId.SIGN_DOCS),
          submission: member.documentsCoiDeclaration ?? null,
          // The real documents the tenant set up for this director to
          // sign (Board Charter, Code of Conduct, etc.) — empty if the
          // tenant hasn't configured any yet. See BoardSignableDocument.
          documents: member.documentsToSign ?? [],
        },
        training: {
          done: this.stageDone(member, BoardOnboardingStageId.TRAINING),
          completedModuleIds:
            member.onboardingTraining?.completedModuleIds ?? [],
          // The tenant's real mandatory-training catalog — empty until
          // the tenant creates modules under Board Training Modules.
          modules: trainingModules,
        },
        induction: {
          done: this.stageDone(member, BoardOnboardingStageId.INDUCTION),
          acknowledgement: member.inductionAcknowledgement ?? null,
          // The real induction pack the tenant has sent so far — see
          // effectiveInductionPack() for where this actually comes from
          // (documents + the legacy inductionPack array).
          pack: this.effectiveInductionPack(member as any),
        },
      },
    };
  }

  // ── Step 2 — Regulatory Fit & Proper declaration ────────────────
  async submitFitProper(userId: string, dto: SubmitFitProperDto) {
    const member = await this.getByUserId(userId);
    this.requireStageDone(
      member,
      BoardOnboardingStageId.ACCEPT,
      'accept your appointment letter',
    );
    member.fitProperDeclaration = {
      fullName: dto.fullName,
      dob: new Date(dto.dob),
      idNumber: dto.idNumber,
      nationality: dto.nationality,
      address: dto.address,
      directorships: dto.directorships ?? [],
      answers: dto.answers ?? [],
      referenceName: dto.referenceName ?? '',
      referenceRelationship: dto.referenceRelationship ?? '',
      referenceEmail: dto.referenceEmail ?? '',
      submittedAt: new Date(),
    } as any;
    this.markStageDone(member, BoardOnboardingStageId.FIT_PROPER);
    this.applyOnboardingGraduation(member);
    await member.save();
    return this.getMyOnboarding(userId);
  }

  // ── Step 3 — Documents & Conflict of Interest declaration ───────
  async submitDocumentsCoi(userId: string, dto: SubmitDocumentsCoiDto) {
    const member = await this.getByUserId(userId);
    this.requireStageDone(
      member,
      BoardOnboardingStageId.FIT_PROPER,
      'submit your Fit & Proper declaration',
    );
    // Required documents are whatever the tenant actually set up for
    // this director (BoardSignableDocument snapshots, assigned at
    // creation time or later via setDocumentsToSign) — not a fixed
    // list. A director with none configured has nothing blocking them
    // here, same as complaint #1's "unless the tenant didn't fill it
    // in" rule for prefilled fields.
    const requiredIds = (member.documentsToSign ?? []).map((d: any) =>
      d._id.toString(),
    );
    const missing = requiredIds.filter(
      (id) => !dto.signedDocumentIds.includes(id),
    );
    if (missing.length) {
      throw new BadRequestException(
        'All required governance documents must be signed first.',
      );
    }
    member.documentsCoiDeclaration = {
      signedDocumentIds: dto.signedDocumentIds,
      holdsOtherDirectorships: dto.holdsOtherDirectorships,
      currentDirectorships: dto.currentDirectorships ?? [],
      answers: dto.answers ?? [],
      submittedAt: new Date(),
    } as any;
    this.markStageDone(member, BoardOnboardingStageId.SIGN_DOCS);
    this.applyOnboardingGraduation(member);
    await member.save();
    // "Sign now" on a document here is the director's real signature
    // on the source Governance Code — the tenant previously had no
    // way to see that this happened at all. Recorded against every
    // signed document's sourceCodeId, not just markStageDone above.
    await this.recordCodeAcknowledgements(member, dto.signedDocumentIds);
    return this.getMyOnboarding(userId);
  }

  // Records (or, on resubmission, refreshes) a real acknowledgement
  // against each signed document's source Governance Code, keyed by
  // this board member so re-signing never creates a duplicate row.
  // Silently skips a document with no sourceCodeId (nothing to record
  // against) or whose source code no longer exists.
  private async recordCodeAcknowledgements(
    member: BoardMemberDocument,
    signedDocumentIds: string[],
  ) {
    const signed = new Set(signedDocumentIds);
    const codeIds = [
      ...new Set(
        (member.documentsToSign ?? [])
          .filter((d: any) => signed.has(d._id.toString()) && d.sourceCodeId)
          .map((d: any) => d.sourceCodeId.toString()),
      ),
    ];
    if (!codeIds.length) return;
    await Promise.all(
      codeIds.map(async (codeId) => {
        const code = await this.governanceCodeModel.findOne({
          _id: codeId,
          tenantId: member.tenantId,
        });
        if (!code) return;
        code.acknowledgedBy = (code.acknowledgedBy ?? []).filter(
          (a: any) => a.boardMemberId?.toString() !== member._id.toString(),
        );
        code.acknowledgedBy.push({
          boardMemberId: member._id,
          name: member.name,
          acknowledgedAt: new Date(),
        } as any);
        code.markModified('acknowledgedBy');
        await code.save();
      }),
    );
  }

  // ── Step 4 — Mandatory training ──────────────────────────────────
  async submitOnboardingTraining(
    userId: string,
    dto: SubmitOnboardingTrainingDto,
  ) {
    const member = await this.getByUserId(userId);
    this.requireStageDone(
      member,
      BoardOnboardingStageId.SIGN_DOCS,
      'sign your appointment documents',
    );
    // Required modules are whatever the tenant has actually configured
    // (BoardTrainingModule), not a fixed reference list — a tenant
    // with none set up yet has nothing blocking this step, same rule
    // as documentsToSign.
    const modules = await this.trainingModuleModel
      .find({ tenantId: member.tenantId })
      .lean();
    const requiredIds = modules.map((m) => m._id.toString());
    const missing = requiredIds.filter(
      (id) => !dto.completedModuleIds.includes(id),
    );
    if (missing.length) {
      throw new BadRequestException(
        'All mandatory training modules must be completed first.',
      );
    }
    // Also record each newly-completed module in the member's real
    // Training & CPD log (member.training) — completing onboarding
    // training is real training, and previously only showed up on the
    // onboarding stage itself, never under the director's own
    // Training & CPD tab. Skips anything already logged from a prior
    // submission (checked against the previously-saved
    // completedModuleIds, not member.training itself) so a
    // resubmission never duplicates an entry.
    const alreadyLogged = new Set(
      member.onboardingTraining?.completedModuleIds ?? [],
    );
    const newlyCompleted = modules.filter(
      (m) =>
        dto.completedModuleIds.includes(m._id.toString()) &&
        !alreadyLogged.has(m._id.toString()),
    );
    if (newlyCompleted.length) {
      for (const m of newlyCompleted) {
        member.training.push({
          title: m.title,
          completedAt: new Date(),
          type: TrainingType.MANDATORY,
          provider: '',
          hours: 0,
          expiresAt: null,
        } as any);
      }
      member.markModified('training');
    }
    member.onboardingTraining = {
      completedModuleIds: dto.completedModuleIds,
      completedAt: new Date(),
    } as any;
    member.markModified('onboardingTraining');
    this.markStageDone(member, BoardOnboardingStageId.TRAINING);
    this.applyOnboardingGraduation(member);
    await member.save();
    return this.getMyOnboarding(userId);
  }

  // ── Step 5 — Induction pack acknowledgement ─────────────────────
  // The last real step — applyOnboardingGraduation flips lifecycleStatus
  // to Active here the moment every checklist item is done, exactly
  // like the reference build's Step 6 (portal activation) happening
  // "automatically" the instant Step 5 is confirmed. Per the PO's
  // explicit ask, unlike documentsToSign/training this step is NOT
  // skippable when nothing is configured — a director can't complete
  // onboarding without a real induction pack from the tenant.
  async submitInduction(userId: string, dto: SubmitInductionDto) {
    const member = await this.getByUserId(userId);
    this.requireStageDone(
      member,
      BoardOnboardingStageId.TRAINING,
      'complete your mandatory training',
    );
    const pack = this.effectiveInductionPack(member as any);
    if (pack.length === 0) {
      throw new BadRequestException(
        "Your Company Secretary hasn't sent an induction pack yet — induction can't be completed until they do.",
      );
    }
    const missing = pack.filter(
      (p) => !dto.acknowledgedDocumentIds.includes(p._id),
    );
    if (missing.length) {
      throw new BadRequestException(
        'Please review and acknowledge every document in your induction pack first.',
      );
    }
    member.inductionAcknowledgement = {
      scheduledDate: dto.scheduledDate ?? null,
      acknowledgedDocumentIds: dto.acknowledgedDocumentIds,
      acknowledgedAt: new Date(),
    } as any;
    this.markStageDone(member, BoardOnboardingStageId.INDUCTION);
    this.applyOnboardingGraduation(member);
    await member.save();
    return this.getMyOnboarding(userId);
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

    // An offboarded director's own board-portal login is deactivated
    // the moment offboarding is initiated — same real gate AuthService
    // already enforces for AccountStatus.INACTIVE on every user type,
    // not a separate board-specific check. Nothing else about the
    // account (their historical records, past meeting/committee data)
    // is touched; this only blocks future logins.
    if (member.userId) {
      await this.userModel.findByIdAndUpdate(member.userId, {
        status: AccountStatus.INACTIVE,
      });
    }

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
