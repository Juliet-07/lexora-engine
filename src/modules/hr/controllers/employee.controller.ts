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
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  AttendanceService,
  EmployeeService,
  LeaveService,
  OnboardingService,
} from '../services';
import { CompleteOnboardingDto, CreateLeaveRequestDto } from '../dtos';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';

// ═══════════════════════════════════════════════════════════════
// EMPLOYEE SELF-SERVICE CONTROLLER
// Routes: /employee/*
// UserType: EMPLOYEE only — these are the people the tenant created
// via HR → Employees. They log into the same tenant app, scoped view.
// ═══════════════════════════════════════════════════════════════

@ApiTags('Employee Self-Service')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.EMPLOYEE)
@Controller('employee')
export class HrEmployeeController {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly leaveService: LeaveService,
    private readonly attendanceService: AttendanceService,
    private readonly onboardingService: OnboardingService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // ONBOARDING — mandatory flow, checked right after login
  // ═══════════════════════════════════════════════════════════

  @Get('onboarding/status')
  @ApiOperation({
    summary: 'Check if onboarding is complete; get documents if not',
  })
  getOnboardingStatus(@CurrentUser('sub') userId: string) {
    return this.onboardingService.getMyStatus(userId);
  }

  @Post('onboarding/complete')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit signed acknowledgement of all onboarding documents',
  })
  completeOnboarding(
    @CurrentUser('sub') userId: string,
    @Body() dto: CompleteOnboardingDto,
    @Req() req: any,
  ) {
    const ipAddress =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.connection?.remoteAddress ||
      null;
    return this.onboardingService.completeOnboarding(userId, dto, ipAddress);
  }

  // ═══════════════════════════════════════════════════════════
  // PROFILE
  // ═══════════════════════════════════════════════════════════

  @Get('profile')
  @ApiOperation({ summary: 'Get my employee profile' })
  getMyProfile(@CurrentUser('sub') userId: string) {
    return this.employeeService.getMyProfile(userId);
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update my profile (contact details only)' })
  updateMyProfile(
    @CurrentUser('sub') userId: string,
    @Body()
    dto: {
      phone?: string;
      dateOfBirth?: string;
      address?: {
        street?: string;
        city?: string;
        state?: string;
        country?: string;
      };
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      bankName?: string;
      bankAccountNumber?: string;
      nationality?: string;
      nationalId?: string;
    },
  ) {
    return this.employeeService.updateMyProfile(userId, dto);
  }

  // ═══════════════════════════════════════════════════════════
  // LEAVE — static routes BEFORE /:id
  // ═══════════════════════════════════════════════════════════

  @Get('leave/balance')
  @ApiOperation({ summary: 'Get my leave balances for the year' })
  getLeaveBalance(@CurrentUser('sub') userId: string) {
    return this.leaveService.getMyLeaveBalance(userId);
  }

  @Get('leave')
  @ApiOperation({ summary: 'Get my leave request history' })
  getLeaveHistory(@CurrentUser('sub') userId: string) {
    return this.leaveService.getMyLeaveRequests(userId);
  }

  @Post('leave')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a leave request' })
  submitLeave(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.leaveService.createLeaveRequest(userId, dto);
  }

  @Patch('leave/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending leave request' })
  cancelLeave(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.leaveService.cancelLeaveRequest(id, userId);
  }

  // ═══════════════════════════════════════════════════════════
  // ATTENDANCE — static routes BEFORE any future /:id
  // ═══════════════════════════════════════════════════════════

  @Get('attendance/active')
  @ApiOperation({
    summary: 'Get my current active shift (null if not clocked in)',
  })
  getActiveShift(@CurrentUser('sub') userId: string) {
    return this.attendanceService.getMyActiveShift(userId);
  }

  @Get('attendance/stats')
  @ApiOperation({
    summary: 'Get my attendance stats (week/month hours, days present)',
  })
  getAttendanceStats(@CurrentUser('sub') userId: string) {
    return this.attendanceService.getMyAttendanceStats(userId);
  }

  @Get('attendance')
  @ApiOperation({ summary: 'Get my attendance history' })
  getAttendanceHistory(
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
