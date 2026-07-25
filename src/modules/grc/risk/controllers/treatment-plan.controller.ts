import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TreatmentPlanService } from '../services';
import { CreateTreatmentPlanDto, DecideTreatmentPlanDto } from '../dtos';
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
@Controller('grc/risk/treatment-plans')
export class TreatmentPlanController {
  constructor(private readonly planService: TreatmentPlanService) {}

  @Get('eligible-risks')
  @ApiOperation({
    summary:
      'Risks currently eligible for a treatment plan (High/Extreme residual)',
  })
  getEligibleRisks(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.planService.getEligibleRisks(t || u);
  }

  @Post()
  create(
    @Body() dto: CreateTreatmentPlanDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.planService.create(t || u, dto);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.planService.getAll(t || u);
  }

  @Patch(':id/decide')
  decide(
    @Param('id') id: string,
    @Body() dto: DecideTreatmentPlanDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.planService.decide(t || u, id, dto);
  }
}
