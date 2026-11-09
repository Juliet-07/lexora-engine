import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { ReadinessService, ReadinessWorkspaceService } from '../services';
import {
  CreateAssessmentDto,
  UpdateThresholdDto,
  SetOverrideDto,
  ClearOverrideDto,
  AddGapDto,
  SetGapStatusDto,
  SetReportSectionDto,
  UpdateNotesDto,
  UpdateContextDto,
  UpdateWeightsDto,
  SetIndicatorDto,
  UpdateGapDto,
  UpdateReportMetaDto,
  UpdateSectionDto,
  RedraftSectionDto,
  UpdateRoomItemDto,
  AddRoomItemDto,
  CreateShareDto,
  SendReportDto,
  AttachReportDto,
  AcceptNdaDto,
  ShareDownloadDto,
  CreateInvestorDto,
  UpdateInvestorDto,
  CreateQuestionDto,
  UpdateQuestionDto,
  DraftAnswerDto,
  CreateTaskDto,
  UpdateTaskDto,
  AddTaskCommentDto,
} from '../dtos';
import { CurrentUser, Public, UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from 'src/modules/auth/schemas';
import { Model } from 'mongoose';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';
import type { Response } from 'express';

@ApiTags('Deal Intelligence')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@Controller('deal-intel/readiness')
export class ReadinessController {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly service: ReadinessService,
  ) {}

  @Post()
  async create(
    @Body() dto: CreateAssessmentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.service.create(tenantId, businessName, dto);
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

  @Patch(':id/threshold')
  updateThreshold(
    @Param('id') id: string,
    @Body() dto: UpdateThresholdDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateThreshold(t || u, id, dto);
  }

  @Patch(':id/override')
  setOverride(
    @Param('id') id: string,
    @Body() dto: SetOverrideDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setOverride(t || u, id, dto);
  }

  @Post(':id/override/clear')
  clearOverride(
    @Param('id') id: string,
    @Body() dto: ClearOverrideDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.clearOverride(t || u, id, dto);
  }

  @Post(':id/recompute')
  recompute(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recomputeAutoScores(t || u, id);
  }

  @Post(':id/gaps')
  addGap(
    @Param('id') id: string,
    @Body() dto: AddGapDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addGap(t || u, id, dto);
  }

  @Patch(':id/gaps/:gapId/status')
  setGapStatus(
    @Param('id') id: string,
    @Param('gapId') gapId: string,
    @Body() dto: SetGapStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setGapStatus(t || u, id, gapId, dto);
  }

  @Delete(':id/gaps/:gapId')
  deleteGap(
    @Param('id') id: string,
    @Param('gapId') gapId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.deleteGap(t || u, id, gapId);
  }

  @Patch(':id/context')
  updateContext(
    @Param('id') id: string,
    @Body() dto: UpdateContextDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateContext(t || u, id, dto);
  }

  @Patch(':id/weights')
  updateWeights(
    @Param('id') id: string,
    @Body() dto: UpdateWeightsDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateWeights(t || u, id, dto);
  }

  @Patch(':id/indicators')
  setIndicator(
    @Param('id') id: string,
    @Body() dto: SetIndicatorDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setIndicator(t || u, id, dto);
  }

  @Post(':id/gaps/generate')
  generateGaps(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.generateGaps(t || u, id);
  }

  @Patch(':id/gaps/:gapId')
  updateGap(
    @Param('id') id: string,
    @Param('gapId') gapId: string,
    @Body() dto: UpdateGapDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateGap(t || u, id, gapId, dto);
  }

  @Patch(':id/report')
  updateReportMeta(
    @Param('id') id: string,
    @Body() dto: UpdateReportMetaDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateReportMeta(t || u, id, dto);
  }

  @Patch(':id/sections')
  updateSection(
    @Param('id') id: string,
    @Body() dto: UpdateSectionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateSection(t || u, id, dto);
  }

  @Post(':id/sections/redraft')
  redraftSection(
    @Param('id') id: string,
    @Body() dto: RedraftSectionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.redraftSection(t || u, id, dto);
  }

  @Patch(':id/report-sections')
  setReportSection(
    @Param('id') id: string,
    @Body() dto: SetReportSectionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setReportSection(t || u, id, dto);
  }

  @Patch(':id/notes')
  updateNotes(
    @Param('id') id: string,
    @Body() dto: UpdateNotesDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateNotes(t || u, id, dto);
  }

  @Get(':id/report')
  async downloadReport(
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    const buffer = await this.service.getReportPdf(tenantId, id, businessName);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        'attachment; filename="Investor Readiness Report.pdf"',
    });
    res.send(buffer);
  }

  @Get(':id/report.docx')
  async downloadReportDocx(
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    const buffer = await this.service.getReportDocx(tenantId, id, businessName);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition':
        'attachment; filename="Investor Readiness Report.docx"',
    });
    res.send(buffer);
  }
}

// ─────────────────────────────────────────────────────────────
// Everything around the assessments: data room, sharing, investor
// pipeline, Q&A, remediation board and the activity feed.
// ─────────────────────────────────────────────────────────────

const roomStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const p = join(process.cwd(), 'uploads', 'readiness', 'data-room');
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
    cb(null, p);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

