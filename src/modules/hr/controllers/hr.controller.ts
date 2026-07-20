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
  UploadedFile,
  UseInterceptors,
  UseFilters,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import {
  AttendanceService,
  EmployeeService,
  LeaveService,
  EmployeeDocumentService,
  EmployeeRecordService,
  HrOverviewService,
  HrReportsService,
  LearningService,
} from '../services';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  EmployeeFilterDto,
  TerminateEmployeeDto,
  UpsertLeavePolicyDto,
  LeaveFilterDto,
  ReviewLeaveRequestDto,
  UploadEmployeeDocumentDto,
  PromoteToHeadOfDepartmentDto,
  AddEmployeeRecordDto,
  SuspendEmployeeDto,
  CreateCourseDto,
  UpdateCourseDto,
  UpdateEmployeeStaffRolesDto,
} from '../dtos';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import {
  PlatformModuleKey,
  UserType,
} from '../../../common/interfaces/user-role.enum';
import { PaginationDto } from '../../../common/pagination.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { EmployeeHierarchyRole } from '../schemas';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/modules/auth/schemas';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

const employeeDocumentStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(process.cwd(), 'uploads', 'employee', 'documents');
    if (!existsSync(uploadPath)) {
      mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const employeeDocumentFileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: any,
) => {
  const allowed = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new BadRequestException(
        'Only PDF, Word, JPG, or PNG files are accepted.',
      ),
      false,
    );
  }
};

const MAX_COURSE_FILE_SIZE_BYTES = 500 * 1024 * 1024;

const courseFileStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(process.cwd(), 'uploads', 'learning', 'courses');
    if (!existsSync(uploadPath)) mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) => {
    cb(null, `${uuidv4()}${extname(file.originalname)}`);
  },
});

const courseFileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const allowed = [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else
    cb(
      new BadRequestException(
        'Only MP4/WebM video or PPT/PPTX files are accepted.',
      ),
      false,
    );
};

