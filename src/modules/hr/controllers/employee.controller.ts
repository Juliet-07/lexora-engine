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
  Delete,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import {
  AttendanceService,
  EmployeeService,
  LeaveService,
  OnboardingService,
  PayrollRunService,
  PerformanceReviewService,
  RequisitionService,
  RequisitionTypeService,
  EmployeeDocumentService,
  EmployeeLoanService,
  ProbationService,
  DisputeService,
} from '../services';
import {
  CompleteOnboardingDto,
  CreateLeaveRequestDto,
  CreateRequisitionDto,
  SaveOnboardingMedicalDto,
  SaveOnboardingPersonalDto,
  SaveOnboardingReferencesDto,
  UpdateEmployeeReviewSectionDto,
  UploadEmployeeDocumentDto,
  RequestLoanDto,
  UpdateManagerReviewSectionDto,
  OpenDisputeCaseDto,
  FileAppealDto,
  CloseDisputeDto,
  RecordOutcomeDto,
  ScheduleHearingDto,
  InvestigateDisputeDto,
  AcknowledgeDisputeDto,
  RespondToDisputeDto,
} from '../dtos';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { Response } from 'express';

// =================================================================
// EMPLOYEE SELF-SERVICE CONTROLLER
// Routes: /employee/*
// =================================================================

const certificateStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(
      process.cwd(),
      'uploads',
      'employee',
      'certificates',
    );
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

const certificateFileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: any,
) => {
  const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new BadRequestException('Only PDF, JPG, or PNG files are accepted.'),
      false,
    );
  }
};

const disputeDocumentStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(process.cwd(), 'uploads', 'disputes', 'documents');
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
    private readonly payrollRunService: PayrollRunService,
    private readonly performanceReviewService: PerformanceReviewService,
    private readonly requisitionService: RequisitionService,
    private readonly requisitionTypeService: RequisitionTypeService,
    private readonly documentService: EmployeeDocumentService,
    private readonly loanService: EmployeeLoanService,
    private readonly probationService: ProbationService,
    private readonly disputeService: DisputeService,
  ) {}

  // ===============================================================
  // ONBOARDING (employee's OWN onboarding paperwork - unrelated to
  // probation onboarding stage below, different concept entirely,
  // left completely untouched)
  // ===============================================================

  @Get('onboarding/status')
  @ApiOperation({
    summary: 'Check if onboarding is complete; get documents if not',
  })
  getOnboardingStatus(@CurrentUser('sub') userId: string) {
    return this.onboardingService.getMyStatus(userId);
  }

  @Patch('onboarding/personal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Onboarding step 1 — save personal & emergency details',
  })
  saveOnboardingPersonal(
    @CurrentUser('sub') userId: string,
    @Body() dto: SaveOnboardingPersonalDto,
  ) {
    return this.onboardingService.savePersonal(userId, dto);
  }

  @Patch('onboarding/medical')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Onboarding step 2 — save medical information' })
  saveOnboardingMedical(
    @CurrentUser('sub') userId: string,
    @Body() dto: SaveOnboardingMedicalDto,
  ) {
    return this.onboardingService.saveMedical(userId, dto);
  }

  @Post('onboarding/certificates')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: certificateStorage,
      fileFilter: certificateFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        name: {
          type: 'string',
          description: 'Optional display name, e.g. "AML Certification"',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Onboarding step 3 — upload a certificate file' })
  uploadOnboardingCertificate(
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.onboardingService.uploadCertificate(userId, file, name);
  }

  @Delete('onboarding/certificates')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove an uploaded certificate' })
  deleteOnboardingCertificate(
    @CurrentUser('sub') userId: string,
    @Body('fileUrl') fileUrl: string,
  ) {
    return this.onboardingService.deleteCertificate(userId, fileUrl);
  }

  @Patch('onboarding/references')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Onboarding step 3 — save professional references' })
  saveOnboardingReferences(
    @CurrentUser('sub') userId: string,
    @Body() dto: SaveOnboardingReferencesDto,
  ) {
    return this.onboardingService.saveReferences(userId, dto);
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

  // ===============================================================
  // PROFILE
  // ===============================================================

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

  // ===============================================================
  // MY DOCUMENTS
  // ===============================================================

  @Get('documents')
  @ApiOperation({ summary: 'Get my uploaded documents' })
  async getMyDocuments(@CurrentUser('sub') userId: string) {
    const employee = await this.employeeService.getMyProfile(userId);
    return this.documentService.getMyDocuments(
      (employee as any).tenantId.toString(),
      (employee as any)._id.toString(),
    );
  }

  @Post('documents')
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
  @ApiOperation({ summary: 'Upload a document to my own employee file' })
  async uploadMyDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadEmployeeDocumentDto,
    @CurrentUser('sub') userId: string,
  ) {
    const employee = await this.employeeService.getMyProfile(userId);
    return this.documentService.uploadAsEmployee(
      (employee as any).tenantId.toString(),
      (employee as any)._id.toString(),
      userId,
      file,
      dto.label,
    );
  }

  @Delete('documents/:documentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a document I uploaded myself' })
  async deleteMyDocument(
    @Param('documentId') documentId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const employee = await this.employeeService.getMyProfile(userId);
    await this.documentService.deleteAsEmployee(
      (employee as any)._id.toString(),
      documentId,
    );
    return { success: true };
  }

  // ===============================================================
  // LEAVE
  // ===============================================================

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

  // ===============================================================
  // ATTENDANCE
  // ===============================================================

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

  // ===============================================================
  // PAYSLIPS
  // ===============================================================

  @Get('payslips')
  @ApiOperation({ summary: 'Get my payslip history' })
  async getMyPayslips(@CurrentUser('sub') userId: string) {
    const employee = await this.employeeService.getMyProfile(userId);
    return this.payrollRunService.getMyPayslips(
      (employee as any)._id.toString(),
    );
  }

  @Get('payslips/:payslipId/render')
  @ApiOperation({ summary: 'Render one of my payslips as branded HTML' })
  async renderMyPayslip(
    @Param('payslipId') payslipId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const employee = await this.employeeService.getMyProfile(userId);
    const slip = await this.payrollRunService.getPayslipForEmployee(
      payslipId,
      (employee as any)._id.toString(),
    );
    return this.payrollRunService.renderPayslipHtml(
      (employee as any).tenantId.toString(),
      slip,
    );
  }

  @Get('payslips/:payslipId/pdf')
  @ApiOperation({ summary: 'Download one of my payslips as PDF' })
  async downloadMyPayslipPdf(
    @Param('payslipId') payslipId: string,
    @CurrentUser('sub') userId: string,
    @Res() res: Response,
  ) {
    const employee = await this.employeeService.getMyProfile(userId);
    const buffer = await this.payrollRunService.getPayslipPdfForEmployee(
      payslipId,
      (employee as any)._id.toString(),
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="payslip-${payslipId}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Get('payroll/my-summary')
  @ApiOperation({ summary: 'YTD payroll summary for the logged-in employee' })
  async getMyPayrollSummary(@CurrentUser('sub') userId: string) {
    return this.payrollRunService.getMyPayrollSummary(userId);
  }
  // ===============================================================
  // LOANS
  // ===============================================================

  @Get('loans')
  @ApiOperation({ summary: 'Get my loan request/history' })
  async getMyLoans(@CurrentUser('sub') userId: string) {
    const employee = await this.employeeService.getMyProfile(userId);
    return this.loanService.getMyLoans((employee as any)._id.toString());
  }

  @Post('loans')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request a new loan/advance' })
  async requestLoan(
    @Body() dto: RequestLoanDto,
    @CurrentUser('sub') userId: string,
  ) {
    const employee = await this.employeeService.getMyProfile(userId);
    return this.loanService.requestLoan(
      (employee as any).tenantId.toString(),
      (employee as any)._id.toString(),
      dto,
    );
  }

  // ===============================================================
  // PERFORMANCE (own self-assessment side)
  // ===============================================================

  @Get('performance/reviews')
  @ApiOperation({ summary: 'Get my performance review history' })
  async getMyReviews(@CurrentUser('sub') userId: string) {
    const employee = await this.employeeService.getMyProfile(userId);
    return this.performanceReviewService.getMyReviews(
      (employee as any)._id.toString(),
    );
  }

  @Get('performance/summary')
  @ApiOperation({ summary: 'My performance summary — latest + full history' })
  async getMyPerformanceSummary(@CurrentUser('sub') userId: string) {
    const employee = await this.employeeService.getMyProfile(userId);
    return this.performanceReviewService.getMyPerformanceSummary(
      (employee as any)._id.toString(),
    );
  }

  @Get('performance/reviews/:reviewId')
  @ApiOperation({
    summary: 'Get one of my performance reviews, with live-computed scores',
  })
  async getMyReviewById(
    @Param('reviewId') reviewId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const employee = await this.employeeService.getMyProfile(userId);
    const review = await this.performanceReviewService.getReviewForEmployee(
      reviewId,
      (employee as any)._id.toString(),
    );
    return {
      review,
      scores: this.performanceReviewService.getScoredView(review),
    };
  }

  @Patch('performance/reviews/:reviewId')
  @ApiOperation({
    summary:
      'Update my self-assessment section (only while employee_in_progress)',
  })
  async updateMyReviewSection(
    @Param('reviewId') reviewId: string,
    @Body() dto: UpdateEmployeeReviewSectionDto,
    @CurrentUser('sub') userId: string,
  ) {
    const employee = await this.employeeService.getMyProfile(userId);
    return this.performanceReviewService.updateEmployeeSection(
      reviewId,
      (employee as any)._id.toString(),
      dto,
    );
  }

  @Post('performance/reviews/:reviewId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Submit my self-assessment — locks my section and notifies my manager',
  })
  async submitMyReview(
    @Param('reviewId') reviewId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const employee = await this.employeeService.getMyProfile(userId);
    return this.performanceReviewService.submitEmployeeSection(
      reviewId,
      (employee as any)._id.toString(),
    );
  }

  @Get('performance/department-history')
  @ApiOperation({
    summary:
      "HoD's read-only view of completed reviews across their whole department",
  })
  getDepartmentReviewHistory(@CurrentUser('sub') userId: string) {
    return this.performanceReviewService.getDepartmentReviewHistory(userId);
  }
  // ===============================================================
  // PERFORMANCE (manager/reviewer side - acting on a DIRECT REPORT's
  // review, not my own)
  // ===============================================================

  @Patch('reviews/:id/manager-section')
  @ApiOperation({
    summary: "Manager fills in their section of a direct report's review",
  })
  updateManagerSection(
    @Param('id') id: string,
    @Body() dto: UpdateManagerReviewSectionDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.performanceReviewService.updateManagerSection(userId, id, dto);
  }

  // CORRECTED: now accepts an optional body carrying the probation
  // recommendation reasoning. Harmless/unused for a normal,
  // non-probation review - only matters when completing a probation
  // Month 3 evaluation, where the service-side guard now REQUIRES it.
  @Patch('reviews/:id/complete')
  @ApiOperation({
    summary: "Manager completes and signs a direct report's review",
  })
  completeReview(
    @Param('id') id: string,
    @Body() dto: { probationRecommendationReasoning?: string },
    @CurrentUser('sub') userId: string,
  ) {
    return this.performanceReviewService.completeReview(
      userId,
      id,
      dto?.probationRecommendationReasoning,
    );
  }

  @Get('reviews/pending-for-my-team')
  @ApiOperation({
    summary: "Reviews awaiting THIS manager's input, across all direct reports",
  })
  getPendingReviewsForMyTeam(@CurrentUser('sub') userId: string) {
    return this.performanceReviewService.getPendingReviewsForManager(userId);
  }

  @Get('reviews/reviewed-by-me')
  @ApiOperation({
    summary: 'Reviews this manager/HoD has personally completed, with scores',
  })
  getReviewedHistory(@CurrentUser('sub') userId: string) {
    return this.performanceReviewService.getReviewedHistoryForManager(userId);
  }

  @Get('reviews/:id')
  @ApiOperation({
    summary: "Get a direct report's review, with live-computed scores",
  })
  async getReviewForReviewer(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    const review = await this.performanceReviewService.getReviewForReviewer(
      userId,
      id,
    );
    return {
      review,
      scores: this.performanceReviewService.getScoredView(review),
    };
  }
  // ===============================================================
  // PROBATION (manager-side actions on a direct report's probation
  // record) - ALL FOUR manager-facing stages, consistently, per the
  // document's real Owner column: Onboarding (manager acts, HR just
  // views), Month 1 (manager only), Month 2 (manager acts, HR just
  // views), Month 3-start (manager only - triggers the review cycle
  // above). Final Decision is HR-only and lives on the TENANT
  // controller instead, never here.
  // ===============================================================

  @Get('probation/my-team')
  @ApiOperation({
    summary: "Probation records for this manager's direct reports",
  })
  getProbationForMyTeam(@CurrentUser('sub') userId: string) {
    return this.probationService.getForMyDirectReports(userId);
  }

  @Get('probation/me')
  @ApiOperation({ summary: 'Get my own probation record, if I have one' })
  getMyOwnProbation(@CurrentUser('sub') userId: string) {
    return this.probationService.getMyProbation(userId);
  }

  @Get('probation/:employeeId')
  @ApiOperation({ summary: "Get a direct report's full probation record" })
  getProbationForMyReport(
    @Param('employeeId') employeeId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.probationService.getForMyReport(userId, employeeId);
  }

  @Patch('probation/:employeeId/onboarding')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Manager completes a direct report's probation onboarding stage",
  })
  completeProbationOnboarding(
    @Param('employeeId') employeeId: string,
    @Body() dto: { objectives: string; successMeasures?: string },
    @CurrentUser('sub') userId: string,
  ) {
    return this.probationService.completeOnboarding(employeeId, userId, dto);
  }

  @Patch('probation/:employeeId/month-1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Manager completes a direct report's Month 1 check-in",
  })
  completeMonth1(
    @Param('employeeId') employeeId: string,
    @Body() dto: { note?: string },
    @CurrentUser('sub') userId: string,
  ) {
    return this.probationService.completeMonth1(employeeId, userId, dto);
  }

  @Patch('probation/:employeeId/month-2')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Manager completes a direct report's Month 2 review — written progress note required",
  })
  completeProbationMonth2(
    @Param('employeeId') employeeId: string,
    @Body() dto: { progressNote: string },
    @CurrentUser('sub') userId: string,
  ) {
    return this.probationService.completeMonth2(employeeId, userId, dto);
  }

  @Post('probation/:employeeId/month-3/start')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      "Manager starts a direct report's Month 3 evaluation — generates a review cycle",
  })
  startProbationMonth3(
    @Param('employeeId') employeeId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.probationService.startMonth3Evaluation(employeeId, userId);
  }

  // ===============================================================
  // REQUISITION
  // ===============================================================

  @Get('requisitions/types')
  @ApiOperation({
    summary: 'Get the list of requisition types available to submit',
  })
  async getRequisitionTypes(@CurrentUser('sub') userId: string) {
    const employee = await this.employeeService.getMyProfile(userId);
    return this.requisitionTypeService.getOrCreate(
      (employee as any).tenantId.toString(),
    );
  }

  @Get('requisitions')
  @ApiOperation({ summary: 'Get my requisition history' })
  async getMyRequisitions(@CurrentUser('sub') userId: string) {
    const employee = await this.employeeService.getMyProfile(userId);
    return this.requisitionService.getMyRequisitions(
      (employee as any)._id.toString(),
    );
  }

  @Get('requisitions/:requisitionId')
  @ApiOperation({ summary: 'Get one of my requisitions' })
  async getMyRequisitionById(
    @Param('requisitionId') requisitionId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const employee = await this.employeeService.getMyProfile(userId);
    return this.requisitionService.getOneForEmployee(
      requisitionId,
      (employee as any)._id.toString(),
    );
  }

  @Post('requisitions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a new requisition request' })
  async createRequisition(
    @Body() dto: CreateRequisitionDto,
    @CurrentUser('sub') userId: string,
  ) {
    const employee = await this.employeeService.getMyProfile(userId);
    return this.requisitionService.createForEmployee(
      (employee as any).tenantId.toString(),
      (employee as any)._id.toString(),
      dto,
    );
  }

  @Get('my-team')
  @ApiOperation({ summary: 'Get my direct reports (Manager only)' })
  getMyDirectReports(@CurrentUser('sub') userId: string) {
    return this.employeeService.getDirectReports(userId);
  }

  @Get('department/tree')
  @ApiOperation({
    summary: "HoD's department — managers with their direct reports",
  })
  getDepartmentTree(@CurrentUser('sub') userId: string) {
    return this.employeeService.getDepartmentTree(userId);
  }

  // @Get('department/team')
  // @ApiOperation({ summary: "HoD's read-only view of their full department" })
  // getDepartmentTeam(@CurrentUser('sub') userId: string) {
  //   return this.employeeService.getDepartmentTeam(userId);
  // }

  // ===============================================================
  // DIRECTORY (used by pickers like "employees involved" on disputes)
  // ===============================================================
  @Get('directory')
  @ApiOperation({
    summary: 'Lightweight list of all active employees in the tenant',
  })
  getDirectory(
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.employeeService.getEmployeeDirectory(t || u);
  }

  // ===============================================================
  // DISPUTE MANAGEMENT
  // ===============================================================
  @Post('disputes')
  @ApiOperation({ summary: 'Raise a grievance (employee self-report)' })
  openCase(
    @Body() dto: OpenDisputeCaseDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.openCaseAsEmployee(t || u, u, dto);
  }

  @Get('disputes/my-cases')
  @ApiOperation({ summary: 'Get my own dispute cases' })
  getMyCases(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.getMyCases(t || u, u);
  }

  @Get('disputes/against-me')
  @ApiOperation({
    summary: 'Cases where I am named as a respondent',
  })
  getCasesAgainstMe(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.getCasesAgainstMe(t || u, u);
  }

  @Get('disputes/team-cases')
  @ApiOperation({
    summary: "Manager's read-only view — cases involving direct reports",
  })
  getTeamCases(
    @CurrentUser('sub') userId: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.getCasesForManager(t || userId, userId);
  }

  @Get('disputes/department-cases')
  @ApiOperation({
    summary: "HoD's read-only view — all cases in their department",
  })
  getDepartmentCases(
    @CurrentUser('sub') userId: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.getCasesForHod(t || userId, userId);
  }

  // ── Manager resolution actions ─────────────────────────────────
  @Get('disputes/:caseId')
  @ApiOperation({
    summary: 'Get full detail of a case involving one of your direct reports',
  })
  getCaseForManager(
    @Param('caseId') caseId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.getCaseByIdForManager(t || u, u, caseId);
  }

  @Patch('disputes/:caseId/respond')
  @ApiOperation({ summary: 'Respondent replies to a case filed against them' })
  respondToDispute(
    @Param('caseId') caseId: string,
    @Body() dto: RespondToDisputeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.respondToDispute(t || u, caseId, u, dto);
  }

  @Patch('disputes/:caseId/manager/acknowledge')
  @ApiOperation({ summary: 'Manager acknowledges a case assigned to them' })
  acknowledgeAsManager(
    @Param('caseId') caseId: string,
    @Body() dto: AcknowledgeDisputeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.acknowledgeAsManager(t || u, caseId, u, dto);
  }

  @Patch('disputes/:caseId/manager/investigate')
  @ApiOperation({ summary: 'Manager records investigation findings' })
  investigateAsManager(
    @Param('caseId') caseId: string,
    @Body() dto: InvestigateDisputeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.investigateAsManager(t || u, caseId, u, dto);
  }

  @Patch('disputes/:caseId/manager/schedule-hearing')
  @ApiOperation({ summary: 'Manager schedules a hearing' })
  scheduleHearingAsManager(
    @Param('caseId') caseId: string,
    @Body() dto: ScheduleHearingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.scheduleHearingAsManager(t || u, caseId, u, dto);
  }

  @Patch('disputes/:caseId/manager/outcome')
  @ApiOperation({ summary: 'Manager records the outcome decision' })
  recordOutcomeAsManager(
    @Param('caseId') caseId: string,
    @Body() dto: RecordOutcomeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.recordOutcomeAsManager(t || u, caseId, u, dto);
  }

  @Patch('disputes/:caseId/manager/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manager closes a case' })
  closeCaseAsManager(
    @Param('caseId') caseId: string,
    @Body() dto: CloseDisputeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.closeCaseAsManager(t || u, caseId, u, dto);
  }

  @Patch('disputes/:caseId/manager/escalate-to-tenant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Manager escalates a case to HR/tenant — unable to resolve at their level',
  })
  escalateToTenant(
    @Param('caseId') caseId: string,
    @Body('notes') notes: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.escalateToTenant(t || u, caseId, u, notes);
  }

  @Post('disputes/:caseId/appeal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'File an appeal against an outcome (within 5 working days)',
  })
  fileAppeal(
    @Param('caseId') caseId: string,
    @Body() dto: FileAppealDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.fileAppeal(t || u, caseId, u, dto);
  }

  @Post('disputes/:caseId/documents')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: disputeDocumentStorage,
      fileFilter: employeeDocumentFileFilter,
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Attach a supporting document (employee side)' })
  attachDocument(
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.attachDocument(t || u, caseId, u, file);
  }
}
