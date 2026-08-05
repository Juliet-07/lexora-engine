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
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
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
  CreateContractDto,
  RenameContractDto,
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
  CreateFolderDto,
  AddPartyDto,
  UpdatePartyDto,
  SubmitReviewDto,
  AddContractSectionFromPrecedentDto,
  AddRedlineDto,
} from '../dtos';
import { CurrentUser, Public, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';

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

  // ── Parties ──────────────────────────────────────────────────
  @Post(':id/parties')
  addParty(
    @Param('id') id: string,
    @Body() dto: AddPartyDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addParty(t || u, id, dto);
  }

  @Patch(':id/parties/:index')
  updateParty(
    @Param('id') id: string,
    @Param('index') index: string,
    @Body() dto: UpdatePartyDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateParty(t || u, id, Number(index), dto);
  }

  @Delete(':id/parties/:index')
  removeParty(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.removeParty(t || u, id, Number(index));
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

  @Post(':id/review/offer/send')
  async sendOfferForReview(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.service.sendOfferForReview(tenantId, id, businessName);
  }

  @Public()
  @Get('review/offer/:token')
  getOfferReviewSnapshot(@Param('token') token: string) {
    return this.service.getOfferReviewSnapshot(token);
  }

  @Public()
  @Post('review/offer/:token')
  submitOfferReview(
    @Param('token') token: string,
    @Body() dto: SubmitReviewDto,
  ) {
    return this.service.submitOfferReview(token, dto);
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

  @Post(':id/data-room/folders')
  addFolder(
    @Param('id') id: string,
    @Body() dto: CreateFolderDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addFolder(t || u, id, dto);
  }

  @Delete(':id/data-room/folders/:index')
  removeFolder(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.removeFolder(t || u, id, Number(index));
  }

  @Delete(':id/data-room/files/:index')
  removeDataRoomFile(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.removeDataRoomFile(t || u, id, Number(index));
  }

  @Post(':id/data-room/send/:partyIndex')
  async sendDataRoomEmail(
    @Param('id') id: string,
    @Param('partyIndex') partyIndex: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.service.sendDataRoomEmail(
      tenantId,
      id,
      Number(partyIndex),
      businessName,
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

  // ── Contracts ────────────────────────────────────────────────
  @Post(':id/contracts')
  createContract(
    @Param('id') id: string,
    @Body() dto: CreateContractDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.createContract(t || u, id, dto);
  }

  @Patch(':id/contracts/:contractId')
  renameContract(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Body() dto: RenameContractDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.renameContract(t || u, id, contractId, dto);
  }

  @Delete(':id/contracts/:contractId')
  deleteContract(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.deleteContract(t || u, id, contractId);
  }

  @Post(':id/contracts/:contractId/sections')
  addContractSection(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Body() dto: AddContractSectionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addContractSection(t || u, id, contractId, dto);
  }

  @Post(':id/contracts/:contractId/sections/from-precedent')
  addContractSectionFromPrecedent(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Body() dto: AddContractSectionFromPrecedentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addContractSectionFromPrecedent(
      t || u,
      id,
      contractId,
      dto,
    );
  }

  @Delete(':id/contracts/:contractId/sections/:index')
  removeContractSection(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.removeContractSection(
      t || u,
      id,
      contractId,
      Number(index),
    );
  }

  @Patch(':id/contracts/:contractId/sections/:index')
  updateContractSectionBody(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Param('index') index: string,
    @Body() dto: UpdateContractSectionBodyDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateContractSectionBody(
      t || u,
      id,
      contractId,
      Number(index),
      dto,
    );
  }

  @Post(':id/contracts/:contractId/sections/:index/comments')
  addContractComment(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Param('index') index: string,
    @Body() dto: AddContractCommentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addContractComment(
      t || u,
      id,
      contractId,
      Number(index),
      dto,
    );
  }

  @Patch(':id/contracts/:contractId/sections/:index/comments/:cIndex/toggle')
  toggleContractComment(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Param('index') index: string,
    @Param('cIndex') cIndex: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.toggleContractComment(
      t || u,
      id,
      contractId,
      Number(index),
      Number(cIndex),
    );
  }

  @Post(':id/contracts/:contractId/sections/:index/redlines')
  async addRedline(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Param('index') index: string,
    @Body() dto: AddRedlineDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const me = await this.userModel
      .findById(u)
      .select('firstName lastName email')
      .lean();
    const authorName =
      `${me?.firstName ?? ''} ${me?.lastName ?? ''}`.trim() || 'You';
    const authorEmail = (me as any)?.email ?? '';
    return this.service.addRedline(
      tenantId,
      id,
      contractId,
      Number(index),
      dto,
      authorName,
      authorEmail,
    );
  }

  @Get(':id/contracts/:contractId/pdf/redlined')
  async downloadRedlinedContractPdf(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Res() res: Response,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    const buffer = await this.service.getRedlinedContractPdf(
      tenantId,
      id,
      contractId,
      businessName,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="Contract - Redlined.pdf"',
    });
    res.send(buffer);
  }

  @Patch(':id/contracts/:contractId/variables')
  setContractVariable(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Body() dto: SetContractVariableDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setContractVariable(t || u, id, contractId, dto);
  }

  @Get(':id/contracts/:contractId/pdf')
  async downloadContractPdf(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Res() res: Response,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    const buffer = await this.service.getContractPdf(
      tenantId,
      id,
      contractId,
      businessName,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="Contract.pdf"',
    });
    res.send(buffer);
  }

  @Post(':id/contracts/:contractId/review/send')
  async sendContractForReview(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.service.sendContractForReview(
      tenantId,
      id,
      contractId,
      businessName,
    );
  }

  @Public()
  @Get('review/contract/:token')
  getContractReviewSnapshot(@Param('token') token: string) {
    return this.service.getContractReviewSnapshot(token);
  }

  @Public()
  @Post('review/contract/:token')
  submitContractReview(
    @Param('token') token: string,
    @Body() dto: SubmitReviewDto,
  ) {
    return this.service.submitContractReview(token, dto);
  }

  @Public()
  @Post('review/contract/:token/sections/:index/redlines')
  addExternalRedline(
    @Param('token') token: string,
    @Param('index') index: string,
    @Body() dto: AddRedlineDto,
  ) {
    return this.service.addExternalRedline(token, Number(index), dto);
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
