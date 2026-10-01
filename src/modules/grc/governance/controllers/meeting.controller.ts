import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { MeetingService } from '../services';
import {
  CreateMeetingDto,
  AddAttendeeDto,
  AddAgendaItemDto,
  UpdateNotesDto,
  UpdateMinutesDto,
  RecordAttendanceDto,
  SubmitAckDto,
  PostponeMeetingDto,
  SubmitMinutesReviewDto,
  AddActionItemDto,
  SetActionItemStatusDto,
  SetChecklistItemDto,
  UpdateNoticeDto,
  SubmitPublicNoticeRsvpDto,
  UpdateMinutesDraftDto,
  SetMinutesDraftStatusDto,
  RecordMeetingConflictDto,
  AddBoardPackRequirementDto,
  UpdateBoardPackDueDateDto,
} from '../dtos/index.dto';
import { CurrentUser, Public, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';

const boardPackStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(
      process.cwd(),
      'uploads',
      'grc',
      'meetings',
      'board-pack',
    );
    if (!existsSync(uploadPath)) mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

const boardPackFileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const allowed = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else
    cb(
      new BadRequestException(
        'Unsupported file type for board pack documents.',
      ),
      false,
    );
};

@ApiTags('GRC — Governance')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/governance/meetings')
export class MeetingController {
  constructor(
    private readonly meetingService: MeetingService,
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
  create(
    @Body() dto: CreateMeetingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.create(t || u, dto);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.meetingService.getAll(t || u);
  }

  @Get(':id')
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.getById(t || u, id);
  }

  @Post(':id/attendees')
  addAttendee(
    @Param('id') id: string,
    @Body() dto: AddAttendeeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.addAttendee(t || u, id, dto);
  }

  @Patch(':id/attendance')
  recordAttendance(
    @Param('id') id: string,
    @Body() dto: RecordAttendanceDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.recordAttendance(t || u, id, dto);
  }

  @Delete(':id/attendees/:index')
  removeAttendee(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.removeAttendee(t || u, id, Number(index));
  }

  @Post(':id/agenda')
  addAgendaItem(
    @Param('id') id: string,
    @Body() dto: AddAgendaItemDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.addAgendaItem(t || u, id, dto);
  }

  @Delete(':id/agenda/:index')
  removeAgendaItem(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.removeAgendaItem(t || u, id, Number(index));
  }

