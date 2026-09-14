import {
  Controller,
  Get,
  Post,
  Patch,
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
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { LeadService } from '../services';
import {
  UpdateLeadDto,
  MoveLeadStageDto,
  MarkLeadLostDto,
  ConvertLeadDto,
  ScheduleLeadMeetingDto,
  CompleteLeadMeetingDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';

const leadDocumentStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const p = join(process.cwd(), 'uploads', 'crm', 'leads');
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
    cb(null, p);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

// Separate from LeadController (tenant-only) — an employee only
// ever sees and acts on leads actually assigned to them. Every
// method below checks that ownership first, via the same
// assertOwnedByEmployee the service uses everywhere here, before
// delegating to the exact same logic a tenant's own actions use —
// so a lead an employee manages follows the identical pipeline
// rules all the way through to conversion.
@ApiTags('CRM — My Leads')
@ApiBearerAuth()
@UserTypes(UserType.EMPLOYEE, UserType.TENANT)
@Controller('crm/my-leads')
export class EmployeeLeadController {
  constructor(private readonly leadService: LeadService) {}

  @Get()
  @ApiOperation({ summary: 'Leads assigned to me' })
  getMyLeads(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leadService.getMyLeads(t || u, u);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my assigned leads' })
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leadService.getLeadForAssignee(t || u, u, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit details on a lead assigned to me' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.leadService.assertOwnedByEmployee(t || u, u, id);
    return this.leadService.update(t || u, id, dto);
  }

  @Patch(':id/stage')
  @ApiOperation({ summary: 'Move a lead assigned to me between board columns' })
  async moveStage(
    @Param('id') id: string,
    @Body() dto: MoveLeadStageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.leadService.assertOwnedByEmployee(t || u, u, id);
    return this.leadService.moveStage(t || u, id, dto);
  }

  @Post(':id/lost')
  @ApiOperation({ summary: 'Mark a lead assigned to me as lost' })
  async markLost(
    @Param('id') id: string,
    @Body() dto: MarkLeadLostDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.leadService.assertOwnedByEmployee(t || u, u, id);
    return this.leadService.markLost(t || u, id, dto);
  }

  @Post(':id/convert')
  @ApiOperation({
    summary: 'Convert a lead assigned to me into a real client',
  })
  async convert(
    @Param('id') id: string,
    @Body() dto: ConvertLeadDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.leadService.assertOwnedByEmployee(t || u, u, id);
    return this.leadService.convert(t || u, id, u, dto);
  }

  @Post(':id/meetings')
  @ApiOperation({ summary: 'Schedule a meeting — emails the lead' })
  async scheduleMeeting(
    @Param('id') id: string,
    @Body() dto: ScheduleLeadMeetingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.leadService.assertOwnedByEmployee(t || u, u, id);
    return this.leadService.scheduleMeeting(t || u, id, dto);
  }

  @Patch(':id/meetings/:meetingId/complete')
  @ApiOperation({ summary: 'Mark a meeting completed, with an outcome' })
  async completeMeeting(
    @Param('id') id: string,
    @Param('meetingId') meetingId: string,
    @Body() dto: CompleteLeadMeetingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.leadService.assertOwnedByEmployee(t || u, u, id);
    return this.leadService.completeMeeting(t || u, id, meetingId, dto);
  }

  @Patch(':id/meetings/:meetingId/cancel')
  @ApiOperation({ summary: 'Cancel a meeting' })
  async cancelMeeting(
    @Param('id') id: string,
    @Param('meetingId') meetingId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.leadService.assertOwnedByEmployee(t || u, u, id);
    return this.leadService.cancelMeeting(t || u, id, meetingId);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'Documents sent to this lead' })
  async getDocuments(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.leadService.assertOwnedByEmployee(t || u, u, id);
    return this.leadService.getDocuments(t || u, id);
  }

  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file', { storage: leadDocumentStorage }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Send a document to the lead by email' })
  async sendDocument(
    @Param('id') id: string,
    @Query('message') message: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.leadService.assertOwnedByEmployee(t || u, u, id);
    return this.leadService.sendDocument(t || u, id, 'You', message, file);
  }
}
