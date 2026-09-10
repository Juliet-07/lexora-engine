import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClientCaseService } from '../services';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';

@ApiTags('CRM — Projects — Cases (Client)')
@ApiBearerAuth()
@UserTypes(UserType.CLIENT)
@Controller('crm/client-cases')
export class ClientCaseController {
  constructor(private readonly service: ClientCaseService) {}

  @Get()
  @ApiOperation({
    summary:
      "The client's own ADR and litigation cases, across every mandate genuinely theirs",
  })
  getMyCases(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMyCases(t || u, u);
  }

  @Get(':type/:id')
  @ApiOperation({
    summary:
      "One case's detail — only if this client is genuinely the client on the mandate it sits under. type is 'adr' or 'litigation'.",
  })
  getMyCase(
    @Param('type') type: 'adr' | 'litigation',
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMyCase(t || u, u, type, id);
  }

  @Get('adr/:id/messages')
  @ApiOperation({ summary: "This case's message thread with the firm" })
  getMessages(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMessages(t || u, u, id);
  }

  @Post('adr/:id/messages')
  @ApiOperation({ summary: 'Reply to the firm on this case' })
  sendMessage(
    @Param('id') id: string,
    @Body() dto: { author: string; body: string },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.sendMessage(t || u, u, id, dto);
  }
}
