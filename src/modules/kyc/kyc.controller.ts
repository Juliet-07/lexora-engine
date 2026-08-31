import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { UserTypes, Roles, CurrentUser } from '../../common/decorators/index';
import {
  UserType,
  TenantRole,
  PlatformModuleKey,
} from '../../common/interfaces/user-role.enum';
import { PaginationDto } from '../../common/pagination.dto';

import { RiskEngineService } from './services/risk-engine.service';
import { TransactionService } from './services/transaction.service';
import { StrService } from './services/str.service';
import { ComplianceAlertsService } from './services/compliance-alerts.service';
import { WatchlistService } from './services/watchlist.service';

import {
  CreateRiskRuleDto,
  UpdateRiskRuleDto,
  CreateRiskScenarioDto,
  OverrideRiskLevelDto,
  RiskEngineFilterDto,
  LogTransactionDto,
  TransactionFilterDto,
  ReviewTransactionDto,
  CreateManualAlertDto,
  UpdateAlertDto,
  AlertFilterDto,
  CreateStrDto,
  UpdateStrDto,
  SubmitStrDto,
  AddWatchlistEntryDto,
  AdHocScreeningDto,
  WatchlistFilterDto,
} from './dto/kyc.dto';
import { StrStatus } from './schemas/str.schema';
import { ReportsService } from './services/reports.service';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

const COMPLIANCE = [
  TenantRole.TENANT_OWNER,
  TenantRole.TENANT_ADMIN,
  TenantRole.TENANT_COMPLIANCE,
];

