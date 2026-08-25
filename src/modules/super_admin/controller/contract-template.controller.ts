import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
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
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import {
  PlatformContractTemplateService,
  PlatformTemplateFolderService,
} from '../services/contract-template.service';
import {
  CreatePlatformContractTemplateDto,
  UpdatePlatformContractTemplateDto,
  SetTemplateStatusDto,
  UploadPlatformContractTemplateDto,
  SetTemplateFolderDto,
  CreatePlatformTemplateFolderDto,
  UpdatePlatformTemplateFolderDto,
} from '../dto/contract-template.dto';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';

// ── Same real disk-storage convention EngagementLetterController
// already uses — saves to /uploads/{feature}/ with a UUID filename,
// served back via main.ts's existing /uploads static prefix. ──────
const templateStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(process.cwd(), 'uploads', 'contract-templates');
    if (!existsSync(uploadPath)) {
      mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const ALLOWED_MIME_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const templateFileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new BadRequestException(
        'Only Word documents (.doc, .docx) are accepted.',
      ),
      false,
    );
  }
};

@ApiTags('Super Admin — Platform Contract Templates')
@ApiBearerAuth()
@UserTypes(UserType.SUPER_ADMIN)
@Controller('super-admin/contract-templates')
export class PlatformContractTemplateController {
  constructor(private readonly service: PlatformContractTemplateService) {}

  @Get()
  @ApiQuery({
    name: 'folderId',
    required: false,
    description:
      "Filter by folder, or 'uncategorized' for templates with no folder",
  })
  @ApiOperation({ summary: 'All platform contract templates' })
  getAll(@Query('folderId') folderId?: string) {
    return this.service.getAll(folderId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One platform contract template' })
  getOne(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an authored (rich-text) template, starting as Draft',
  })
  create(
    @Body() dto: CreatePlatformContractTemplateDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.service.create(dto, adminId);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: templateStorage,
      fileFilter: templateFileFilter,
      limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'title', 'category'],
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        category: { type: 'string' },
        jurisdiction: { type: 'string' },
        description: { type: 'string' },
        version: { type: 'string' },
      },
    },
  })
  @ApiOperation({
    summary:
      'Upload an existing PDF or Word document as a template, starting as Draft',
  })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadPlatformContractTemplateDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.service.upload(file, dto, adminId);
  }

  @Post(':id/replace-file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: templateStorage,
      fileFilter: templateFileFilter,
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: "Replace an uploaded template's real file" })
  replaceFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.replaceFile(id, file);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an authored template' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlatformContractTemplateDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a template — real file on disk is removed too, if any',
  })
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }

  @Patch(':id/folder')
  @ApiOperation({
    summary:
      'Move a template into a folder (or clear it back to uncategorized) — works for authored and uploaded templates alike',
  })
  setFolder(@Param('id') id: string, @Body() dto: SetTemplateFolderDto) {
    return this.service.setFolder(id, dto.folderId ?? null);
  }

  @Post(':id/status')
  @ApiOperation({
    summary:
      'Publish or unpublish — published templates become available to every tenant',
  })
  setStatus(@Param('id') id: string, @Body() dto: SetTemplateStatusDto) {
    return this.service.setStatus(id, dto.status);
  }
}

@ApiTags('Super Admin — Contract Template Folders')
@ApiBearerAuth()
@UserTypes(UserType.SUPER_ADMIN)
@Controller('super-admin/contract-template-folders')
export class PlatformTemplateFolderController {
  constructor(private readonly service: PlatformTemplateFolderService) {}

  @Get()
  @ApiOperation({
    summary: 'All folders, each with a real, live count of templates in it',
  })
  getAll() {
    return this.service.getAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create a folder' })
  create(
    @Body() dto: CreatePlatformTemplateFolderDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.service.create(dto, adminId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a folder / edit its description' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlatformTemplateFolderDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Delete a folder — refuses if it still has templates in it, so nothing gets silently orphaned',
  })
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
