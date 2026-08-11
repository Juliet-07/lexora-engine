import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MandateService } from '../services';
import {
  CreateMandateDto,
  UpdateMandateDto,
  SetClosureItemDto,
  UpdateMilestoneDto,
  AddMilestoneDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Projects — Mandates (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('crm/mandates')
export class MandateController {
  constructor(private readonly service: MandateService) {}

  @Post()
  @ApiOperation({ summary: 'Create a mandate' })
  create(
    @Body() dto: CreateMandateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all mandates' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one mandate' })
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit mandate details' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMandateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.update(t || u, id, dto);
  }

  @Post(':id/advance')
  @ApiOperation({ summary: 'Advance to the next lifecycle stage' })
  advance(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.advanceStage(t || u, id);
  }

  @Post(':id/clear-conflict-check')
  @ApiOperation({ summary: 'Clear the conflict check' })
  clearConflictCheck(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.clearConflictCheck(t || u, id);
  }

  @Patch(':id/closure/:itemId')
  @ApiOperation({ summary: 'Toggle a closure checklist item' })
  setClosureItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: SetClosureItemDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setClosureItem(t || u, id, itemId, dto);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Close the mandate (requires full checklist)' })
  close(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.close(t || u, id);
  }

  @Post(':id/milestones')
  @ApiOperation({ summary: 'Add a milestone' })
  addMilestone(
    @Param('id') id: string,
    @Body() dto: AddMilestoneDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addMilestone(t || u, id, dto);
  }

  @Patch(':id/milestones/:milestoneId')
  @ApiOperation({ summary: 'Edit a milestone or move its status' })
  updateMilestone(
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: UpdateMilestoneDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateMilestone(t || u, id, milestoneId, dto);
  }

  @Delete(':id/milestones/:milestoneId')
  @ApiOperation({ summary: 'Delete a milestone' })
  deleteMilestone(
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.deleteMilestone(t || u, id, milestoneId);
  }
}
