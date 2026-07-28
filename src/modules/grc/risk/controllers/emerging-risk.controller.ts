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
import { EmergingRiskService } from '../services';
import {
  CreateEmergingRiskDto,
  UpdateEmergingRiskDto,
  AddTriggerDto,
  AddReviewDto,
  EscalateEmergingRiskDto,
} from '../dtos';
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
@Controller('grc/risk/emerging')
export class EmergingRiskController {
  constructor(private readonly service: EmergingRiskService) {}

  @Post()
  create(
    @Body() dto: CreateEmergingRiskDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmergingRiskDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.update(t || u, id, dto);
  }

  @Post(':id/triggers')
  addTrigger(
    @Param('id') id: string,
    @Body() dto: AddTriggerDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addTrigger(t || u, id, dto);
  }

  @Patch(':id/triggers/:index/fire')
  fireTrigger(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.fireTrigger(t || u, id, Number(index));
  }

  @Post(':id/reviews')
  addReview(
    @Param('id') id: string,
    @Body() dto: AddReviewDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addReview(t || u, id, dto);
  }

  @Post(':id/escalate')
  escalate(
    @Param('id') id: string,
    @Body() dto: EscalateEmergingRiskDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.escalate(t || u, id, dto);
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.service.delete(t || u, id);
    return { success: true };
  }
}
