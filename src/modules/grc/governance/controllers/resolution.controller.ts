import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResolutionService } from '../services';
import {
  CreateResolutionDto,
  SetBoardVoteDto,
  SetWrittenStatusDto,
  RecordWrittenResponseDto,
  CloseWrittenDto,
  AddProxyDto,
  SaveShareholderPollDto,
} from '../dtos/index.dto';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';

@ApiTags('GRC — Governance')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/governance/resolutions')
export class ResolutionController {
  constructor(
    private readonly resolutionService: ResolutionService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  @Get('next-reference')
  getNextReference(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.resolutionService.getNextReference(t || u);
  }

  @Post()
  create(
    @Body() dto: CreateResolutionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.resolutionService.create(t || u, dto);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.resolutionService.getAll(t || u);
  }

  @Get(':id')
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.resolutionService.getById(t || u, id);
  }

  @Patch(':id/board-vote')
  setBoardVote(
    @Param('id') id: string,
    @Body() dto: SetBoardVoteDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.resolutionService.setBoardVote(t || u, id, dto);
  }

  @Post(':id/board-vote/close')
  closeBoardVote(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.resolutionService.closeBoardVote(t || u, id);
  }

  @Patch(':id/written-status')
  async setWrittenStatus(
    @Param('id') id: string,
    @Body() dto: SetWrittenStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.resolutionService.setWrittenStatus(
      tenantId,
      id,
      dto,
      businessName,
    );
  }

  @Patch(':id/written-response')
  recordWrittenResponse(
    @Param('id') id: string,
    @Body() dto: RecordWrittenResponseDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.resolutionService.recordWrittenResponse(t || u, id, dto);
  }

  @Post(':id/written/close')
  closeWritten(
    @Param('id') id: string,
    @Body() dto: CloseWrittenDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.resolutionService.closeWritten(t || u, id, dto);
  }

  @Post(':id/proxies')
  addProxy(
    @Param('id') id: string,
    @Body() dto: AddProxyDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.resolutionService.addProxy(t || u, id, dto);
  }

  @Patch(':id/shareholder-poll')
  saveShareholderPoll(
    @Param('id') id: string,
    @Body() dto: SaveShareholderPollDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.resolutionService.saveShareholderPoll(t || u, id, dto);
  }

  @Post(':id/shareholder/close')
  closeShareholder(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.resolutionService.closeShareholder(t || u, id);
  }
}
