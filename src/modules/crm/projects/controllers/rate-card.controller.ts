import { Controller, Get, Put, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RateCardService } from '../services';
import { UpsertRateCardDto } from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Projects — Rate Cards (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('crm/rate-cards')
export class RateCardController {
  constructor(private readonly service: RateCardService) {}

  @Get()
  @ApiOperation({ summary: 'All rate cards' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Put(':employeeUserId')
  @ApiOperation({
    summary: "Set (create or update) an employee's standard rate",
  })
  upsert(
    @Param('employeeUserId') employeeUserId: string,
    @Body() dto: UpsertRateCardDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.upsert(t || u, { ...dto, employeeUserId });
  }
}
