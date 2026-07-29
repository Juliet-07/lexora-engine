import {
  Controller,
  Get,
  Post,
  Patch,
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
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ComplianceObligationService } from '../services';
import {
  CreateObligationDto,
  SetFilingStageDto,
  CertifyFilingDto,
  ConfirmReceiptDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';

const evidenceStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const p = join(process.cwd(), 'uploads', 'compliance', 'filings');
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
@Controller('grc/compliance/obligations')
export class ComplianceObligationController {
  constructor(
    private readonly service: ComplianceObligationService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  @Post()
  async create(
    @Body() dto: CreateObligationDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.service.create(tenantId, dto, businessName);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get('filings')
  getAllFilings(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAllFilings(t || u);
  }

  @Patch('filings/:id/stage')
  setStage(
    @Param('id') id: string,
    @Body() dto: SetFilingStageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setStage(t || u, id, dto);
  }

  @Post('filings/:id/evidence')
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

  @Patch('filings/:id/certify')
  certify(
    @Param('id') id: string,
    @Body() dto: CertifyFilingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.certify(t || u, id, dto);
  }

  @Patch('filings/:id/confirm-receipt')
  confirmReceipt(
    @Param('id') id: string,
    @Body() dto: ConfirmReceiptDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.confirmReceipt(t || u, id, dto);
  }
}