@ApiTags('Deal Intelligence')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@Controller('deal-intel/readiness-workspace')
export class ReadinessWorkspaceController {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly service: ReadinessWorkspaceService,
  ) {}

  private async actor(userId: string): Promise<string> {
    const me = await this.userModel
      .findById(userId)
      .select('firstName lastName')
      .lean();
    return `${me?.firstName ?? ''} ${me?.lastName ?? ''}`.trim() || 'You';
  }

  @Get()
  get(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.get(t || u);
  }

  // ── Data room ──
  @Patch('room/:itemId')
  async updateRoomItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateRoomItemDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateRoomItem(
      t || u,
      itemId,
      dto,
      await this.actor(u),
    );
  }

  @Post('room')
  async addRoomItem(
    @Body() dto: AddRoomItemDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addRoomItem(t || u, dto, await this.actor(u));
  }

  @Delete('room/:itemId')
  async removeRoomItem(
    @Param('itemId') itemId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.removeRoomItem(t || u, itemId, await this.actor(u));
  }

  @Post('room/:itemId/files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: roomStorage,
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async uploadRoomFile(
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    if (!file) throw new BadRequestException('File is required.');
    return this.service.uploadRoomFile(
      t || u,
      itemId,
      file,
      await this.actor(u),
    );
  }

  @Delete('room/:itemId/files/:fileId')
  async removeRoomFile(
    @Param('itemId') itemId: string,
    @Param('fileId') fileId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.removeRoomFile(
      t || u,
      itemId,
      fileId,
      await this.actor(u),
    );
  }

  @Post('room-report')
  async attachReport(
    @Body() dto: AttachReportDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.service.attachReport(
      tenantId,
      dto,
      businessName,
      await this.actor(u),
    );
  }

  @Get('zip')
  async zip(
    @Query('assessmentId') assessmentId: string,
    @Res() res: Response,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    const buffer = await this.service.buildZip(
      tenantId,
      assessmentId || null,
      businessName,
    );
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="Data Room.zip"',
    });
    res.send(buffer);
  }

  // ── Sharing ──
  @Post('shares')
  async createShare(
    @Body() dto: CreateShareDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.service.createShare(
      tenantId,
      dto,
      businessName,
      await this.actor(u),
    );
  }

  @Post('report-send')
  async sendReport(
    @Body() dto: SendReportDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.service.sendReport(
      tenantId,
      dto,
      businessName,
      await this.actor(u),
    );
  }

  @Post('shares/:shareId/resend')
  async resend(
    @Param('shareId') shareId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.service.resendShare(
      tenantId,
      shareId,
      businessName,
      await this.actor(u),
    );
  }

  @Post('shares/:shareId/revoke')
  async revoke(
    @Param('shareId') shareId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.revokeShare(t || u, shareId, await this.actor(u));
  }

  // ── Investor pipeline ──
  @Post('investors')
  async createInvestor(
    @Body() dto: CreateInvestorDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.createInvestor(t || u, dto, await this.actor(u));
  }

  @Patch('investors/:id')
  async updateInvestor(
    @Param('id') id: string,
    @Body() dto: UpdateInvestorDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateInvestor(t || u, id, dto, await this.actor(u));
  }

  @Post('investors/:id/advance')
  async advance(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.advanceInvestor(t || u, id, await this.actor(u));
  }

  @Delete('investors/:id')
  async deleteInvestor(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.deleteInvestor(t || u, id, await this.actor(u));
  }

  // ── Investor Q&A ──
  @Post('questions')
  async createQuestion(
    @Body() dto: CreateQuestionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.createQuestion(t || u, dto, await this.actor(u));
  }

  @Patch('questions/:id')
  updateQuestion(
    @Param('id') id: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateQuestion(t || u, id, dto);
  }

  @Post('questions/:id/answer')
  async draftAnswer(
    @Param('id') id: string,
    @Body() dto: DraftAnswerDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.draftAnswer(t || u, id, dto, await this.actor(u));
  }

  @Post('questions/:id/approve')
  async approveAnswer(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.approveAnswer(t || u, id, await this.actor(u));
  }

  @Post('questions/:id/reopen')
  async reopenQuestion(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.reopenQuestion(t || u, id, await this.actor(u));
  }

  @Delete('questions/:id')
  deleteQuestion(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.deleteQuestion(t || u, id);
  }

  // ── Remediation board ──
  @Post('tasks')
  async createTask(
    @Body() dto: CreateTaskDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.createTask(t || u, dto, await this.actor(u));
  }

  @Patch('tasks/:id')
  async updateTask(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateTask(t || u, id, dto, await this.actor(u));
  }

  @Post('tasks/:id/comments')
  async addTaskComment(
    @Param('id') id: string,
    @Body() dto: AddTaskCommentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addTaskComment(t || u, id, dto, await this.actor(u));
  }

  @Delete('tasks/:id')
  async deleteTask(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.deleteTask(t || u, id, await this.actor(u));
  }
}

// ── Public, token-gated investor view — the link in the data room
// email. The investor is rarely a platform user, so this is
// deliberately not behind @UserTypes. ────────────────────────────
@ApiTags('Deal Intelligence — Public Data Room (no auth)')
@Public()
@Controller('deal-intel/readiness-share')
export class ReadinessSharePublicController {
  constructor(private readonly service: ReadinessWorkspaceService) {}

  @Get(':token')
  open(@Param('token') token: string) {
    return this.service.publicOpen(token);
  }

  @Post(':token/nda')
  acceptNda(@Param('token') token: string, @Body() dto: AcceptNdaDto) {
    return this.service.publicAcceptNda(token, dto);
  }

  @Post(':token/download')
  download(@Param('token') token: string, @Body() dto: ShareDownloadDto) {
    return this.service.publicDownload(token, dto);
  }
}
