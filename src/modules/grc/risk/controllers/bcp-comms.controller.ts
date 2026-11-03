import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BcpCommsService, CommsUser } from '../services/bcp-comms.service';
import {
  ComposeCommsDto,
  CreateCommsContactDto,
  CreateCommsGroupDto,
  CreateCommsTemplateDto,
  LogCommsReceiptDto,
  ReorderCommsGroupsDto,
  ReturnCommsMessageDto,
  SaveCommsMessageDto,
  UpdateCommsContactDto,
  UpdateCommsGroupDto,
  UpdateCommsTemplateDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';

// BCP/DR → Stakeholder Communications. Everything is scoped to the
// tenant (an employee acts on behalf of the tenant they belong to).
@ApiTags('GRC — Risk')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/risk/bcp/comms')
export class BcpCommsController {
  constructor(private readonly comms: BcpCommsService) {}

  // ── Stakeholder register ───────────────────────────────────
  @Get('groups')
  listGroups(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.listGroups(t || u);
  }

  @Post('groups')
  createGroup(
    @Body() dto: CreateCommsGroupDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.createGroup(t || u, dto);
  }

  @Post('groups/reorder')
  reorderGroups(
    @Body() dto: ReorderCommsGroupsDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.reorderGroups(t || u, dto.ids);
  }

  @Patch('groups/:id')
  updateGroup(
    @Param('id') id: string,
    @Body() dto: UpdateCommsGroupDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.updateGroup(t || u, id, dto);
  }

  @Delete('groups/:id')
  deleteGroup(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.deleteGroup(t || u, id);
  }

  @Post('groups/:id/contacts')
  addContact(
    @Param('id') id: string,
    @Body() dto: CreateCommsContactDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.addContact(t || u, id, dto);
  }

  @Patch('contacts/:id')
  updateContact(
    @Param('id') id: string,
    @Body() dto: UpdateCommsContactDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.updateContact(t || u, id, dto);
  }

  @Delete('contacts/:id')
  deleteContact(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.deleteContact(t || u, id);
  }

  @Get('clients')
  listClients(
    @Query('search') search: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.listClients(t || u, search);
  }

  // ── Templates ──────────────────────────────────────────────
  @Get('templates')
  listTemplates(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.listTemplates(t || u);
  }

  @Post('templates')
  createTemplate(
    @Body() dto: CreateCommsTemplateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.createTemplate(t || u, dto);
  }

  @Patch('templates/:id')
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateCommsTemplateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.updateTemplate(t || u, id, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.deleteTemplate(t || u, id);
  }

  // ── Per-incident plan, notices and record ──────────────────
  @Get('incidents/:incidentId/plan')
  getPlan(
    @Param('incidentId') incidentId: string,
    @CurrentUser() user: CommsUser,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.getPlan(t || user.sub, incidentId, user);
  }

  @Get('incidents/:incidentId/record')
  getRecord(
    @Param('incidentId') incidentId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.getRecord(t || u, incidentId);
  }

  @Post('incidents/:incidentId/compose')
  compose(
    @Param('incidentId') incidentId: string,
    @Body() dto: ComposeCommsDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.compose(t || u, incidentId, dto);
  }

  @Get('incidents/:incidentId/messages')
  listMessages(
    @Param('incidentId') incidentId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.listMessages(t || u, incidentId);
  }

  @Get('incidents/:incidentId/messages/:id')
  getMessage(
    @Param('incidentId') incidentId: string,
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.getMessage(t || u, incidentId, id);
  }

  @Post('incidents/:incidentId/messages')
  createMessage(
    @Param('incidentId') incidentId: string,
    @Body() dto: SaveCommsMessageDto,
    @CurrentUser() user: CommsUser,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.saveMessage(t || user.sub, user, incidentId, dto);
  }

  @Patch('incidents/:incidentId/messages/:id')
  updateMessage(
    @Param('incidentId') incidentId: string,
    @Param('id') id: string,
    @Body() dto: SaveCommsMessageDto,
    @CurrentUser() user: CommsUser,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.saveMessage(t || user.sub, user, incidentId, dto, id);
  }

  @Post('incidents/:incidentId/messages/:id/issue')
  issue(
    @Param('incidentId') incidentId: string,
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.issue(t || u, incidentId, id);
  }

  @Post('incidents/:incidentId/messages/:id/resend-failed')
  resendFailed(
    @Param('incidentId') incidentId: string,
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.resendFailed(t || u, incidentId, id);
  }

  @Post('incidents/:incidentId/messages/:id/return')
  returnMessage(
    @Param('incidentId') incidentId: string,
    @Param('id') id: string,
    @Body() dto: ReturnCommsMessageDto,
    @CurrentUser() user: CommsUser,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.returnMessage(t || user.sub, user, incidentId, id, dto);
  }

  @Post('incidents/:incidentId/messages/:id/receipt')
  logReceipt(
    @Param('incidentId') incidentId: string,
    @Param('id') id: string,
    @Body() dto: LogCommsReceiptDto,
    @CurrentUser() user: CommsUser,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.logReceipt(t || user.sub, user, incidentId, id, dto);
  }

  @Delete('incidents/:incidentId/messages/:id')
  deleteMessage(
    @Param('incidentId') incidentId: string,
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.comms.deleteMessage(t || u, incidentId, id);
  }
}
