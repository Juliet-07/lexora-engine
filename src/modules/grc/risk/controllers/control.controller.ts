import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ControlService } from '../services';
import { CreateControlDto, LogTestDto, LogDeficiencyDto } from '../dtos';
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
@Controller('grc/risk/controls')
export class ControlController {
  constructor(private readonly controlService: ControlService) {}

  @Post()
  create(
    @Body() dto: CreateControlDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.controlService.create(t || u, dto);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.controlService.getAll(t || u);
  }

  @Post(':id/tests')
  logTest(
    @Param('id') id: string,
    @Body() dto: LogTestDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.controlService.logTest(t || u, id, dto);
  }

  @Get('tests/all')
  getAllTests(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.controlService.getAllTests(t || u);
  }

  @Post(':id/deficiencies')
  logDeficiency(
    @Param('id') id: string,
    @Body() dto: LogDeficiencyDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.controlService.logDeficiency(t || u, id, dto);
  }

  @Get('deficiencies/all')
  getAllDeficiencies(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.controlService.getAllDeficiencies(t || u);
  }

  @Patch('deficiencies/:id/remediate')
  markRemediated(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.controlService.markRemediated(t || u, id);
  }
}
