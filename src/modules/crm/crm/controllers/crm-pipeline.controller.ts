import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ClientPipelineService, LeadService } from '../services';
import {
  CreateLeadDto,
  UpdateLeadDto,
  MoveLeadStageDto,
  MarkLeadLostDto,
  ConvertLeadDto,
  MoveClientStageDto,
  ScheduleLeadMeetingDto,
  CompleteLeadMeetingDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { ClientPipelineStage } from '../schemas';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

const leadDocumentStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const p = join(process.cwd(), 'uploads', 'crm', 'leads');
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
    cb(null, p);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

@ApiTags('CRM — Pipeline (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('crm/leads')
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new lead' })
  create(
    @Body() dto: CreateLeadDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leadService.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all leads (all stages/statuses)' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.leadService.getAll(t || u);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Lead/Prospect stat card counts' })
  getStats(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.leadService.getStats(t || u);
  }

  @Get('funnel')
  @ApiOperation({ summary: 'Conversion funnel percentages' })
  getFunnel(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.leadService.getFunnel(t || u);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one lead' })
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leadService.getById(t || u, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit lead details' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leadService.update(t || u, id, dto);
  }

  @Patch(':id/stage')
  @ApiOperation({ summary: 'Move a lead between Lead/Prospect board columns' })
  moveStage(
    @Param('id') id: string,
    @Body() dto: MoveLeadStageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leadService.moveStage(t || u, id, dto);
  }

  @Patch(':id/lost')
  @ApiOperation({ summary: 'Mark a lead as lost/disqualified' })
  markLost(
    @Param('id') id: string,
    @Body() dto: MarkLeadLostDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leadService.markLost(t || u, id, dto);
  }

  @Post(':id/convert')
  @ApiOperation({
    summary:
      'Convert a lead into a real client account via the same quickAddClient flow',
  })
  convert(
    @Param('id') id: string,
    @Body() dto: ConvertLeadDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leadService.convert(t || u, id, u, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a lead' })
  async delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.leadService.delete(t || u, id);
    return { success: true };
  }

  // ── Meetings ─────────────────────────────────────────────────
  @Post(':id/meetings')
  @ApiOperation({ summary: 'Schedule a meeting — emails the lead' })
  scheduleMeeting(
    @Param('id') id: string,
    @Body() dto: ScheduleLeadMeetingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leadService.scheduleMeeting(t || u, id, dto);
  }

  @Patch(':id/meetings/:meetingId/complete')
  @ApiOperation({ summary: 'Mark a meeting completed, with an outcome' })
  completeMeeting(
    @Param('id') id: string,
    @Param('meetingId') meetingId: string,
    @Body() dto: CompleteLeadMeetingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leadService.completeMeeting(t || u, id, meetingId, dto);
  }

  @Patch(':id/meetings/:meetingId/cancel')
  @ApiOperation({ summary: 'Cancel a meeting' })
  cancelMeeting(
    @Param('id') id: string,
    @Param('meetingId') meetingId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leadService.cancelMeeting(t || u, id, meetingId);
  }

  // ── Documents ────────────────────────────────────────────────
  @Get(':id/documents')
  @ApiOperation({ summary: 'Documents sent to this lead' })
  getDocuments(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leadService.getDocuments(t || u, id);
  }

  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file', { storage: leadDocumentStorage }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Send a document to the lead by email, with a real attachment (proposal, company profile, etc.)',
  })
  sendDocument(
    @Param('id') id: string,
    @Query('message') message: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leadService.sendDocument(t || u, id, 'You', message, file);
  }
}

@ApiTags('CRM — Pipeline (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('crm/clients')
export class ClientPipelineController {
  constructor(private readonly clientPipelineService: ClientPipelineService) {}

  @Get('board')
  @ApiQuery({ name: 'stage', enum: ClientPipelineStage })
  @ApiOperation({
    summary:
      'One board column (active/retained/past) with enriched client cards',
  })
  getBoardColumn(
    @Query('stage') stage: ClientPipelineStage,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.clientPipelineService.getBoardColumn(t || u, stage);
  }

  @Get('counts')
  @ApiOperation({ summary: 'Active/retained/past counts for the stat cards' })
  getCounts(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.clientPipelineService.getCounts(t || u);
  }

  @Patch(':pipelineId/stage')
  @ApiOperation({ summary: 'Move a client between Active/Retained/Past' })
  moveStage(
    @Param('pipelineId') pipelineId: string,
    @Body() dto: MoveClientStageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.clientPipelineService.moveStage(t || u, pipelineId, dto);
  }
}
