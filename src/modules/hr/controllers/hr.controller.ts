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
} from '../dtos';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';
import { PaginationDto } from '../../../common/pagination.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';

// ── Document storage — SAME folder as the employee self-service
// controller's employeeDocumentStorage ('uploads/employee/documents'),
// since both upload entry points write into the SAME logical
// document collection. Same inline-config pattern used throughout
// this codebase — no shared/centralized multer config file exists. ──

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

@ApiTags('HR')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr')
export class HrTenantController {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly leaveService: LeaveService,
    private readonly attendanceService: AttendanceService,
    private readonly documentService: EmployeeDocumentService,
  ) {}

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
    @Body() dto: { name: string; description?: string; lead?: string },
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
    @Body() dto: { name?: string; description?: string; lead?: string },
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
    return this.employeeService.terminateEmployee(id, t || u, dto);
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
}
