import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RegulatoryChangeService } from '../services';
import {
  CreateRegChangeDto,
  UpdateAssessmentDto,
  UpdateLoopActionDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

@ApiTags('GRC — Compliance')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/compliance/regulatory-changes')
export class RegulatoryChangeController {
  constructor(private readonly service: RegulatoryChangeService) {}

  @Post()
  create(
    @Body() dto: CreateRegChangeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Patch(':id/assessment')
  updateAssessment(
    @Param('id') id: string,
    @Body() dto: UpdateAssessmentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateAssessment(t || u, id, dto);
  }

  @Patch(':id/loop/:field')
  updateLoopAction(
    @Param('id') id: string,
    @Param('field') field: string,
    @Body() dto: UpdateLoopActionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateLoopAction(t || u, id, field, dto);
  }
}
