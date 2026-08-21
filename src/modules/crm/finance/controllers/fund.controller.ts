import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  FundService,
  CapitalCommitmentService,
  CapitalCallService,
} from '../services';
import {
  CreateFundDto,
  SetFundStatusDto,
  CreateCapitalCommitmentDto,
  CreateCapitalCallDto,
  RecordCallFundingDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Finance — Fund Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/funds')
export class FundController {
  constructor(private readonly service: FundService) {}

  @Get()
  @ApiOperation({
    summary: 'All funds, with real committed/called/unfunded totals',
  })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One fund' })
  getById(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a fund — setup only. Distributions, waterfall, NAV and carry are not modelled yet pending confirmed methodology',
  })
  create(
    @Body() dto: CreateFundDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Update fund lifecycle status' })
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetFundStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setStatus(t || u, id, dto.status);
  }
}

@ApiTags('CRM — Finance — Fund Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/funds/:fundId/commitments')
export class CapitalCommitmentController {
  constructor(private readonly service: CapitalCommitmentService) {}

  @Get()
  @ApiOperation({ summary: 'All LP capital commitments for this fund' })
  getAll(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAll(t || u, fundId);
  }

  @Post()
  @ApiOperation({ summary: 'Add an LP capital commitment' })
  create(
    @Param('fundId') fundId: string,
    @Body() dto: CreateCapitalCommitmentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, fundId, dto);
  }
}

@ApiTags('CRM — Finance — Fund Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/funds/:fundId/capital-calls')
export class CapitalCallController {
  constructor(private readonly service: CapitalCallService) {}

  @Get()
  @ApiOperation({ summary: 'All capital calls for this fund' })
  getAll(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAll(t || u, fundId);
  }

  @Post()
  @ApiOperation({
    summary:
      'Issue a capital call — pro-rata allocated across every current LP commitment, frozen at issuance',
  })
  create(
    @Param('fundId') fundId: string,
    @Body() dto: CreateCapitalCallDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, fundId, dto);
  }

  @Post(':callId/allocations/:allocationId/fund')
  @ApiOperation({ summary: 'Record an LP actually funding their allocation' })
  recordFunding(
    @Param('callId') callId: string,
    @Param('allocationId') allocationId: string,
    @Body() dto: RecordCallFundingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordFunding(t || u, callId, allocationId, dto);
  }
}
