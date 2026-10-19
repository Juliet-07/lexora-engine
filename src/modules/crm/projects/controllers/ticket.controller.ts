import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { TicketService, MandateService, TimeEntryService } from '../services';
import {
  AssignTicketDto,
  UpdateTicketStatusDto,
  AddTicketNoteDto,
  ConvertTicketToMandateDto,
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
  constructor(
    private readonly service: TicketService,
    // Composed here rather than inside TicketService, which stays a
    // leaf with no knowledge of Mandate/TimeEntry (see ProjectsModule's
    // docstring) — "Convert to mandate" genuinely needs both, so the
    // controller is where that composition belongs.
    private readonly mandateService: MandateService,
    private readonly timeEntryService: TimeEntryService,
  ) {}

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

  // Real conversion — a ticket that's grown past a quick fix becomes
  // a billable Mandate: the tenant confirms the engagement details
  // Mandate.create() needs (fee structure, manager, budget, target
  // date) that a ticket has no equivalent of, and whatever hours are
  // already logged on the ticket transfer onto the new mandate as its
  // first time entry. A ticket can only be converted once.
  @Post(':id/convert-to-mandate')
  @ApiOperation({
    summary:
      'Turn this ticket into a Mandate — billable engagement details confirmed here, logged ticket time carried over',
  })
  async convertToMandate(
    @Param('id') id: string,
    @Body() dto: ConvertTicketToMandateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const ticket = await this.service.getById(tenantId, id);
    if ((ticket as any).convertedToMandateId) {
      throw new BadRequestException(
        `This ticket was already converted to mandate ${(ticket as any).convertedToMandateRef}`,
      );
    }

    const mandate = await this.mandateService.create(tenantId, {
      name: dto.name?.trim() || ticket.subject,
      description: ticket.description || '',
      clientUserId: String(ticket.clientUserId),
      clientName: ticket.clientName,
      type: dto.type,
      manager: dto.manager,
      teamId: dto.teamId,
      teamName: dto.teamName,
      targetDate: dto.targetDate,
      budget: dto.budget,
      feeStructure: dto.feeStructure,
      currency: dto.currency,
    });

    // Carry over whatever time was already logged on the ticket — only
    // possible once there's a real agent to attribute it to; loggedHrs
    // has no logging UI yet (see Ticket.loggedHrs), so in practice this
    // is usually 0 today, but the transfer is real once that exists.
    if (ticket.loggedHrs > 0 && ticket.agentUserId) {
      await this.timeEntryService.create(tenantId, {
        memberUserId: String(ticket.agentUserId),
        member: ticket.agent || 'Service desk',
        mandateId: String((mandate as any)._id),
        mandateName: (mandate as any).name,
        taskTitle: `Service desk — ${ticket.ref}`,
        narrative: `Time logged on service desk ticket ${ticket.ref}: ${ticket.subject}`,
        date: new Date().toISOString(),
        hours: ticket.loggedHrs,
        billable: true,
      });
    }

    const updatedTicket = await this.service.markConverted(
      tenantId,
      id,
      String((mandate as any)._id),
      (mandate as any).ref,
    );
    return { mandate, ticket: updatedTicket };
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
