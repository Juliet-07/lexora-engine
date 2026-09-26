import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { BoardMemberService } from '../services';
import {
  CreateBoardMemberDto,
  CreateBoardMemberWithContractDto,
  UpdateBoardMemberDto,
  RecordConflictDto,
  LogTrainingDto,
  SetSuccessorDto,
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
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from 'src/modules/auth/schemas';
import { Model } from 'mongoose';

const documentStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(
      process.cwd(),
      'uploads',
      'grc',
      'board-members',
      'documents',
    );
    if (!existsSync(uploadPath)) mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

@ApiTags('GRC — Governance')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/governance/board-members')
export class BoardMemberController {
  constructor(
    private readonly boardMemberService: BoardMemberService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  private async currentUserName(userId: string): Promise<string> {
    const me = await this.userModel
      .findById(userId)
      .select('firstName lastName')
      .lean();
    return `${me?.firstName ?? ''} ${me?.lastName ?? ''}`.trim();
  }

  @Post()
  async create(
    @Body() dto: CreateBoardMemberDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.boardMemberService.create(tenantId, dto, businessName);
  }

  // Real, atomic appointment — creates the director's login and
  // generates their appointment-letter contract together, the same
  // process a client goes through on the "Add Client" wizard. This is
  // now the real path Board Management's "New Director" flow uses.
  @Post('create-with-contract')
  @ApiOperation({
    summary:
      'Create a board member and generate their appointment-letter contract in one step',
  })
  createWithContract(
    @Body() dto: CreateBoardMemberWithContractDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    return this.boardMemberService.createWithContract(tenantId, dto, u);
  }

  // Registered before ':id' so "contracts" is never mistaken for an id.
  @Get('contracts')
  @ApiOperation({
    summary: 'Every appointment-letter contract issued to a board member',
  })
  getOnboardingContracts(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.getOnboardingContracts(t || u);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.boardMemberService.getAll(t || u);
  }

  @Get(':id')
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.getById(t || u, id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBoardMemberDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.update(t || u, id, dto);
  }

  @Patch(':id/successor')
  @ApiOperation({
    summary: "Set or clear this board member's designated successor",
  })
  setSuccessor(
    @Param('id') id: string,
    @Body() dto: SetSuccessorDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.setSuccessor(t || u, id, dto.successorId);
  }

  // ── Conflicts ────────────────────────────────────────────────

  @Post(':id/conflicts')
  @ApiOperation({ summary: 'Record a conflict-of-interest disclosure' })
  recordConflict(
    @Param('id') id: string,
    @Body() dto: RecordConflictDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.recordConflict(t || u, id, dto);
  }

  @Patch(':id/conflicts/:index/resolve')
  resolveConflict(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.resolveConflict(t || u, id, Number(index));
  }

  // ── Training ─────────────────────────────────────────────────

  @Post(':id/training')
  @ApiOperation({
    summary: 'Log a completed training, CPD activity, or certification',
  })
  logTraining(
    @Param('id') id: string,
    @Body() dto: LogTrainingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.logTraining(t || u, id, dto);
  }

  // ── Skills ───────────────────────────────────────────────────

  @Post(':id/skills')
  addSkill(
    @Param('id') id: string,
    @Body() dto: AddSkillDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.addSkill(t || u, id, dto);
  }

  @Delete(':id/skills/:index')
  removeSkill(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.removeSkill(t || u, id, Number(index));
  }

  // ── Remuneration ─────────────────────────────────────────────

  @Patch(':id/remuneration')
  updateRemuneration(
    @Param('id') id: string,
    @Body() dto: UpdateRemunerationDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.updateRemuneration(t || u, id, dto);
  }

  // ── Committees ───────────────────────────────────────────────

  @Patch(':id/committees')
  @ApiOperation({
    summary: "Replace this director's committee memberships and chair flags",
  })
  setCommittees(
    @Param('id') id: string,
    @Body() dto: SetCommitteesDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.setCommittees(t || u, id, dto);
  }

  // ── Attendance ───────────────────────────────────────────────

  @Patch(':id/attendance')
  updateAttendance(
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.updateAttendance(t || u, id, dto);
  }

  // ── Other directorships ──────────────────────────────────────

  @Post(':id/other-directorships')
  addOtherDirectorship(
    @Param('id') id: string,
    @Body() dto: AddOtherDirectorshipDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.addOtherDirectorship(t || u, id, dto);
  }

  @Delete(':id/other-directorships/:index')
  removeOtherDirectorship(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.removeOtherDirectorship(
      t || u,
      id,
      Number(index),
    );
  }

  // ── Documents ────────────────────────────────────────────────

  @Post(':id/documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: documentStorage,
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a signed governance document or regulatory filing',
  })
  async addDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('category') category: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const uploaderName = await this.currentUserName(u);
    return this.boardMemberService.addDocument(
      t || u,
      id,
      file,
      category,
      uploaderName,
    );
  }

  @Delete(':id/documents/:index')
  removeDocument(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.removeDocument(t || u, id, Number(index));
  }

  // ── Onboarding ───────────────────────────────────────────────

  @Patch(':id/onboarding/:index/toggle')
  toggleOnboardingItem(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.toggleOnboardingItem(
      t || u,
      id,
      Number(index),
    );
  }

  // ── Succession planning ──────────────────────────────────────

  @Post(':id/succession')
  @ApiOperation({ summary: 'Start a new succession plan for this director' })
  initiateSuccession(
    @Param('id') id: string,
    @Body() dto: InitiateSuccessionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.initiateSuccession(t || u, id, dto);
  }

  @Patch(':id/succession/stage')
  updateSuccessionStage(
    @Param('id') id: string,
    @Body() dto: UpdateSuccessionStageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.updateSuccessionStage(t || u, id, dto);
  }

  @Patch(':id/succession/risk-assessment')
  updateRiskAssessment(
    @Param('id') id: string,
    @Body() dto: UpdateRiskAssessmentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.updateRiskAssessment(t || u, id, dto);
  }

  @Post(':id/succession/candidates')
  addSuccessionCandidate(
    @Param('id') id: string,
    @Body() dto: AddSuccessionCandidateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.addSuccessionCandidate(t || u, id, dto);
  }

  @Delete(':id/succession/candidates/:index')
  removeSuccessionCandidate(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.removeSuccessionCandidate(
      t || u,
      id,
      Number(index),
    );
  }

  @Patch(':id/succession/knowledge-transfer/:index/toggle')
  toggleKnowledgeTransferItem(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.toggleKnowledgeTransferItem(
      t || u,
      id,
      Number(index),
    );
  }

  // ── Offboarding ──────────────────────────────────────────────

  @Post(':id/offboard')
  @ApiOperation({ summary: 'Initiate offboarding for this director' })
  initiateOffboarding(
    @Param('id') id: string,
    @Body() dto: InitiateOffboardingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.initiateOffboarding(t || u, id, dto);
  }

  @Patch(':id/offboarding/:index/toggle')
  toggleOffboardingItem(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.toggleOffboardingItem(
      t || u,
      id,
      Number(index),
    );
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.boardMemberService.delete(t || u, id);
    return { success: true };
  }
}
