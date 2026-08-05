import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PortfolioService } from '../services';
import {
  UpdatePortfolioSettingsDto,
  SetScenarioEnabledDto,
  AddScenarioDealDto,
  SetValueOverrideDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';

@ApiTags('Deal Intelligence')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@Controller('deal-intel/portfolio')
export class PortfolioController {
  constructor(private readonly service: PortfolioService) {}

  @Get()
  get(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getPortfolio(t || u);
  }

  @Patch('settings')
  updateSettings(
    @Body() dto: UpdatePortfolioSettingsDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateSettings(t || u, dto);
  }

  @Patch('scenario/enabled')
  setScenarioEnabled(
    @Body() dto: SetScenarioEnabledDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setScenarioEnabled(t || u, dto);
  }

  @Post('scenario/reset')
  resetScenario(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.resetScenario(t || u);
  }

  @Post('scenario/deals')
  addScenarioDeal(
    @Body() dto: AddScenarioDealDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addScenarioDeal(t || u, dto);
  }

  @Delete('scenario/deals/:index')
  removeScenarioDeal(
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.removeScenarioDeal(t || u, Number(index));
  }

  @Patch('scenario/toggle-removed/:dealId')
  toggleRemovedDeal(
    @Param('dealId') dealId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.toggleRemovedDeal(t || u, dealId);
  }

  @Patch('scenario/value-override/:dealId')
  setValueOverride(
    @Param('dealId') dealId: string,
    @Body() dto: SetValueOverrideDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setValueOverride(t || u, dealId, dto);
  }
}
