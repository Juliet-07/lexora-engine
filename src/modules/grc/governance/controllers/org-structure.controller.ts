import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OrgStructureService } from '../services';
import {
  CreateOrgStructureNodeDto,
  UpdateOrgStructureNodeDto,
  MoveOrgStructureNodeDto,
} from '../dtos/org-structure.dto';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

// Governance → Organisation Structure (Oct 2026 rework) — a freeform
// chart the tenant builds and edits directly: shareholders, the
// board, departments, and roles, nested however their real structure
// works. See OrgStructureService for why this replaced the earlier
// HR-Employee-derived, read-only chart.
@ApiTags('GRC — Governance — Organisation Structure')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/governance/org-structure')
export class OrgStructureController {
  constructor(private readonly service: OrgStructureService) {}

  @Get()
  @ApiOperation({
    summary:
      "The tenant's own org structure — shareholders, board, " +
      'departments and roles, built and arranged directly by the tenant.',
  })
  getTree(@CurrentUser('tenantId') t: string, @CurrentUser('sub') u: string) {
    return this.service.getTree(t || u);
  }

  @Post()
  @ApiOperation({ summary: 'Add a node to the org structure' })
  create(
    @Body() dto: CreateOrgStructureNodeDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Edit a node — its label, subtitle, type, or which node it sits under',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOrgStructureNodeDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.update(t || u, id, dto);
  }

  @Patch(':id/move')
  @ApiOperation({ summary: 'Shift a node up or down among its siblings' })
  move(
    @Param('id') id: string,
    @Body() dto: MoveOrgStructureNodeDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.move(t || u, id, dto.direction);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Remove a node. Pass ?cascade=true to also remove everything nested under it.',
  })
  remove(
    @Param('id') id: string,
    @Query('cascade') cascade: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.remove(t || u, id, cascade === 'true');
  }
}
