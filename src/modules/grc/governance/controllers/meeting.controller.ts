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
  @ApiOperation({ summary: "Upload a document into this meeting's board pack" })
  addBoardPackDoc(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.meetingService.addBoardPackDoc(t || u, id, file);
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
