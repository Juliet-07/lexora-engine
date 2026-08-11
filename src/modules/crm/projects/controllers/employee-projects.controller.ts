import { Controller, Get, Patch, Body, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { MyProjectsService } from '../services';
import { UpdateMyTaskDto } from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';

@ApiTags('CRM — Projects — My Mandates (Employee)')
@ApiBearerAuth()
@UserTypes(UserType.EMPLOYEE)
@Controller('crm')
export class MyProjectsController {
  constructor(private readonly service: MyProjectsService) {}

  @Get('my-mandates')
  @ApiOperation({ summary: "Mandates the employee's own team is assigned to" })
  getMyMandates(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMyMandates(t || u, u);
  }

  @Get('my-mandates/:id')
  @ApiOperation({
    summary: 'One mandate — only if the employee is on its team',
  })
  getMandateDetail(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMandateDetail(t || u, u, id);
  }

  @Get('my-mandates/:id/tasks')
  @ApiOperation({
    summary: 'All tasks on the mandate (any assignee) — the Board view',
  })
  getMandateTasks(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMandateTasks(t || u, u, id);
  }

  @Get('my-mandates/:id/documents')
  @ApiOperation({ summary: "The mandate's real documents, read-only" })
  getMandateDocuments(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMandateDocuments(t || u, u, id);
  }

  @Get('my-tasks')
  @ApiQuery({ name: 'mandateId', required: false })
  @ApiOperation({
    summary: "The employee's own tasks, across all mandates or one",
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
    summary: "Move status or log hours on the employee's own task",
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
