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
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DealService } from '../services';
import {
  CreateDealDto,
  SetStageDto,
  SetStatusDto,
  UpdateTermSheetDto,
  AddDDItemDto,
  UpdateDDItemDto,
  AddContractSectionDto,
  UpdateContractSectionBodyDto,
  AddContractCommentDto,
  SetContractVariableDto,
  AddCPDto,
  UpdateCPDto,
  AddSigningChecklistDto,
  AddSignatoryDto,
  UpdateSigningDetailsDto,
  AddPostCompletionDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';

const dataRoomStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const p = join(process.cwd(), 'uploads', 'deals', 'data-room');
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
    cb(null, p);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

@ApiTags('Deals & Transactions')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.DEALS)
@Controller('deals')
export class DealController {
  constructor(
    private readonly service: DealService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  // ── Core ─────────────────────────────────────────────────────
  @Post()
  create(
    @Body() dto: CreateDealDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
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

  @Patch(':id/stage')
  setStage(
    @Param('id') id: string,
    @Body() dto: SetStageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setStage(t || u, id, dto);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setStatus(t || u, id, dto);
  }

  // ── Term Sheet ───────────────────────────────────────────────
  @Patch(':id/term-sheet')
  updateTermSheet(
    @Param('id') id: string,
    @Body() dto: UpdateTermSheetDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateTermSheet(t || u, id, dto);
  }

  // ── Data Room ────────────────────────────────────────────────
  @Post(':id/data-room/files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: dataRoomStorage,
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async addDataRoomFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    if (!file) throw new BadRequestException('File is required.');
    const me = await this.userModel
      .findById(u)
      .select('firstName lastName')
      .lean();
    const uploadedBy =
      `${me?.firstName ?? ''} ${me?.lastName ?? ''}`.trim() || 'You';
    return this.service.addDataRoomFile(
      t || u,
      id,
      file,
      folder || '01 Corporate',
      uploadedBy,
    );
  }

  // ── Due Diligence ────────────────────────────────────────────
  @Post(':id/dd')
  addDDItem(
    @Param('id') id: string,
    @Body() dto: AddDDItemDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addDDItem(t || u, id, dto);
  }

  @Patch(':id/dd/:index')
  updateDDItem(
    @Param('id') id: string,
    @Param('index') index: string,
    @Body() dto: UpdateDDItemDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateDDItem(t || u, id, Number(index), dto);
  }

  // ── Contract ─────────────────────────────────────────────────
  @Post(':id/contract/sections')
  addContractSection(
    @Param('id') id: string,
    @Body() dto: AddContractSectionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addContractSection(t || u, id, dto);
  }

  @Delete(':id/contract/sections/:index')
  removeContractSection(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.removeContractSection(t || u, id, Number(index));
  }

  @Patch(':id/contract/sections/:index')
  updateContractSectionBody(
    @Param('id') id: string,
    @Param('index') index: string,
    @Body() dto: UpdateContractSectionBodyDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateContractSectionBody(
      t || u,
      id,
      Number(index),
      dto,
    );
  }

  @Post(':id/contract/sections/:index/comments')
  addContractComment(
    @Param('id') id: string,
    @Param('index') index: string,
    @Body() dto: AddContractCommentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addContractComment(t || u, id, Number(index), dto);
  }

  @Patch(':id/contract/sections/:index/comments/:cIndex/toggle')
  toggleContractComment(
    @Param('id') id: string,
    @Param('index') index: string,
    @Param('cIndex') cIndex: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.toggleContractComment(
      t || u,
      id,
      Number(index),
      Number(cIndex),
    );
  }

  @Patch(':id/contract/variables')
  setContractVariable(
    @Param('id') id: string,
    @Body() dto: SetContractVariableDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setContractVariable(t || u, id, dto);
  }

  // ── CPs ──────────────────────────────────────────────────────
  @Post(':id/cps')
  addCP(
    @Param('id') id: string,
    @Body() dto: AddCPDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addCP(t || u, id, dto);
  }

  @Patch(':id/cps/:index')
  updateCP(
    @Param('id') id: string,
    @Param('index') index: string,
    @Body() dto: UpdateCPDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateCP(t || u, id, Number(index), dto);
  }

  // ── Signing ──────────────────────────────────────────────────
  @Post(':id/signing/checklist')
  addSigningChecklistItem(
    @Param('id') id: string,
    @Body() dto: AddSigningChecklistDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addSigningChecklistItem(t || u, id, dto);
  }

  @Patch(':id/signing/checklist/:index/toggle')
  toggleSigningChecklistItem(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.toggleSigningChecklistItem(t || u, id, Number(index));
  }

  @Post(':id/signing/signatories')
  addSignatory(
    @Param('id') id: string,
    @Body() dto: AddSignatoryDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addSignatory(t || u, id, dto);
  }

  @Patch(':id/signing/signatories/:index/sign')
  markSignatorySigned(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.markSignatorySigned(t || u, id, Number(index));
  }

  @Patch(':id/signing/details')
  updateSigningDetails(
    @Param('id') id: string,
    @Body() dto: UpdateSigningDetailsDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateSigningDetails(t || u, id, dto);
  }

  // ── Post-Completion ──────────────────────────────────────────
  @Post(':id/post-completion')
  addPostCompletion(
    @Param('id') id: string,
    @Body() dto: AddPostCompletionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addPostCompletion(t || u, id, dto);
  }

  @Patch(':id/post-completion/:index/toggle')
  togglePostCompletion(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.togglePostCompletion(t || u, id, Number(index));
  }
}
