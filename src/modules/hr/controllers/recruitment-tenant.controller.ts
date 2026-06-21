import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { CandidateService } from '../services/candidate.service';
import { OffboardingService } from '../services/offboarding.service';
import { SuccessionPlanService } from '../services/succession-plan.service';
import {
  CreateCandidateDto,
  UpdateCandidateDto,
  MoveCandidateStageDto,
  UpdateOffboardingDto,
  CreateSuccessionPlanDto,
  UpdateSuccessionPlanDto,
  AddSuccessorDto,
} from '../dtos/recruitment.dto';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';

@ApiTags('HR — Candidate Pipeline (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/recruitment/candidates')
export class CandidateController {
  constructor(private readonly candidateService: CandidateService) {}

  @Get()
  @ApiQuery({ name: 'stage', required: false })
  @ApiOperation({
    summary: 'List all candidates, optionally filtered by stage',
  })
  getAll(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query('stage') stage?: string,
  ) {
    return this.candidateService.getAll(t || u, stage);
  }

  @Get('stage-counts')
  @ApiOperation({ summary: 'Get candidate counts per pipeline stage' })
  getStageCounts(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.candidateService.getStageCounts(t || u);
  }

  @Get(':candidateId')
  @ApiOperation({ summary: 'Get a single candidate' })
  getOne(
    @Param('candidateId') candidateId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.candidateService.getById(t || u, candidateId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a candidate to the pipeline (starts at "sourced")',
  })
  create(
    @Body() dto: CreateCandidateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.candidateService.create(t || u, dto);
  }

  @Patch(':candidateId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update candidate details' })
  update(
    @Param('candidateId') candidateId: string,
    @Body() dto: UpdateCandidateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.candidateService.update(t || u, candidateId, dto);
  }

  @Patch(':candidateId/stage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move a candidate to a different pipeline stage' })
  moveStage(
    @Param('candidateId') candidateId: string,
    @Body() dto: MoveCandidateStageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.candidateService.moveStage(t || u, candidateId, dto);
  }

  @Delete(':candidateId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a candidate from the pipeline' })
  async delete(
    @Param('candidateId') candidateId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.candidateService.delete(t || u, candidateId);
    return { success: true };
  }
}

@ApiTags('HR — Offboarding (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/recruitment/offboarding')
export class OffboardingController {
  constructor(private readonly offboardingService: OffboardingService) {}

  @Get()
  @ApiQuery({ name: 'status', required: false })
  @ApiOperation({ summary: 'List all offboarding records' })
  getAll(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query('status') status?: string,
  ) {
    return this.offboardingService.getAll(t || u, status);
  }

  @Get(':recordId')
  @ApiOperation({ summary: 'Get a single offboarding record' })
  getOne(
    @Param('recordId') recordId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.offboardingService.getById(t || u, recordId);
  }

  @Patch(':recordId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update an offboarding record' })
  update(
    @Param('recordId') recordId: string,
    @Body() dto: UpdateOffboardingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.offboardingService.update(t || u, recordId, dto);
  }
}

@ApiTags('HR — Succession Planning (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/recruitment/succession-plans')
export class SuccessionPlanController {
  constructor(private readonly planService: SuccessionPlanService) {}

  @Get()
  @ApiOperation({ summary: 'List all succession plans' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.planService.getAll(t || u);
  }

  @Get(':planId')
  @ApiOperation({ summary: 'Get a single succession plan' })
  getOne(
    @Param('planId') planId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.planService.getById(t || u, planId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new succession plan for a critical role' })
  create(
    @Body() dto: CreateSuccessionPlanDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.planService.create(t || u, dto);
  }

  @Patch(':planId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a succession plan' })
  update(
    @Param('planId') planId: string,
    @Body() dto: UpdateSuccessionPlanDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.planService.update(t || u, planId, dto);
  }

  @Delete(':planId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a succession plan' })
  async delete(
    @Param('planId') planId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.planService.delete(t || u, planId);
    return { success: true };
  }

  @Post(':planId/successors')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a successor to a plan' })
  addSuccessor(
    @Param('planId') planId: string,
    @Body() dto: AddSuccessorDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.planService.addSuccessor(t || u, planId, dto);
  }

  @Delete(':planId/successors/:employeeId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a successor from a plan' })
  removeSuccessor(
    @Param('planId') planId: string,
    @Param('employeeId') employeeId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.planService.removeSuccessor(t || u, planId, employeeId);
  }
}
