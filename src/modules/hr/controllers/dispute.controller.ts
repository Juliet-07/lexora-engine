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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { DisputeService } from '../services';
import {
  OpenDisputeCaseDto,
  AcknowledgeDisputeDto,
  InvestigateDisputeDto,
  ScheduleHearingDto,
  RecordOutcomeDto,
  EscalateExternalDto,
  ResolveAppealDto,
  CloseDisputeDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { FileInterceptor } from '@nestjs/platform-express';

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

const disputeDocumentFileFilter = (
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
// =================================================================
// HR / TENANT CONTROLLER
// =================================================================

@ApiTags('HR — Disputes (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@Controller('hr/disputes')
export class DisputeTenantController {
  constructor(private readonly disputeService: DisputeService) {}

  @Post()
  @ApiOperation({ summary: 'Open a new dispute case (HR/Manager)' })
  openCase(
    @Body() dto: OpenDisputeCaseDto,
    @Body('complainantEmployeeId') complainantEmployeeId: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.openCase(
      t || u,
      u,
      complainantEmployeeId ?? null,
      dto,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all dispute cases with optional filters' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'stage', required: false })
  @ApiQuery({ name: 'track', required: false })
  getAllCases(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('stage') stage?: string,
    @Query('track') track?: string,
  ) {
    return this.disputeService.getAllCases(t || u, {
      status,
      type,
      stage,
      track,
    });
  }

  @Get('employee/:employeeId')
  @ApiOperation({
    summary: 'All dispute cases involving one employee (filed by or against)',
  })
  getCasesForEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.disputeService.getCasesForEmployee(t || u, employeeId);
  }

  @Get(':caseId')
  @ApiOperation({ summary: 'Get full detail of a dispute case' })
  getCaseById(
    @Param('caseId') caseId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.getCaseById(t || u, caseId);
  }

  @Patch(':caseId/acknowledge')
  @ApiOperation({ summary: 'Acknowledge case — issue written acknowledgment' })
  acknowledge(
    @Param('caseId') caseId: string,
    @Body() dto: AcknowledgeDisputeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.acknowledgeAsTenant(t || u, caseId, u, dto);
  }

  @Patch(':caseId/investigate')
  @ApiOperation({ summary: 'Record investigation findings' })
  investigate(
    @Param('caseId') caseId: string,
    @Body() dto: InvestigateDisputeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.investigateAsTenant(t || u, caseId, u, dto);
  }

  @Patch(':caseId/schedule-hearing')
  @ApiOperation({ summary: 'Schedule the disciplinary/grievance hearing' })
  scheduleHearing(
    @Param('caseId') caseId: string,
    @Body() dto: ScheduleHearingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.scheduleHearingAsTenant(t || u, caseId, u, dto);
  }

  @Patch(':caseId/outcome')
  @ApiOperation({ summary: 'Record the outcome decision' })
  recordOutcome(
    @Param('caseId') caseId: string,
    @Body() dto: RecordOutcomeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.recordOutcomeAsTenant(t || u, caseId, u, dto);
  }

  @Patch(':caseId/resolve-appeal')
  @ApiOperation({ summary: "Review and resolve an employee's appeal" })
  resolveAppeal(
    @Param('caseId') caseId: string,
    @Body() dto: ResolveAppealDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.resolveAppealAsTenant(t || u, caseId, u, dto);
  }

  @Patch(':caseId/escalate-external')
  @ApiOperation({
    summary: 'Escalate to external track (Labour Inspectorate / Court)',
  })
  escalateExternal(
    @Param('caseId') caseId: string,
    @Body() dto: EscalateExternalDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.escalateExternalAsTenant(t || u, caseId, u, dto);
  }

  @Patch(':caseId/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close a dispute case' })
  closeCase(
    @Param('caseId') caseId: string,
    @Body() dto: CloseDisputeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.closeCaseAsTenant(t || u, caseId, u, dto);
  }

  @Post(':caseId/documents')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: disputeDocumentStorage,
      fileFilter: disputeDocumentFileFilter,
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
  @ApiOperation({ summary: 'Attach a supporting document to a case' })
  attachDocument(
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.disputeService.attachDocument(t || u, caseId, u, file);
  }
}
