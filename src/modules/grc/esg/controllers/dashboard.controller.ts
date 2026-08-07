import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EsgDashboardService, EsgContextService } from '../services';
import { SnapshotHistoryDto } from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

@ApiTags('GRC — ESG')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/esg/dashboard')
export class EsgDashboardController {
  constructor(
    private readonly service: EsgDashboardService,
    private readonly contextService: EsgContextService,
  ) {}

  @Get()
  get(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getDashboard(t || u);
  }

  // Records the current period's pillar scores into history — an
  // explicit action (matches Valuation's version snapshots), not
  // something that happens silently every time the dashboard loads.
  @Post('snapshot-history')
  async snapshotHistory(
    @Body() dto: SnapshotHistoryDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const dash = await this.service.getDashboard(tenantId);
    return this.contextService.snapshotHistory(
      tenantId,
      dto,
      dash.environmental,
      dash.social,
      dash.governance,
    );
  }
}
