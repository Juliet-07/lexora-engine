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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TeamMemberService } from '../services/team-member.service';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';

// ─────────────────────────────────────────────────────────────
// TEAM MEMBER SELF-SERVICE CONTROLLER
// Routes: /tenant/me/*
// UserType: TENANT (team members are tenant users with tenantId set)
// ─────────────────────────────────────────────────────────────

@ApiTags('Team Member Self-Service')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('tenant/me')
export class TeamMemberController {
  constructor(private readonly teamMemberService: TeamMemberService) {}

  // ── Profile ───────────────────────────────────────────────

  @Get('profile')
  @ApiOperation({ summary: 'Get own profile' })
  getMyProfile(@CurrentUser('sub') memberId: string) {
    return this.teamMemberService.getMyProfile(memberId);
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update own profile (name, phone)' })
  updateMyProfile(
    @CurrentUser('sub') memberId: string,
    @Body() dto: { phone?: string; firstName?: string; lastName?: string },
  ) {
    return this.teamMemberService.updateMyProfile(memberId, dto);
  }

  // ── Leave — static routes BEFORE /:id ────────────────────

  @Get('leave/balance')
  @ApiOperation({ summary: 'Get my leave balances for the year' })
  getLeaveBalance(@CurrentUser('sub') memberId: string) {
    return this.teamMemberService.getMyLeaveBalance(memberId);
  }

  @Get('leave')
  @ApiOperation({ summary: 'Get my leave history' })
  getLeaveHistory(@CurrentUser('sub') memberId: string) {
    return this.teamMemberService.getMyLeaveRequests(memberId);
  }

  @Post('leave')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a leave request' })
  submitLeave(
    @CurrentUser('sub') memberId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body()
    dto: {
      type: string;
      startDate: string;
      endDate: string;
      reason: string;
    },
  ) {
    // For team owner (no tenantId), use their own id as tenantId
    return this.teamMemberService.submitLeaveRequest(
      memberId,
      tenantId || memberId,
      dto,
    );
  }

  @Patch('leave/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending leave request' })
  cancelLeave(@Param('id') id: string, @CurrentUser('sub') memberId: string) {
    return this.teamMemberService.cancelLeaveRequest(id, memberId);
  }

  // ── Attendance ────────────────────────────────────────────

  @Get('attendance/active')
  @ApiOperation({ summary: 'Get current active shift (if clocked in)' })
  getActiveShift(@CurrentUser('sub') memberId: string) {
    return this.teamMemberService.getActiveShift(memberId).catch(() => null);
  }

  @Get('attendance/stats')
  @ApiOperation({ summary: 'Get attendance stats (week, month hours)' })
  getAttendanceStats(@CurrentUser('sub') memberId: string) {
    return this.teamMemberService.getAttendanceStats(memberId);
  }

  @Get('attendance')
  @ApiOperation({ summary: 'Get attendance history' })
  getAttendance(
    @CurrentUser('sub') memberId: string,
    @Query('limit') limit?: string,
  ) {
    return this.teamMemberService.getMyAttendance(
      memberId,
      limit ? Number(limit) : 30,
    );
  }

  @Post('attendance/clock-in')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Clock in for the day' })
  clockIn(
    @CurrentUser('sub') memberId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: { location?: string },
  ) {
    return this.teamMemberService.clockIn(memberId, tenantId || memberId, dto);
  }

  @Post('attendance/break/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a break' })
  startBreak(@CurrentUser('sub') memberId: string) {
    return this.teamMemberService.startBreak(memberId);
  }

  @Post('attendance/break/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End a break' })
  endBreak(@CurrentUser('sub') memberId: string) {
    return this.teamMemberService.endBreak(memberId);
  }

  @Post('attendance/clock-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clock out' })
  clockOut(@CurrentUser('sub') memberId: string) {
    return this.teamMemberService.clockOut(memberId);
  }
}
