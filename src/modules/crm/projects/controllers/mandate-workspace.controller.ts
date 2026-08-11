import {
  Controller,
  Get,
  Post,
  Delete,
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
import { MandateWorkspaceService } from '../services';
import {
  CreateMessageDto,
  CreateNoteDto,
  CreateFolderDto,
  FileClientDocumentDto,
} from '../dtos';
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

@ApiTags('CRM — Projects — Mandate workspace (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('crm/mandates/:mandateId')
export class MandateWorkspaceController {
  constructor(private readonly service: MandateWorkspaceService) {}

  // ── Messages ─────────────────────────────────────────────────

  @Get('messages')
  @ApiOperation({ summary: 'Client communications thread for this mandate' })
  getMessages(
    @Param('mandateId') mandateId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMessages(t || u, mandateId);
  }

  @Post('messages')
  @ApiOperation({ summary: 'Send a message to the client' })
  addMessage(
    @Param('mandateId') mandateId: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addMessage(t || u, mandateId, dto);
  }

  // ── Notes ────────────────────────────────────────────────────

  @Get('notes')
  @ApiOperation({ summary: 'Internal notes for this mandate' })
  getNotes(
    @Param('mandateId') mandateId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getNotes(t || u, mandateId);
  }

  @Post('notes')
  @ApiOperation({ summary: 'Add an internal note' })
  addNote(
    @Param('mandateId') mandateId: string,
    @Body() dto: CreateNoteDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addNote(t || u, mandateId, dto);
  }

  @Delete('notes/:noteId')
  @ApiOperation({ summary: 'Delete a note' })
  deleteNote(
    @Param('mandateId') mandateId: string,
    @Param('noteId') noteId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.deleteNote(t || u, mandateId, noteId);
  }

  // ── Documents & folders ──────────────────────────────────────

  @Get('folders')
  @ApiOperation({
    summary: 'Folders for this mandate (default + custom + in use)',
  })
  getFolders(
    @Param('mandateId') mandateId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getFolders(t || u, mandateId);
  }

  @Post('folders')
  @ApiOperation({ summary: 'Create a new (initially empty) folder' })
  addFolder(
    @Param('mandateId') mandateId: string,
    @Body() dto: CreateFolderDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addFolder(t || u, mandateId, dto.folder);
  }

  @Get('documents')
  @ApiOperation({ summary: 'Documents, optionally filtered to one folder' })
  getDocuments(
    @Param('mandateId') mandateId: string,
    @Query('folder') folder: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getDocuments(t || u, mandateId, folder);
  }

  @Get('documents/received')
  @ApiOperation({
    summary: 'Documents received from the client, pending filing',
  })
  getReceivedFromClient(
    @Param('mandateId') mandateId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getReceivedFromClient(t || u, mandateId);
  }

  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { storage: documentStorage }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a document into a folder' })
  uploadDocument(
    @Param('mandateId') mandateId: string,
    @Query('folder') folder: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.uploadDocument(t || u, mandateId, folder, 'You', file);
  }

  @Post('documents/:documentId/file')
  @ApiOperation({
    summary: 'Accept & file a document received from the client',
  })
  fileClientDocument(
    @Param('mandateId') mandateId: string,
    @Param('documentId') documentId: string,
    @Body() dto: FileClientDocumentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.fileClientDocument(
      t || u,
      mandateId,
      documentId,
      dto.folder,
    );
  }
}
