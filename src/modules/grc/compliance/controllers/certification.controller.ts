import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { CertificationService } from '../services';
import {
  CreateCertificationDto,
  UpdateRenewalStageDto,
  RecordRenewalDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

const evidenceStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const p = join(process.cwd(), 'uploads', 'compliance', 'certifications');
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
    cb(null, p);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

@ApiTags('GRC — Compliance')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/compliance/certifications')
export class CertificationController {
  constructor(private readonly service: CertificationService) {}

  @Post()
  create(
    @Body() dto: CreateCertificationDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Patch(':id/stage')
  updateStage(
    @Param('id') id: string,
    @Body() dto: UpdateRenewalStageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateStage(t || u, id, dto);
  }

  @Patch(':id/renew')
  recordRenewal(
    @Param('id') id: string,
    @Body() dto: RecordRenewalDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordRenewal(t || u, id, dto);
  }

  @Post(':id/evidence')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: evidenceStorage,
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  addEvidence(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addEvidence(t || u, id, files);
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
}
