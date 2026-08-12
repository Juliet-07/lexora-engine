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
import { MyKbService, MyProjectsService, MyTicketsService } from '../services';
import {
  UpdateMyTaskDto,
  CreateEmployeeMessageDto,
  CreateMyTimeEntryDto,
  VoteKbArticleDto,
  UpdateTicketStatusDto,
  AddTicketNoteDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';
import { TicketStatus } from '../schemas';

@ApiTags('CRM — Employee Projects Controllers')
@ApiBearerAuth()
// Employees AND tenant owners — a tenant's own account can have a
// real, linked HR Employee record too (e.g. role "Owner"), and
// resolveEmployee() in the service already requires that real link
// to exist before returning anything. Restricting this to
// UserType.EMPLOYEE alone locked out exactly that case: an owner
// with real assigned work who should see it the same way any other
// employee does. Which of the two they are also changes what they're
// authorized to see once inside — see userType passed through below.
@UserTypes(UserType.EMPLOYEE, UserType.TENANT)
@Controller('crm')
export class MyProjectsController {
  constructor(private readonly service: MyProjectsService) {}

  @Get('my-mandates')
  @ApiOperation({
    summary:
      "Mandates the caller is involved in — every mandate for a tenant-type caller, or the employee's own team/task links for a genuine employee",
  })
  getMyMandates(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('userType') userType: string,
  ) {
    return this.service.getMyMandates(t || u, u, userType);
  }

  @Get('my-mandates/:id')
  @ApiOperation({
    summary:
      'One mandate — unrestricted for a tenant-type caller, team/task-gated for a genuine employee',
  })
  getMandateDetail(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('userType') userType: string,
  ) {
    return this.service.getMandateDetail(t || u, u, id, userType);
  }

  @Get('my-mandates/:id/tasks')
  @ApiOperation({
    summary: 'All tasks on the mandate (any assignee) — the Board view',
  })
  getMandateTasks(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('userType') userType: string,
  ) {
    return this.service.getMandateTasks(t || u, u, id, userType);
  }

  @Get('my-mandates/:id/documents')
  @ApiOperation({ summary: "The mandate's real documents, read-only" })
  getMandateDocuments(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('userType') userType: string,
  ) {
    return this.service.getMandateDocuments(t || u, u, id, userType);
  }

  @Get('my-mandates/:id/messages')
  @ApiOperation({
    summary: 'My own message thread with the tenant for this mandate',
  })
  getMyMessages(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('userType') userType: string,
  ) {
    return this.service.getMyMessages(t || u, u, id, userType);
  }

  @Post('my-mandates/:id/messages')
  @ApiOperation({ summary: 'Reply to the tenant on this mandate' })
  sendMyMessage(
    @Param('id') id: string,
    @Body() dto: CreateEmployeeMessageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('userType') userType: string,
  ) {
    return this.service.sendMyMessage(t || u, u, id, userType, dto);
  }

  @Get('my-tasks')
  @ApiQuery({ name: 'mandateId', required: false })
  @ApiOperation({
    summary:
      'The caller\'s own tasks — always personal, even for a tenant-type caller, since "my tasks" means work assigned to them specifically, not everyone\'s',
  })
  getMyTasks(
    @Query('mandateId') mandateId: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMyTasks(t || u, u, mandateId);
  }

  @Patch('my-tasks/:id')
  @ApiOperation({
    summary: "Move status or log hours on the caller's own task",
  })
  updateMyTask(
    @Param('id') id: string,
    @Body() dto: UpdateMyTaskDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateMyTask(t || u, u, id, dto);
  }

  @Get('my-time-entries')
  @ApiQuery({ name: 'mandateId', required: false })
  @ApiOperation({ summary: "The caller's own time entries" })
  getMyTimeEntries(
    @Query('mandateId') mandateId: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMyTimeEntries(t || u, u, mandateId);
  }

  @Post('my-time-entries')
  @ApiOperation({
    summary:
      'Log time against a mandate the caller has real access to (starts as Draft)',
  })
  logMyTime(
    @Body() dto: CreateMyTimeEntryDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.logMyTime(t || u, u, dto);
  }

  @Post('my-time-entries/:id/submit')
  @ApiOperation({
    summary: "Submit one of the caller's own draft entries for approval",
  })
  submitMyTimeEntry(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.submitMyTimeEntry(t || u, u, id);
  }
}

@ApiTags('CRM — Employee Projects Controllers')
@ApiBearerAuth()
@UserTypes(UserType.EMPLOYEE, UserType.TENANT)
@Controller('crm/my-tickets')
export class MyTicketsController {
  constructor(private readonly service: MyTicketsService) {}

  @Get()
  @ApiQuery({ name: 'status', required: false, enum: TicketStatus })
  @ApiOperation({ summary: 'Tickets assigned to me' })
  getMyTickets(
    @Query('status') status: TicketStatus | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMyTickets(t || u, u, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One ticket, only if assigned to me' })
  getMyTicket(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMyTicket(t || u, u, id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Move status on my own assigned ticket' })
  setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setStatus(t || u, u, id, dto);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a note — internal or sent to the client' })
  addNote(
    @Param('id') id: string,
    @Body() dto: AddTicketNoteDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addNote(t || u, u, id, dto);
  }
}

@ApiTags('CRM — Employee Projects Controllers')
@ApiBearerAuth()
@UserTypes(UserType.EMPLOYEE, UserType.TENANT)
@Controller('crm/my-kb-articles')
export class MyKbController {
  constructor(private readonly service: MyKbService) {}

  @Get()
  @ApiOperation({ summary: 'Published internal articles' })
  getArticles(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getArticles(t || u);
  }

  @Get('suggest')
  @ApiQuery({ name: 'q', required: true })
  @ApiOperation({
    summary: 'Keyword-matched suggestions, e.g. for the current ticket',
  })
  suggest(
    @Query('q') q: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.suggest(t || u, q ?? '');
  }

  @Post(':id/view')
  @ApiOperation({ summary: 'Record a view' })
  recordView(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordView(t || u, id);
  }

  @Post(':id/vote')
  @ApiOperation({ summary: 'Vote helpful / not helpful' })
  vote(
    @Param('id') id: string,
    @Body() dto: VoteKbArticleDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.vote(t || u, id, dto);
  }
}
