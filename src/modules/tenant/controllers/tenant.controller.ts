import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TenantService } from '../services/tenant.service';
import { UpdateTenantProfileDto, UpgradePlanDto } from '../dto/tenant.dto';
import {
  UserTypes,
  Roles,
  CurrentUser,
} from '../../../common/decorators/index';
import {
  UserType,
  TenantRole,
} from '../../../common/interfaces/user-role.enum';
import { PaginationDto } from '../../../common/pagination.dto';
import {
  QuickAddClientDto,
  ClientFilterDto,
  AssignClientDto,
  UpdateClientStatusDto,
  RequestClientInfoDto,
} from '../dto/client.dto';
import { TenantClientsService } from '../services/tenant-client.service';
import { Response } from 'express';

@ApiTags('Tenant')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('tenant')
export class TenantController {
  constructor(
    private readonly service: TenantService,
    private readonly tenantClientService: TenantClientsService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════

  @Get('dashboard')
  @ApiOperation({
    summary: 'Tenant dashboard — team stats, subscription, recent activity',
  })
  getDashboard(@CurrentUser('sub') tenantOwnerId: string) {
    return this.service.getDashboard(tenantOwnerId);
  }

  // ═══════════════════════════════════════════════════════════
  // TENANT PROFILE
  // ═══════════════════════════════════════════════════════════

  @Get('profile')
  @ApiOperation({ summary: 'Get tenant business profile' })
  getProfile(@CurrentUser('sub') userId: string) {
    return this.service.getMyProfile(userId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update tenant business profile' })
  updateMyProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateTenantProfileDto,
  ) {
    return this.service.updateMyProfile(userId, dto);
  }

  // ═══════════════════════════════════════════════════════════
  // CLIENT MANAGEMENT
  // ═══════════════════════════════════════════════════════════
  // ── Stats ─────────────────────────────────────────────────
  @Get('client-stats')
  @ApiOperation({ summary: 'Client statistics for this tenant' })
  getStats(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.tenantClientService.getClientStats(t || u);
  }
  // ── Quick-add ─────────────────────────────────────────────
  @Post('create-client')
  @ApiOperation({
    summary: 'Add a new client',
    description:
      'Creates client with fullName, email, phoneNumber, clientType. Emails credentials.',
  })
  quickAdd(
    @Body() dto: QuickAddClientDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.tenantClientService.quickAddClient(dto, t || u, u);
  }

  // ── List all ──────────────────────────────────────────────
  @Get('my-clients')
  @ApiOperation({ summary: 'List all clients with filters' })
  findAll(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query() pagination: PaginationDto,
    @Query() filters: ClientFilterDto,
  ) {
    return this.tenantClientService.getClients(t || u, pagination, filters);
  }

  // ── Get Client Report ────────────────────────────────────────────────
  @Get('my-clients/:id/report')
  @ApiOperation({ summary: 'Download full KYC report for a client as PDF' })
  async downloadClientReport(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const { filePath, fileName } =
      await this.tenantClientService.generateClientReport(id, t || u);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const stream = require('fs').createReadStream(filePath);
    stream.pipe(res);

    // Clean up file after streaming
    stream.on('end', () => {
      require('fs').unlink(filePath, () => {});
    });
  }

  // ── Get one ───────────────────────────────────────────────
  @Get('my-clients/:id')
  @ApiOperation({ summary: 'Get client full details' })
  findOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.tenantClientService.getClientById(id, t || u);
  }

  // ── Pending Approvals (Onboarding & CDD queue) ────────────
  @Get('pending-approvals')
  @ApiOperation({
    summary: 'List clients who are yet to start their KYC process',
    description:
      'Returns clients with kycStatus: not_started | in_progress | submitted',
  })
  getPendingApprovals(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.tenantClientService.getPendingApprovals(t || u, pagination);
  }

  @Get('onboarding')
  @ApiOperation({
    summary: 'List clients actively filling or who have submitted onboarding',
    description: 'Returns clients with kycStatus: in_progress | submitted',
  })
  getOnboardingInProgress(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.tenantClientService.getOnboardingInProgress(t || u, pagination);
  }

  // ── Assign ────────────────────────────────────────────────
  @Patch(':id/assign')
  @Roles(
    TenantRole.TENANT_OWNER,
    TenantRole.TENANT_ADMIN,
    TenantRole.TENANT_MANAGER,
  )
  @ApiOperation({ summary: 'Assign client to a team member' })
  assign(
    @Param('id') id: string,
    @Body() dto: AssignClientDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.tenantClientService.assignClient(id, dto, t || u);
  }

  // ── Approve ───────────────────────────────────────────────

  @Post(':id/verify')
  @Roles(
    TenantRole.TENANT_OWNER,
    TenantRole.TENANT_ADMIN,
    TenantRole.TENANT_COMPLIANCE,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run AML/KYC verifications [compliance]',
    description:
      'Runs PEP screening, sanctions check, UBO identification, and adverse media ' +
      'screening against OpenSanctions. Computes a risk score and saves all results. ' +
      'Must be completed before approval is allowed.',
  })
  runVerifications(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.tenantClientService.runVerifications(id, t || u, u);
  }