@ApiTags('HR')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.HR_PM)
@Controller('hr')
export class HrTenantController {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly employeeService: EmployeeService,
    private readonly leaveService: LeaveService,
    private readonly attendanceService: AttendanceService,
    private readonly documentService: EmployeeDocumentService,
    private readonly recordService: EmployeeRecordService,
    private readonly overviewService: HrOverviewService,
    private readonly reportsService: HrReportsService,
    private readonly learningService: LearningService,
  ) {}

  // ── Overview ──────────────────────────────────────────────────

  @Get('overview')
  @ApiOperation({
    summary:
      'Org-wide HR pulse — per-department headcount, performance, attendance, and open roles',
  })
  getOverview(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.overviewService.getOverview(t || u);
  }

  // ── Stats ──────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'HR dashboard stats' })
  getStats(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.employeeService.getEmployeeStats(t || u);
  }

  // ═══════════════════════════════════════════════════════════
  // TEAMS (DEPARTMENTS)
  // ═══════════════════════════════════════════════════════════

  @Get('teams')
  @ApiOperation({ summary: 'List all teams (departments)' })
  getTeams(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.employeeService.getTeams(t || u);
  }

  @Post('teams')
  @ApiOperation({ summary: 'Create a new team (department)' })
  createTeam(
    @Body() dto: { name: string; description?: string },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.createTeam(t || u, dto);
  }

  @Patch('teams/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a team' })
  updateTeam(
    @Param('id') id: string,
    @Body() dto: { name?: string; description?: string },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.updateTeam(t || u, id, dto);
  }

  @Delete('teams/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a team (only if no active employees)' })
  deleteTeam(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.deleteTeam(t || u, id);
  }

  // @Get('my-team')
  // @ApiOperation({ summary: 'Get my direct reports (Manager only)' })
  // getMyTeam(@CurrentUser('sub') userId: string) {
  //   return this.employeeService.getDirectReports(userId);
  // }

  // @Get('my-department')
  // @ApiOperation({ summary: 'Get my department tree (Head of Department only)' })
  // getMyDepartment(@CurrentUser('sub') userId: string) {
  //   return this.employeeService.getDepartmentTree(userId);
  // }

  // ═══════════════════════════════════════════════════════════
  // LOCATIONS (BRANCHES)
  // ═══════════════════════════════════════════════════════════

  @Get('locations')
  @ApiOperation({ summary: 'List all locations (branches)' })
  getLocations(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.getLocations(t || u);
  }

  @Post('locations')
  @ApiOperation({ summary: 'Create a new location (branch)' })
  createLocation(
    @Body()
    dto: {
      name: string;
      country: string;
      city?: string;
      address?: string;
      timezone?: string;
    },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.createLocation(t || u, dto);
  }

  @Patch('locations/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a location' })
  updateLocation(
    @Param('id') id: string,
    @Body()
    dto: {
      name?: string;
      country?: string;
      city?: string;
      address?: string;
      timezone?: string;
    },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.updateLocation(t || u, id, dto);
  }

  @Delete('locations/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a location (only if no active employees)' })
  deleteLocation(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.deleteLocation(t || u, id);
  }

  // ═══════════════════════════════════════════════════════════
  // EMPLOYEES
  // Static routes BEFORE /:id
  // ═══════════════════════════════════════════════════════════

  @Get('employees')
  @ApiOperation({ summary: 'List all employees (filterable)' })
  @ApiQuery({ name: 'teamId', required: false })
  @ApiQuery({ name: 'locationId', required: false })
  @ApiQuery({ name: 'employmentStatus', required: false })
  @ApiQuery({ name: 'employmentType', required: false })
  @ApiQuery({ name: 'search', required: false })
  getEmployees(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query() pagination: PaginationDto,
    @Query() filters: EmployeeFilterDto,
  ) {
    return this.employeeService.getEmployees(t || u, pagination, filters);
  }

  @Post('employees')
  @ApiOperation({ summary: 'Create a new employee' })
  createEmployee(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.createEmployee(dto, t || u, u);
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

  @Patch('employees/:id/staff-roles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Grant or revoke module-scoped platform roles for an employee (e.g. risk_officer → GRC access)',
  })
  updateStaffRoles(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeStaffRolesDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.updateStaffRoles(t || u, id, dto.staffRoles);
  }

  @Get('employees/:id/detail')
  @ApiOperation({
    summary: 'Get employee with leave balance + recent attendance',
  })
  async getEmployeeDetail(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const [employee, leave, leaveHistory, attendance, attendanceStats] =
      await Promise.all([
        this.employeeService.getEmployeeById(id, tenantId),
        this.leaveService.getEmployeeLeaveBalance(id, tenantId),
        this.leaveService.getEmployeeLeaveHistory(id, tenantId),
        this.attendanceService.getEmployeeAttendance(id, tenantId, 5),
        this.attendanceService.getEmployeeAttendanceStats(id, tenantId),
      ]);

    return {
      employee,
      leave: {
        balances: leave.balances,
        history: leaveHistory,
      },
      attendance: {
        recent: attendance,
        stats: attendanceStats,
      },
    };
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
    return this.employeeService.terminateEmployee(t || u, id, dto);
  }

  @Patch('employees/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Suspend an employee — deactivates their login and marks them inactive until the end date',
  })
  suspendEmployee(
    @Param('id') id: string,
    @Body() dto: SuspendEmployeeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.suspendEmployee(t || u, id, dto);
  }

  @Patch('employees/:id/reinstate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End a suspension early, before its end date' })
  reinstateEmployee(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.reinstateEmployee(t || u, id);
  }

  @Get('employees/:id/direct-reports')
  @ApiOperation({ summary: "Get a specific employee's direct reports" })
  getEmployeeDirectReports(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.getDirectReportsOf(t || u, id);
  }

  @Post('employees/:id/resend-welcome')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend welcome email with new temporary credentials',
  })
  resendWelcomeEmail(
    @Param('id') employeeId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.resendWelcomeEmail(t || u, employeeId);
  }

  @Post('employees/:id/records')
  @ApiOperation({
    summary:
      'Add a standalone HR record to an employee (warning, suspension, termination, or note) — not a dispute case',
  })
  addRecord(
    @Param('id') employeeId: string,
    @Body() dto: AddEmployeeRecordDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.recordService.addRecord(t || u, employeeId, u, dto);
  }

  @Get('employees/:id/records')
  @ApiOperation({ summary: "Get an employee's HR records" })
  getRecords(
    @Param('id') employeeId: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.recordService.getRecordsForEmployee(t || u, employeeId);
  }

  // ═══════════════════════════════════════════════════════════
  // EMPLOYEE DOCUMENTS — tenant view/manage on a SPECIFIC
  // employee's file. ':id/documents' shares the same :id param
  // depth as ':id/detail' / ':id/terminate' above — no new
  // route-ordering concern, NestJS distinguishes these by their
  // trailing literal segment regardless of declaration order.
  // ═══════════════════════════════════════════════════════════

  @Get('employees/:id/documents')
  @ApiOperation({ summary: "Get an employee's uploaded documents" })
  getEmployeeDocuments(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.documentService.getForEmployee(t || u, id);
  }

  @Post('employees/:id/documents')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: employeeDocumentStorage,
      fileFilter: employeeDocumentFileFilter,
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        label: {
          type: 'string',
          description: 'Optional free-text label, e.g. "Passport copy"',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload a document onto an employee file, as the tenant',
  })
  uploadEmployeeDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadEmployeeDocumentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.documentService.uploadAsTenant(t || u, id, u, file, dto.label);
  }

  @Delete('employees/documents/:documentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an employee document' })
  async deleteEmployeeDocument(
    @Param('documentId') documentId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.documentService.deleteAsTenant(t || u, documentId);
    return { success: true };
  }

  @Get('employees/by-role/:role')
  @ApiOperation({
    summary:
      'List employees with a specific hierarchy role (for manager/HoD pickers)',
  })
  getEmployeesByRole(
    @Param('role') role: EmployeeHierarchyRole,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.getEmployeesByHierarchyRole(t || u, role);
  }

  @Post('employees/promote-to-hod')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Promote a Manager to Head of Department, replacing the current one',
  })
  promoteToHod(
    @Body() dto: PromoteToHeadOfDepartmentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.employeeService.promoteManagerToHeadOfDepartment(
      t || u,
      dto.teamId,
      dto.promotedManagerId,
      dto.regularsReassignToManagerId ?? null,
    );
  }
  // ═══════════════════════════════════════════════════════════
  // LEAVE
  // ═══════════════════════════════════════════════════════════

  @Post('leave/policy')
  @ApiOperation({ summary: 'Set leave policy' })
  upsertLeavePolicy(
    @Body() dto: UpsertLeavePolicyDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leaveService.upsertPolicy(t || u, {
      locationId: dto.locationId ?? null,
      policies: dto.policies,
    });
  }

  @Get('leave/policy')
  @ApiOperation({ summary: 'Get all leave policies' })
  getAllLeavePolicies(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leaveService.getAllPolicies(t || u);
  }

  @Get('leave/policy/uncovered')
  @ApiOperation({ summary: 'Get locations that have no leave policy yet' })
  getUncoveredLocation(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leaveService.getLocationsWithoutPolicy(t || u);
  }

  @Get('leave/policy/:locationId')
  @ApiOperation({ summary: 'Get leave policy for a specific location' })
  getLeavePolicy(
    @Param('locationId') locationId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leaveService.getPolicy(
      t || u,
      locationId === 'default' ? null : locationId,
    );
  }

  @Get('leave/requests')
  @ApiOperation({ summary: 'List all leave requests (filterable)' })
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
  @ApiOperation({ summary: 'Leave stats' })
  getLeaveStats(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leaveService.getLeaveStats(t || u);
  }

  @Patch('leave/requests/:id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject a leave request' })
  reviewLeaveRequest(
    @Param('id') id: string,
    @Body() dto: ReviewLeaveRequestDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.leaveService.reviewLeaveRequest(id, t || u, u, dto);
  }

  // ═══════════════════════════════════════════════════════════
  // ATTENDANCE
  // ═══════════════════════════════════════════════════════════

  @Get('attendance/today')
  @ApiOperation({ summary: "Today's attendance log" })
  getTodayAttendance(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query('teamId') teamId?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.attendanceService.getTodayAttendance(
      t || u,
      teamId,
      locationId,
    );
  }

  @Get('attendance/trends')
  @ApiOperation({ summary: 'Weekly attendance trends' })
  getWeeklyTrends(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.attendanceService.getWeeklyTrends(t || u, teamId);
  }

  // ═══════════════════════════════════════════════════════════
  // LEARNING & DEV
  // ═══════════════════════════════════════════════════════════
  @Post('learning/courses')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: courseFileStorage,
      fileFilter: courseFileFilter,
      limits: { fileSize: MAX_COURSE_FILE_SIZE_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Publish a new course — all active employees are emailed',
  })
  async createCourse(
    @Body() dto: CreateCourseDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const businessName = await resolveBusinessName(this.userModel, t || u);
    return this.learningService.createCourse(t || u, dto, file, businessName);
  }

  @Get('learning/courses')
  @ApiOperation({
    summary: 'List all courses (tenant view, includes answer keys)',
  })
  getAllCourses(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.learningService.getAllForTenant(t || u);
  }

  @Get('learning/courses/:id')
  @ApiOperation({ summary: 'Get one course (tenant view)' })
  getCourse(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.learningService.getOneForTenant(t || u, id);
  }

  @Patch('learning/courses/:id')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: courseFileStorage,
      fileFilter: courseFileFilter,
      limits: { fileSize: MAX_COURSE_FILE_SIZE_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update a course' })
  updateCourse(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.learningService.updateCourse(t || u, id, dto, file);
  }

  @Delete('learning/courses/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a course and all its enrollment records' })
  async deleteCourse(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.learningService.deleteCourse(t || u, id);
    return { success: true };
  }

  @Get('learning/courses/:id/stats')
  @ApiOperation({ summary: 'Enrollment/completion stats for a course' })
  getCourseStats(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.learningService.getCourseStats(t || u, id);
  }

  @Get('learning/courses/:id/leaderboard')
  @ApiOperation({ summary: 'Top-performing employees for a course' })
  getLeaderboard(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.learningService.getCourseLeaderboard(t || u, id);
  }

  // ═══════════════════════════════════════════════════════════
  // REPORTS
  // ═══════════════════════════════════════════════════════════
  @Get('reports/demographics')
  @ApiOperation({ summary: 'MIFOTRA-aligned workforce demographics report' })
  getDemographics(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.reportsService.getDemographicsReport(t || u);
  }

  @Get('reports/payroll/periods')
  @ApiOperation({
    summary: 'List available payroll periods for the report picker',
  })
  getPayrollPeriods(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.reportsService.getPayrollPeriods(t || u);
  }

  @Get('reports/payroll')
  @ApiQuery({ name: 'period', required: false })
  @ApiOperation({
    summary: 'Payroll totals and department breakdown for a period',
  })
  getPayroll(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query('period') period?: string,
  ) {
    return this.reportsService.getPayrollReport(t || u, period);
  }

  @Get('reports/disputes')
  @ApiOperation({
    summary: 'Dispute case volume, outcomes, and resolution time',
  })
  getDisputes(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.reportsService.getDisputesReport(t || u);
  }

  @Get('reports/employee-records')
  @ApiOperation({
    summary:
      'HR records (warnings, suspensions, terminations) by type and department',
  })
  getEmployeeRecords(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.reportsService.getEmployeeRecordsReport(t || u);
  }

  @Get('reports/requisitions')
  @ApiOperation({
    summary: 'Requisition volume, approval rate, and review time',
  })
  getRequisitions(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.reportsService.getRequisitionsReport(t || u);
  }

  @Get('reports/performance')
  @ApiOperation({ summary: 'Rating band distribution and department scores' })
  getPerformance(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.reportsService.getPerformanceReport(t || u);
  }
}
