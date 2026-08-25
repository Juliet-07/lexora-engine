import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LitigationCaseService } from '../services';
import {
  CreateLitigationCaseDto,
  UpdateLitigationDetailsDto,
  UpdateLitigationStageDto,
  AddLitigationPleadingDto,
  UpdateLitigationPleadingDto,
  AddLitigationCourtDateDto,
  AddLitigationDisbursementDto,
  AddLitigationTimelineEntryDto,
  RecordLitigationOutcomeDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Projects — Litigation (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('crm/litigation-cases')
export class LitigationCaseController {
  constructor(private readonly service: LitigationCaseService) {}

  @Post()
  @ApiOperation({
    summary:
      'File litigation directly, with no prior ADR phase (the far more common path — escalating a real ADR case — uses POST crm/adr-cases/:id/escalate instead)',
  })
  create(
    @Body() dto: CreateLitigationCaseDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'All litigation cases' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'One litigation case, with combined ADR+litigation hours/fees/age computed live',
  })
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Patch(':id/details')
  @ApiOperation({ summary: 'Update court details / parties' })
  updateDetails(
    @Param('id') id: string,
    @Body() dto: UpdateLitigationDetailsDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateDetails(t || u, id, dto);
  }

  @Patch(':id/stage')
  @ApiOperation({
    summary: 'Move litigation stage — logs a real, narrated timeline entry',
  })
  setStage(
    @Param('id') id: string,
    @Body() dto: UpdateLitigationStageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setStage(t || u, id, dto);
  }

  @Post(':id/pleadings')
  @ApiOperation({ summary: 'Add a pleading to the tracker' })
  addPleading(
    @Param('id') id: string,
    @Body() dto: AddLitigationPleadingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addPleading(t || u, id, dto);
  }

  @Patch(':id/pleadings/:pleadingId')
  @ApiOperation({ summary: 'Mark a pleading filed / update its status' })
  updatePleading(
    @Param('id') id: string,
    @Param('pleadingId') pleadingId: string,
    @Body() dto: UpdateLitigationPleadingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updatePleading(t || u, id, pleadingId, dto);
  }

  @Post(':id/court-dates')
  @ApiOperation({ summary: 'Add a court date' })
  addCourtDate(
    @Param('id') id: string,
    @Body() dto: AddLitigationCourtDateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addCourtDate(t || u, id, dto);
  }

  @Post(':id/disbursements')
  @ApiOperation({ summary: 'Record a disbursement' })
  addDisbursement(
    @Param('id') id: string,
    @Body() dto: AddLitigationDisbursementDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addDisbursement(t || u, id, dto);
  }

  @Post(':id/timeline')
  @ApiOperation({
    summary: 'Add a manual timeline entry for a real-world milestone',
  })
  addTimelineEntry(
    @Param('id') id: string,
    @Body() dto: AddLitigationTimelineEntryDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addTimelineEntry(t || u, id, dto);
  }

  @Post(':id/outcome')
  @ApiOperation({ summary: 'Record the judgment / outcome' })
  recordOutcome(
    @Param('id') id: string,
    @Body() dto: RecordLitigationOutcomeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordOutcome(t || u, id, dto);
  }

  @Post(':id/consent-judgment')
  @ApiOperation({
    summary:
      'Record settlement reached mid-litigation — consent judgment, case closed',
  })
  recordConsentJudgment(
    @Param('id') id: string,
    @Body('terms') terms: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordConsentJudgment(t || u, id, terms);
  }

  @Post(':id/withdraw')
  @ApiOperation({ summary: 'Withdraw the case' })
  withdraw(
    @Param('id') id: string,
    @Body('reason') reason: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.withdraw(t || u, id, reason);
  }
}
