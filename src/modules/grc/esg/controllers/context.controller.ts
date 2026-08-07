import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EsgContextService } from '../services';
import { UpdateContextDto } from '../dtos';
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
@Controller('grc/esg/context')
export class EsgContextController {
  constructor(private readonly service: EsgContextService) {}

  @Get()
  get(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.get(t || u);
  }

  @Patch()
  update(
    @Body() dto: UpdateContextDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.update(t || u, dto);
  }

  @Get('history')
  getHistory(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getHistory(t || u);
  }
}
