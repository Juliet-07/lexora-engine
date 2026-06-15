import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EmployeeService } from '../services/employee.service';
import { LeaveService } from '../services/leave.service';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';
import { CreateLeaveRequestDto } from '../dtos';
import { AttendanceService } from '../services';

// ─────────────────────────────────────────────────────────────
// EMPLOYEE SELF-SERVICE CONTROLLER
// userType: EMPLOYEE — routes: /employee/*
// ─────────────────────────────────────────────────────────────

@ApiTags('HR — Employee Self-Service')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.EMPLOYEE)
@Controller('employee')
export class HrEmployeeController {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly leaveService: LeaveService,
    private readonly attendanceService: AttendanceService,
  ) {}

  // ── Profile ───────────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Get own employee profile' })
  getMyProfile(@CurrentUser('sub') userId: string) {
    return this.employeeService.getMyProfile(userId);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update own employee profile' })
  updateMyProfile(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.employeeService.updateMyProfile(userId, dto);
  }

  // ── Leave — static routes BEFORE /:id ────────────────────

  @Get('leave/balance')
  @ApiOperation({ summary: 'Get my leave balances' })
  getMyLeaveBalance(@CurrentUser('sub') userId: string) {
    return this.leaveService.getMyLeaveBalance(userId);
  }

  @Get('leave')
  @ApiOperation({ summary: 'Get my leave history' })
  getMyLeaveRequests(@CurrentUser('sub') userId: string) {
    return this.leaveService.getMyLeaveRequests(userId);
  }

  @Post('leave')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a leave request' })
  createLeaveRequest(
    @Body() dto: CreateLeaveRequestDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.leaveService.createLeaveRequest(userId, dto);
  }

  @Patch('leave/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending leave request' })
  cancelLeaveRequest(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.leaveService.cancelLeaveRequest(id, userId);
  }

  @Get('attendance/active')
  @ApiOperation({ summary: 'Get current active shift' })
  getActiveShift(@CurrentUser('sub') userId: string) {
    return this.attendanceService.getMyActiveShift(userId);
  }

  @Get('attendance/stats')
  @ApiOperation({ summary: 'Get my attendance stats (week/month hours)' })
  getAttendanceStats(@CurrentUser('sub') userId: string) {
    return this.attendanceService.getMyAttendanceStats(userId);
  }

  @Get('attendance')
  @ApiOperation({ summary: 'Get my attendance history' })
  getMyAttendance(
    @CurrentUser('sub') userId: string,
    @Query('limit') limit?: string,
  ) {
    return this.attendanceService.getMyAttendance(
      userId,
      limit ? Number(limit) : 30,
    );
  }

  @Post('attendance/clock-in')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Clock in for the day' })
  clockIn(
    @CurrentUser('sub') userId: string,
    @Body() dto: { location?: string },
  ) {
    return this.attendanceService.clockIn(userId, dto);
  }

  @Post('attendance/break/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a break' })
  startBreak(@CurrentUser('sub') userId: string) {
    return this.attendanceService.startBreak(userId);
  }

  @Post('attendance/break/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End a break' })
  endBreak(@CurrentUser('sub') userId: string) {
    return this.attendanceService.endBreak(userId);
  }

  @Post('attendance/clock-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clock out' })
  clockOut(@CurrentUser('sub') userId: string) {
    return this.attendanceService.clockOut(userId);
  }
}
