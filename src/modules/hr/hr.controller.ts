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
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';

import { EmployeeService } from './services/employee.service';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  EmployeeFilterDto,
  TerminateEmployeeDto,
} from './hr.dto';
import { UserTypes, CurrentUser } from '../../common/decorators/index';
import { UserType } from '../../common/interfaces/user-role.enum';
import { PaginationDto } from '../../common/pagination.dto';

// ─────────────────────────────────────────────────────────────
// TENANT HR CONTROLLER
// ─────────────────────────────────────────────────────────────

@ApiTags('HR')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr')
export class HrTenantController {
  constructor(private readonly employeeService: EmployeeService) {}

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
}

// ─────────────────────────────────────────────────────────────
// EMPLOYEE SELF-SERVICE CONTROLLER
// ─────────────────────────────────────────────────────────────

@ApiTags('HR — Employee Self-Service')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.EMPLOYEE)
@Controller('employee')
export class HrEmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get own employee profile' })
  getMyProfile(@CurrentUser('sub') userId: string) {
    return this.employeeService.getMyProfile(userId);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update own employee profile',
    description:
      'Employee updates their own contact details, address, emergency contact and bank details.',
  })
  updateMyProfile(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.employeeService.updateMyProfile(userId, dto);
  }
}

@ApiTags('HR — Client Self-Service')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.CLIENT)
@Controller('client/hr')
export class HrClientController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Get('employees')
  @ApiOperation({
    summary: 'Get employees for this client [client portal]',
    description:
      'Client fetches their own employees using their clientProfileId from GET /auth/me.',
  })
  getMyEmployees(
    @Query('clientProfileId') clientProfileId: string,
    @Query() pagination: PaginationDto,
  ) {
    if (!clientProfileId) {
      throw new BadRequestException('clientProfileId is required');
    }
    return this.employeeService.getEmployeesForClient(
      clientProfileId,
      pagination,
    );
  }
}