  @Post(':id/approve')
  @Roles(
    TenantRole.TENANT_OWNER,
    TenantRole.TENANT_ADMIN,
    TenantRole.TENANT_COMPLIANCE,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve a client [compliance]',
    description:
      'Client must have submitted their onboarding AND verifications must be ' +
      'marked complete before approval is allowed.',
  })
  approve(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.tenantClientService.approveClient(id, t || u, u);
  }

  // ── Reject ────────────────────────────────────────────────
  @Post(':id/reject')
  @Roles(
    TenantRole.TENANT_OWNER,
    TenantRole.TENANT_ADMIN,
    TenantRole.TENANT_COMPLIANCE,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a client [compliance]' })
  reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.tenantClientService.rejectClient(id, t || u, u, reason);
  }

  // ── Reactivate ─────────────────────────────────────────────
  @Patch(':id/reactivate')
  @Roles(
    TenantRole.TENANT_OWNER,
    TenantRole.TENANT_ADMIN,
    TenantRole.TENANT_COMPLIANCE,
  )
  @ApiOperation({
    summary: 'Reactivate a rejected/inactive client [owner, admin, compliance]',
    description:
      'Sets client status back to pending and resets KYC to not_started so they can redo onboarding.',
  })
  reactivate(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.tenantClientService.reactivateClient(id, t || u, u);
  }

  // ── Request info ──────────────────────────────────────────
  @Post(':id/request-info')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request additional info from client' })
  requestInfo(
    @Param('id') id: string,
    @Body() dto: RequestClientInfoDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.tenantClientService.requestInfo(id, t || u, dto);
  }

  // ── Status ────────────────────────────────────────────────
  @Patch(':id/status')
  @Roles(
    TenantRole.TENANT_OWNER,
    TenantRole.TENANT_ADMIN,
    TenantRole.TENANT_MANAGER,
  )
  @ApiOperation({ summary: 'Update client status' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateClientStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.tenantClientService.updateClientStatus(id, dto, t || u);
  }

  // ── Remove ────────────────────────────────────────────────
  @Delete(':id')
  @Roles(TenantRole.TENANT_OWNER, TenantRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Deactivate client [owner, admin]' })
  remove(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.tenantClientService.deleteClient(id, t || u);
  }

  // ═══════════════════════════════════════════════════════════
  // MODULES
  // ═══════════════════════════════════════════════════════════

  @Get('modules')
  @ApiOperation({
    summary: 'View active modules on current subscription',
    description:
      'Shows which platform modules are available based on the tenant subscription plan.',
  })
  getMyModules(
    @CurrentUser('sub') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    const resolvedTenantId = tenantId || userId;
    return this.service.getMyModules(resolvedTenantId);
  }

  @Get('plans')
  @ApiOperation({
    summary: 'Get available subscription plans',
    description: 'Returns all active plans that the tenant can upgrade to.',
  })
  getAvailablePlans() {
    return this.service.getAvailablePlans();
  }

  @Post('upgrade-plan')
  @HttpCode(HttpStatus.OK)
  @Roles(TenantRole.TENANT_OWNER)
  @ApiOperation({
    summary: 'Self-upgrade subscription plan [owner only]',
    description: 'Tenant owner upgrades their subscription to a new plan.',
  })
  upgradePlan(
    @Body() dto: UpgradePlanDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.upgradePlan(t || u, dto.plan);
  }
}
