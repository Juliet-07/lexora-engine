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
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import {
  PayrollPolicyService,
  EmployeeLoanService,
  PayrollRunService,
  PayslipTemplateService,
} from '../services';
import {
  UpsertPayrollPolicyDto,
  ApplyRwandaPresetDto,
  CreateLoanDto,
  UpdateLoanDto,
  CreatePayrollRunDto,
  UpdatePayslipTemplateDto,
} from '../dtos/';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';

@ApiTags('HR — Payroll Policy (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/payroll/policy')
export class PayrollPolicyController {
  constructor(private readonly policyService: PayrollPolicyService) {}

  @Get()
  @ApiOperation({ summary: 'List all payroll policies for this tenant' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.policyService.getAllPolicies(t || u);
  }

  @Get('for-location/:locationId')
  @ApiOperation({
    summary:
      'Resolve the effective policy for a location (falls back to tenant default)',
  })
  getForLocation(
    @Param('locationId') locationId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.policyService.getPolicyForLocation(t || u, locationId);
  }

  @Get('default')
  @ApiOperation({ summary: 'Get the tenant-wide default policy' })
  getDefault(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.policyService.getPolicyForLocation(t || u, null);
  }

  @Post()
  @ApiOperation({
    summary:
      'Create or update a payroll policy (omit locationId for tenant default)',
  })
  upsert(
    @Body() dto: UpsertPayrollPolicyDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.policyService.upsertPolicy(t || u, dto);
  }

  @Post('apply-rwanda-preset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Apply the built-in Rwanda statutory deduction preset to a location or default',
  })
  applyRwandaPreset(
    @Body() dto: ApplyRwandaPresetDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.policyService.applyRwandaPreset(
      t || u,
      dto.locationId ?? null,
      dto.overwrite ?? false,
    );
  }

  @Delete(':policyId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a payroll policy' })
  async delete(
    @Param('policyId') policyId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.policyService.deletePolicy(t || u, policyId);
    return { success: true };
  }
}

@ApiTags('HR — Employee Loans (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/payroll/loans')
export class EmployeeLoanController {
  constructor(private readonly loanService: EmployeeLoanService) {}

  @Get()
  @ApiQuery({ name: 'status', required: false })
  @ApiOperation({ summary: 'List all employee loans for this tenant' })
  getAll(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query('status') status?: string,
  ) {
    return this.loanService.getAllLoans(t || u, status);
  }

  @Get('employee/:employeeId')
  @ApiOperation({ summary: "Get a specific employee's loans" })
  getForEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.loanService.getLoansForEmployee(employeeId, t || u);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new loan for an employee' })
  create(
    @Body() dto: CreateLoanDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.loanService.createLoan(t || u, dto);
  }

  @Patch(':loanId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a loan (installment amount, status, note)' })
  update(
    @Param('loanId') loanId: string,
    @Body() dto: UpdateLoanDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.loanService.updateLoan(t || u, loanId, dto);
  }

  @Delete(':loanId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a loan' })
  async delete(
    @Param('loanId') loanId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.loanService.deleteLoan(t || u, loanId);
    return { success: true };
  }
}

@ApiTags('HR — Payroll Runs (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/payroll/runs')
export class PayrollRunController {
  constructor(private readonly runService: PayrollRunService) {}

  @Get()
  @ApiOperation({ summary: 'List all payroll runs for this tenant' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.runService.getAllRuns(t || u);
  }

  @Get('period-status')
  @ApiQuery({ name: 'periodLabel', required: true, example: 'June 2026' })
  @ApiOperation({
    summary:
      "Get every employee's payroll status for a given period, across all runs",
  })
  getPeriodStatus(
    @Query('periodLabel') periodLabel: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.runService.getAllEmployeesPeriodStatus(t || u, periodLabel);
  }

  @Get(':runId')
  @ApiOperation({ summary: 'Get a run with all its payslips' })
  getDetail(
    @Param('runId') runId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.runService.getRunDetail(t || u, runId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new draft payroll run' })
  create(
    @Body() dto: CreatePayrollRunDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.runService.createRun(t || u, dto);
  }

  @Post(':runId/recalculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recalculate a draft run' })
  recalculate(
    @Param('runId') runId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.runService.recalculateRun(t || u, runId);
  }

  @Post(':runId/process')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finalize a draft run — irreversible' })
  process(
    @Param('runId') runId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.runService.processRun(t || u, runId, u);
  }

  @Post(':runId/mark-paid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a processed run as paid/disbursed' })
  markPaid(
    @Param('runId') runId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.runService.markPaid(t || u, runId);
  }

  @Delete(':runId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Discard a draft run' })
  async discard(
    @Param('runId') runId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.runService.discardDraftRun(t || u, runId);
    return { success: true };
  }

  @Get('payslip/:payslipId')
  @ApiOperation({ summary: 'Get a single payslip by ID' })
  getPayslip(
    @Param('payslipId') payslipId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.runService.getPayslip(t || u, payslipId);
  }

  @Get('payslip/:payslipId/render')
  @ApiOperation({
    summary: 'Render a payslip as branded HTML using the tenant template',
  })
  async renderPayslip(
    @Param('payslipId') payslipId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const slip = await this.runService.getPayslip(t || u, payslipId);
    return this.runService.renderPayslipHtml(t || u, slip);
  }
}

@ApiTags('HR — Payslip Template (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/payroll/template')
export class PayslipTemplateController {
  constructor(private readonly templateService: PayslipTemplateService) {}

  @Get()
  @ApiOperation({ summary: "Get this tenant's payslip template" })
  get(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.templateService.getOrCreateTemplate(t || u);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update payslip template appearance/settings' })
  update(
    @Body() dto: UpdatePayslipTemplateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.templateService.updateTemplate(t || u, dto);
  }
}
