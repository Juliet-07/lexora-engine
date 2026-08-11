import { Controller, Get, Put, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClientCommercialService } from '../services';
import { UpsertClientCommercialDto } from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Client Management (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('crm/client-commercials')
export class ClientCommercialController {
  constructor(private readonly service: ClientCommercialService) {}

  @Get()
  @ApiOperation({
    summary: 'All commercial profiles for this tenant, keyed by client id',
  })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAllAsMap(t || u);
  }

  @Get(':clientUserId')
  @ApiOperation({ summary: "One client's commercial profile, if assigned" })
  getOne(
    @Param('clientUserId') clientUserId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getOne(t || u, clientUserId);
  }

  @Put(':clientUserId')
  @ApiOperation({
    summary: "Set (create or update) a client's commercial profile",
  })
  upsert(
    @Param('clientUserId') clientUserId: string,
    @Body() dto: UpsertClientCommercialDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.upsert(t || u, clientUserId, dto);
  }

  @Delete(':clientUserId')
  @ApiOperation({ summary: "Clear a client's commercial profile" })
  clear(
    @Param('clientUserId') clientUserId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.clear(t || u, clientUserId);
  }
}
