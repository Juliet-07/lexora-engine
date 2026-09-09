import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { TicketService } from '../services';
import {
  AssignTicketDto,
  UpdateTicketStatusDto,
  AddTicketNoteDto,
} from '../dtos';
import { TicketStatus } from '../schemas';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

// Deliberately no POST / here — tenants receive tickets, they don't
// raise them. Creation only exists on the client-facing controller.
@ApiTags('CRM — Projects — Service Desk (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('crm/tickets')
export class TicketController {
  constructor(private readonly service: TicketService) {}

  @Get()
  @ApiQuery({ name: 'status', required: false, enum: TicketStatus })
  @ApiQuery({ name: 'agentUserId', required: false })
  @ApiOperation({ summary: 'All tickets, optionally filtered' })
  getAll(
    @Query('status') status: TicketStatus | undefined,
    @Query('agentUserId') agentUserId: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAll(t || u, { status, agentUserId });
  }

  // ── SLA escalation settings — real, per-tenant preferences for
  // the "Breach management" tab. Declared before :id below so
  // "sla-settings" is never swallowed as a ticket id. ──
  @Get('sla-settings')
  @ApiOperation({ summary: "Get this tenant's SLA escalation settings" })
  getSlaSettings(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getSlaSettings(t || u);
  }

  @Patch('sla-settings')
  @ApiOperation({ summary: "Update this tenant's SLA escalation settings" })
  updateSlaSettings(
    @Body()
    dto: { notifyAt75?: boolean; notifyAt90?: boolean; notifyAt100?: boolean },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateSlaSettings(t || u, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One ticket' })
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Assign the ticket to an employee' })
  assign(
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.assign(t || u, id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Move ticket status' })
  setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setStatus(t || u, id, dto);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a note — internal or sent to the client' })
  addNote(
    @Param('id') id: string,
    @Body() dto: AddTicketNoteDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addNote(t || u, id, dto);
  }
}
