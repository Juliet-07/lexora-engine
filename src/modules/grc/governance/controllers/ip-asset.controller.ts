import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { IpAssetService } from '../services/ip-asset.service';
import {
  CreateIpAssetDto,
  CreateIpDeadlineDto,
  RenewIpAssetDto,
  UpdateIpAssetDto,
  UpdateIpDeadlineDto,
} from '../dtos/ip-charge.dto';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

const ALLOWED = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];
export const ipDocUpload = FileInterceptor('file', {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      const dir = join(process.cwd(), 'uploads', 'grc', 'ip-assets');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) =>
      cb(null, `${uuidv4()}${extname(file.originalname)}`),
  }),
  fileFilter: (_req, file, cb) =>
    ALLOWED.includes(file.mimetype)
      ? cb(null, true)
      : cb(new BadRequestException('Unsupported file type.'), false),
  limits: { fileSize: 25 * 1024 * 1024 },
});

@ApiTags('GRC — Governance — Intellectual Property')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/governance/ip-assets')
export class IpAssetController {
  constructor(private readonly service: IpAssetService) {}

  @Get()
  @ApiOperation({
    summary:
      'IP register with portfolio stats and the open renewals & deadlines (the same dates the compliance calendar shows)',
  })
  overview(@CurrentUser('tenantId') t: string, @CurrentUser('sub') u: string) {
    return this.service.getOverview(t || u);
  }

  @Post()
  create(
    @Body() dto: CreateIpAssetDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateIpAssetDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.update(t || u, id, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.remove(t || u, id);
  }

  @Post(':id/renew')
  @ApiOperation({ summary: 'Record a renewal — moves the expiry date on' })
  renew(
    @Param('id') id: string,
    @Body() dto: RenewIpAssetDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.renew(t || u, id, dto);
  }

  @Post(':id/deadlines')
  addDeadline(
    @Param('id') id: string,
    @Body() dto: CreateIpDeadlineDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.addDeadline(t || u, id, dto);
  }

  @Patch(':id/deadlines/:deadlineId')
  updateDeadline(
    @Param('id') id: string,
    @Param('deadlineId') deadlineId: string,
    @Body() dto: UpdateIpDeadlineDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.updateDeadline(t || u, id, deadlineId, dto);
  }

  @Delete(':id/deadlines/:deadlineId')
  removeDeadline(
    @Param('id') id: string,
    @Param('deadlineId') deadlineId: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.removeDeadline(t || u, id, deadlineId);
  }

  @Post(':id/documents')
  @UseInterceptors(ipDocUpload)
  @ApiConsumes('multipart/form-data')
  addDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.addDocument(t || u, id, file);
  }

  @Delete(':id/documents/:index')
  removeDocument(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.removeDocument(t || u, id, Number(index));
  }
}
