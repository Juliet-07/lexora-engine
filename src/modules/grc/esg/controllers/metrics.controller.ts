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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EsgMetricsService, EsgContextService } from '../services';
import {
  UpsertMetricDto,
  CreateInitiativeDto,
  SetInitiativeStatusDto,
} from '../dtos';
import { MetricPillar } from '../schemas';
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
@Controller('grc/esg/metrics')
export class EsgMetricsController {
  constructor(
    private readonly service: EsgMetricsService,
    private readonly contextService: EsgContextService,
  ) {}

  @Get()
  async getAll(
    @Query('pillar') pillar: MetricPillar | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const ctx = await this.contextService.get(tenantId);
    return this.service.getAll(tenantId, ctx, pillar);
  }

  @Post()
  create(
    @Body() dto: UpsertMetricDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.upsert(t || u, null, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpsertMetricDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.upsert(t || u, id, dto);
  }

  @Delete(':id')
  delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.delete(t || u, id);
  }

  @Get('initiatives')
  getInitiatives(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getInitiatives(t || u);
  }

  @Post('initiatives')
  createInitiative(
    @Body() dto: CreateInitiativeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.createInitiative(t || u, dto);
  }

  @Patch('initiatives/:id/status')
  setInitiativeStatus(
    @Param('id') id: string,
    @Body() dto: SetInitiativeStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setInitiativeStatus(t || u, id, dto);
  }
}