@ApiTags('KYC / AML')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.KYC)
@Controller('kyc')
export class KycController {
  constructor(
    private readonly riskEngine: RiskEngineService,
    private readonly transactions: TransactionService,
    private readonly str: StrService,
    private readonly alerts: ComplianceAlertsService,
    private readonly watchlist: WatchlistService,
    private readonly reports: ReportsService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // RISK ENGINE
  // ═══════════════════════════════════════════════════════════

  @Get('risk/dashboard')
  @ApiOperation({
    summary:
      'Risk dashboard — breakdown, high-risk clients, trend, region, top factors',
  })
  getRiskDashboard(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskEngine.getRiskDashboard(t || u);
  }

  @Get('risk/clients')
  @ApiOperation({ summary: 'Paginated client risk list with filters' })
  getClientRiskList(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query() pagination: PaginationDto,
    @Query() filters: RiskEngineFilterDto,
  ) {
    return this.riskEngine.getClientRiskList(t || u, pagination, filters);
  }

  @Get('risk/rules')
  @ApiOperation({
    summary: 'Get all risk rules — global (SuperAdmin) + tenant own',
  })
  getRules(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.riskEngine.getRules(t || u);
  }

  @Post('risk/rules')
  @Roles(...COMPLIANCE)
  @ApiOperation({ summary: 'Create a tenant risk rule [compliance]' })
  createRule(
    @Body() dto: CreateRiskRuleDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskEngine.createRule(t || u, u, dto);
  }

  @Patch('risk/rules/:ruleId')
  @Roles(...COMPLIANCE)
  @ApiOperation({ summary: 'Update a tenant risk rule [compliance]' })
  updateRule(
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateRiskRuleDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskEngine.updateRule(ruleId, t || u, dto);
  }

  @Delete('risk/rules/:ruleId')
  @Roles(...COMPLIANCE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a tenant risk rule [compliance]' })
  deleteRule(
    @Param('ruleId') ruleId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskEngine.deleteRule(ruleId, t || u);
  }

  @Get('risk/scenarios')
  @ApiOperation({ summary: 'Get all risk scenarios for this tenant' })
  getScenarios(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskEngine.getScenarios(t || u);
  }

  @Post('risk/scenarios')
  @Roles(...COMPLIANCE)
  @ApiOperation({ summary: 'Create a risk scenario [compliance]' })
  createScenario(
    @Body() dto: CreateRiskScenarioDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskEngine.createScenario(t || u, u, dto);
  }

  @Patch('risk/scenarios/:scenarioId')
  @Roles(...COMPLIANCE)
  @ApiOperation({ summary: 'Update a risk scenario [compliance]' })
  updateScenario(
    @Param('scenarioId') scenarioId: string,
    @Body() dto: Partial<CreateRiskScenarioDto>,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskEngine.updateScenario(scenarioId, t || u, dto);
  }

  @Delete('risk/scenarios/:scenarioId')
  @Roles(...COMPLIANCE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a risk scenario [compliance]' })
  deleteScenario(
    @Param('scenarioId') scenarioId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskEngine.deleteScenario(scenarioId, t || u);
  }

  @Patch('risk/clients/:clientId/override')
  @Roles(...COMPLIANCE)
  @ApiOperation({ summary: 'Override client risk level [compliance]' })
  overrideRiskLevel(
    @Param('clientId') clientId: string,
    @Body() dto: OverrideRiskLevelDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskEngine.overrideRiskLevel(clientId, t || u, u, dto);
  }

  @Get('risk/clients/:clientId/override')
  @ApiOperation({ summary: 'Get risk override record for a client' })
  getRiskOverride(
    @Param('clientId') clientId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.riskEngine.getRiskOverride(clientId, t || u);
  }

  // ═══════════════════════════════════════════════════════════
  // TRANSACTION MONITORING
  // ═══════════════════════════════════════════════════════════

  @Get('transactions/dashboard')
  @ApiOperation({
    summary: 'Transaction monitoring dashboard stats + recent flagged',
  })
  getTxDashboard(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.transactions.getDashboard(t || u);
  }

  @Post('transactions')
  @Roles(...COMPLIANCE, TenantRole.TENANT_MANAGER)
  @ApiOperation({
    summary: 'Log a transaction',
    description:
      'Manually log a transaction. Auto-flag engine runs immediately against all active rules.',
  })
  logTransaction(
    @Body() dto: LogTransactionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.transactions.logTransaction(t || u, u, dto);
  }

  @Get('transactions')
  @ApiOperation({
    summary:
      'List transactions with filters (status, type, client, date range)',
  })
  getTransactions(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query() pagination: PaginationDto,
    @Query() filters: TransactionFilterDto,
  ) {
    return this.transactions.getTransactions(t || u, pagination, filters);
  }

  @Get('transactions/wire-transfers')
  @ApiOperation({ summary: 'Wire and cross-border transfers only' })
  getWireTransfers(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.transactions.getWireTransfers(t || u, pagination);
  }

  @Get('transactions/:txId')
  @ApiOperation({ summary: 'Get a single transaction by ID' })
  getTransaction(
    @Param('txId') txId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.transactions.getTransactionById(txId, t || u);
  }

  @Patch('transactions/:txId/review')
  @Roles(...COMPLIANCE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Review a flagged transaction — clear or keep flagged [compliance]',
  })
  reviewTransaction(
    @Param('txId') txId: string,
    @Body() dto: ReviewTransactionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.transactions.reviewTransaction(txId, t || u, u, dto);
  }

  @Get('transactions/client/:clientId/profile')
  @ApiOperation({
    summary: 'Behavioral profile for a client — patterns, volumes, frequency',
  })
  getBehavioralProfile(
    @Param('clientId') clientId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.transactions.getBehavioralProfile(clientId, t || u);
  }

  // ═══════════════════════════════════════════════════════════
  // COMPLIANCE ALERTS
  // ═══════════════════════════════════════════════════════════

  @Get('alerts/stats')
  @ApiOperation({ summary: 'Alert stats — counts by status, severity, type' })
  getAlertStats(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.alerts.getAlertStats(t || u);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'List compliance alerts with filters' })
  getAlerts(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query() pagination: PaginationDto,
    @Query() filters: AlertFilterDto,
  ) {
    return this.alerts.getAlerts(t || u, pagination, filters);
  }

  @Get('alerts/:alertId')
  @ApiOperation({ summary: 'Get a single alert' })
  getAlert(
    @Param('alertId') alertId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.alerts.getAlertById(alertId, t || u);
  }

  @Post('alerts')
  @Roles(...COMPLIANCE)
  @ApiOperation({ summary: 'Create a manual compliance alert [compliance]' })
  createAlert(
    @Body() dto: CreateManualAlertDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.alerts.createManualAlert(t || u, u, dto);
  }

  @Patch('alerts/:alertId')
  @Roles(...COMPLIANCE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Review / dismiss / escalate an alert [compliance]',
  })
  updateAlert(
    @Param('alertId') alertId: string,
    @Body() dto: UpdateAlertDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.alerts.updateAlert(alertId, t || u, u, dto);
  }

