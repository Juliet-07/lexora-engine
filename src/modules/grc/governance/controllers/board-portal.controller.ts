import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BoardMemberService, GovernanceCodeService } from '../services';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';
import {
  SubmitFitProperDto,
  SubmitDocumentsCoiDto,
  SubmitOnboardingTrainingDto,
  SubmitInductionDto,
  DecideCodeBoardApprovalDto,
} from '../dtos/index.dto';

// ── Board portal, self-service ──────────────────────────────────
// Reached from lexora-board (BOARD_APP_URL), not the tenant app.
// Deliberately carries NO @RequiresModule — ModuleAccessGuard denies
// UserType.BOARD_MEMBER by default for every module-gated route, and
// a director's own onboarding view isn't a tenant GRC-module
// permission to begin with. Scoped entirely to the calling board
// member's own record (via their JWT's `sub`), never a tenantId +
// arbitrary :id the way the tenant-side controller is.
@ApiTags('Board Portal')
@ApiBearerAuth()
@UserTypes(UserType.BOARD_MEMBER)
@Controller('board-portal')
export class BoardPortalController {
  constructor(
    private readonly boardMemberService: BoardMemberService,
    private readonly governanceCodeService: GovernanceCodeService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: "The signed-in board member's own profile" })
  getMe(@CurrentUser('sub') userId: string) {
    return this.boardMemberService.getMyProfile(userId);
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
}
