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
import {
  ControlService,
  TestPlanService,
  DeficiencyService,
} from '../services';
import {
  CreateControlDto,
  CreateTestDto,
  UpdateTestDto,
  AssignTestDto,
  CompleteTestDto,
  SignOffTestDto,
  CreateDeficiencyDto,
  UpdateDeficiencyDto,
  ValidateDeficiencyDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

const makeEvidenceStorage = (subfolder: string) =>
  diskStorage({
    destination: (_req, _file, cb) => {
      const p = join(process.cwd(), 'uploads', 'grc', 'risk', subfolder);
      if (!existsSync(p)) mkdirSync(p, { recursive: true });
      cb(null, p);
    },
    filename: (_req, file, cb) =>
      cb(null, `${uuidv4()}${extname(file.originalname)}`),
  });

const testEvidenceStorage = makeEvidenceStorage('tests');
const deficiencyEvidenceStorage = makeEvidenceStorage('deficiencies');

@ApiTags('GRC — Risk')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/risk/controls')
export class ControlController {
  constructor(
    private readonly controlService: ControlService,
    private readonly testPlanService: TestPlanService,
    private readonly deficiencyService: DeficiencyService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // CONTROL LIBRARY
  // ═══════════════════════════════════════════════════════════

  @Post()
  create(
    @Body() dto: CreateControlDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.controlService.create(t || u, dto);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.controlService.getAll(t || u);
  }

  // ═══════════════════════════════════════════════════════════
  // TEST PLAN
  // ═══════════════════════════════════════════════════════════

  @Post('tests')
  createTest(
    @Body() dto: CreateTestDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.testPlanService.create(t || u, dto);
  }

  @Get('tests')
  getAllTests(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.testPlanService.getAll(t || u);
  }

  @Patch('tests/:id')
  updateTest(
    @Param('id') id: string,
    @Body() dto: UpdateTestDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.testPlanService.update(t || u, id, dto);
  }

  @Patch('tests/:id/assign')
  assignTest(
    @Param('id') id: string,
    @Body() dto: AssignTestDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.testPlanService.assign(t || u, id, dto);
  }

  @Post('tests/:id/evidence')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: testEvidenceStorage,
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  addTestEvidence(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.testPlanService.addEvidence(t || u, id, files);
  }

  @Patch('tests/:id/complete')
  completeTest(
    @Param('id') id: string,
    @Body() dto: CompleteTestDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.testPlanService.complete(t || u, id, dto);
  }

  @Patch('tests/:id/sign-off')
  signOffTest(
    @Param('id') id: string,
    @Body() dto: SignOffTestDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.testPlanService.signOff(t || u, id, dto);
  }

  @Delete('tests/:id')
  async deleteTest(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.testPlanService.delete(t || u, id);
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════
  // DEFICIENCIES
  // ═══════════════════════════════════════════════════════════

  @Post('deficiencies')
  createDeficiency(
    @Body() dto: CreateDeficiencyDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.deficiencyService.create(t || u, dto);
  }

  @Get('deficiencies')
  getAllDeficiencies(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.deficiencyService.getAll(t || u);
  }

  @Patch('deficiencies/:id')
  updateDeficiency(
    @Param('id') id: string,
    @Body() dto: UpdateDeficiencyDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.deficiencyService.update(t || u, id, dto);
  }

  @Post('deficiencies/:id/evidence')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: deficiencyEvidenceStorage,
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  addDeficiencyEvidence(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.deficiencyService.addEvidence(t || u, id, files);
  }

  @Patch('deficiencies/:id/validate')
  validateDeficiency(
    @Param('id') id: string,
    @Body() dto: ValidateDeficiencyDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.deficiencyService.validate(t || u, id, dto);
  }

  @Delete('deficiencies/:id')
  async deleteDeficiency(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.deficiencyService.delete(t || u, id);
    return { success: true };
  }
}