  @Post(':id/board-pack')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: boardPackStorage,
      fileFilter: boardPackFileFilter,
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      "Upload a document into this meeting's board pack, optionally filed under one of its agenda items",
  })
  async addBoardPackDoc(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('agendaItemTitle') agendaItemTitle: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const uploadedBy = await this.currentUserName(u);
    return this.meetingService.addBoardPackDoc(
      t || u,
      id,
      file,
      agendaItemTitle,
      uploadedBy,
    );
  }

  @Post(':id/board-pack/requirement')
  @ApiOperation({
    summary:
      'Request a board pack document that has not been uploaded yet — an "Outstanding" placeholder, optionally naming who it is expected from and by when',
  })
  addBoardPackRequirement(
    @Param('id') id: string,
    @Body() dto: AddBoardPackRequirementDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.addBoardPackRequirement(t || u, id, dto);
  }

  @Post(':id/board-pack/:index/fulfill')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: boardPackStorage,
      fileFilter: boardPackFileFilter,
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Attach a file to an outstanding board pack requirement, rather than creating a duplicate row',
  })
  async fulfillBoardPackDoc(
    @Param('id') id: string,
    @Param('index') index: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const uploadedBy = await this.currentUserName(u);
    return this.meetingService.fulfillBoardPackDoc(
      t || u,
      id,
      Number(index),
      file,
      uploadedBy,
    );
  }

  @Delete(':id/board-pack/:index')
  removeBoardPackDoc(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.removeBoardPackDoc(t || u, id, Number(index));
  }

  @Patch(':id/board-pack-due-date')
  @ApiOperation({
    summary:
      'Set or clear a custom board pack due date — defaults to 7 days before the meeting when unset',
  })
  updateBoardPackDueDate(
    @Param('id') id: string,
    @Body() dto: UpdateBoardPackDueDateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.updateBoardPackDueDate(t || u, id, dto);
  }

  @Patch(':id/notes')
  updateNotes(
    @Param('id') id: string,
    @Body() dto: UpdateNotesDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.updateNotes(t || u, id, dto);
  }

  @Patch(':id/minutes')
  updateMinutes(
    @Param('id') id: string,
    @Body() dto: UpdateMinutesDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.updateMinutes(t || u, id, dto);
  }

  // ── Preparation checklist ────────────────────────────────────────

  @Patch(':id/checklist/:itemId')
  async setChecklistItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: SetChecklistItemDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.meetingService.setChecklistItem(
      tenantId,
      id,
      itemId,
      dto,
      businessName,
    );
  }

  // ── Notice — drafted, then dispatched to attendees ───────────────

  @Patch(':id/notice')
  updateNotice(
    @Param('id') id: string,
    @Body() dto: UpdateNoticeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.updateNotice(t || u, id, dto);
  }

  @Post(':id/notice/dispatch')
  @ApiOperation({ summary: 'Send the meeting notice to all attendees' })
  async dispatchNotice(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.meetingService.dispatchNotice(tenantId, id, businessName);
  }

  @Post(':id/notice/resend')
  @ApiOperation({
    summary: 'Resend the meeting notice to non-respondents only',
  })
  async resendNotice(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.meetingService.resendNotice(tenantId, id, businessName);
  }

  @Get(':id/notice/pdf')
  @ApiOperation({
    summary:
      'Download the meeting notice — body plus current recipients and dispatch status — as a PDF',
  })
  async downloadNoticePdf(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    const { buffer, filename } = await this.meetingService.downloadNoticePdf(
      tenantId,
      id,
      businessName,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }

  // ── Meeting-specific conflict of interest ────────────────────────

  @Post(':id/conflicts')
  @ApiOperation({
    summary:
      'Record a conflict of interest declared during this meeting (tenant-recorded)',
  })
  async recordConflict(
    @Param('id') id: string,
    @Body() dto: RecordMeetingConflictDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const recordedByName = await resolveBusinessName(this.userModel, tenantId);
    return this.meetingService.recordConflict(
      tenantId,
      id,
      dto,
      recordedByName,
    );
  }

  // ── Structured minutes drafting ──────────────────────────────────

  @Patch(':id/minutes-draft')
  async updateMinutesDraft(
    @Param('id') id: string,
    @Body() dto: UpdateMinutesDraftDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.meetingService.updateMinutesDraft(
      tenantId,
      id,
      dto,
      businessName,
    );
  }

  @Patch(':id/minutes-draft/status')
  async setMinutesDraftStatus(
    @Param('id') id: string,
    @Body() dto: SetMinutesDraftStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.meetingService.setMinutesDraftStatus(
      tenantId,
      id,
      dto,
      businessName,
    );
  }

  @Post(':id/mark-held')
  markHeld(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.markHeld(t || u, id);
  }

  @Post(':id/dispatch')
  @ApiOperation({
    summary:
      'Send the meeting pack (notes, agenda, board pack) to all attendees',
  })
  async dispatch(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.meetingService.dispatch(tenantId, id, businessName);
  }

  @Post(':id/send-minutes')
  @ApiOperation({
    summary:
      'Send the written minutes to all attendees — requires the meeting to be marked Held',
  })
  async sendMinutes(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.meetingService.sendMinutes(tenantId, id, businessName);
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.meetingService.delete(t || u, id);
    return { success: true };
  }

  @Post(':id/postpone')
  async postponeMeeting(
    @Param('id') id: string,
    @Body() dto: PostponeMeetingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.meetingService.postponeMeeting(
      tenantId,
      id,
      dto.reason,
      businessName,
      dto.newDate,
    );
  }

  @Post(':id/resume')
  resumeMeeting(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.resumeMeeting(t || u, id);
  }

  @Post(':id/action-items')
  addActionItem(
    @Param('id') id: string,
    @Body() dto: AddActionItemDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.addActionItem(t || u, id, dto);
  }

  @Delete(':id/action-items/:actionItemId')
  removeActionItem(
    @Param('id') id: string,
    @Param('actionItemId') actionItemId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.removeActionItem(t || u, id, actionItemId);
  }

  @Patch(':id/action-items/:actionItemId/status')
  setActionItemStatus(
    @Param('id') id: string,
    @Param('actionItemId') actionItemId: string,
    @Body() dto: SetActionItemStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.setActionItemStatus(
      t || u,
      id,
      actionItemId,
      dto,
    );
  }

  @Public()
  @Get('ack/:token')
  @ApiOperation({
    summary: 'Public — fetch the acknowledgement page snapshot for a token',
  })
  getAckSnapshot(@Param('token') token: string) {
    return this.meetingService.getAckSnapshot(token);
  }

  @Public()
  @Post('ack/:token')
  @ApiOperation({ summary: 'Public — submit a board pack acknowledgement' })
  submitAck(@Param('token') token: string, @Body() dto: SubmitAckDto) {
    return this.meetingService.submitAck(token, dto);
  }

  @Public()
  @Get('notice-rsvp/:token')
  @ApiOperation({
    summary: 'Public — fetch the notice RSVP page snapshot for a token',
  })
  getNoticeRsvpSnapshot(@Param('token') token: string) {
    return this.meetingService.getNoticeRsvpSnapshot(token);
  }

  @Public()
  @Post('notice-rsvp/:token')
  @ApiOperation({ summary: 'Public — submit a meeting notice RSVP' })
  submitPublicNoticeRsvp(
    @Param('token') token: string,
    @Body() dto: SubmitPublicNoticeRsvpDto,
  ) {
    return this.meetingService.submitPublicNoticeRsvp(token, dto);
  }

  @Public()
  @Get('minutes-review/:token')
  getMinutesReviewSnapshot(@Param('token') token: string) {
    return this.meetingService.getMinutesReviewSnapshot(token);
  }

  @Public()
  @Post('minutes-review/:token')
  submitMinutesReview(
    @Param('token') token: string,
    @Body() dto: SubmitMinutesReviewDto,
  ) {
    return this.meetingService.submitMinutesReview(token, dto);
  }
}
