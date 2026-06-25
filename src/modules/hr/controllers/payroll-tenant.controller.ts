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
  BadRequestException,
  Res,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import {
  PayrollPolicyService,
  EmployeeLoanService,
  PayrollRunService,
  PayslipTemplateService,
  PayrollCalculationService,
  ExchangeRateService,
  PayrollExportService,
} from '../services';
import {
  UpsertPayrollPolicyDto,
  ApplyRwandaPresetDto,
  CreatePayrollRunDto,
  UpdatePayslipTemplateDto,
  GrossUpFromNetDto,
  DecideLoanRequestDto,
} from '../dtos/';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('HR — Payroll Policy (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/payroll/policy')
export class PayrollPolicyController {
  constructor(
    private readonly policyService: PayrollPolicyService,
    private readonly calcService: PayrollCalculationService,
  ) {}

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

  @Post('gross-up')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Calculate the basic salary needed to achieve a target net pay, under a location's policy",
  })
  async grossUp(
    @Body() dto: GrossUpFromNetDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const policy = await this.policyService.getPolicyForLocation(
      t || u,
      dto.locationId ?? null,
    );
    if (!policy) {
      throw new BadRequestException(
        'No payroll policy configured for this location or tenant default.',
      );
    }
    const grossSalary = this.calcService.solveGrossFromNet(
      dto.targetNet,
      policy as any,
    );
    return { targetNet: dto.targetNet, grossSalary, currency: policy.currency };
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

  @Get('pending')
  @ApiOperation({ summary: 'List loan requests awaiting a decision' })
  getPending(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.loanService.getAllLoans(t || u, 'pending');
  }

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

  @Patch(':loanId/decide')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject a pending loan request' })
  decide(
    @Param('loanId') loanId: string,
    @Body() dto: DecideLoanRequestDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.loanService.decideLoanRequest(t || u, loanId, u, dto);
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
  constructor(
    private readonly runService: PayrollRunService,
    private readonly fxService: ExchangeRateService,
    private readonly exportService: PayrollExportService,
  ) {}

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

  @Get('fx-preview')
  @ApiQuery({ name: 'from', required: true, example: 'USD' })
  @ApiQuery({ name: 'to', required: true, example: 'RWF' })
  @ApiOperation({
    summary:
      'Fetch a live exchange rate to pre-fill a manual rate (does not apply it automatically)',
  })
  async fxPreview(@Query('from') from: string, @Query('to') to: string) {
    return this.fxService.getRate(from, to);
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
    return this.runService.markPaid(t || u, runId, u);
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

  @Post(':runId/email-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Email every payslip in this run to its respective employee',
  })
  emailAllPayslips(
    @Param('runId') runId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.runService.emailAllPayslipsInRun(t || u, runId);
  }

  @Get(':runId/export-excel')
  @ApiOperation({
    summary: 'Download this run as an Excel file for accounting/bank transfer',
  })
  async exportExcel(
    @Param('runId') runId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.exportRunToExcel(t || u, runId);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="payroll-export.xlsx"`,
    });
    res.send(buffer);
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

  @Get('payslip/:payslipId/pdf')
  @ApiOperation({ summary: 'Download a payslip as PDF' })
  async downloadPayslipPdf(
    @Param('payslipId') payslipId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const buffer = await this.runService.getPayslipPdf(t || u, payslipId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="payslip-${payslipId}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
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

  @Post('payslip/:payslipId/email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Email a payslip to the employee's own address on file",
  })
  async emailPayslip(
    @Param('payslipId') payslipId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.runService.emailPayslipToEmployee(t || u, payslipId);
  }

  @Get('employee/:employeeId/payslips')
  @ApiOperation({ summary: "Get an employee's payslip history (tenant view)" })
  getEmployeePayslips(
    @Param('employeeId') employeeId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.runService.getPayslipsForEmployee(t || u, employeeId);
  }
}

const logoUploadConfig = {
  storage: memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new BadRequestException('Only PNG, JPG, or SVG logos are accepted.'),
        false,
      );
    }
  },
};

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

  @Post('logo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', logoUploadConfig))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: "Upload the tenant's payslip logo" })
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    return this.templateService.updateTemplate(t || u, {
      logoUrl: dataUrl,
    } as any);
  }
}
