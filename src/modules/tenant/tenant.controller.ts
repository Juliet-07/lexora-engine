import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';

import { TenantService } from './tenant.service';
import {
  UpdateTenantProfileDto,
  InviteTeamMemberDto,
  UpdateTeamMemberDto,
  UpdateTeamMemberStatusDto,
  TeamMemberFilterDto,
} from './dto/tenant.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserTypes, Roles, CurrentUser } from '../../common/decorators/index';
import { UserType, TenantRole } from '../../common/interfaces/user-role.enum';
import { PaginationDto } from '../../common/pagination.dto';
import {
  QuickAddClientDto,
  UpdateClientProfileDto,
  ClientFilterDto,
  AssignClientDto,
  UpdateClientStatusDto,
  RequestClientInfoDto,
} from './dto/client.dto';
import { TenantClientsService } from './tenant-client.service';

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
    // For team members, use their tenantId. For the owner, use their own id.
    return this.service.getDashboard(tenantOwnerId);
  }

  // ═══════════════════════════════════════════════════════════
  // PROFILE
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

  // ── Full profile update ───────────────────────────────────
  @Patch(':id/profile')
  @ApiOperation({ summary: 'Complete or update client full profile' })
  updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateClientProfileDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.tenantClientService.updateClientProfile(id, dto, t || u);
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
  @Post(':id/approve')
  @Roles(
    TenantRole.TENANT_OWNER,
    TenantRole.TENANT_ADMIN,
    TenantRole.TENANT_COMPLIANCE,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a client [compliance]' })
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

  // ── Reset password ────────────────────────────────────────
  // @Post(':id/reset-password')
  // @HttpCode(HttpStatus.OK)
  // @Roles(TenantRole.TENANT_OWNER, TenantRole.TENANT_ADMIN)
  // @ApiOperation({ summary: 'Reset client password [owner, admin]' })
  // resetPassword(
  //   @Param('id') id: string,
  //   @CurrentUser('sub') u: string,
  //   @CurrentUser('tenantId') t: string,
  // ) {
  //   return this.service.resetClientPassword(id, t || u);
  // }

  // ── Remove ────────────────────────────────────────────────
  // @Delete(':id')
  // @Roles(TenantRole.TENANT_OWNER, TenantRole.TENANT_ADMIN)
  // @ApiOperation({ summary: 'Deactivate client [owner, admin]' })
  // remove(
  //   @Param('id') id: string,
  //   @CurrentUser('sub') u: string,
  //   @CurrentUser('tenantId') t: string,
  // ) {
  //   return this.service.removeClient(id, t || u);
  // }
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
    // Owner: their own id IS their tenantId
    // Team member: their tenantId points to the owner
    const resolvedTenantId = tenantId || userId;
    return this.service.getMyModules(resolvedTenantId);
  }

  // ═══════════════════════════════════════════════════════════
  // TEAM MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  //   @Post('team')
  //   @Roles(TenantRole.TENANT_OWNER, TenantRole.TENANT_ADMIN)
  //   @ApiOperation({
  //     summary: 'Invite a new team member [owner, admin]',
  //     description:
  //       'Creates a team member account under this tenant and emails them credentials. ' +
  //       'Role hierarchy enforced — you can only assign roles below your own level.',
  //   })
  //   inviteTeamMember(
  //     @Body() dto: InviteTeamMemberDto,
  //     @CurrentUser('sub') userId: string,
  //     @CurrentUser('tenantId') tenantId: string,
  //     @CurrentUser('roles') roles: string[],
  //   ) {
  //     const resolvedTenantId = tenantId || userId;
  //     return this.service.inviteTeamMember(dto, resolvedTenantId, userId, roles);
  //   }

  @Get('team')
  @ApiOperation({ summary: 'List all team members' })
  getTeamMembers(
    @CurrentUser('sub') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query() pagination: PaginationDto,
    @Query() filters: TeamMemberFilterDto,
  ) {
    const resolvedTenantId = tenantId || userId;
    return this.service.getTeamMembers(resolvedTenantId, pagination, filters);
  }

  @Get('team/:id')
  @ApiOperation({ summary: 'Get team member by ID' })
  getTeamMember(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    const resolvedTenantId = tenantId || userId;
    return this.service.getTeamMemberById(id, resolvedTenantId);
  }

  @Patch('team/:id')
  @Roles(TenantRole.TENANT_OWNER, TenantRole.TENANT_ADMIN)
  @ApiOperation({
    summary: 'Update team member details or role [owner, admin]',
  })
  updateTeamMember(
    @Param('id') id: string,
    @Body() dto: UpdateTeamMemberDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('roles') roles: string[],
  ) {
    const resolvedTenantId = tenantId || userId;
    return this.service.updateTeamMember(id, dto, resolvedTenantId, roles);
  }

  @Patch('team/:id/status')
  @Roles(TenantRole.TENANT_OWNER, TenantRole.TENANT_ADMIN)
  @ApiOperation({
    summary: 'Activate, suspend or deactivate a team member [owner, admin]',
  })
  updateTeamMemberStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTeamMemberStatusDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    const resolvedTenantId = tenantId || userId;
    return this.service.updateTeamMemberStatus(id, dto, resolvedTenantId);
  }

  //   @Post('team/:id/reset-password')
  //   @HttpCode(HttpStatus.OK)
  //   @Roles(TenantRole.TENANT_OWNER, TenantRole.TENANT_ADMIN)
  //   @ApiOperation({ summary: 'Reset team member password [owner, admin]' })
  //   resetTeamMemberPassword(
  //     @Param('id') id: string,
  //     @CurrentUser('sub') userId: string,
  //     @CurrentUser('tenantId') tenantId: string,
  //   ) {
  //     const resolvedTenantId = tenantId || userId;
  //     return this.service.resetTeamMemberPassword(id, resolvedTenantId);
  //   }

  @Delete('team/:id')
  @Roles(TenantRole.TENANT_OWNER, TenantRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Deactivate (remove) a team member [owner, admin]' })
  removeTeamMember(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    const resolvedTenantId = tenantId || userId;
    return this.service.removeTeamMember(id, resolvedTenantId);
  }
}
