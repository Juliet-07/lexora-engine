import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PolicyTemplateService } from '../services';
import { PolicyTemplateAppliesTo } from '../schemas';
import { UserTypes } from 'src/common/decorators';
import { POLICY_MERGE_FIELDS } from 'src/common/utils/policy-merge-fields';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

@ApiTags('GRC — Policy Templates')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/compliance/policy-templates')
export class PolicyTemplateController {
  constructor(private readonly service: PolicyTemplateService) {}

  // Labels, groups and input kinds for the policy editor's Merge Fields panel.
  // Declared before any ':id' route.
  @Get('merge-fields')
  getMergeFields() {
    return POLICY_MERGE_FIELDS;
  }

  // Shared by both the Policies and Governance Codes tenant pages —
  // appliesTo distinguishes which catalogue slice a caller wants (see
  // PolicyTemplateService.getPublished).
  @Get()
  getPublished(
    @Query('category') category?: string,
    @Query('appliesTo') appliesTo?: PolicyTemplateAppliesTo,
  ) {
    return this.service.getPublished(category, appliesTo);
  }
}
