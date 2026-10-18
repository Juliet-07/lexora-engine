import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  CandidateService,
  OffboardingService,
  SuccessionPlanService,
  JobOpeningService,
} from '../services';
import {
  CreateCandidateDto,
  UpdateCandidateDto,
  MoveCandidateStageDto,
  UpdateOffboardingDto,
  UpdateFairnessChecklistDto,
  ServeNoticeDto,
  FileOffboardingAppealDto,
  RecordAppealOutcomeDto,
  WithdrawAppealDto,
  UpdateExitInterviewDto,
  CreateSuccessionPlanDto,
  UpdateSuccessionPlanDto,
  AddSuccessorDto,
  CreateJobOpeningDto,
  UpdateJobOpeningDto,
} from '../dtos';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import { resolveBusinessName } from '../../../common/utils/resolve-business-name.util';

const certificateOfServiceStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(
      process.cwd(),
      'uploads',
      'offboarding',
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

const noticeFileStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(process.cwd(), 'uploads', 'offboarding', 'notices');
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

const appealFileStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(process.cwd(), 'uploads', 'offboarding', 'appeals');
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

const certificateOfServiceFileFilter = (
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

@ApiTags('HR — Candidate Pipeline (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/recruitment/candidates')
export class CandidateController {
  constructor(
    private readonly candidateService: CandidateService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  @Get()
  @ApiQuery({ name: 'stage', required: false })
  @ApiOperation({
    summary: 'List all candidates, optionally filtered by stage',
  })
  getAll(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query('stage') stage?: string,
  ) {
    return this.candidateService.getAll(t || u, stage);
  }

  @Get('stage-counts')
  @ApiOperation({ summary: 'Get candidate counts per pipeline stage' })
  getStageCounts(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.candidateService.getStageCounts(t || u);
  }

  @Get(':candidateId')
  @ApiOperation({ summary: 'Get a single candidate' })
  getOne(
    @Param('candidateId') candidateId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.candidateService.getById(t || u, candidateId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a candidate to the pipeline (starts at "sourced")',
  })
  create(
    @Body() dto: CreateCandidateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.candidateService.create(t || u, dto);
  }

  @Patch(':candidateId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update candidate details' })
  update(
    @Param('candidateId') candidateId: string,
    @Body() dto: UpdateCandidateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.candidateService.update(t || u, candidateId, dto);
  }

  @Patch(':candidateId/stage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move a candidate to a different pipeline stage' })
  async moveStage(
    @Param('candidateId') candidateId: string,
    @Body() dto: MoveCandidateStageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const businessName = await resolveBusinessName(this.userModel, t || u);
    return this.candidateService.moveStage(
      t || u,
      candidateId,
      dto,
      businessName,
    );
  }

  @Delete(':candidateId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a candidate from the pipeline' })
  async delete(
    @Param('candidateId') candidateId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.candidateService.delete(t || u, candidateId);
    return { success: true };
  }
}

@ApiTags('HR — Offboarding (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/recruitment/offboarding')
export class OffboardingController {
  constructor(
    // See hr/services/payroll-run.service.ts — OffboardingService sits
    // in a circular import with EmployeeService, which leaves a plain
    // injection of it unresolvable at boot without forwardRef.
    @Inject(forwardRef(() => OffboardingService))
    private readonly offboardingService: OffboardingService,
  ) {}

  @Get()
  @ApiQuery({ name: 'status', required: false })
  @ApiOperation({ summary: 'List all offboarding records' })
  getAll(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query('status') status?: string,
  ) {
    return this.offboardingService.getAll(t || u, status);
  }

  @Get(':recordId')
  @ApiOperation({ summary: 'Get a single offboarding record' })
  getOne(
    @Param('recordId') recordId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.offboardingService.getById(t || u, recordId);
  }

