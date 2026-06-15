import {
  Controller,
  Get,
  Post,
  Patch,
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
import { EmployeeService, LeaveService } from '../services';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  EmployeeFilterDto,
  TerminateEmployeeDto,
  UpsertLeavePolicyDto,
  LeaveFilterDto,
  ReviewLeaveRequestDto,
} from '../dtos';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';
import { PaginationDto } from '../../../common/pagination.dto';

// ─────────────────────────────────────────────────────────────
// TENANT HR CONTROLLER
// ─────────────────────────────────────────────────────────────
@ApiTags('HR')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr')
export class HrTenantController {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly leaveService: LeaveService,
  ) {}

  // ── Stats ──────────────────────────────────────────────────
  @Get('stats')
  @ApiOperation({ summary: 'HR dashboard stats' })
  getStats(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.employeeService.getEmployeeStats(t || u);
  }

  // ── STATIC ROUTES FIRST — must come before /:id ───────────

  @Get('employees/grouped')
  @ApiOperation({
    summary: 'List employees grouped by client company',
    description: 'Primary view for the Employees page.',
  })
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'department', required: false })
  @ApiQuery({ name: 'employmentStatus', required: false })
  @ApiQuery({ name: 'search', required: false })
  getEmployeesGrouped(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query() filters: EmployeeFilterDto,
  ) {
    return this.employeeService.getEmployeesGrouped(t || u, filters);
  }

  @Get('employees/departments')
  @ApiOperation({ summary: 'Get list of distinct departments' })
  getDepartments(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.getDepartments(t || u);
  }

  // ── PARAMETERISED ROUTES after static ─────────────────────

  @Get('employees')
  @ApiOperation({ summary: 'List all employees (flat, paginated)' })
  getEmployees(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query() pagination: PaginationDto,
    @Query() filters: EmployeeFilterDto,
  ) {
    return this.employeeService.getEmployees(t || u, pagination, filters);
  }

  @Get('employees/:id')
  @ApiOperation({ summary: 'Get employee full profile' })
  getEmployee(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.getEmployeeById(id, t || u);
  }

  @Post('employees')
  @ApiOperation({ summary: 'Create employee for a client' })
  createEmployee(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.createEmployee(dto, t || u, u);
  }

  @Patch('employees/:id')
  @ApiOperation({ summary: 'Update employee details' })
  updateEmployee(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.updateEmployee(id, t || u, dto);
  }

  @Patch('employees/:id/terminate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Terminate or process resignation of an employee' })
  terminateEmployee(
    @Param('id') id: string,
    @Body() dto: TerminateEmployeeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.terminateEmployee(id, t || u, dto);
  }

  @Get('clients/:clientId/employees')
  @ApiOperation({ summary: 'List employees for a specific client' })
  getEmployeesByClient(
    @Param('clientId') clientId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.employeeService.getEmployeesByClient(
      clientId,
      t || u,
      pagination,
    );
  }

  // ── Leave Policy ──────────────────────────────────────────

  @Post('leave/policy')
  @ApiOperation({
    summary: 'Set leave policy for a client',
    description:
      'Creates or updates leave allowances per type for a specific client.',
  })
  upsertLeavePolicy(
    @Body() dto: UpsertLeavePolicyDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leaveService.upsertPolicy(t || u, dto);
  }

  @Get('leave/policy')
  @ApiOperation({ summary: 'Get all leave policies for this tenant' })
  getAllLeavePolicies(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leaveService.getAllPolicies(t || u);
  }

  @Get('leave/policy/:clientId')
  @ApiOperation({ summary: 'Get leave policy for a specific client' })
  getLeavePolicy(
    @Param('clientId') clientId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leaveService.getPolicy(t || u, clientId);
  }

  // ── Leave Requests ────────────────────────────────────────

  @Get('leave/requests')
  @ApiOperation({ summary: 'List all leave requests (filterable)' })
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'type', required: false })
  getTenantLeaveRequests(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query() pagination: PaginationDto,
    @Query() filters: LeaveFilterDto,
  ) {
    return this.leaveService.getTenantLeaveRequests(
      t || u,
      pagination,
      filters,
    );
  }

  @Get('leave/stats')
  @ApiOperation({ summary: 'Leave stats — pending count, by type, by status' })
  getLeaveStats(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.leaveService.getLeaveStats(t || u, clientId);
  }

  @Patch('leave/requests/:id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject a leave request [tenant only]' })
  reviewLeaveRequest(
    @Param('id') id: string,
    @Body() dto: ReviewLeaveRequestDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leaveService.reviewLeaveRequest(id, t || u, u, dto);
  }
}
