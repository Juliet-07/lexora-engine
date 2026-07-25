import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RiskAppetiteService } from '../services';
import { SaveAppetiteVersionDto } from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

@ApiTags('GRC — Risk')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/risk/appetite')
export class RiskAppetiteController {
  constructor(private readonly appetiteService: RiskAppetiteService) {}

  @Get('current')
  getCurrent(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.appetiteService.getCurrent(t || u);
  }

  @Post()
  @ApiOperation({
    summary:
      'Save a new appetite version — becomes current, appended to history',
  })
  save(
    @Body() dto: SaveAppetiteVersionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.appetiteService.saveNewVersion(t || u, dto);
  }

  @Get('history')
  getHistory(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.appetiteService.getHistory(t || u);
  }
}
