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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import {
  CreateClientDto,
  UpdateClientDto,
  UpdateClientStatusDto,
  UpdateRiskLevelDto,
  ClientFilterDto,
} from './dto/client.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, CurrentUser } from '../../common/decorators/index';
import { PaginationDto } from '../../common/pagination.dto';

@ApiTags('Clients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly service: ClientsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new client' })
  create(
    @Body() dto: CreateClientDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.createClient(dto, orgId);
  }

  @Get()
  @ApiOperation({ summary: 'List all clients with filters' })
  findAll(
    @CurrentUser('organizationId') orgId: string,
    @Query() pagination: PaginationDto,
    @Query() filters: ClientFilterDto,
  ) {
    return this.service.findAll(orgId, pagination, filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get client statistics for the organization' })
  getStats(@CurrentUser('organizationId') orgId: string) {
    return this.service.getClientStats(orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get client by ID' })
  findOne(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.findById(id, orgId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update client details' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.updateClient(id, dto, orgId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update client status' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateClientStatusDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.updateStatus(id, dto, orgId);
  }

  @Patch(':id/risk-level')
  @Roles('admin', 'compliance-officer', 'manager')
  @ApiOperation({ summary: 'Update client risk level [compliance]' })
  updateRiskLevel(
    @Param('id') id: string,
    @Body() dto: UpdateRiskLevelDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.updateRiskLevel(id, dto, orgId);
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Delete client [admin]' })
  delete(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.deleteClient(id, orgId);
  }
}
