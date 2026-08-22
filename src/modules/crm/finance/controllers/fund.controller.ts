import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import {
  FundService,
  CapitalCommitmentService,
  CapitalCallService,
  CapitalAccountService,
  DistributionService,
  PortfolioHoldingService,
  HoldingValuationService,
  NavService,
  FundExpenseService,
  ManagementFeeService,
  ComplianceService,
  FxRateService,
  ScenarioService,
  LpReportingService,
} from '../services';
import {
  CreateFundDto,
  UpdateFundTermsDto,
  SetFundStatusDto,
  CreateCapitalCommitmentDto,
  CreateCapitalCallDto,
  RecordCallFundingDto,
  CureDefaultDto,
  RecordDistributionDto,
  CreatePortfolioHoldingDto,
  RecordExitDto,
  ProposeValuationDto,
  ReviewValuationDto,
  ApproveValuationDto,
  RecordFundExpenseDto,
  ChargeManagementFeeDto,
  AddKeyPersonDto,
  AddComplianceCalendarItemDto,
  MarkComplianceCompleteDto,
  RecordFxRateDto,
  RunScenarioDto,
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

  @Patch(':id/terms')
  @ApiOperation({
    summary:
      "Edit the fund's real LPA terms — partial update, any field omitted is left unchanged",
  })
  updateTerms(
    @Param('id') id: string,
    @Body() dto: UpdateFundTermsDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateTerms(t || u, id, dto);
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

  @Get(':commitmentId/equalisation')
  @ApiOperation({
    summary:
      'Preview the real equalisation calculation for a subsequent-close LP — read-only',
  })
  computeEqualisation(
    @Param('fundId') fundId: string,
    @Param('commitmentId') commitmentId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.computeEqualisation(t || u, fundId, commitmentId);
  }

  @Post(':commitmentId/equalisation/apply')
  @ApiOperation({
    summary:
      'Apply equalisation — posts real capital account entries, catch-up to this LP and interest to earlier-close LPs',
  })
  applyEqualisation(
    @Param('fundId') fundId: string,
    @Param('commitmentId') commitmentId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.applyEqualisation(t || u, fundId, commitmentId);
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

  @Post(':callId/allocations/:allocationId/default')
  @ApiOperation({
    summary:
      "Declare a formal default — sets the real cure deadline from the fund's own LPA cure period",
  })
  declareDefault(
    @Param('callId') callId: string,
    @Param('allocationId') allocationId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.declareDefault(t || u, callId, allocationId);
  }

  @Post(':callId/allocations/:allocationId/cure')
  @ApiOperation({
    summary:
      'Cure a default — funds the allocation and charges real default interest for the days overdue',
  })
  cureDefault(
    @Param('callId') callId: string,
    @Param('allocationId') allocationId: string,
    @Body() dto: CureDefaultDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.cureDefault(t || u, callId, allocationId, dto);
  }

  @Post(':callId/allocations/:allocationId/forfeit')
  @ApiOperation({
    summary:
      "Forfeit an uncured default — real forfeiture percentage of the LP's balance, reallocated pro-rata to non-defaulting LPs",
  })
  forfeitDefault(
    @Param('callId') callId: string,
    @Param('allocationId') allocationId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.forfeitDefault(t || u, callId, allocationId);
  }
}

@ApiTags('CRM — Finance — Fund Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/funds/:fundId/capital-accounts')
export class CapitalAccountController {
  constructor(private readonly service: CapitalAccountService) {}

  @Get()
  @ApiOperation({
    summary:
      'LP-by-LP capital account register — real balances, tied to the fund',
  })
  getAll(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAll(t || u, fundId);
  }

  @Get(':commitmentId/entries')
  @ApiOperation({ summary: "One LP's real capital account audit trail" })
  getEntries(
    @Param('commitmentId') commitmentId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getEntries(t || u, commitmentId);
  }
}

@ApiTags('CRM — Finance — Fund Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/funds/:fundId/distributions')
export class DistributionController {
  constructor(private readonly service: DistributionService) {}

  @Get()
  @ApiOperation({
    summary:
      'All distribution events for this fund, each with its frozen tier breakdown',
  })
  getAll(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAll(t || u, fundId);
  }

  @Get('waterfall')
  @ApiOperation({
    summary:
      'The real cumulative waterfall state — tier-by-tier progress across every distribution to date',
  })
  getWaterfallState(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getWaterfallState(t || u, fundId);
  }

  @Get('gp-carry-position')
  @ApiOperation({
    summary:
      'Real GP carry position — received, paid net of escrow, escrow held, and a genuine clawback check',
  })
  getGpCarryPosition(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getGpCarryPosition(t || u, fundId);
  }

  @Get('accrued-carry')
  @ApiOperation({
    summary:
      'Real accrued (unrealised) carry on current NAV — payable only if an actual distribution happens',
  })
  getAccruedCarryOnNav(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAccruedCarryOnNav(t || u, fundId);
  }

  @Post()
  @ApiOperation({
    summary:
      'Record a distribution — waterfalls it through the four real tiers against the real cumulative state',
  })
  recordDistribution(
    @Param('fundId') fundId: string,
    @Body() dto: RecordDistributionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordDistribution(t || u, fundId, dto);
  }
}

@ApiTags('CRM — Finance — Fund Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/funds/:fundId/holdings')
export class PortfolioHoldingController {
  constructor(private readonly service: PortfolioHoldingService) {}

  @Get()
  @ApiOperation({
    summary:
      'Portfolio holdings, each with its real latest approved fair value and MOIC',
  })
  getAll(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAll(t || u, fundId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a portfolio holding' })
  create(
    @Param('fundId') fundId: string,
    @Body() dto: CreatePortfolioHoldingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, fundId, dto);
  }

  @Post(':holdingId/exit')
  @ApiOperation({
    summary:
      "Record a real exit — proceeds become the holding's fair value; does not itself distribute cash to LPs",
  })
  recordExit(
    @Param('fundId') fundId: string,
    @Param('holdingId') holdingId: string,
    @Body() dto: RecordExitDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordExit(t || u, fundId, holdingId, dto);
  }
}

@ApiTags('CRM — Finance — Fund Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/funds/:fundId/valuations')
export class HoldingValuationController {
  constructor(private readonly service: HoldingValuationService) {}

  @Get(':period')
  @ApiOperation({
    summary:
      'The real valuation workflow status for every active holding in a given period',
  })
  getWorkflowForPeriod(
    @Param('fundId') fundId: string,
    @Param('period') period: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getWorkflowForPeriod(t || u, fundId, period);
  }

  @Post('holdings/:holdingId/periods/:period/propose')
  @ApiOperation({
    summary: 'GP proposes a fair value for a holding for a period',
  })
  proposeValuation(
    @Param('fundId') fundId: string,
    @Param('holdingId') holdingId: string,
    @Param('period') period: string,
    @Body() dto: ProposeValuationDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.proposeValuation(
      t || u,
      fundId,
      holdingId,
      period,
      dto,
    );
  }

  @Post(':valuationId/review')
  @ApiOperation({
    summary:
      "Lexora's real review — can accept or adjust the GP's proposed value, with a documented reason",
  })
  reviewValuation(
    @Param('valuationId') valuationId: string,
    @Body() dto: ReviewValuationDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.reviewValuation(t || u, valuationId, dto);
  }

  @Post(':valuationId/approve')
  @ApiOperation({
    summary:
      'Investment committee approval — locks in the value NAV reads from',
  })
  approveValuation(
    @Param('valuationId') valuationId: string,
    @Body() dto: ApproveValuationDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.approveValuation(t || u, valuationId, dto);
  }
}

@ApiTags('CRM — Finance — Fund Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/funds/:fundId/nav')
export class NavController {
  constructor(private readonly service: NavService) {}

  @Get()
  @ApiOperation({
    summary:
      'Real NAV — portfolio at latest approved fair value, plus real fund cash, less fee/expense payables',
  })
  getNav(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getNav(t || u, fundId);
  }

  @Get('performance')
  @ApiOperation({
    summary:
      'Real DPI/RVPI/TVPI and a genuine XIRR-based net IRR from actual dated cash flows',
  })
  getPerformanceMetrics(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getPerformanceMetrics(t || u, fundId);
  }
}

@ApiTags('CRM — Finance — Fund Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/funds/:fundId/expenses')
export class FundExpenseController {
  constructor(private readonly service: FundExpenseService) {}

  @Get()
  @ApiOperation({ summary: 'All real fund expenses' })
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
      'Record a fund expense — pro-rata allocated to LPs; organisational costs respect the real cap, GP bears any excess',
  })
  recordExpense(
    @Param('fundId') fundId: string,
    @Body() dto: RecordFundExpenseDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordExpense(t || u, fundId, dto);
  }
}

@ApiTags('CRM — Finance — Fund Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/funds/:fundId/management-fee')
export class ManagementFeeController {
  constructor(private readonly service: ManagementFeeService) {}

  @Get()
  @ApiOperation({ summary: 'All real management fee charges for this fund' })
  getAll(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAll(t || u, fundId);
  }

  @Get('preview')
  @ApiOperation({
    summary:
      'Preview what a charge would look like right now — real basis switch and side-letter rates, nothing persisted',
  })
  previewFee(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.previewFee(t || u, fundId);
  }

  @Post(':period/charge')
  @ApiOperation({
    summary:
      "Charge management fee for a period — accrues against each LP's capital account, one charge per period",
  })
  chargeFee(
    @Param('fundId') fundId: string,
    @Param('period') period: string,
    @Body() dto: ChargeManagementFeeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.chargeFee(t || u, fundId, period, dto);
  }

  @Post('charges/:chargeId/pay')
  @ApiOperation({
    summary:
      "Mark a fee charge as paid — real cash leaving the fund's bank account to the manager",
  })
  payFee(
    @Param('chargeId') chargeId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.payFee(t || u, chargeId);
  }
}

@ApiTags('CRM — Finance — Fund Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/funds/:fundId/compliance')
export class ComplianceController {
  constructor(private readonly service: ComplianceService) {}

  @Get('key-persons')
  @ApiOperation({
    summary: 'Real key persons and their real active/departed status',
  })
  getKeyPersons(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getKeyPersons(t || u, fundId);
  }

  @Post('key-persons')
  @ApiOperation({ summary: 'Add a key person under LPA cl. 16' })
  addKeyPerson(
    @Param('fundId') fundId: string,
    @Body() dto: AddKeyPersonDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addKeyPerson(t || u, fundId, dto);
  }

  @Post('key-persons/:keyPersonId/confirm')
  @ApiOperation({ summary: 'Confirm a key person is still active' })
  confirmActive(
    @Param('keyPersonId') keyPersonId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.confirmActive(t || u, keyPersonId);
  }

  @Post('key-persons/:keyPersonId/depart')
  @ApiOperation({
    summary:
      'Mark a key person departed — real, automatic consequence: suspends the investment period',
  })
  markDeparted(
    @Param('fundId') fundId: string,
    @Param('keyPersonId') keyPersonId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.markDeparted(t || u, fundId, keyPersonId);
  }

  @Get('calendar')
  @ApiOperation({
    summary:
      'Real compliance filing calendar, with status computed live from real dates',
  })
  getCalendar(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getCalendar(t || u, fundId);
  }

  @Post('calendar')
  @ApiOperation({ summary: 'Add a real compliance filing requirement' })
  addCalendarItem(
    @Param('fundId') fundId: string,
    @Body() dto: AddComplianceCalendarItemDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addCalendarItem(t || u, fundId, dto);
  }

  @Post('calendar/:calendarItemId/complete')
  @ApiOperation({ summary: 'Mark a compliance filing complete for a period' })
  markComplete(
    @Param('calendarItemId') calendarItemId: string,
    @Body() dto: MarkComplianceCompleteDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.markComplete(t || u, calendarItemId, dto);
  }

  @Get('restrictions')
  @ApiOperation({
    summary:
      'Real-time investment restriction monitoring against real portfolio holdings',
  })
  getRestrictionMonitoring(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getRestrictionMonitoring(t || u, fundId);
  }
}

@ApiTags('CRM — Finance — Fund Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/funds/:fundId/fx-rates')
export class FxRateController {
  constructor(private readonly service: FxRateService) {}

  @Get()
  @ApiOperation({ summary: 'Real, tenant-entered FX rate snapshots' })
  getAll(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAll(t || u, fundId);
  }

  @Post()
  @ApiOperation({ summary: 'Record a real FX rate snapshot' })
  recordRate(
    @Param('fundId') fundId: string,
    @Body() dto: RecordFxRateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordRate(t || u, fundId, dto);
  }

  @Get('exposure')
  @ApiOperation({
    summary:
      'Real FX exposure and gain/loss, isolating currency movement from operating performance',
  })
  getFxExposure(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getFxExposure(t || u, fundId);
  }
}

@ApiTags('CRM — Finance — Fund Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/funds/:fundId/scenarios')
export class ScenarioController {
  constructor(private readonly service: ScenarioService) {}

  @Post('run')
  @ApiOperation({
    summary:
      'Real, read-only what-if calculator — runs hypothetical exit values through the real waterfall; nothing persisted',
  })
  runScenario(
    @Param('fundId') fundId: string,
    @Body() dto: RunScenarioDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.runScenario(t || u, fundId, dto);
  }
}

@ApiTags('CRM — Finance — Fund Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/funds/:fundId/lp-reporting')
export class LpReportingController {
  constructor(private readonly service: LpReportingService) {}

  @Get('commitments/:commitmentId/statement')
  @ApiQuery({ name: 'periodStart', required: true })
  @ApiQuery({ name: 'periodEnd', required: true })
  @ApiOperation({
    summary:
      'Real quarterly LP statement — real opening/closing capital account balance and real per-LP performance',
  })
  getQuarterlyStatement(
    @Param('fundId') fundId: string,
    @Param('commitmentId') commitmentId: string,
    @Query('periodStart') periodStart: string,
    @Query('periodEnd') periodEnd: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getQuarterlyStatement(
      t || u,
      fundId,
      commitmentId,
      periodStart,
      periodEnd,
    );
  }

  @Get('calls/:callId/notice/:commitmentId')
  @ApiOperation({ summary: 'Real capital call notice for one LP' })
  getCallNotice(
    @Param('callId') callId: string,
    @Param('commitmentId') commitmentId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getCallNotice(t || u, callId, commitmentId);
  }

  @Get('distributions/:distributionId/notice/:commitmentId')
  @ApiOperation({ summary: 'Real distribution notice for one LP' })
  getDistributionNotice(
    @Param('distributionId') distributionId: string,
    @Param('commitmentId') commitmentId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getDistributionNotice(
      t || u,
      distributionId,
      commitmentId,
    );
  }

  @Get('commitments/:commitmentId/fee-expense-disclosure/:period')
  @ApiOperation({
    summary:
      "Real fee & expense disclosure — this LP's real share of a period's real fees and expenses",
  })
  getFeeExpenseDisclosure(
    @Param('fundId') fundId: string,
    @Param('commitmentId') commitmentId: string,
    @Param('period') period: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getFeeExpenseDisclosure(
      t || u,
      fundId,
      commitmentId,
      period,
    );
  }
}
