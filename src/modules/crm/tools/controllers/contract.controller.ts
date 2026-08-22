import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { CommentService } from '../services';
import { AddCommentDto, EditCommentDto, ToggleReactionDto } from '../dtos';
import { CommentSubjectType } from '../schemas';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import { ContractService } from '../services';
import {
  CreateContractDto,
  ExecuteContractDto,
  AddNegotiationRoundDto,
  AddAmendmentDto,
  AddObligationDto,
  SetObligationDoneDto,
} from '../dtos';

@ApiTags('CRM — Tools — Contracts')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('tools/comments')
export class CommentController {
  constructor(private readonly service: CommentService) {}

  @Get(':subjectType/:subjectId')
  @ApiOperation({
    summary:
      'Real threaded comments for a subject, reconstructed as a tree from flat storage',
  })
  getThread(
    @Param('subjectType') subjectType: CommentSubjectType,
    @Param('subjectId') subjectId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getThread(t || u, subjectType, subjectId);
  }

  @Post(':subjectType/:subjectId')
  @ApiOperation({ summary: 'Add a comment or, with parentId, a real reply' })
  addComment(
    @Param('subjectType') subjectType: CommentSubjectType,
    @Param('subjectId') subjectId: string,
    @Body() dto: AddCommentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addComment(t || u, subjectType, subjectId, dto);
  }

  @Patch(':commentId')
  @ApiOperation({ summary: 'Edit a comment' })
  editComment(
    @Param('commentId') commentId: string,
    @Body() dto: EditCommentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.editComment(t || u, commentId, dto);
  }

  @Delete(':commentId')
  @ApiOperation({ summary: 'Soft-delete a comment — replies stay intact' })
  deleteComment(
    @Param('commentId') commentId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.deleteComment(t || u, commentId);
  }

  @Post(':commentId/react')
  @ApiOperation({ summary: 'Toggle a real reaction on a comment' })
  toggleReaction(
    @Param('commentId') commentId: string,
    @Body() dto: ToggleReactionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.toggleReaction(t || u, commentId, dto);
  }

  @Get('mention-directory')
  @ApiOperation({
    summary: 'Real employee directory for @mention autocomplete',
  })
  getMentionDirectory(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMentionDirectory(t || u);
  }
}

@ApiTags('CRM — Tools — Contracts')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('tools/contracts')
export class ContractController {
  constructor(private readonly service: ContractService) {}

  @Get()
  @ApiOperation({ summary: 'All contracts' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get('expiring')
  @ApiQuery({ name: 'withinDays', required: false })
  @ApiOperation({
    summary: 'Real, live-computed contracts expiring within a window',
  })
  getExpiring(
    @Query('withinDays') withinDays: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getExpiring(
      t || u,
      withinDays ? Number(withinDays) : undefined,
    );
  }

  @Get('obligations-due')
  @ApiQuery({ name: 'withinDays', required: false })
  @ApiOperation({
    summary: 'Real, live-computed obligations due across all contracts',
  })
  getObligationsDue(
    @Query('withinDays') withinDays: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getObligationsDue(
      t || u,
      withinDays ? Number(withinDays) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'One contract' })
  getById(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a contract, starting at Draft' })
  create(
    @Body() dto: CreateContractDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Post(':id/advance')
  @ApiOperation({ summary: 'Advance to the next real stage in sequence' })
  advanceStage(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.advanceStage(t || u, id);
  }

  @Post(':id/execute')
  @ApiOperation({
    summary:
      'Capture signature — moves to Active with real executed/effective dates',
  })
  executeContract(
    @Param('id') id: string,
    @Body() dto: ExecuteContractDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.executeContract(t || u, id, dto);
  }

  @Post(':id/initiate-renewal')
  @ApiOperation({ summary: 'Move a contract into Renewal' })
  initiateRenewal(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.initiateRenewal(t || u, id);
  }

  @Post(':id/toggle-auto-renew')
  @ApiOperation({ summary: 'Toggle auto-renewal' })
  toggleAutoRenew(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.toggleAutoRenew(t || u, id);
  }

  @Post(':id/rounds')
  @ApiOperation({ summary: 'Add a negotiation round' })
  addNegotiationRound(
    @Param('id') id: string,
    @Body() dto: AddNegotiationRoundDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addNegotiationRound(t || u, id, dto);
  }

  @Post(':id/amendments')
  @ApiOperation({ summary: 'Add an amendment' })
  addAmendment(
    @Param('id') id: string,
    @Body() dto: AddAmendmentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addAmendment(t || u, id, dto);
  }

  @Post(':id/obligations')
  @ApiOperation({ summary: 'Add an obligation' })
  addObligation(
    @Param('id') id: string,
    @Body() dto: AddObligationDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addObligation(t || u, id, dto);
  }

  @Post(':id/obligations/:obligationId/done')
  @ApiOperation({ summary: 'Mark an obligation done or not done' })
  setObligationDone(
    @Param('id') id: string,
    @Param('obligationId') obligationId: string,
    @Body() dto: SetObligationDoneDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setObligationDone(t || u, id, obligationId, dto);
  }
}
