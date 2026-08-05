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
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { PrecedentService } from '../services';
import {
  CreatePrecedentDto,
  CreatePrecedentFolderDto,
  UpdatePrecedentContentDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const precedentStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const p = join(process.cwd(), 'uploads', 'deals', 'precedents');
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
    cb(null, p);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

const docxFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  if (file.mimetype === DOCX_MIME) cb(null, true);
  else
    cb(
      new BadRequestException(
        'Only .docx files are supported (legacy .doc is not).',
      ),
      false,
    );
};

@ApiTags('Deals & Transactions')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.DEALS)
@Controller('deals/precedents')
export class PrecedentController {
  constructor(private readonly service: PrecedentService) {}

  @Post('folders')
  createFolder(
    @Body() dto: CreatePrecedentFolderDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.createFolder(t || u, dto);
  }

  @Get('folders')
  getFolders(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getFolders(t || u);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: precedentStorage,
      fileFilter: docxFilter,
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  create(
    @Body() dto: CreatePrecedentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    if (!file) throw new BadRequestException('A .docx file is required.');
    return this.service.create(t || u, dto, file);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get(':id')
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Patch(':id/content')
  updateContent(
    @Param('id') id: string,
    @Body() dto: UpdatePrecedentContentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateContent(t || u, id, dto);
  }

  @Post(':id/replace-document')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: precedentStorage,
      fileFilter: docxFilter,
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  replaceDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    if (!file) throw new BadRequestException('A .docx file is required.');
    return this.service.replaceDocument(t || u, id, file);
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.service.delete(t || u, id);
    return { success: true };
  }

  @Delete('folders/:id')
  deleteFolder(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.deleteFolder(t || u, id);
  }
}
