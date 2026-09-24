import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
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
import { IncidentService } from '../services';
import {
  CreateIncidentDto,
  UpdateIncidentFieldsDto,
  AddIncidentFindingDto,
  AddIncidentActionDto,
  UpdateIncidentActionStatusDto,
  AddIncidentLessonDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';

const incidentStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const p = join(process.cwd(), 'uploads', 'grc', 'incidents');
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
@Controller('grc/compliance/incidents')
export class IncidentController {
  constructor(
    private readonly service: IncidentService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  private async currentUserName(userId: string): Promise<string> {
    const me = await this.userModel
      .findById(userId)
      .select('firstName lastName')
      .lean();
    return `${me?.firstName ?? ''} ${me?.lastName ?? ''}`.trim();
  }

  @Post()
  async create(
    @Body() dto: CreateIncidentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const name = await this.currentUserName(u);
    return this.service.create(t || u, dto, name, u);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Patch(':id')
  updateFields(
    @Param('id') id: string,
    @Body() dto: UpdateIncidentFieldsDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateFields(t || u, id, dto);
  }

  @Post(':id/findings')
  addFinding(
    @Param('id') id: string,
    @Body() dto: AddIncidentFindingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addFinding(t || u, id, dto);
  }

  @Post(':id/actions')
  addAction(
    @Param('id') id: string,
    @Body() dto: AddIncidentActionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addAction(t || u, id, dto);
  }

  @Patch(':id/actions/:index')
  updateActionStatus(
    @Param('id') id: string,
    @Param('index', ParseIntPipe) index: number,
    @Body() dto: UpdateIncidentActionStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateActionStatus(t || u, id, index, dto);
  }

  @Post(':id/lessons')
  async addLesson(
    @Param('id') id: string,
    @Body() dto: AddIncidentLessonDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const name = await this.currentUserName(u);
    return this.service.addLesson(t || u, id, dto, name);
  }

  @Post(':id/files')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: incidentStorage,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async addFiles(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const name = await this.currentUserName(u);
    return this.service.addFiles(t || u, id, files, name);
  }
}
