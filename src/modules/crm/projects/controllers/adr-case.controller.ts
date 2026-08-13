import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdrCaseService } from '../services';
import {
  CreateAdrCaseDto,
  UpdateAdrStageDto,
  AddAdrSessionDto,
  RecordAdrSettlementDto,
  RecordAdrOutcomeDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Projects — ADR (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('crm/adr-cases')
export class AdrCaseController {
  constructor(private readonly service: AdrCaseService) {}

  @Post()
  @ApiOperation({ summary: 'File a new ADR case' })
  create(
    @Body() dto: CreateAdrCaseDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'All ADR cases' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One case' })
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Patch(':id/stage')
  @ApiOperation({ summary: 'Move stage' })
  setStage(
    @Param('id') id: string,
    @Body() dto: UpdateAdrStageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setStage(t || u, id, dto);
  }

  @Post(':id/sessions')
  @ApiOperation({ summary: 'Add a session' })
  addSession(
    @Param('id') id: string,
    @Body() dto: AddAdrSessionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addSession(t || u, id, dto);
  }

  @Post(':id/settlement')
  @ApiOperation({ summary: 'Record a settlement' })
  recordSettlement(
    @Param('id') id: string,
    @Body() dto: RecordAdrSettlementDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordSettlement(t || u, id, dto);
  }

  @Post(':id/outcome')
  @ApiOperation({ summary: 'Record an award / outcome' })
  recordOutcome(
    @Param('id') id: string,
    @Body() dto: RecordAdrOutcomeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordOutcome(t || u, id, dto);
  }
}
