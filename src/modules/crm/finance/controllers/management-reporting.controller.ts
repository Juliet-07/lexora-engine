import { Controller, Get, Post, Body, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { ManagementReportingService } from '../services';
import { SaveExecutiveSummaryDto, EmailManagementReportDto } from '../dtos';
import { ReportPeriodType } from '../schemas';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Finance — Management Reporting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/management-reports/:periodType/:periodKey')
export class ManagementReportingController {
  constructor(private readonly service: ManagementReportingService) {}

  @Get()
  @ApiQuery({ name: 'displayCurrency', required: false })
  @ApiOperation({
    summary:
      'Real report for one period — revenue, expenses, position, and the saved executive summary',
  })
  getReport(
    @Param('periodType') periodType: ReportPeriodType,
    @Param('periodKey') periodKey: string,
    @Query('displayCurrency') displayCurrency: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getReport(
      t || u,
      periodType,
      periodKey,
      displayCurrency,
    );
  }

  @Post('executive-summary')
  @ApiOperation({
    summary: "Save the tenant's own written commentary for this period",
  })
  saveExecutiveSummary(
    @Param('periodType') periodType: ReportPeriodType,
    @Param('periodKey') periodKey: string,
    @Body() dto: SaveExecutiveSummaryDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.saveExecutiveSummary(
      t || u,
      periodType,
      periodKey,
      dto.executiveSummary,
      'You',
    );
  }

  @Get('pdf')
  @ApiQuery({ name: 'displayCurrency', required: false })
  @ApiOperation({ summary: 'Download the report as a PDF' })
  async downloadPdf(
    @Param('periodType') periodType: ReportPeriodType,
    @Param('periodKey') periodKey: string,
    @Query('displayCurrency') displayCurrency: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.downloadReportPdf(
      t || u,
      periodType,
      periodKey,
      displayCurrency,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="management-report-${periodKey}.pdf"`,
    });
    res.send(buffer);
  }

  @Post('email')
  @ApiOperation({
    summary: 'Email the report as a PDF to any recipient the tenant chooses',
  })
  emailReport(
    @Param('periodType') periodType: ReportPeriodType,
    @Param('periodKey') periodKey: string,
    @Body() dto: EmailManagementReportDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.emailReport(
      t || u,
      periodType,
      periodKey,
      dto.displayCurrency,
      dto.recipientName,
      dto.recipientEmail,
      dto.subject,
    );
  }
}
