import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from '../services';
import {
  CreateAuditDto,
  SetAuditStatusDto,
  AddRequestDto,
  SetRequestStatusDto,
  AddFindingDto,
  UpdateFindingDto,
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
@Controller('grc/compliance/audits')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Post()
  create(
    @Body() dto: CreateAuditDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetAuditStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setStatus(t || u, id, dto);
  }

  @Post(':id/requests')
  addRequest(
    @Param('id') id: string,
    @Body() dto: AddRequestDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addRequest(t || u, id, dto);
  }

  @Patch(':id/requests/:index/status')
  setRequestStatus(
    @Param('id') id: string,
    @Param('index') index: string,
    @Body() dto: SetRequestStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setRequestStatus(t || u, id, Number(index), dto);
  }

  @Post(':id/findings')
  addFinding(
    @Param('id') id: string,
    @Body() dto: AddFindingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addFinding(t || u, id, dto);
  }

  @Patch(':id/findings/:index')
  updateFinding(
    @Param('id') id: string,
    @Param('index') index: string,
    @Body() dto: UpdateFindingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateFinding(t || u, id, Number(index), dto);
  }
}
