import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';
import { SupportTicketService } from '../services';
import {
  CreateSupportTicketDto,
  EscalateTicketDto,
  SupportMessageDto,
  AdminSupportMessageDto,
  SetSupportStatusDto,
} from '../dtos';
import {
  SupportTicketStatus,
  SupportTicketPriority,
  SupportTicketSource,
} from '../schemas';

// Tenant side: raise a ticket to the platform team, follow it, and escalate a
// client's Portal-access ticket.
@ApiTags('Platform Support (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@Controller('support/tickets')
export class TenantSupportTicketController {
  constructor(private readonly service: SupportTicketService) {}

  @Get()
  @ApiOperation({ summary: "This tenant's tickets to the platform team" })
  list(
    @Query('status') status: SupportTicketStatus | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.listForTenant(t || u, status);
  }

  @Post()
  @ApiOperation({ summary: 'Raise a ticket to the platform team' })
  create(
    @Body() dto: CreateSupportTicketDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, u, dto);
  }

  // Declared before ':id' so these literal prefixes aren't read as an id.
  @Get('by-client-ticket/:clientTicketId')
  @ApiOperation({
    summary:
      'The platform thread behind a client ticket (null if not escalated)',
  })
  byClientTicket(
    @Param('clientTicketId') clientTicketId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getForClientTicket(t || u, clientTicketId);
  }

  @Post('escalate/:clientTicketId')
  @ApiOperation({
    summary:
      "Escalate a client's Portal-access ticket to the platform team — nothing about the client is sent",
  })
  escalate(
    @Param('clientTicketId') clientTicketId: string,
    @Body() dto: EscalateTicketDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.escalate(t || u, u, clientTicketId, dto);
  }

  @Get(':id')
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getForTenant(t || u, id);
  }

  @Post(':id/messages')
  reply(
    @Param('id') id: string,
    @Body() dto: SupportMessageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.tenantReply(t || u, u, id, dto.body);
  }

  @Patch(':id/close')
  close(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.tenantSetStatus(t || u, id, true);
  }

  @Patch(':id/reopen')
  reopen(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.tenantSetStatus(t || u, id, false);
  }
}

// Super Admin side: every tenant's tickets in one inbox. Responses never carry
// a link to a tenant's client (see SupportTicketService.forAdmin).
@ApiTags('SuperAdmin — Platform Support Tickets')
@ApiBearerAuth()
@UserTypes(UserType.SUPER_ADMIN)
@Controller('super-admin/support-tickets')
export class AdminSupportTicketController {
  constructor(private readonly service: SupportTicketService) {}

  @Get()
  list(
    @Query('status') status?: SupportTicketStatus,
    @Query('priority') priority?: SupportTicketPriority,
    @Query('source') source?: SupportTicketSource,
    @Query('needsReply') needsReply?: string,
    @Query('q') q?: string,
  ) {
    return this.service.adminList({
      status,
      priority,
      source,
      needsReply: needsReply === 'true',
      q,
    });
  }

  @Get('stats')
  stats() {
    return this.service.adminStats();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.adminGet(id);
  }

  @Post(':id/messages')
  reply(
    @Param('id') id: string,
    @Body() dto: AdminSupportMessageDto,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.adminReply(u, id, dto);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetSupportStatusDto,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.adminSetStatus(u, id, dto.status);
  }

  @Post(':id/assign')
  assign(@Param('id') id: string, @CurrentUser('sub') u: string) {
    return this.service.adminAssignToMe(u, id);
  }
}
