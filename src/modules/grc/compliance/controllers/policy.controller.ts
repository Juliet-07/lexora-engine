import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
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
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PolicyService } from '../services';
import {
  CreatePolicyDto,
  UpdatePolicyPropertiesDto,
  UpsertSectionDto,
  SetPolicyStatusDto,
  PublishPolicyDto,
  AddPolicyCommentDto,
  UploadPolicyDto,
  AcknowledgeEmployeePolicyDto,
  SubmitBoardAckDto,
} from '../dtos';
import { CurrentUser, UserTypes, Public } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';

const policyStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const p = join(process.cwd(), 'uploads', 'grc', 'policies');
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
    cb(null, p);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

const policyFileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const allowed = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new BadRequestException('Unsupported file type.'), false);
};

@ApiTags('GRC — Compliance')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/compliance/policies')
export class PolicyController {
  constructor(
    private readonly service: PolicyService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  private async currentUser(
    userId: string,
  ): Promise<{ name: string; role: string }> {
    const me = await this.userModel
      .findById(userId)
      .select('firstName lastName adminRole roles')
      .lean();
    return {
      name: `${me?.firstName ?? ''} ${me?.lastName ?? ''}`.trim(),
      role: me?.adminRole || me?.roles?.[0] || '',
    };
  }

  // ── New in-app editor flow ──────────────────────────────────

  @Post()
  create(
    @Body() dto: CreatePolicyDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get('stats')
  getStats(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getStats(t || u);
  }

  @Get('roster-report')
  getRosterReport(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getRosterReport(t || u);
  }

  @Get(':id')
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getOne(t || u, id);
  }

  @Patch(':id/properties')
  updateProperties(
    @Param('id') id: string,
    @Body() dto: UpdatePolicyPropertiesDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateProperties(t || u, id, dto);
  }

  @Post(':id/sections')
  addSection(
    @Param('id') id: string,
    @Body() dto: UpsertSectionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addSection(t || u, id, dto);
  }

  @Put(':id/sections/:sectionId')
  updateSection(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: UpsertSectionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateSection(t || u, id, sectionId, dto);
  }

  @Delete(':id/sections/:sectionId')
  deleteSection(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.deleteSection(t || u, id, sectionId);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetPolicyStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setStatus(t || u, id, dto.status);
  }

  @Patch(':id/publish')
  async publish(
    @Param('id') id: string,
    @Body() dto: PublishPolicyDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const { name } = await this.currentUser(u);
    return this.service.publish(t || u, id, dto, name);
  }

  @Post(':id/comments')
  async addComment(
    @Param('id') id: string,
    @Body() dto: AddPolicyCommentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const { name, role } = await this.currentUser(u);
    return this.service.addComment(t || u, id, dto, name, role);
  }

  @Post(':id/remind')
  async sendReminders(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.service.sendReminders(tenantId, id, businessName);
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

  @Post(':id/acknowledge')
  async acknowledgeAsEmployee(
    @Param('id') id: string,
    @Body() dto: AcknowledgeEmployeePolicyDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const me = await this.userModel
      .findById(u)
      .select('email firstName lastName')
      .lean();
    const name = `${me?.firstName ?? ''} ${me?.lastName ?? ''}`.trim();
    return this.service.acknowledgeAsEmployee(
      tenantId,
      id,
      me?.email ?? '',
      name,
      dto.signature,
    );
  }

  // ── Legacy single-file-upload flow ──────────────────────────

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: policyStorage,
      fileFilter: policyFileFilter,
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async uploadDocument(
    @Body() dto: UploadPolicyDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.service.uploadDocument(tenantId, dto, file, businessName);
  }

  @Public()
  @Get('ack/:token')
  getAckSnapshot(@Param('token') token: string) {
    return this.service.getAckSnapshot(token);
  }

  @Public()
  @Post('ack/:token')
  submitBoardAck(
    @Param('token') token: string,
    @Body() dto: SubmitBoardAckDto,
  ) {
    return this.service.submitBoardAck(token, dto);
  }
}
