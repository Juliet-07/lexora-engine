import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import {
  BankAccountService,
  BankTransactionService,
  BankRuleService,
  TransferService,
  ReconciliationService,
  CashForecastService,
} from '../services';
import {
  CreateBankAccountDto,
  CreateBankTransactionDto,
  MatchTransactionDto,
  CreateBankRuleDto,
  CreateTransferDto,
  SetStatementBalanceDto,
  SignOffReconciliationDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Finance — Banking')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/bank-accounts')
export class BankAccountController {
  constructor(private readonly service: BankAccountService) {}

  @Post()
  @ApiOperation({ summary: 'Add a bank account' })
  create(
    @Body() dto: CreateBankAccountDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'All accounts — balance computed live from real transactions and transfers',
  })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }
}

@ApiTags('CRM — Finance — Banking')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/bank-transactions')
export class BankTransactionController {
  constructor(private readonly service: BankTransactionService) {}

  @Post()
  @ApiOperation({
    summary: 'Record a transaction — bank rules applied automatically',
  })
  create(
    @Body() dto: CreateBankTransactionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiQuery({ name: 'accountId', required: false })
  @ApiOperation({ summary: 'The bank feed, optionally filtered by account' })
  getAll(
    @Query('accountId') accountId: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAll(t || u, accountId);
  }

  @Post(':id/match')
  @ApiOperation({
    summary: 'Match a transaction to a real invoice, bill, or payroll run',
  })
  match(
    @Param('id') id: string,
    @Body() dto: MatchTransactionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.match(t || u, id, dto);
  }
}

@ApiTags('CRM — Finance — Banking')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/bank-rules')
export class BankRuleController {
  constructor(private readonly service: BankRuleService) {}

  @Post()
  @ApiOperation({ summary: 'Create a bank rule' })
  create(
    @Body() dto: CreateBankRuleDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'All bank rules' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }
}

@ApiTags('CRM — Finance — Banking')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/transfers')
export class TransferController {
  constructor(private readonly service: TransferService) {}

  @Post()
  @ApiOperation({ summary: 'Record an inter-account transfer' })
  create(
    @Body() dto: CreateTransferDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'All transfers' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }
}

@ApiTags('CRM — Finance — Banking')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/reconciliation')
export class ReconciliationController {
  constructor(private readonly service: ReconciliationService) {}

  @Get(':accountId/:period')
  @ApiOperation({
    summary:
      'The reconciliation view for one account and period, e.g. period=2026-07',
  })
  getView(
    @Param('accountId') accountId: string,
    @Param('period') period: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getView(t || u, accountId, period);
  }

  @Post(':accountId/:period/statement-balance')
  @ApiOperation({
    summary: 'Set the bank statement balance to reconcile against',
  })
  setStatementBalance(
    @Param('accountId') accountId: string,
    @Param('period') period: string,
    @Body() dto: SetStatementBalanceDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setStatementBalance(t || u, accountId, period, dto);
  }

  @Post(':accountId/:period/sign-off')
  @ApiOperation({
    summary:
      'Sign off — requires zero variance and a different person from the preparer',
  })
  signOff(
    @Param('accountId') accountId: string,
    @Param('period') period: string,
    @Body() dto: SignOffReconciliationDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.signOff(t || u, accountId, period, dto);
  }
}

@ApiTags('CRM — Finance — Banking')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/cash-forecast')
export class CashForecastController {
  constructor(private readonly service: CashForecastService) {}

  @Get()
  @ApiOperation({
    summary:
      '30/60/90-day forecast, computed live from real AR, AP, payroll and account balances',
  })
  getForecast(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getForecast(t || u);
  }
}
