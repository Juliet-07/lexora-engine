import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import {
  WhtService,
  VatService,
  PayrollTaxService,
  CitService,
  EbmService,
  TaxObligationService,
} from '../services';
import { CreateTaxObligationDto } from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Finance — Tax')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/tax-obligations')
export class TaxObligationController {
  constructor(private readonly service: TaxObligationService) {}

  @Post()
  @ApiOperation({ summary: 'Add an obligation to the tax calendar' })
  create(
    @Body() dto: CreateTaxObligationDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'The tax calendar' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Post(':id/file')
  @ApiOperation({ summary: 'Mark filed' })
  file(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.file(t || u, id);
  }
}

@ApiTags('CRM — Finance — Tax')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/vat')
export class VatController {
  constructor(private readonly service: VatService) {}

  @Get()
  @ApiQuery({
    name: 'period',
    required: false,
    description: 'YYYY-MM, defaults to current month',
  })
  @ApiOperation({ summary: 'Real output/input VAT return for a period' })
  getReturn(
    @Query('period') period: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getReturn(t || u, period);
  }
}

@ApiTags('CRM — Finance — Tax')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/payroll-tax')
export class PayrollTaxController {
  constructor(private readonly service: PayrollTaxService) {}

  @Get()
  @ApiOperation({
    summary: 'Real PAYE/RSSB remittances, sourced from actual HR payroll runs',
  })
  getRemittances(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getRemittances(t || u);
  }
}

@ApiTags('CRM — Finance — Tax')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/cit')
export class CitController {
  constructor(private readonly service: CitService) {}

  @Get()
  @ApiOperation({
    summary: 'Provisional CIT at 28%, computed from real revenue/expenses',
  })
  getProvision(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getProvision(t || u);
  }
}

@ApiTags('CRM — Finance — Tax')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/wht')
export class WhtController {
  constructor(private readonly service: WhtService) {}

  @Get()
  @ApiOperation({
    summary:
      'The WHT register — single source of truth, populated automatically',
  })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }
}

@ApiTags('CRM — Finance — Tax')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/ebm')
export class EbmController {
  constructor(private readonly service: EbmService) {}

  @Get()
  @ApiOperation({ summary: 'EBM sync status for real invoices' })
  getStatus(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getStatus(t || u);
  }

  @Post(':invoiceId/resync')
  @ApiOperation({ summary: 'Re-sync a document to EBM' })
  resync(
    @Param('invoiceId') invoiceId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.resync(t || u, invoiceId);
  }
}