  @Post('alerts/bulk-dismiss')
  @Roles(...COMPLIANCE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk dismiss multiple open alerts [compliance]' })
  bulkDismiss(
    @Body() body: { alertIds: string[]; note?: string },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.alerts.bulkDismiss(body.alertIds, t || u, u, body.note);
  }

  @Get('alerts/client/:clientId')
  @ApiOperation({ summary: 'All alerts for a specific client' })
  getClientAlerts(
    @Param('clientId') clientId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.alerts.getClientAlerts(clientId, t || u);
  }

  // ═══════════════════════════════════════════════════════════
  // STR / SAR
  // ═══════════════════════════════════════════════════════════

  @Get('transactions/:txId/str-draft')
  @ApiOperation({
    summary:
      "Pre-fill a new STR from a flagged transaction — real transaction details plus the client's real behavioral profile",
  })
  getStrDraftFromTransaction(
    @Param('txId') txId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.str.getStrDraftFromTransaction(txId, t || u);
  }

  @Get('str/stats')
  @ApiOperation({
    summary: 'STR stats — draft, pending, submitted, acknowledged, total',
  })
  getStrStats(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.str.getStats(t || u);
  }

  @Get('str')
  @ApiOperation({ summary: 'List STR reports' })
  @ApiQuery({ name: 'status', enum: StrStatus, required: false })
  getStrs(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query() pagination: PaginationDto,
    @Query('status') status?: StrStatus,
  ) {
    return this.str.getStrs(t || u, pagination, status);
  }

  @Get('str/:strId')
  @ApiOperation({ summary: 'Get a single STR by ID' })
  getStr(
    @Param('strId') strId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.str.getStrById(strId, t || u);
  }

  @Post('str')
  @Roles(...COMPLIANCE)
  @ApiOperation({
    summary: 'Create a new STR [compliance]',
    description:
      'Set saveAsDraft=true to save as draft, false to move to pending review.',
  })
  createStr(
    @Body() dto: CreateStrDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.str.createStr(t || u, u, dto);
  }

  @Patch('str/:strId')
  @Roles(...COMPLIANCE)
  @ApiOperation({ summary: 'Update a draft STR [compliance]' })
  updateStr(
    @Param('strId') strId: string,
    @Body() dto: UpdateStrDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.str.updateStr(strId, t || u, dto);
  }

  @Post('str/:strId/submit')
  @Roles(...COMPLIANCE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit STR to Rwanda FIC [compliance]',
    description:
      'Marks STR as submitted and returns goAML-compatible XML. ' +
      'Download the XML and upload it to goweb.fic.gov.rw',
  })
  submitStr(
    @Param('strId') strId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.str.submitStr(strId, t || u, u);
  }

