import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
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
import {
  BoardMemberService,
  GovernanceCodeService,
  MeetingService,
  BoardDashboardService,
} from 'src/modules/grc/governance/services';
import { BoardTrainingService } from 'src/modules/grc/governance/services/board-training.service';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';
import {
  SubmitFitProperDto,
  SubmitDocumentsCoiDto,
  SubmitOnboardingTrainingDto,
  SubmitInductionDto,
  DecideCodeBoardApprovalDto,
  SubmitBoardMemberAckDto,
  SetActionItemStatusDto,
  SubmitNoticeRsvpDto,
  ToggleBoardPackReadDto,
  AddBoardPackNoteDto,
  SubmitMeetingConflictDto,
} from 'src/modules/grc/governance/dtos/index.dto';
import { CompleteBoardTrainingDto } from 'src/modules/grc/governance/dtos/board-training.dto';

const trainingProofStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(
      process.cwd(),
      'uploads',
      'grc',
      'trainings',
      'proof',
    );
    if (!existsSync(uploadPath)) mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

// ── Board portal, self-service ──────────────────────────────────
// Reached from lexora-board (BOARD_APP_URL), not the tenant app.
// Deliberately carries NO @RequiresModule — ModuleAccessGuard denies
// UserType.BOARD_MEMBER by default for every module-gated route, and
// a director's own onboarding view isn't a tenant GRC-module
// permission to begin with. Scoped entirely to the calling board
// member's own record (via their JWT's `sub`), never a tenantId +
// arbitrary :id the way the tenant-side controller is.
//
// Lives in its own top-level `board-portal` module/folder (sibling to
// `grc`, `hr`, etc.) rather than inside Governance, so every endpoint
// a signed-in board member calls is in one place regardless of which
// feature module actually owns the data. It still injects the real
// services from their owning modules (Governance here) rather than
// redefining any schema or service of its own — see board-portal.module.ts.
// Other domains' board-facing routes (e.g. ESG's disclosure sign-off)
// get their own controller added here the same way, each one importing
// its owning module and exported services, never duplicating them.
@ApiTags('Board Portal')
@ApiBearerAuth()
@UserTypes(UserType.BOARD_MEMBER)
@Controller('board-portal')
export class BoardPortalController {
  constructor(
    private readonly boardMemberService: BoardMemberService,
    private readonly governanceCodeService: GovernanceCodeService,
    private readonly meetingService: MeetingService,
    private readonly boardDashboardService: BoardDashboardService,
    private readonly boardTrainingService: BoardTrainingService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: "The signed-in board member's own profile" })
  getMe(@CurrentUser('sub') userId: string) {
    return this.boardMemberService.getMyProfile(userId);
  }

  @Get('dashboard')
  @ApiOperation({
    summary:
      "The signed-in board member's Dashboard — KPIs, attention items, " +
      'upcoming meetings and standing, all computed from real records',
  })
  getMyDashboard(@CurrentUser('sub') userId: string) {
    return this.boardDashboardService.getForBoardMember(userId);
  }

  @Get('onboarding')
  @ApiOperation({
    summary: "The signed-in board member's own onboarding state",
  })
  getMyOnboarding(@CurrentUser('sub') userId: string) {
    return this.boardMemberService.getMyOnboarding(userId);
  }

  @Get('committees')
  @ApiOperation({
    summary: 'Committees this director belongs to, with their tasks',
  })
  getMyCommittees(@CurrentUser('sub') userId: string) {
    return this.boardMemberService.getMyCommittees(userId);
  }

  @Get('board-overview')
  @ApiOperation({
    summary:
      "Board of Directors overview — this director's role/status, total " +
      'active board members, their own board-meeting attendance, and the ' +
      'current published Board Charter',
  })
  getBoardOverview(@CurrentUser('sub') userId: string) {
    return this.boardMemberService.getBoardOverview(userId);
  }

  // ── Meetings — "receive everything pertaining to it... on their
  // board portal": every real meeting this director is an attendee
  // of, plus a lightweight in-app RSVP/acknowledgement and the
  // ability to mark their own action items done, so a director isn't
  // limited to the emailed ack-token link. ─────────────────────────

  @Get('meetings')
  @ApiOperation({
    summary:
      'Meetings this director is invited to, with their own attendance/RSVP and action items',
  })
  async getMyMeetings(@CurrentUser('sub') userId: string) {
    const { boardMemberId, tenantId, email } =
      await this.boardMemberService.resolveBoardMember(userId);
    return this.meetingService.getForBoardMemberPortal(
      tenantId,
      boardMemberId,
      email,
    );
  }

  @Post('meetings/:id/ack')
  @ApiOperation({
    summary: 'RSVP / acknowledge a meeting agenda in-app',
  })
  async submitMeetingAck(
    @Param('id') id: string,
    @Body() dto: SubmitBoardMemberAckDto,
    @CurrentUser('sub') userId: string,
  ) {
    const { tenantId, name, email } =
      await this.boardMemberService.resolveBoardMember(userId);
    return this.meetingService.submitBoardMemberAck(
      tenantId,
      id,
      email,
      name,
      dto,
    );
  }

  @Post('meetings/:id/notice/rsvp')
  @ApiOperation({ summary: 'RSVP to a meeting notice in-app' })
  async submitMeetingNoticeRsvp(
    @Param('id') id: string,
    @Body() dto: SubmitNoticeRsvpDto,
    @CurrentUser('sub') userId: string,
  ) {
    const { tenantId, email } =
      await this.boardMemberService.resolveBoardMember(userId);
    return this.meetingService.submitBoardMemberNoticeRsvp(
      tenantId,
      id,
      email,
      dto,
    );
  }

  @Post('meetings/:id/notice/opened')
  @ApiOperation({ summary: 'Mark a meeting notice as opened, in-app' })
  async markMeetingNoticeOpened(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    const { tenantId, email } =
      await this.boardMemberService.resolveBoardMember(userId);
    return this.meetingService.markNoticeOpened(tenantId, id, email);
  }

  @Patch('meetings/:id/board-pack/read')
  @ApiOperation({
    summary: 'Mark one board pack document read/unread, in-app',
  })
  async toggleBoardPackRead(
    @Param('id') id: string,
    @Body() dto: ToggleBoardPackReadDto,
    @CurrentUser('sub') userId: string,
  ) {
    const { tenantId, name, email } =
      await this.boardMemberService.resolveBoardMember(userId);
    return this.meetingService.toggleBoardPackDocumentRead(
      tenantId,
      id,
      email,
      name,
      dto,
    );
  }

  @Post('meetings/:id/board-pack/confirm-read')
  @ApiOperation({
    summary: 'Confirm every board pack document has been read',
  })
  async confirmBoardPackRead(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    const { tenantId, email } =
      await this.boardMemberService.resolveBoardMember(userId);
    return this.meetingService.confirmBoardPackRead(tenantId, id, email);
  }

  @Post('meetings/:id/board-pack/notes')
  @ApiOperation({
    summary:
      'Add a note or question on a board pack document, shared with the tenant',
  })
  async addBoardPackNote(
    @Param('id') id: string,
    @Body() dto: AddBoardPackNoteDto,
    @CurrentUser('sub') userId: string,
  ) {
    const { tenantId, name, email } =
      await this.boardMemberService.resolveBoardMember(userId);
    return this.meetingService.addBoardPackNote(tenantId, id, email, name, dto);
  }

  @Post('meetings/:id/conflicts')
  @ApiOperation({
    summary: 'Declare a conflict of interest for this meeting, in-app',
  })
  async submitMeetingConflict(
    @Param('id') id: string,
    @Body() dto: SubmitMeetingConflictDto,
    @CurrentUser('sub') userId: string,
  ) {
    const { boardMemberId, tenantId, name, email } =
      await this.boardMemberService.resolveBoardMember(userId);
    return this.meetingService.submitBoardMemberConflict(
      tenantId,
      id,
      boardMemberId,
      name,
      email,
      dto,
    );
  }

  @Patch('meetings/:id/action-items/:actionItemId/status')
  @ApiOperation({
    summary: "Mark one of the director's own meeting action items Open/Done",
  })
  async setMyMeetingActionItemStatus(
    @Param('id') id: string,
    @Param('actionItemId') actionItemId: string,
    @Body() dto: SetActionItemStatusDto,
    @CurrentUser('sub') userId: string,
  ) {
    const { boardMemberId, tenantId, email } =
      await this.boardMemberService.resolveBoardMember(userId);
    return this.meetingService.setMyActionItemStatus(
      tenantId,
      boardMemberId,
      email,
      id,
      actionItemId,
      dto,
    );
  }

  // ── Real onboarding form submissions — one per step, each
  // server-gated on the previous step actually being done (see
  // BoardMemberService's requireStageDone). Replaces the earlier flat
  // "mark item complete by index" endpoint, which had no way to
  // collect the actual Fit & Proper declaration, document/COI answers,
  // training completion, or induction acknowledgement the real
  // onboarding journey needs. ──────────────────────────────────────

  @Post('onboarding/fit-proper')
  @ApiOperation({ summary: 'Submit the regulatory Fit & Proper declaration' })
  submitFitProper(
    @Body() dto: SubmitFitProperDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.boardMemberService.submitFitProper(userId, dto);
  }

  @Post('onboarding/documents-coi')
  @ApiOperation({
    summary:
      'Submit the signed appointment documents plus Conflict of Interest declaration',
  })
  submitDocumentsCoi(
    @Body() dto: SubmitDocumentsCoiDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.boardMemberService.submitDocumentsCoi(userId, dto);
  }

  @Post('onboarding/training')
  @ApiOperation({ summary: 'Submit completed mandatory training modules' })
  submitOnboardingTraining(
    @Body() dto: SubmitOnboardingTrainingDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.boardMemberService.submitOnboardingTraining(userId, dto);
  }

  @Post('onboarding/induction')
  @ApiOperation({ summary: 'Acknowledge receipt of the induction pack' })
  submitInduction(
    @Body() dto: SubmitInductionDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.boardMemberService.submitInduction(userId, dto);
  }

  // ── Governance Codes — codes this director has been asked to
  // approve, decided in-app rather than via an emailed link. ───────

  @Get('governance-codes')
  @ApiOperation({
    summary: 'Governance codes this director has been asked to approve',
  })
  getGovernanceCodes(@CurrentUser('sub') userId: string) {
    return this.governanceCodeService.getPendingForBoardMember(userId);
  }

  @Post('governance-codes/:id/decide')
  @ApiOperation({ summary: 'Approve or reject a governance code' })
  decideGovernanceCode(
    @Param('id') id: string,
    @Body() dto: DecideCodeBoardApprovalDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.governanceCodeService.decideBoardApproval(userId, id, dto);
  }

  // ── Trainings — general, ongoing board training (distinct from the
  // onboarding-only modules under /onboarding/training above). A
  // director reviews the tenant's attached material and marks it
  // done, or — when no material was attached — uploads their own
  // proof of completion instead. ────────────────────────────────────

  @Get('trainings')
  @ApiOperation({
    summary:
      'Trainings assigned to the signed-in director, with their own completion status',
  })
  async getMyTrainings(@CurrentUser('sub') userId: string) {
    const { boardMemberId, tenantId } =
      await this.boardMemberService.resolveBoardMember(userId);
    return this.boardTrainingService.getForBoardMemberPortal(
      tenantId,
      boardMemberId,
    );
  }

  @Post('trainings/:id/complete')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Mark a training complete — with proof (file) when it has no material of its own',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: trainingProofStorage,
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async completeTraining(
    @Param('id') id: string,
    @Body() _dto: CompleteBoardTrainingDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') userId: string,
  ) {
    const { boardMemberId, tenantId, name, email } =
      await this.boardMemberService.resolveBoardMember(userId);
    return this.boardTrainingService.completeByBoardMember(
      tenantId,
      id,
      boardMemberId,
      name,
      email,
      file,
    );
  }
}
