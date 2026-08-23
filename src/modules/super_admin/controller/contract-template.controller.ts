import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
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
} from '@nestjs/swagger';
import { PlatformContractTemplateService } from '../services/contract-template.service';
import {
  CreatePlatformContractTemplateDto,
  UpdatePlatformContractTemplateDto,
  SetTemplateStatusDto,
  UploadPlatformContractTemplateDto,
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
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const templateFileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new BadRequestException(
        'Only PDF or Word documents (.pdf, .doc, .docx) are accepted.',
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
  @ApiOperation({ summary: 'All platform contract templates' })
  getAll() {
    return this.service.getAll();
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

  @Post(':id/status')
  @ApiOperation({
    summary:
      'Publish or unpublish — published templates become available to every tenant',
  })
  setStatus(@Param('id') id: string, @Body() dto: SetTemplateStatusDto) {
    return this.service.setStatus(id, dto.status);
  }
}
