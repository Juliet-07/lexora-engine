import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { DisputeService } from '../services';
import {
  OpenDisputeCaseDto,
  AcknowledgeDisputeDto,
  InvestigateDisputeDto,
  ScheduleHearingDto,
  RecordOutcomeDto,
  EscalateExternalDto,
  ResolveAppealDto,
  CloseDisputeDto,
  AttachFormDto,
  AttachDocumentDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';

// =================================================================
// HR / TENANT CONTROLLER
// =================================================================

@ApiTags('HR — Disputes (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@Controller('hr/disputes')
export class DisputeTenantController {
  constructor(private readonly disputeService: DisputeService) {}

  @Post()
  @ApiOperation({ summary: 'Open a new dispute case (HR/Manager)' })
  openCase(
    @Body() dto: OpenDisputeCaseDto,
    @Body('complainantEmployeeId') complainantEmployeeId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.openCase(t || u, u, complainantEmployeeId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all dispute cases with optional filters' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'stage', required: false })
  @ApiQuery({ name: 'track', required: false })
  getAllCases(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('stage') stage?: string,
    @Query('track') track?: string,
  ) {
    return this.disputeService.getAllCases(t || u, {
      status,
      type,
      stage,
      track,
    });
  }

  @Get(':caseId')
  @ApiOperation({ summary: 'Get full detail of a dispute case' })
  getCaseById(
    @Param('caseId') caseId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.getCaseById(t || u, caseId);
  }

  @Patch(':caseId/acknowledge')
  @ApiOperation({ summary: 'Acknowledge case — issue written acknowledgment' })
  acknowledge(
    @Param('caseId') caseId: string,
    @Body() dto: AcknowledgeDisputeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.acknowledge(t || u, caseId, u, dto);
  }

  @Patch(':caseId/investigate')
  @ApiOperation({ summary: 'Record investigation findings' })
  investigate(
    @Param('caseId') caseId: string,
    @Body() dto: InvestigateDisputeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.investigate(t || u, caseId, u, dto);
  }

  @Patch(':caseId/schedule-hearing')
  @ApiOperation({ summary: 'Schedule the disciplinary/grievance hearing' })
  scheduleHearing(
    @Param('caseId') caseId: string,
    @Body() dto: ScheduleHearingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.scheduleHearing(t || u, caseId, u, dto);
  }

  @Patch(':caseId/outcome')
  @ApiOperation({ summary: 'Record the outcome decision' })
  recordOutcome(
    @Param('caseId') caseId: string,
    @Body() dto: RecordOutcomeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.recordOutcome(t || u, caseId, u, dto);
  }

  @Patch(':caseId/resolve-appeal')
  @ApiOperation({ summary: "Review and resolve an employee's appeal" })
  resolveAppeal(
    @Param('caseId') caseId: string,
    @Body() dto: ResolveAppealDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.resolveAppeal(t || u, caseId, u, dto);
  }

  @Patch(':caseId/escalate-external')
  @ApiOperation({
    summary: 'Escalate to external track (Labour Inspectorate / Court)',
  })
  escalateExternal(
    @Param('caseId') caseId: string,
    @Body() dto: EscalateExternalDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.escalateExternal(t || u, caseId, u, dto);
  }

  @Patch(':caseId/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close a dispute case' })
  closeCase(
    @Param('caseId') caseId: string,
    @Body() dto: CloseDisputeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.closeCase(t || u, caseId, u, dto);
  }

  @Post(':caseId/forms')
  @ApiOperation({ summary: 'Attach a form (D1/D2/D3/D4/E1) to a case' })
  attachForm(
    @Param('caseId') caseId: string,
    @Body() dto: AttachFormDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.attachForm(t || u, caseId, u, dto);
  }

  @Post(':caseId/documents')
  @ApiOperation({ summary: 'Attach a supporting document to a case' })
  attachDocument(
    @Param('caseId') caseId: string,
    @Body() dto: AttachDocumentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.attachDocument(t || u, caseId, u, dto);
  }
}
