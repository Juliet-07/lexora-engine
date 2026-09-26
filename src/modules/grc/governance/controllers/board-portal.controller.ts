import { Controller, Get, Post, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BoardMemberService } from '../services';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';

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
  constructor(private readonly boardMemberService: BoardMemberService) {}

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

  @Post('onboarding/items/:index/complete')
  @ApiOperation({
    summary:
      "Mark one of the signed-in board member's own onboarding items as done",
  })
  completeMyOnboardingItem(
    @Param('index') index: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.boardMemberService.completeMyOnboardingItem(
      userId,
      Number(index),
    );
  }
}
