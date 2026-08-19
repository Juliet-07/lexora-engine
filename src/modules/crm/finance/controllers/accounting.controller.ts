import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import {
  LedgerAccountService,
  JournalService,
  RecodeService,
  GeneralLedgerService,
  TrialBalanceService,
  PeriodCloseService,
  AssetService,
  MaintenanceLogService,
  AccountingOverviewService,
} from '../services';
import {
  CreateAccountDto,
  CreateJournalDto,
  PostJournalDto,
  RecodeTransactionDto,
  CompletePeriodStepDto,
  LockPeriodDto,
  OverridePeriodLockDto,
  CreateAssetDto,
  DisposeAssetDto,
  CreateMaintenanceLogDto,
} from '../dtos';
import { GlSource } from '../schemas';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Finance — Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/accounting-overview')
export class AccountingOverviewController {
  constructor(private readonly service: AccountingOverviewService) {}

  @Get()
  @ApiOperation({
    summary: 'Real cross-module summary — Sales, Billing, Purchases',
  })
  getOverview(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getOverview(t || u);
  }
}

@ApiTags('CRM — Finance — Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/accounts')
export class LedgerAccountController {
  constructor(private readonly service: LedgerAccountService) {}

  @Post()
  @ApiOperation({ summary: 'Add an account' })
  create(
    @Body() dto: CreateAccountDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'The chart of accounts — balance computed live from real GL postings',
  })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Post('seed-defaults')
  @ApiOperation({ summary: 'Seed a real starting chart of accounts' })
  seedDefaults(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.seedDefaults(t || u);
  }
}

@ApiTags('CRM — Finance — Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/journals')
export class JournalController {
  constructor(private readonly service: JournalService) {}

  @Post()
  @ApiOperation({ summary: 'Raise a manual multi-line journal' })
  create(
    @Body() dto: CreateJournalDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'All journals' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Post(':id/post')
  @ApiOperation({
    summary: 'Post — writes the real lines to the general ledger',
  })
  post(
    @Param('id') id: string,
    @Body() dto: PostJournalDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.post(t || u, id, dto.postedBy);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject/reverse' })
  reject(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.reject(t || u, id);
  }
}

@ApiTags('CRM — Finance — Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/general-ledger')
export class GeneralLedgerController {
  constructor(private readonly service: GeneralLedgerService) {}

  @Get()
  @ApiQuery({ name: 'source', required: false, enum: GlSource })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiOperation({
    summary: 'Every posted GL line, with a real running balance per account',
  })
  getEntries(
    @Query('source') source: GlSource | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('search') search: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getEntries(t || u, { source, from, to, search });
  }
}

@ApiTags('CRM — Finance — Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/trial-balance')
export class TrialBalanceController {
  constructor(private readonly service: TrialBalanceService) {}

  @Get()
  @ApiQuery({ name: 'asOf', required: false })
  @ApiOperation({
    summary: 'Real trial balance as of a date, from real GL postings',
  })
  getTrialBalance(
    @Query('asOf') asOf: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getTrialBalance(t || u, asOf);
  }
}

@ApiTags('CRM — Finance — Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/period-close')
export class PeriodCloseController {
  constructor(private readonly service: PeriodCloseService) {}

  @Get(':period')
  @ApiOperation({
    summary: 'The close checklist for a period, e.g. period=2026-08',
  })
  getPeriod(
    @Param('period') period: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getPeriod(t || u, period);
  }

  @Post(':period/steps/:key')
  @ApiOperation({ summary: 'Mark a close step complete' })
  completeStep(
    @Param('period') period: string,
    @Param('key') key: string,
    @Body() dto: CompletePeriodStepDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.completeStep(t || u, period, key, dto.completedBy);
  }

  @Post(':period/lock')
  @ApiOperation({
    summary:
      'Lock the period — irreversible, requires all other steps complete',
  })
  lock(
    @Param('period') period: string,
    @Body() dto: LockPeriodDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.lock(t || u, period, dto.lockedBy);
  }

  @Post(':period/override')
  @ApiOperation({ summary: 'Log a documented override on a locked period' })
  override(
    @Param('period') period: string,
    @Body() dto: OverridePeriodLockDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.override(t || u, period, dto.by, dto.reason);
  }
}

@ApiTags('CRM — Finance — Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/recode')
export class RecodeController {
  constructor(private readonly service: RecodeService) {}

  @Get()
  @ApiOperation({
    summary: 'Real bank transactions with an unconfirmed suggested coding',
  })
  getCandidates(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getCandidates(t || u);
  }

  @Post(':transactionId')
  @ApiOperation({
    summary: 'Confirm or override the ledger account for a transaction',
  })
  recode(
    @Param('transactionId') transactionId: string,
    @Body() dto: RecodeTransactionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recode(t || u, transactionId, dto);
  }
}

@ApiTags('CRM — Finance — Asset Register')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/assets')
export class AssetController {
  constructor(private readonly service: AssetService) {}

  @Post()
  @ApiOperation({ summary: 'Register an asset — a real tag is generated' })
  create(
    @Body() dto: CreateAssetDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'All assets — NBV computed live via real straight-line depreciation',
  })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Post(':id/dispose')
  @ApiOperation({
    summary: 'Dispose — gain/loss computed against real NBV at disposal',
  })
  dispose(
    @Param('id') id: string,
    @Body() dto: DisposeAssetDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.dispose(t || u, id, dto.disposalValue);
  }

  @Post('generate-depreciation/:period')
  @ApiOperation({
    summary:
      'Generate the real, unposted depreciation journal for a period, e.g. period=2026-08',
  })
  generateDepreciation(
    @Param('period') period: string,
    @Body() body: { preparedBy: string },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.generateDepreciationJournal(
      t || u,
      period,
      body.preparedBy,
    );
  }
}

@ApiTags('CRM — Finance — Asset Register')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/asset-maintenance')
export class MaintenanceLogController {
  constructor(private readonly service: MaintenanceLogService) {}

  @Post()
  @ApiOperation({
    summary: 'Log a maintenance/service event against a real asset',
  })
  create(
    @Body() dto: CreateMaintenanceLogDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'The maintenance log' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }
}
