import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { ManagementReportingService } from '../services';
import {
  SaveExecutiveSummaryDto,
  EmailManagementReportDto,
  EmailBoardReportDto,
  SaveReportContentDto,
} from '../dtos';
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
@RequiresModule(PlatformModuleKey.CRM, PlatformModuleKey.FINANCE)
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

  @Get('pack')
  @ApiQuery({ name: 'displayCurrency', required: false })
  @ApiOperation({
    summary:
      'Everything the Finance → Report page shows for one period — overview, P&L, balance sheet, cash flow, trial balance, aged receivables/payables, budget vs actuals, ratios and the management report content',
  })
  getPack(
    @Param('periodType') periodType: ReportPeriodType,
    @Param('periodKey') periodKey: string,
    @Query('displayCurrency') displayCurrency: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getPack(t || u, periodType, periodKey, displayCurrency);
  }

  @Put('content')
  @ApiOperation({
    summary:
      "Save the tenant's own part of the management report — CEO/MD message, section commentary, risks and actions (each call saves only the parts it sends)",
  })
  saveContent(
    @Param('periodType') periodType: ReportPeriodType,
    @Param('periodKey') periodKey: string,
    @Body() dto: SaveReportContentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.saveContent(t || u, periodType, periodKey, dto, 'You');
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

  @Post('email-board')
  @ApiOperation({
    summary: 'Email the full report PDF to every active board member',
  })
  emailBoard(
    @Param('periodType') periodType: ReportPeriodType,
    @Param('periodKey') periodKey: string,
    @Body() dto: EmailBoardReportDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.emailReportToBoard(
      t || u,
      periodType,
      periodKey,
      dto.displayCurrency,
      dto.subject,
    );
  }
}