  @Patch(':recordId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update an offboarding record' })
  update(
    @Param('recordId') recordId: string,
    @Body() dto: UpdateOffboardingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.offboardingService.update(t || u, recordId, dto);
  }

  @Post(':recordId/certificate/upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: certificateOfServiceStorage,
      fileFilter: certificateOfServiceFileFilter,
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
  @ApiOperation({
    summary: 'Upload the Certificate of Service document for this record',
  })
  uploadCertificate(
    @Param('recordId') recordId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.offboardingService.uploadCertificateOfService(
      t || u,
      recordId,
      file,
    );
  }

  @Post(':recordId/certificate/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Email the uploaded Certificate of Service to the departing employee',
  })
  sendCertificate(
    @Param('recordId') recordId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.offboardingService.sendCertificateOfService(t || u, recordId);
  }

  @Post(':recordId/certificate/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate a draft Certificate of Service PDF for this record',
  })
  generateCertificate(
    @Param('recordId') recordId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.offboardingService.generateCertificate(t || u, recordId);
  }

  // ── Step 1: Pre-termination fairness checklist ──

  @Patch(':recordId/fairness')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update the pre-termination fairness checklist' })
  updateFairness(
    @Param('recordId') recordId: string,
    @Body() dto: UpdateFairnessChecklistDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.offboardingService.updateFairnessChecklist(
      t || u,
      recordId,
      dto,
    );
  }

  // ── Step 2: Draft & serve notice ──

  @Get(':recordId/notice/pdf')
  @ApiOperation({ summary: 'Download the drafted termination notice as PDF' })
  async downloadNoticePdf(
    @Param('recordId') recordId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const buffer = await this.offboardingService.getNoticePdf(t || u, recordId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="termination-notice-${recordId}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Get(':recordId/notice/docx')
  @ApiOperation({ summary: 'Download the drafted termination notice as Word' })
  async downloadNoticeDocx(
    @Param('recordId') recordId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const buffer = await this.offboardingService.getNoticeDocx(
      t || u,
      recordId,
    );
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="termination-notice-${recordId}.docx"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Patch(':recordId/notice/serve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark the termination notice as served' })
  serveNotice(
    @Param('recordId') recordId: string,
    @Body() dto: ServeNoticeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.offboardingService.serveNotice(t || u, recordId, dto);
  }

  @Post(':recordId/notice/file')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: noticeFileStorage,
      fileFilter: certificateOfServiceFileFilter,
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
  @ApiOperation({ summary: 'Upload the signed termination notice document' })
  uploadNoticeFile(
    @Param('recordId') recordId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.offboardingService.uploadNoticeFile(t || u, recordId, file);
  }

  // ── Step 3: Appeal period (Art. 29) ──

  @Post(':recordId/appeal/file')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'File an appeal on behalf of the employee' })
  fileAppeal(
    @Param('recordId') recordId: string,
    @Body() dto: FileOffboardingAppealDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.offboardingService.fileAppeal(t || u, recordId, dto);
  }

  @Patch(':recordId/appeal/outcome')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record the outcome of an appeal hearing' })
  recordAppealOutcome(
    @Param('recordId') recordId: string,
    @Body() dto: RecordAppealOutcomeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.offboardingService.recordAppealOutcome(t || u, recordId, dto);
  }

  @Post(':recordId/appeal/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Withdraw a filed appeal' })
  withdrawAppeal(
    @Param('recordId') recordId: string,
    @Body() dto: WithdrawAppealDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.offboardingService.withdrawAppeal(t || u, recordId, dto);
  }

  @Post(':recordId/appeal/upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: appealFileStorage,
      fileFilter: certificateOfServiceFileFilter,
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'kind', enum: ['hearing_minutes', 'withdrawal_letter'] })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Upload appeal hearing minutes or a withdrawal letter',
  })
  uploadAppealFile(
    @Param('recordId') recordId: string,
    @Query('kind') kind: 'hearing_minutes' | 'withdrawal_letter',
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    if (kind !== 'hearing_minutes' && kind !== 'withdrawal_letter') {
      throw new BadRequestException(
        'kind must be "hearing_minutes" or "withdrawal_letter".',
      );
    }
    return this.offboardingService.uploadAppealFile(
      t || u,
      recordId,
      kind,
      file,
    );
  }

  // ── Step 4: Exit interview ──

  @Patch(':recordId/exit-interview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update any part of the exit interview process' })
  updateExitInterview(
    @Param('recordId') recordId: string,
    @Body() dto: UpdateExitInterviewDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.offboardingService.updateExitInterview(t || u, recordId, dto);
  }

  // ── Step 6: Final pay computation ──

  @Post(':recordId/final-pay/compute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Compute (or recompute) the final pay breakdown from real salary, leave and policy data',
  })
  computeFinalPay(
    @Param('recordId') recordId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.offboardingService.computeFinalPay(t || u, recordId);
  }

  @Post(':recordId/final-pay/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve the computed final pay and send to payroll',
  })
  approveFinalPay(
    @Param('recordId') recordId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.offboardingService.approveFinalPay(t || u, recordId);
  }
}

@ApiTags('HR — Succession Planning (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/recruitment/succession-plans')
export class SuccessionPlanController {
  constructor(private readonly planService: SuccessionPlanService) {}

  @Get()
  @ApiOperation({ summary: 'List all succession plans' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.planService.getAll(t || u);
  }

  @Get(':planId')
  @ApiOperation({ summary: 'Get a single succession plan' })
  getOne(
    @Param('planId') planId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.planService.getById(t || u, planId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new succession plan for a critical role' })
  create(
    @Body() dto: CreateSuccessionPlanDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.planService.create(t || u, dto);
  }

  @Patch(':planId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a succession plan' })
  update(
    @Param('planId') planId: string,
    @Body() dto: UpdateSuccessionPlanDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.planService.update(t || u, planId, dto);
  }

  @Delete(':planId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a succession plan' })
  async delete(
    @Param('planId') planId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.planService.delete(t || u, planId);
    return { success: true };
  }

  @Post(':planId/successors')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a successor to a plan' })
  addSuccessor(
    @Param('planId') planId: string,
    @Body() dto: AddSuccessorDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.planService.addSuccessor(t || u, planId, dto);
  }

  @Delete(':planId/successors/:employeeId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a successor from a plan' })
  removeSuccessor(
    @Param('planId') planId: string,
    @Param('employeeId') employeeId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.planService.removeSuccessor(t || u, planId, employeeId);
  }
}

@ApiTags('HR — Job Openings (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@Controller('hr/job-openings')
export class JobOpeningController {
  constructor(private readonly jobOpeningService: JobOpeningService) {}

  @Post()
  @ApiOperation({
    summary:
      'Create a job opening — all active employees are emailed a vacancy notice',
  })
  create(
    @Body() dto: CreateJobOpeningDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.jobOpeningService.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all job openings' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.jobOpeningService.getAll(t || u);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update a job opening — setting status to Filled emails all active employees',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateJobOpeningDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.jobOpeningService.update(t || u, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a job opening' })
  async delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.jobOpeningService.delete(t || u, id);
    return { success: true };
  }
}
