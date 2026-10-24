import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EventService, EventAutomationService } from '../services';
import {
  CreateEventDto,
  UpdateEventDto,
  InviteToEventDto,
  RegisterForEventDto,
  UpdateEventAutomationDto,
  MarkAttendanceDto,
  RecordEventOutcomeDto,
  CancelEventDto,
  SubmitEventFeedbackDto,
  SetOpenRegistrationDto,
} from '../dtos';
import { CurrentUser, UserTypes, Public } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Tools — Events')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('tools/events')
export class EventController {
  constructor(
    private readonly service: EventService,
    private readonly automation: EventAutomationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'All events' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One event' })
  getById(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an event, as a draft' })
  create(
    @Body() dto: CreateEventDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Edit an event — allowed while Draft or Published; refused once Completed or Cancelled',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.update(t || u, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an event' })
  delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.delete(t || u, id);
  }

  @Post(':id/invite')
  @ApiOperation({
    summary:
      'Invite real clients/board members/employees (in-house) or contacts (external); emails immediately if the event is already published',
  })
  invite(
    @Param('id') id: string,
    @Body() dto: InviteToEventDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.inviteMembers(t || u, id, dto);
  }

  @Delete(':id/invites/:inviteId')
  @ApiOperation({ summary: "Remove an invite that hasn't responded yet" })
  removeInvite(
    @Param('id') id: string,
    @Param('inviteId') inviteId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.removeInvite(t || u, id, inviteId);
  }

  @Post(':id/open-link')
  @ApiOperation({
    summary:
      'The shareable public registration link of an external event (created on first use) — for people who are not CRM contacts',
  })
  openLink(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getOpenLink(t || u, id);
  }

  @Patch(':id/open-registration')
  @ApiOperation({
    summary:
      'Switch the public registration link on or off, or replace it with a new one',
  })
  setOpenRegistration(
    @Param('id') id: string,
    @Body() dto: SetOpenRegistrationDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setOpenRegistration(t || u, id, dto ?? {});
  }

  @Post(':id/publish')
  @ApiOperation({
    summary:
      'Publish a draft event — real emails go out now to every invitee, carrying their registration link (external) or portal link (in-house)',
  })
  publish(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.publish(t || u, id);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary:
      'Cancel an event — everyone already invited is emailed unless notifyInvitees is false',
  })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelEventDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.cancel(t || u, id, dto ?? {});
  }

  @Patch(':id/automation')
  @ApiOperation({
    summary:
      'Change which reminders and follow-ups run around the event (send only what changed)',
  })
  updateAutomation(
    @Param('id') id: string,
    @Body() dto: UpdateEventAutomationDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateAutomation(t || u, id, dto);
  }

  @Post(':id/automation/:key/send')
  @ApiOperation({
    summary:
      'Send one reminder / follow-up now instead of waiting for its scheduled time',
  })
  sendAutomationStep(
    @Param('id') id: string,
    @Param('key') key: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.automation.runNow(t || u, id, key);
  }

  @Post(':id/attendance')
  @ApiOperation({
    summary:
      'Record who actually attended (once the event has started) — overrides the registration / acknowledgement signal',
  })
  markAttendance(
    @Param('id') id: string,
    @Body() dto: MarkAttendanceDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.markAttendance(t || u, id, dto);
  }

  @Patch(':id/outcome')
  @ApiOperation({
    summary:
      'Record the post-event results: walk-ins, leads, follow-up calls, recording & materials, notes',
  })
  recordOutcome(
    @Param('id') id: string,
    @Body() dto: RecordEventOutcomeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordOutcome(t || u, id, dto);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Mark a published event completed' })
  complete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.complete(t || u, id);
  }
}

// ── Public, token-gated registration — same reasoning as the
// Contract module's public signing routes: the counterparty (a CRM
// contact) is frequently not a registered platform user at all, so
// this is deliberately not behind @UserTypes. ────────────────────
@ApiTags('CRM — Tools — Events — Public Registration (no auth)')
@Public()
@Controller('tools/events/register')
export class EventRegistrationController {
  constructor(private readonly service: EventService) {}

  @Get(':token')
  @ApiOperation({ summary: 'View event details via a personal invite token' })
  getByToken(@Param('token') token: string) {
    return this.service.getPublicEventByToken(token);
  }

  @Post(':token')
  @ApiOperation({
    summary:
      'Register via a personal invite token — this submission is itself the attendance record',
  })
  register(@Param('token') token: string, @Body() dto: RegisterForEventDto) {
    return this.service.registerForEvent(token, dto);
  }
}

