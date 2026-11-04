import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  PlatformModuleKey,
  TenantRole,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { HealthScoreService } from './health-score.service';
import {
  UpdateHealthScoreCommentaryDto,
  UpdateHealthScoreSettingsDto,
} from './health-score.dto';

@ApiTags('GRC — Health Score')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/health-score')
export class HealthScoreController {
  constructor(private readonly service: HealthScoreService) {}

  @Get()
  @ApiOperation({
    summary:
      'The GRC Health Score: composite, five module scores, every indicator with its measured value and basis, the trend and the management commentary',
  })
  get(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.get(t || u);
  }

  @Put('settings')
  @Roles(
    TenantRole.TENANT_OWNER,
    TenantRole.TENANT_ADMIN,
    TenantRole.TENANT_MANAGER,
    TenantRole.TENANT_COMPLIANCE,
  )
  @ApiOperation({
    summary:
      'Change module weights and indicator weights, floors and targets (or reset them all)',
  })
  settings(
    @Body() dto: UpdateHealthScoreSettingsDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateSettings(t || u, u, dto);
  }

  @Put('commentary')
  @Roles(
    TenantRole.TENANT_OWNER,
    TenantRole.TENANT_ADMIN,
    TenantRole.TENANT_MANAGER,
    TenantRole.TENANT_COMPLIANCE,
  )
  @ApiOperation({
    summary: 'Save the MD/CEO note and the per-module commentary',
  })
  commentary(
    @Body() dto: UpdateHealthScoreCommentaryDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateCommentary(t || u, u, dto);
  }
}
