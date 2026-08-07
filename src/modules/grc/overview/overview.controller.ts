import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OverviewService } from './overview.service';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

@ApiTags('GRC — Overview')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/overview')
export class OverviewController {
  constructor(private readonly service: OverviewService) {}

  @Get()
  get(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getOverview(t || u);
  }
}
