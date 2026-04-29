import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  AssignPlanDto,
  UpdateOrgStatusDto,
} from './dto/organization.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/pagination.dto';

@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Post()
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Create a new organization [admin]' })
  @ApiResponse({ status: 201 })
  create(@Body() dto: CreateOrganizationDto) {
    return this.service.createOrganization(dto);
  }

  @Get()
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'List all organizations [admin]' })
  findAll(@Query() pagination: PaginationDto) {
    return this.service.findAll(pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization by ID' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Update organization [admin]' })
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    return this.service.updateOrganization(id, dto);
  }

  @Patch(':id/plan')
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Assign subscription plan [admin]' })
  assignPlan(@Param('id') id: string, @Body() dto: AssignPlanDto) {
    return this.service.assignPlan(id, dto);
  }

  @Patch(':id/status')
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Update organization status [admin]' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrgStatusDto) {
    return this.service.updateStatus(id, dto);
  }

  @Delete(':id/deactivate')
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Deactivate organization [admin]' })
  deactivate(@Param('id') id: string) {
    return this.service.deactivateOrganization(id);
  }

  @Delete(':id')
  @Roles('super-admin')
  @ApiOperation({ summary: 'Permanently delete organization [super-admin]' })
  delete(@Param('id') id: string) {
    return this.service.deleteOrganization(id);
  }
}
