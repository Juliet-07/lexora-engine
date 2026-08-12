import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import {
  ClientKbService,
  ClientProjectsService,
  ClientTicketsService,
} from '../services';
import {
  CreateMessageDto,
  CreateTicketDto,
  RateTicketDto,
  ReplyTicketDto,
  VoteKbArticleDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';

const documentStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const p = join(process.cwd(), 'uploads', 'crm', 'mandates');
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
    cb(null, p);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

@ApiTags('CRM — Client Projects Controllers')
@ApiBearerAuth()
@UserTypes(UserType.CLIENT)
@Controller('crm/client-projects')
export class ClientProjectsController {
  constructor(private readonly service: ClientProjectsService) {}

  @Get()
  @ApiOperation({ summary: "The client's own mandates" })
  getMyProjects(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMyProjects(t || u, u);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One mandate — only if this client is genuinely the client on it',
  })
  getProjectDetail(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getProjectDetail(t || u, u, id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Communications thread with the tenant' })
  getMessages(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMessages(t || u, u, id);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a message to the tenant' })
  sendMessage(
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.sendMessage(t || u, u, id, dto);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'Documents on this mandate' })
  getDocuments(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getDocuments(t || u, u, id);
  }

  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file', { storage: documentStorage }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload a document — lands in "Client submissions" pending the tenant accepting & filing it',
  })
  uploadDocument(
    @Param('id') id: string,
    @Query('folder') folder: string | undefined,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.uploadDocument(
      t || u,
      u,
      id,
      folder || 'Client submissions',
      'Client',
      file,
    );
  }
}

@ApiTags('CRM — Client Projects Controllers')
@ApiBearerAuth()
@UserTypes(UserType.CLIENT)
@Controller('crm/client-tickets')
export class ClientTicketsController {
  constructor(private readonly service: ClientTicketsService) {}

  @Post()
  @ApiOperation({ summary: 'Raise a new ticket' })
  raiseTicket(
    @Body() dto: CreateTicketDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.raiseTicket(t || u, u, dto.clientName, dto);
  }

  @Get()
  @ApiOperation({ summary: 'My own tickets' })
  getMyTickets(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMyTickets(t || u, u);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my own tickets' })
  getMyTicket(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMyTicket(t || u, u, id);
  }

  @Post(':id/reply')
  @ApiOperation({
    summary: 'Reply on my own ticket — always sent to the tenant',
  })
  reply(
    @Param('id') id: string,
    @Body() dto: ReplyTicketDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.reply(t || u, u, id, dto.clientName, dto.body);
  }

  @Post(':id/rate')
  @ApiOperation({ summary: 'Rate a closed ticket' })
  rate(
    @Param('id') id: string,
    @Body() dto: RateTicketDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.rate(t || u, u, id, dto);
  }
}

@ApiTags('CRM — Client Projects Controllers')
@ApiBearerAuth()
@UserTypes(UserType.CLIENT)
@Controller('crm/client-kb-articles')
export class ClientKbController {
  constructor(private readonly service: ClientKbService) {}

  @Get()
  @ApiOperation({ summary: 'Published client-facing articles' })
  getArticles(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getArticles(t || u);
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
