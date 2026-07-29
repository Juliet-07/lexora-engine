import {
  Controller,
  Get,
  Post,
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

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: policyStorage,
      fileFilter: policyFileFilter,
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async create(
    @Body() dto: CreatePolicyDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.service.create(tenantId, dto, file, businessName);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
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
