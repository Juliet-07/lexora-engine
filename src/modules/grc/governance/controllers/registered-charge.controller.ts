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
import { RegisteredChargeService } from '../services/registered-charge.service';
import {
  CreateChargeDto,
  SatisfyChargeDto,
  UpdateChargeDto,
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
const chargeDocUpload = FileInterceptor('file', {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      const dir = join(process.cwd(), 'uploads', 'grc', 'charges');
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

@ApiTags('GRC — Governance — Register of Charges')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/governance/charges')
export class RegisteredChargeController {
  constructor(private readonly service: RegisteredChargeService) {}

  @Get()
  @ApiOperation({ summary: 'Register of charges with summary stats' })
  overview(@CurrentUser('tenantId') t: string, @CurrentUser('sub') u: string) {
    return this.service.getOverview(t || u);
  }

  @Post()
  create(
    @Body() dto: CreateChargeDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateChargeDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.update(t || u, id, dto);
  }

  @Post(':id/satisfy')
  @ApiOperation({ summary: 'Mark a charge as satisfied (released)' })
  satisfy(
    @Param('id') id: string,
    @Body() dto: SatisfyChargeDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.satisfy(t || u, id, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.remove(t || u, id);
  }

  @Post(':id/documents')
  @UseInterceptors(chargeDocUpload)
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
