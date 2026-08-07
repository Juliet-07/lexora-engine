import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EsgMaterialityService } from '../services';
import {
  CreateStakeholderDto,
  RecordEngagementDto,
  CreateTopicDto,
  UpdateTopicScoreDto,
  UpdateThresholdDto,
  ApproveCycleDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

@ApiTags('GRC — ESG')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/esg/materiality')
export class EsgMaterialityController {
  constructor(private readonly service: EsgMaterialityService) {}

  // ── Cycle ────────────────────────────────────────────────────

  @Get('cycle')
  getCycle(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getCycle(t || u);
  }

  @Patch('cycle/threshold')
  updateThreshold(
    @Body() dto: UpdateThresholdDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateThreshold(t || u, dto);
  }

  @Post('cycle/approve')
  approveCycle(
    @Body() dto: ApproveCycleDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.approveCycle(t || u, dto);
  }

  @Post('cycle/next')
  openNextCycle(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.openNextCycle(t || u);
  }

  // ── Stakeholders ─────────────────────────────────────────────

  @Get('stakeholders')
  getStakeholders(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getStakeholders(t || u);
  }

  @Post('stakeholders')
  addStakeholder(
    @Body() dto: CreateStakeholderDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addStakeholder(t || u, dto);
  }

  @Patch('stakeholders/:id/engagement')
  recordEngagement(
    @Param('id') id: string,
    @Body() dto: RecordEngagementDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordEngagement(t || u, id, dto);
  }

  // ── Topics ───────────────────────────────────────────────────

  @Get('topics')
  getTopics(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getTopics(t || u);
  }

  @Post('topics')
  addTopic(
    @Body() dto: CreateTopicDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addTopic(t || u, dto);
  }

  @Patch('topics/:id/score')
  updateTopicScore(
    @Param('id') id: string,
    @Body() dto: UpdateTopicScoreDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateTopicScore(t || u, id, dto);
  }

  @Post('topics/:id/escalate')
  escalate(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.escalateToRisk(t || u, id);
  }
}
