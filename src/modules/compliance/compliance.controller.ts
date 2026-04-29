import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { ComplianceService } from './compliance.service';
import {
  CreateAlertDto,
  UpdateAlertDto,
  CreateCaseDto,
  UpdateCaseDto,
  AddCaseNoteDto,
  AssignCaseDto,
  AuditLogFilterDto,
} from './dto/compliance.dto';
import { AlertStatus, CaseStatus } from './schemas/compliance.schema';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, CurrentUser } from '../../common/decorators/index';
import { PaginationDto } from '../../common/pagination.dto';

@ApiTags('Compliance & Alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('compliance')
export class ComplianceController {
  constructor(private readonly service: ComplianceService) {}

  // Alerts
  @Post('alerts')
  @Roles('admin', 'compliance-officer', 'manager')
  @ApiOperation({ summary: 'Create a compliance alert [compliance]' })
  createAlert(
    @Body() dto: CreateAlertDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.createAlert(dto, orgId);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'List all alerts' })
  @ApiQuery({ name: 'status', enum: AlertStatus, required: false })
  findAlerts(
    @CurrentUser('organizationId') orgId: string,
    @Query() pagination: PaginationDto,
    @Query('status') status?: AlertStatus,
  ) {
    return this.service.findAlerts(orgId, pagination, status);
  }

  @Get('alerts/:id')
  @ApiOperation({ summary: 'Get alert by ID' })
  findAlert(@Param('id') id: string) {
    return this.service.findAlertById(id);
  }

  @Patch('alerts/:id')
  @Roles('admin', 'compliance-officer', 'manager')
  @ApiOperation({ summary: 'Update alert [compliance]' })
  updateAlert(
    @Param('id') id: string,
    @Body() dto: UpdateAlertDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.updateAlert(id, dto, userId);
  }

  @Patch('alerts/:id/resolve')
  @Roles('admin', 'compliance-officer')
  @ApiOperation({ summary: 'Resolve an alert [compliance]' })
  resolveAlert(
    @Param('id') id: string,
    @Body('notes') notes: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.resolveAlert(id, notes, userId);
  }

  // Cases
  @Post('cases')
  @Roles('admin', 'compliance-officer', 'manager')
  @ApiOperation({ summary: 'Create a compliance case [compliance]' })
  createCase(
    @Body() dto: CreateCaseDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.createCase(dto, orgId, userId);
  }

  @Get('cases')
  @ApiOperation({ summary: 'List all compliance cases' })
  @ApiQuery({ name: 'status', enum: CaseStatus, required: false })
  findCases(
    @CurrentUser('organizationId') orgId: string,
    @Query() pagination: PaginationDto,
    @Query('status') status?: CaseStatus,
  ) {
    return this.service.findCases(orgId, pagination, status);
  }

  @Get('cases/:id')
  @ApiOperation({ summary: 'Get case by ID' })
  findCase(@Param('id') id: string) {
    return this.service.findCaseById(id);
  }

  @Patch('cases/:id')
  @Roles('admin', 'compliance-officer', 'manager')
  @ApiOperation({ summary: 'Update case [compliance]' })
  updateCase(@Param('id') id: string, @Body() dto: UpdateCaseDto) {
    return this.service.updateCase(id, dto);
  }

  @Patch('cases/:id/assign')
  @Roles('admin', 'compliance-officer', 'manager')
  @ApiOperation({ summary: 'Assign case to a user [compliance]' })
  assignCase(@Param('id') id: string, @Body() dto: AssignCaseDto) {
    return this.service.assignCase(id, dto);
  }

  @Post('cases/:id/notes')
  @ApiOperation({ summary: 'Add a note to a compliance case' })
  addNote(
    @Param('id') id: string,
    @Body() dto: AddCaseNoteDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.addCaseNote(id, dto, userId);
  }

  @Patch('cases/:id/resolve')
  @Roles('admin', 'compliance-officer')
  @ApiOperation({ summary: 'Resolve a compliance case [compliance]' })
  resolveCase(@Param('id') id: string) {
    return this.service.resolveCase(id);
  }

  // Audit Logs
  @Get('audit-logs')
  @Roles('admin', 'compliance-officer', 'super-admin')
  @ApiOperation({ summary: 'Get audit logs [admin]' })
  getAuditLogs(
    @CurrentUser('organizationId') orgId: string,
    @Query() pagination: PaginationDto,
    @Query() filters: AuditLogFilterDto,
  ) {
    return this.service.getAuditLogs(orgId, pagination, filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get compliance dashboard statistics' })
  getStats(@CurrentUser('organizationId') orgId: string) {
    return this.service.getComplianceStats(orgId);
  }
}
