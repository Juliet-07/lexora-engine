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
  UploadedFiles,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { EsgFrameworkService } from '../services';
import {
  CreateFrameworkDto,
  UpdateFrameworkDto,
  SetFrameworkActiveDto,
  ReorderFrameworksDto,
  CreateIndicatorDto,
  UpdateIndicatorResponseDto,
  CompileReportDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

const evidenceStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const p = join(process.cwd(), 'uploads', 'esg', 'indicators');
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
    cb(null, p);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

@ApiTags('GRC — ESG')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/esg')
export class EsgFrameworkController {
  constructor(private readonly service: EsgFrameworkService) {}

  // ── Frameworks ───────────────────────────────────────────────

  @Get('frameworks')
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAllFrameworks(t || u);
  }

  @Get('frameworks/coverage')
  coverageForAll(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.coverageForAll(t || u);
  }

  @Post('frameworks')
  create(
    @Body() dto: CreateFrameworkDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.createFramework(t || u, dto);
  }

  @Patch('frameworks/reorder')
  reorder(
    @Body() dto: ReorderFrameworksDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.reorder(t || u, dto);
  }

  @Patch('frameworks/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFrameworkDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateFramework(t || u, id, dto);
  }

  @Patch('frameworks/:id/active')
  setActive(
    @Param('id') id: string,
    @Body() dto: SetFrameworkActiveDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setActive(t || u, id, dto);
  }

  @Delete('frameworks/:id')
  deleteFramework(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.deleteFramework(t || u, id);
  }

  // ── Indicators ───────────────────────────────────────────────

  @Get('frameworks/:frameworkId/indicators')
  getIndicators(
    @Param('frameworkId') frameworkId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getIndicators(t || u, frameworkId);
  }

  @Post('frameworks/:frameworkId/indicators')
  addIndicator(
    @Param('frameworkId') frameworkId: string,
    @Body() dto: CreateIndicatorDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addIndicator(t || u, frameworkId, dto);
  }

  @Patch('indicators/:id/response')
  updateResponse(
    @Param('id') id: string,
    @Body() dto: UpdateIndicatorResponseDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateResponse(t || u, id, dto);
  }

  @Post('indicators/:id/evidence')
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

  @Post('indicators/:id/submit')
  submitForSignOff(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.submitForSignOff(t || u, id);
  }

  @Post('indicators/:id/sign-off')
  signOff(
    @Param('id') id: string,
    @Query('signedOffBy') signedOffBy: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.signOff(
      t || u,
      id,
      signedOffBy || 'Sustainability Lead',
    );
  }

  // ── Reports ──────────────────────────────────────────────────

  @Get('reports')
  getReports(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getReports(t || u);
  }

  @Post('frameworks/:frameworkId/compile')
  compile(
    @Param('frameworkId') frameworkId: string,
    @Body() dto: CompileReportDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.compile(t || u, frameworkId, dto);
  }

  @Post('reports/:id/publish')
  publish(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.publish(t || u, id);
  }
}