  @Get('str/:strId/xml')
  @Roles(...COMPLIANCE)
  @ApiOperation({ summary: 'Download goAML XML for an STR [compliance]' })
  async downloadStrXml(
    @Param('strId') strId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const xml = await this.str.getStrXml(strId, t || u);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${strId}-goAML.xml"`,
    );
    res.send(xml);
  }

  @Patch('str/:strId/acknowledge')
  @Roles(...COMPLIANCE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark STR as acknowledged by FIC Rwanda [compliance]',
  })
  acknowledgeStr(
    @Param('strId') strId: string,
    @Body() dto: SubmitStrDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.str.acknowledgeStr(strId, t || u, dto.goAmlReference);
  }

  // ═══════════════════════════════════════════════════════════
  // WATCHLIST
  // ═══════════════════════════════════════════════════════════

  @Get('watchlist/stats')
  @ApiOperation({ summary: 'Watchlist stats — counts by list type' })
  getWatchlistStats(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.watchlist.getStats(t || u);
  }

  @Get('watchlist')
  @ApiOperation({ summary: 'List watchlist entries with filters' })
  getWatchlistEntries(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query() pagination: PaginationDto,
    @Query() filters: WatchlistFilterDto,
  ) {
    return this.watchlist.getEntries(t || u, pagination, filters);
  }

  @Post('watchlist')
  @Roles(...COMPLIANCE)
  @ApiOperation({ summary: 'Add a watchlist entry manually [compliance]' })
  addWatchlistEntry(
    @Body() dto: AddWatchlistEntryDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.watchlist.addEntry(t || u, u, dto);
  }

  @Delete('watchlist/:entryId')
  @Roles(...COMPLIANCE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a watchlist entry [compliance]' })
  deleteWatchlistEntry(
    @Param('entryId') entryId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.watchlist.deleteEntry(entryId, t || u);
  }

  @Post('watchlist/import-csv')
  @Roles(...COMPLIANCE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Import watchlist entries from CSV [compliance]',
    description:
      'CSV headers: name,entityType,listType,country,source,reason,aliases. ' +
      'Send as plain text body.',
  })
  importCsv(
    @Body('csv') csv: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.watchlist.importCsv(t || u, u, csv);
  }

  @Post('watchlist/sync')
  @Roles(...COMPLIANCE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sync watchlist from OpenSanctions [compliance]',
    description:
      'Fetches OFAC, EU, UN, UK HMT sanctions + PEP data and upserts into watchlist.',
  })
  syncWatchlist(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.watchlist.syncFromOpenSanctions(t || u, u);
  }

  @Post('watchlist/screen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ad-hoc screening against watchlist',
    description:
      'Screen a name against the local watchlist. Set checkLive=true to also query OpenSanctions live.',
  })
  adHocScreen(
    @Body() dto: AdHocScreeningDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.watchlist.adHocScreen(t || u, dto);
  }
  @Get('reports/operational')
  @ApiOperation({
    summary: 'Operational report',
    description:
      'Alerts generated/resolved, STRs filed, avg resolution time, ' +
      'daily alert activity trend for last 30 days.',
  })
  getOperationalReport(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.reports.getOperationalReport(t || u);
  }

  @Get('reports/risk')
  @ApiOperation({
    summary: 'Risk analytics report',
    description:
      'Client risk distribution, verification outcomes (PEP/sanctions/adverse media), ' +
      'top risk factors, high-risk client list, risk trend.',
  })
  getRiskAnalytics(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.reports.getRiskAnalytics(t || u);
  }

  @Get('reports/regulatory')
  @ApiOperation({
    summary: 'Regulatory dashboard',
    description:
      'FIU-facing metrics — STR stats, overdue periodic reviews, ' +
      'sanctions/PEP hit counts, recent STR list.',
  })
  getRegulatoryDashboard(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.reports.getRegulatoryDashboard(t || u);
  }

  @Get('reports/trends')
  @ApiOperation({
    summary: 'Trend analysis',
    description:
      'Client growth, onboarding funnel, alert trend, ' +
      'transaction volume trend and STR filings over last 6 months.',
  })
  getTrendAnalysis(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.reports.getTrendAnalysis(t || u);
  }

  @Get('reports/export/:type')
  @Roles(
    TenantRole.TENANT_OWNER,
    TenantRole.TENANT_ADMIN,
    TenantRole.TENANT_COMPLIANCE,
  )
  @ApiOperation({
    summary: 'Export report as CSV',
    description:
      'type = operational | risk | regulatory | trends. ' +
      'Returns a downloadable CSV file.',
  })
  async exportReport(
    @Param('type') type: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const csv = await this.reports.exportCsv(t || u, type);
    const filename = `lexora-${type}-report-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
