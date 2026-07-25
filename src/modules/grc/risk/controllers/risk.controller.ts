import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RiskService } from '../services';
import {
  CreateRiskDto,
  UpdateRiskDto,
  SetRiskStatusDto,
  LinkControlDto,
  LinkRelatedRiskDto,
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
@Controller('grc/risk/risks')
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Post()
  create(
    @Body() dto: CreateRiskDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskService.create(t || u, dto);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.riskService.getAll(t || u);
  }

  @Get('heatmap')
  getHeatmap(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskService.getHeatmapData(t || u);
  }

  @Get(':id')
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskService.getById(t || u, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Edit risk details — a note is required and logged to change history',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRiskDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskService.update(t || u, id, dto);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetRiskStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskService.setStatus(t || u, id, dto);
  }

  @Post(':id/controls')
  linkControl(
    @Param('id') id: string,
    @Body() dto: LinkControlDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskService.linkControl(t || u, id, dto);
  }

  @Delete(':id/controls/:controlId')
  unlinkControl(
    @Param('id') id: string,
    @Param('controlId') controlId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskService.unlinkControl(t || u, id, controlId);
  }

  @Post(':id/related')
  linkRelated(
    @Param('id') id: string,
    @Body() dto: LinkRelatedRiskDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskService.linkRelatedRisk(t || u, id, dto);
  }

  @Delete(':id/related/:relatedRiskId')
  unlinkRelated(
    @Param('id') id: string,
    @Param('relatedRiskId') relatedRiskId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskService.unlinkRelatedRisk(t || u, id, relatedRiskId);
  }
}
