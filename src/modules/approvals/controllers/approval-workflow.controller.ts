import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';
import {
  ApprovalWorkflowService,
  RequestUser,
} from '../services/approval-workflow.service';
import { SaveWorkflowDto } from '../dtos/approval.dto';

// Where the account owner sets who drafts, who reviews / approves and in
// what order, for CRM contracts and GRC deal contracts. The owner is always
// the last step and does not need to be listed.
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@Controller('approvals/workflows')
export class ApprovalWorkflowController {
  constructor(private readonly service: ApprovalWorkflowService) {}

  @Get(':module')
  async get(@Param('module') module: string, @CurrentUser() user: RequestUser) {
    return this.service.view(
      user,
      ApprovalWorkflowService.assertModule(module),
    );
  }

  @UserTypes(UserType.TENANT)
  @Put(':module')
  async save(
    @Param('module') module: string,
    @Body() dto: SaveWorkflowDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.save(
      user,
      ApprovalWorkflowService.assertModule(module),
      dto,
    );
  }
}
