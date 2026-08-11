import {
  Controller,
  Get,
  Post,
  Patch,
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
import { MyProjectsService } from '../services';
import { UpdateMyTaskDto, CreateEmployeeMessageDto } from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';

@ApiTags('CRM — Projects — My Mandates (Employee)')
@ApiBearerAuth()
// Employees AND tenant owners — a tenant's own account can have a
// real, linked HR Employee record too (e.g. role "Owner"), and
// resolveEmployee() in the service already requires that real link
// to exist before returning anything. Restricting this to
// UserType.EMPLOYEE alone locked out exactly that case: an owner
// with real assigned work who should see it the same way any other
// employee does. Which of the two they are also changes what they're
// authorized to see once inside — see userType passed through below.
@UserTypes(UserType.EMPLOYEE, UserType.TENANT)
@Controller('crm')
export class MyProjectsController {
  constructor(private readonly service: MyProjectsService) {}

  @Get('my-mandates')
  @ApiOperation({
    summary:
      "Mandates the caller is involved in — every mandate for a tenant-type caller, or the employee's own team/task links for a genuine employee",
  })
  getMyMandates(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('userType') userType: string,
  ) {
    return this.service.getMyMandates(t || u, u, userType);
  }

  @Get('my-mandates/:id')
  @ApiOperation({
    summary:
      'One mandate — unrestricted for a tenant-type caller, team/task-gated for a genuine employee',
  })
  getMandateDetail(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('userType') userType: string,
  ) {
    return this.service.getMandateDetail(t || u, u, id, userType);
  }

  @Get('my-mandates/:id/tasks')
  @ApiOperation({
    summary: 'All tasks on the mandate (any assignee) — the Board view',
  })
  getMandateTasks(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('userType') userType: string,
  ) {
    return this.service.getMandateTasks(t || u, u, id, userType);
  }

  @Get('my-mandates/:id/documents')
  @ApiOperation({ summary: "The mandate's real documents, read-only" })
  getMandateDocuments(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('userType') userType: string,
  ) {
    return this.service.getMandateDocuments(t || u, u, id, userType);
  }

  @Get('my-mandates/:id/messages')
  @ApiOperation({
    summary: 'My own message thread with the tenant for this mandate',
  })
  getMyMessages(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('userType') userType: string,
  ) {
    return this.service.getMyMessages(t || u, u, id, userType);
  }

  @Post('my-mandates/:id/messages')
  @ApiOperation({ summary: 'Reply to the tenant on this mandate' })
  sendMyMessage(
    @Param('id') id: string,
    @Body() dto: CreateEmployeeMessageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('userType') userType: string,
  ) {
    return this.service.sendMyMessage(t || u, u, id, userType, dto);
  }

  @Get('my-tasks')
  @ApiQuery({ name: 'mandateId', required: false })
  @ApiOperation({
    summary:
      'The caller\'s own tasks — always personal, even for a tenant-type caller, since "my tasks" means work assigned to them specifically, not everyone\'s',
  })
  getMyTasks(
    @Query('mandateId') mandateId: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMyTasks(t || u, u, mandateId);
  }

  @Patch('my-tasks/:id')
  @ApiOperation({
    summary: "Move status or log hours on the caller's own task",
  })
  updateMyTask(
    @Param('id') id: string,
    @Body() dto: UpdateMyTaskDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateMyTask(t || u, u, id, dto);
  }
}
