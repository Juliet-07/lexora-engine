import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { TrustLedgerService, TrustMovementService } from '../services';
import {
  CreateTrustLedgerDto,
  RecordTrustDepositDto,
  RequestTrustDrawdownDto,
  AuthoriseTrustDrawdownDto,
  RejectTrustDrawdownDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Finance — Trust Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/trust-ledgers')
export class TrustLedgerController {
  constructor(private readonly service: TrustLedgerService) {}

  @Get()
  @ApiOperation({
    summary: 'All trust ledgers, with real live-computed balances',
  })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One trust ledger' })
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
      'Create a client trust ledger, linked to a real Trust-type bank account',
  })
  create(
    @Body() dto: CreateTrustLedgerDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get('integrity/:bankAccountId')
  @ApiOperation({
    summary:
      "The real no-commingling check — sum of every client ledger vs the trust bank account's own real balance",
  })
  getIntegrityCheck(
    @Param('bankAccountId') bankAccountId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getIntegrityCheck(t || u, bankAccountId);
  }

  @Post(':id/reconcile')
  @ApiOperation({ summary: 'Monthly sign-off for a client ledger' })
  markReconciled(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.markReconciled(t || u, id);
  }
}

@ApiTags('CRM — Finance — Trust Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/trust-movements')
export class TrustMovementController {
  constructor(private readonly service: TrustMovementService) {}

  @Get()
  @ApiQuery({ name: 'ledgerId', required: false })
  @ApiOperation({ summary: 'Trust movements, optionally scoped to one ledger' })
  getAll(
    @Query('ledgerId') ledgerId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAll(t || u, ledgerId);
  }

  @Post('deposit')
  @ApiOperation({
    summary: 'Record a deposit — posts immediately, no authorisation needed',
  })
  recordDeposit(
    @Body() dto: RecordTrustDepositDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordDeposit(t || u, dto);
  }

  @Post('drawdown')
  @ApiOperation({
    summary:
      "Request a drawdown — awaits a different person's authorisation before it takes effect",
  })
  requestDrawdown(
    @Body() dto: RequestTrustDrawdownDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.requestDrawdown(t || u, dto);
  }

  @Post(':id/authorise')
  @ApiOperation({
    summary: 'Authorise a drawdown — real dual control, re-checks the balance',
  })
  authoriseDrawdown(
    @Param('id') id: string,
    @Body() dto: AuthoriseTrustDrawdownDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.authoriseDrawdown(t || u, id, dto.authorisedBy);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a drawdown request' })
  rejectDrawdown(
    @Param('id') id: string,
    @Body() dto: RejectTrustDrawdownDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.rejectDrawdown(t || u, id, dto.reason);
  }
}
