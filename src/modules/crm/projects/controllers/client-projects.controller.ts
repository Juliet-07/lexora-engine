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
import { ClientProjectsService } from '../services';
import { CreateMessageDto } from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

const documentStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const p = join(process.cwd(), 'uploads', 'crm', 'mandates');
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
    cb(null, p);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

@ApiTags('CRM — Projects (Client)')
@ApiBearerAuth()
@UserTypes(UserType.CLIENT)
@RequiresModule(PlatformModuleKey.CRM)
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
