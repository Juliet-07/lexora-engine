import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { ReportingService } from './reporting.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, CurrentUser } from '../../common/decorators/index';

@ApiTags('Reporting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportingController {
  constructor(private readonly service: ReportingService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get dashboard summary metrics' })
  getDashboard(@CurrentUser('organizationId') orgId: string) {
    return this.service.getDashboardSummary(orgId);
  }

  @Get('compliance')
  @Roles('admin', 'compliance-officer', 'manager')
  @ApiOperation({ summary: 'Generate compliance report [compliance]' })
  @ApiQuery({ name: 'from', required: false, example: '2024-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2024-12-31' })
  getComplianceReport(
    @CurrentUser('organizationId') orgId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.generateComplianceReport(orgId, from, to);
  }

  @Get('financial')
  @Roles('admin', 'manager', 'accountant')
  @ApiOperation({ summary: 'Generate financial report [admin]' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getFinancialReport(
    @CurrentUser('organizationId') orgId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.generateFinancialReport(orgId, from, to);
  }

  @Get('clients')
  @ApiOperation({ summary: 'Generate client analytics report' })
  getClientReport(@CurrentUser('organizationId') orgId: string) {
    return this.service.generateClientReport(orgId);
  }

  @Get('projects')
  @ApiOperation({ summary: 'Generate project analytics report' })
  getProjectReport(@CurrentUser('organizationId') orgId: string) {
    return this.service.generateProjectReport(orgId);
  }
}
