import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OrgStructureService } from '../services';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

// Governance → Organisation Structure — real org chart derived from HR's
// own Employee records, not a freeform tenant-designed structure.
@ApiTags('GRC — Governance')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/governance/org-structure')
export class OrgStructureController {
  constructor(private readonly orgStructureService: OrgStructureService) {}

  @Get()
  @ApiOperation({
    summary:
      "The tenant's real org chart, derived from HR's Employee records " +
      '(reportsToManagerId/jobTitle/teamId)',
  })
  getOrgChart(@CurrentUser('tenantId') tenantId: string) {
    return this.orgStructureService.getOrgChart(tenantId);
  }
}
