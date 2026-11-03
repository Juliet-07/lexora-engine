import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Request } from 'express';
import { NoticeEmployeeService, NoticeService } from '../services';
import {
  AcknowledgeNoticeDto,
  AskNoticeQuestionDto,
  AudiencePreviewDto,
  BulkNoticeIdsDto,
  NoticeIdsDto,
  PublishNoticeDto,
  RecordOfflineAckDto,
  ReplyQuestionDto,
  SaveNoticeDto,
  SaveNoticeGroupDto,
  SaveNoticeTemplateDto,
  TrackerActionDto,
  UpdateNoticeSettingsDto,
} from '../dtos';
import { CurrentUser, UserTypes } from '../../../common/decorators/index';
import {
  PlatformModuleKey,
  UserType,
} from '../../../common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

const noticeAttachmentStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const dir = join(process.cwd(), 'uploads', 'hr', 'notices');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${uuidv4()}${extname(file.originalname)}`);
  },
});

const noticeAttachmentFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: any,
) => {
  const allowed = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else
    cb(
      new BadRequestException('Attach a PDF, Word, Excel or image file.'),
      false,
    );
};

const sizeLabel = (bytes: number) => {
  const kb = bytes / 1024;
  return kb > 1024
    ? `${(kb / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(kb))} KB`;
};

// ═══════════════════════════════════════════════════════════════
// HR admin — Notices & Communications
// ═══════════════════════════════════════════════════════════════
@ApiTags('HR — Notices (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.HR_PM)
@Controller('hr/notices')
export class NoticeTenantController {
  constructor(private readonly notices: NoticeService) {}

  // ── Static routes first: they must not be swallowed by :id ──

  @Get('overview')
  @ApiOperation({
    summary:
      'Notices hub: KPIs, in-progress acknowledgements, items needing attention',
  })
  overview(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.notices.overview(t || u);
  }

  @Get('meta')
  @ApiOperation({
    summary:
      'Everything the compose form needs: departments, locations, groups, templates, settings',
  })
  meta(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.notices.meta(t || u);
  }

  @Get('employees')
  @ApiOperation({
    summary: 'Search employees for the "specific people" audience',
  })
  employees(
    @Query('search') search: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.searchEmployees(t || u, search);
  }

  @Post('audience/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Who would receive a notice sent to this audience' })
  previewAudience(
    @Body() dto: AudiencePreviewDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.previewAudience(t || u, dto);
  }

  @Post('attachments')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: noticeAttachmentStorage,
      fileFilter: noticeAttachmentFilter,
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Upload a file to attach to a notice' })
  uploadAttachment(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded.');
    return {
      name: file.originalname,
      size: sizeLabel(file.size),
      url: `/uploads/hr/notices/${file.filename}`,
    };
  }

  @Get('register.csv')
  @ApiOperation({ summary: 'Notice register as CSV text' })
  registerCsv(
    @Query() q: any,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.registerCsv(t || u, q);
  }

  // Tracker
  @Get('tracker')
  @ApiOperation({
    summary: 'Outstanding acknowledgements across active notices',
  })
  tracker(
    @Query() q: any,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.tracker(t || u, q);
  }

  @Get('tracker.csv')
  @ApiOperation({ summary: 'Outstanding acknowledgements as CSV text' })
  trackerCsv(
    @Query() q: any,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.trackerCsv(t || u, q);
  }

  @Post('tracker/remind')
  @HttpCode(HttpStatus.OK)
  trackerRemind(
    @Body() dto: TrackerActionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.trackerRemind(t || u, u, dto.items);
  }

  @Post('tracker/escalate')
  @HttpCode(HttpStatus.OK)
  trackerEscalate(
    @Body() dto: TrackerActionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.trackerEscalate(t || u, u, dto.items);
  }

  // Templates / groups / settings
  @Get('templates')
  listTemplates(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.listTemplates(t || u);
  }

  @Post('templates')
  @HttpCode(HttpStatus.CREATED)
  createTemplate(
    @Body() dto: SaveNoticeTemplateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.createTemplate(t || u, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.deleteTemplate(t || u, id);
  }

  @Get('groups')
  listGroups(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.listGroups(t || u);
  }

  @Post('groups')
  @HttpCode(HttpStatus.CREATED)
  createGroup(
    @Body() dto: SaveNoticeGroupDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.createGroup(t || u, dto);
  }

  @Get('groups/:id/members')
  groupMembers(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.groupMembers(t || u, id);
  }

  @Delete('groups/:id')
  deleteGroup(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.deleteGroup(t || u, id);
  }

  @Get('settings')
  getSettings(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.getSettings(t || u);
  }

  @Put('settings')
  updateSettings(
    @Body() dto: UpdateNoticeSettingsDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.updateSettings(t || u, dto);
  }

  @Get('employee/:employeeId/history')
  employeeHistory(
    @Param('employeeId') employeeId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.employeeHistory(t || u, employeeId);
  }

  @Post('bulk/archive')
  @HttpCode(HttpStatus.OK)
  bulkArchive(
    @Body() dto: BulkNoticeIdsDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.bulkArchive(t || u, u, dto.noticeIds);
  }

  @Post('bulk/remind')
  @HttpCode(HttpStatus.OK)
  async bulkRemind(
    @Body() dto: BulkNoticeIdsDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const actor = await this.notices.actorName(u);
    let reminded = 0;
    for (const id of dto.noticeIds) {
      try {
        reminded += (await this.notices.remind(t || u, id, null, actor))
          .reminded;
      } catch {
        /* a missing notice in the selection is skipped */
      }
    }
    return { reminded };
  }

  // ── Collection ──

  @Get()
  @ApiOperation({ summary: 'Notice register' })
  list(
    @Query() q: any,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.list(t || u, q);
  }

  @Post('draft')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save a new notice as a draft' })
  createDraft(
    @Body() dto: SaveNoticeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.saveDraft(t || u, u, dto);
  }

  @Post('publish')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send or schedule a new notice' })
  publishNew(
    @Body() dto: PublishNoticeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.publish(t || u, u, dto);
  }

  // ── One notice ──

  @Get(':id')
  detail(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.detail(t || u, id);
  }

  @Get(':id/recipients')
  recipients(
    @Param('id') id: string,
    @Query() q: any,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.recipients(t || u, id, q);
  }

  @Get(':id/recipients.csv')
  recipientsCsv(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.recipientsCsv(t || u, id);
  }

  @Put(':id/draft')
  @ApiOperation({ summary: 'Save changes to a draft or scheduled notice' })
  updateDraft(
    @Param('id') id: string,
    @Body() dto: SaveNoticeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.saveDraft(t || u, u, dto, id);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send or schedule an existing draft' })
  publishExisting(
    @Param('id') id: string,
    @Body() dto: PublishNoticeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.publish(t || u, u, dto, id);
  }

  @Post(':id/send-now')
  @HttpCode(HttpStatus.OK)
  sendNow(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.sendNow(t || u, u, id);
  }

  @Post(':id/unschedule')
  @HttpCode(HttpStatus.OK)
  unschedule(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.unschedule(t || u, u, id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.archive(t || u, u, id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.restore(t || u, u, id);
  }

  @Post(':id/pin')
  @HttpCode(HttpStatus.OK)
  pin(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.togglePin(t || u, u, id);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.remove(t || u, id);
  }

  @Post(':id/remind')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remind outstanding recipients (all, or the listed employees)',
  })
  async remind(
    @Param('id') id: string,
    @Body() dto: Partial<NoticeIdsDto>,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const actor = await this.notices.actorName(u);
    return this.notices.remind(t || u, id, dto?.employeeIds ?? null, actor);
  }

  @Post(':id/escalate')
  @HttpCode(HttpStatus.OK)
  async escalate(
    @Param('id') id: string,
    @Body() dto: NoticeIdsDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const actor = await this.notices.actorName(u);
    return this.notices.escalate(t || u, id, dto.employeeIds, actor);
  }

  @Post(':id/recipients/:employeeId/offline-ack')
  @HttpCode(HttpStatus.OK)
  offlineAck(
    @Param('id') id: string,
    @Param('employeeId') employeeId: string,
    @Body() dto: RecordOfflineAckDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.recordOfflineAck(t || u, u, id, employeeId, dto);
  }

  @Get(':id/recipients/:employeeId/receipt')
  receipt(
    @Param('id') id: string,
    @Param('employeeId') employeeId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.receipt(t || u, id, employeeId);
  }

  @Post(':id/questions/:questionId/reply')
  @HttpCode(HttpStatus.OK)
  reply(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: ReplyQuestionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.replyToQuestion(t || u, u, id, questionId, dto);
  }
}

// ═══════════════════════════════════════════════════════════════
// Employee workspace — my notices
// ═══════════════════════════════════════════════════════════════
@ApiTags('Employee — Notices')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.EMPLOYEE, UserType.TENANT)
@Controller('employee/notices')
export class NoticeEmployeeController {
  constructor(private readonly mine: NoticeEmployeeService) {}

  @Get('summary')
  @ApiOperation({
    summary:
      'What needs my attention — drives the dashboard message under the greeting',
  })
  summary(@CurrentUser('sub') userId: string) {
    return this.mine.summary(userId);
  }

  @Get()
  @ApiOperation({ summary: 'My notices (filter: action | unread | ack | all)' })
  list(@Query('filter') filter: string, @CurrentUser('sub') userId: string) {
    return this.mine.list(userId, filter || 'action');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Open a notice (records the read receipt)' })
  open(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.mine.open(userId, id);
  }

  @Post(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  acknowledge(
    @Param('id') id: string,
    @Body() dto: AcknowledgeNoticeDto,
    @CurrentUser('sub') userId: string,
    @Req() req: Request,
  ) {
    return this.mine.acknowledge(userId, id, dto, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
  }

  @Post(':id/questions')
  @HttpCode(HttpStatus.CREATED)
  ask(
    @Param('id') id: string,
    @Body() dto: AskNoticeQuestionDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.mine.ask(userId, id, dto);
  }

  @Get(':id/receipt')
  receipt(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.mine.receipt(userId, id);
  }
}
