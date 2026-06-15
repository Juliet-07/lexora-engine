import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EmployeeService, LeaveService } from '../services/';
import { UserTypes } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';
import { PaginationDto } from '../../../common/pagination.dto';
import { LeaveFilterDto } from '../dtos';

// ─────────────────────────────────────────────────────────────
// CLIENT HR CONTROLLER
// ─────────────────────────────────────────────────────────────
@ApiTags('HR — Client Self-Service')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.CLIENT)
@Controller('client/hr')
export class HrClientController {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly leaveService: LeaveService,
  ) {}

  // ── Employees ─────────────────────────────────────────────

  @Get('employees')
  @ApiOperation({ summary: 'Get employees for this client' })
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

  // ── Leave (read-only — client views their employees' leave) ─

  @Get('leave')
  @ApiOperation({ summary: "View leave requests for this client's employees" })
  getClientLeaveRequests(
    @Query('clientProfileId') clientProfileId: string,
    @Query() pagination: PaginationDto,
    @Query() filters: LeaveFilterDto,
  ) {
    if (!clientProfileId) {
      throw new BadRequestException('clientProfileId is required');
    }
    return this.leaveService.getClientLeaveRequests(
      clientProfileId,
      pagination,
      filters,
    );
  }
}
