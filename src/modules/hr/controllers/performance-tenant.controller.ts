import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  KpiTemplateService,
  FrameworkService,
  ReviewCycleService,
  PerformanceReviewService,
} from '../services';
import {
  UpsertKpiTemplateDto,
  UpdateFrameworkDto,
  CreateReviewCycleDto,
  UpdateManagerReviewSectionDto,
} from '../dtos';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';

@ApiTags('HR — KPI Templates (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/performance/kpi-templates')
export class KpiTemplateController {
  constructor(private readonly templateService: KpiTemplateService) {}

  @Get()
  @ApiOperation({ summary: 'List all KPI templates for this tenant' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.templateService.getAllTemplates(t || u);
  }

  @Get('for-job-title/:jobTitle')
  @ApiOperation({ summary: 'Get the KPI template for a specific job title' })
  getForJobTitle(
    @Param('jobTitle') jobTitle: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.templateService.getTemplateForJobTitle(
      t || u,
      decodeURIComponent(jobTitle),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create or update a KPI template for a job title' })
  upsert(
    @Body() dto: UpsertKpiTemplateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.templateService.upsertTemplate(t || u, dto);
  }

  @Delete(':templateId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a KPI template' })
  async delete(
    @Param('templateId') templateId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.templateService.deleteTemplate(t || u, templateId);
    return { success: true };
  }
}

@ApiTags('HR — Performance Frameworks (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/performance/frameworks')
export class FrameworkController {
  constructor(private readonly frameworkService: FrameworkService) {}

  @Get('competencies')
  @ApiOperation({
    summary:
      "Get this tenant's competency framework (seeds defaults on first access)",
  })
  getCompetencies(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.frameworkService.getOrCreateCompetencies(t || u);
  }

  @Patch('competencies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update the competency framework' })
  updateCompetencies(
    @Body() dto: UpdateFrameworkDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.frameworkService.updateCompetencies(t || u, dto);
  }

  @Get('values')
  @ApiOperation({
    summary:
      "Get this tenant's values framework (seeds defaults on first access)",
  })
  getValues(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.frameworkService.getOrCreateValues(t || u);
  }

  @Patch('values')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update the values framework' })
  updateValues(
    @Body() dto: UpdateFrameworkDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.frameworkService.updateValues(t || u, dto);
  }
}

@ApiTags('HR — Review Cycles (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/performance/cycles')
export class ReviewCycleController {
  constructor(private readonly cycleService: ReviewCycleService) {}

  @Get()
  @ApiOperation({ summary: 'List all review cycles for this tenant' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.cycleService.getAllCycles(t || u);
  }

  @Get(':cycleId')
  @ApiOperation({ summary: 'Get a cycle with all its performance reviews' })
  getDetail(
    @Param('cycleId') cycleId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.cycleService.getCycleDetail(t || u, cycleId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new draft review cycle' })
  create(
    @Body() dto: CreateReviewCycleDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.cycleService.createCycle(t || u, dto);
  }

  @Post(':cycleId/open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Open a draft cycle so employees can begin their self-assessments',
  })
  open(
    @Param('cycleId') cycleId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.cycleService.openCycle(t || u, cycleId);
  }

  @Post(':cycleId/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close a cycle' })
  close(
    @Param('cycleId') cycleId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.cycleService.closeCycle(t || u, cycleId);
  }

  @Delete(':cycleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Discard a draft cycle' })
  async discard(
    @Param('cycleId') cycleId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.cycleService.discardDraftCycle(t || u, cycleId);
    return { success: true };
  }
}

@ApiTags('HR — Performance Reviews (Tenant/Manager)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/performance/reviews')
export class PerformanceReviewController {
  constructor(private readonly reviewService: PerformanceReviewService) {}

  @Get(':reviewId')
  @ApiOperation({
    summary: 'Get a single performance review, with live-computed scores',
  })
  async getOne(
    @Param('reviewId') reviewId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const review = await this.reviewService.getReviewById(t || u, reviewId);
    return { review, scores: this.reviewService.getScoredView(review) };
  }

  @Patch(':reviewId/manager')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update the manager's section of a review" })
  updateManagerSection(
    @Param('reviewId') reviewId: string,
    @Body() dto: UpdateManagerReviewSectionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.reviewService.updateManagerSection(t || u, reviewId, dto);
  }

  @Post(':reviewId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign off and complete the review — irreversible' })
  complete(
    @Param('reviewId') reviewId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.reviewService.completeReview(t || u, reviewId, u);
  }
}
