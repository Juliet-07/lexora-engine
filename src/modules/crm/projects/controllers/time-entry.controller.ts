import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { TimeEntryService } from '../services';
import {
  CreateTimeEntryDto,
  UpdateTimeEntryDto,
  RejectTimeEntryDto,
} from '../dtos';
import { TimesheetStatus } from '../schemas';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Projects — Timesheets (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('crm/time-entries')
export class TimeEntryController {
  constructor(private readonly service: TimeEntryService) {}

  @Post()
  @ApiOperation({ summary: 'Log a time entry (starts as Draft)' })
  create(
    @Body() dto: CreateTimeEntryDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiQuery({ name: 'mandateId', required: false })
  @ApiQuery({ name: 'memberUserId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: TimesheetStatus })
  @ApiQuery({ name: 'adrCaseId', required: false })
  @ApiQuery({ name: 'litigationCaseId', required: false })
  @ApiOperation({ summary: 'List time entries, optionally filtered' })
  getAll(
    @Query('mandateId') mandateId: string | undefined,
    @Query('memberUserId') memberUserId: string | undefined,
    @Query('status') status: TimesheetStatus | undefined,
    @Query('adrCaseId') adrCaseId: string | undefined,
    @Query('litigationCaseId') litigationCaseId: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAll(t || u, {
      mandateId,
      memberUserId,
      status,
      adrCaseId,
      litigationCaseId,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a draft or rejected entry' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTimeEntryDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.update(t || u, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a draft entry' })
  delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.delete(t || u, id);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Draft → Submitted' })
  submit(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.submit(t || u, id);
  }

  @Post(':id/lead-approve')
  @ApiOperation({ summary: 'Submitted → Lead Approved' })
  leadApprove(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.leadApprove(t || u, id);
  }

  @Post(':id/approve')
  @ApiOperation({
    summary:
      'Submitted or Lead Approved → Approved. This is what counts toward WIP.',
  })
  approve(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.approve(t || u, id);
  }

  @Post(':id/reject')
  @ApiOperation({
    summary: 'Submitted or Lead Approved → Rejected, with a reason',
  })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectTimeEntryDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.reject(t || u, id, dto);
  }
}
