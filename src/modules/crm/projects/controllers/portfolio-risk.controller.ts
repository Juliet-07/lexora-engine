import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PortfolioRiskService } from '../services';
import {
  CreatePortfolioRiskDto,
  UpdateRiskStatusDto,
  AddRiskNoteDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Projects — PMO Risks (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('crm/portfolio-risks')
export class PortfolioRiskController {
  constructor(private readonly service: PortfolioRiskService) {}

  @Post()
  @ApiOperation({ summary: 'Log a portfolio risk or issue' })
  create(
    @Body() dto: CreatePortfolioRiskDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'All portfolio risks' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Move status' })
  setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRiskStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setStatus(t || u, id, dto);
  }

  @Post(':id/escalate')
  @ApiOperation({ summary: 'Escalate to portfolio' })
  escalate(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.escalate(t || u, id);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a mitigation note' })
  addNote(
    @Param('id') id: string,
    @Body() dto: AddRiskNoteDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addNote(t || u, id, dto);
  }
}
