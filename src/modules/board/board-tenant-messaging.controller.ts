import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';
import { BoardMessagingService } from './services';
import { SendBoardMessageDto } from './dtos/index.dto';

// ── Tenant-side half of Board Directory messaging ────────────────
// "a page has been created for the tenant to receive messages from
// board members, so now we need to create that connection from
// board portal to tenant portal" (PO, Oct 2026). Reached from
// lexora-tenant's Board Messaging page (GRC > Governance), not the
// board portal — the counterpart here is always a real BoardMember
// on this tenant's own board. The reverse direction (a director
// messaging "the tenant") is the synthetic tenant-owner entry
// BoardMemberService#getDirectoryForPortal adds to the board
// portal's own Board Directory, handled by the existing
// BoardPortalController routes.
//
// Same BoardMessagingService/BoardMessage collection as the board
// portal side — one thread, two ends — just the tenant-side method
// variants (…ForTenant) instead of the board-member ones, since
// "self" here is the tenant's own User id, never a BoardMember id.
// `@CurrentUser('tenantId') t` falls back to `u` (sub) the same way
// every other tenant/employee-shared governance route in this
// codebase does, so either actor resolves to the right tenantId.
@ApiTags('GRC — Governance — Board Messaging')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@Controller('grc/governance/board-messages')
export class TenantBoardMessagingController {
  constructor(private readonly messagingService: BoardMessagingService) {}

  @Get('threads')
  @ApiOperation({
    summary: 'My message threads with board members, most recent first',
  })
  getThreads(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.messagingService.getThreadsForTenant(t || u);
  }

  @Get(':boardMemberId')
  @ApiOperation({ summary: 'Full message history with one board member' })
  getThread(
    @Param('boardMemberId') boardMemberId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.messagingService.getThreadForTenant(t || u, boardMemberId);
  }

  @Post(':boardMemberId')
  @ApiOperation({ summary: 'Send a message to a board member' })
  sendMessage(
    @Param('boardMemberId') boardMemberId: string,
    @Body() dto: SendBoardMessageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.messagingService.sendMessageForTenant(
      t || u,
      boardMemberId,
      dto,
    );
  }
}