// ── Public open registration — the one shareable link per external
// event. Anyone with the link can register; they're added to the
// invitee list. ──────────────────────────────────────────────────
@ApiTags('CRM — Tools — Events — Public Open Registration (no auth)')
@Public()
@Controller('tools/events/join')
export class EventOpenRegistrationController {
  constructor(private readonly service: EventService) {}

  @Get(':token')
  @ApiOperation({ summary: 'View an event via its public registration link' })
  getByToken(@Param('token') token: string) {
    return this.service.getPublicEventByOpenToken(token);
  }

  @Post(':token')
  @ApiOperation({
    summary:
      'Register through the public link — adds the registrant to the invitee list',
  })
  register(@Param('token') token: string, @Body() dto: RegisterForEventDto) {
    return this.service.registerViaOpenLink(token, dto);
  }
}

// ── Public, token-gated feedback — the link in the post-event
// feedback email. The same personal token as registration, so there's
// nothing for the invitee to log in to. ──────────────────────────
@ApiTags('CRM — Tools — Events — Public Feedback (no auth)')
@Public()
@Controller('tools/events/feedback')
export class EventFeedbackController {
  constructor(private readonly service: EventService) {}

  @Get(':token')
  @ApiOperation({ summary: 'The event a feedback link belongs to' })
  getByToken(@Param('token') token: string) {
    return this.service.getFeedbackByToken(token);
  }

  @Post(':token')
  @ApiOperation({ summary: 'Submit a 1–5 rating and an optional comment' })
  submit(@Param('token') token: string, @Body() dto: SubmitEventFeedbackDto) {
    return this.service.submitFeedback(token, dto);
  }
}

// ── Client portal — same crm/client-* URL convention client-
// newsletters/client-invoices/client-projects already use. ───────
@ApiTags('CRM — Tools — Events — Client Portal')
@ApiBearerAuth()
@UserTypes(UserType.CLIENT)
@Controller('crm/client-events')
export class ClientEventController {
  constructor(private readonly service: EventService) {}

  @Get()
  @ApiOperation({ summary: 'In-house events I am invited to' })
  getMyEvents(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMyClientEvents(t || u, u);
  }

  @Post(':id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge my attendance' })
  acknowledge(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.acknowledgeAsClient(t || u, u, id);
  }
}

// ── Board portal — same board-portal/* convention
// BoardPortalNewsletterController already uses. ──────────────────
@ApiTags('CRM — Tools — Events — Board Portal')
@ApiBearerAuth()
@UserTypes(UserType.BOARD_MEMBER)
@Controller('board-portal/events')
export class BoardPortalEventController {
  constructor(private readonly service: EventService) {}

  @Get()
  @ApiOperation({ summary: 'In-house events I am invited to' })
  async getMyEvents(@CurrentUser('sub') userId: string) {
    const member = await this.service.resolveBoardMemberId(userId);
    return this.service.getMyBoardEvents(
      String(member.tenantId),
      String(member._id),
    );
  }

  @Post(':id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge my attendance' })
  async acknowledge(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    const member = await this.service.resolveBoardMemberId(userId);
    return this.service.acknowledgeAsBoardMember(
      String(member.tenantId),
      String(member._id),
      id,
    );
  }
}

// ── Employee self-service — lives here (rather than in
// ProjectsModule's MyProjectsController) since EventService itself
// lives in ToolsModule, which already imports ProjectsModule; the
// reverse import would be circular. Same UserTypes pairing
// MyProjectsController uses — a tenant owner can have a genuine
// linked Employee record too. ─────────────────────────────────────
@ApiTags('CRM — Tools — Events — Employee Self-Service')
@ApiBearerAuth()
@UserTypes(UserType.EMPLOYEE, UserType.TENANT)
@Controller('crm/my-events')
export class MyEventsController {
  constructor(private readonly service: EventService) {}

  @Get()
  @ApiOperation({ summary: 'In-house events I am invited to' })
  async getMyEvents(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const employee = await this.service.resolveEmployeeId(t || u, u);
    return this.service.getMyEmployeeEvents(t || u, String(employee._id));
  }

  @Post(':id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge my attendance' })
  async acknowledge(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const employee = await this.service.resolveEmployeeId(t || u, u);
    return this.service.acknowledgeAsEmployee(t || u, String(employee._id), id);
  }
}
