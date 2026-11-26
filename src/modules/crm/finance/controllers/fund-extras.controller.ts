import {
  applyDecorators,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import {
  CapitalCommitmentService,
  CapitalCallService,
} from '../services/fund.service';
import { FundStatementService } from '../services/fund-statement.service';
import { FundNoticeService } from '../services/fund-notice.service';
import { FundReportService } from '../services/fund-report.service';
import { FundSideLetterService } from '../services/fund-side-letter.service';
import { FundDocumentService } from '../services/fund-document.service';
import { TrustAuditService } from '../services/trust-support.service';
import {
  CreateCapitalCallDto,
  GenerateLpReportDto,
  GenerateStatementsDto,
  CreateSideLetterDto,
  DraftFundDocumentDto,
  RecordMfnElectionDto,
  SendCallNoticesDto,
  SendFundReportDto,
  SetProvisionComplianceDto,
  UpdateCapitalCommitmentDto,
  UpdateFundDocumentDto,
  UpdateSideLetterDto,
  UploadFundDocumentDto,
  UploadFundReportDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

// One multer setup per feature: tenant-scoped folder, UUID file names,
// served back through the shared /uploads static route.
const uploadOf = (folder: string, types: RegExp, maxMb: number) =>
  FileInterceptor('file', {
    storage: diskStorage({
      destination: (req: any, _file, cb) => {
        const tenant = String(req.user?.tenantId || req.user?.sub || 'unknown');
        const dir = join(process.cwd(), 'uploads', folder, tenant);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) =>
        cb(null, `${uuidv4()}${extname(file.originalname)}`),
    }),
    limits: { fileSize: maxMb * 1024 * 1024 },
    fileFilter: (_req: any, file: Express.Multer.File, cb: any) =>
      types.test(extname(file.originalname).toLowerCase())
        ? cb(null, true)
        : cb(new Error('That file type is not supported'), false),
  });

const DOC_TYPES = /\.(pdf|docx?|xlsx?|pptx?|png|jpe?g)$/;
const vaultUpload = uploadOf('fund-documents', DOC_TYPES, 50);
const reportUpload = uploadOf('fund-reports', DOC_TYPES, 50);
const sideLetterUpload = uploadOf('fund-side-letters', DOC_TYPES, 25);

const send = (
  res: Response,
  f: { buffer: Buffer; filename: string; mimeType: string },
) => {
  res.set({
    'Content-Type': f.mimeType,
    'Content-Disposition': `attachment; filename="${f.filename.replace(/"/g, '')}"`,
  });
  res.send(f.buffer);
};

const Guarded = () =>
  applyDecorators(
    ApiBearerAuth(),
    UserTypes(UserType.TENANT, UserType.EMPLOYEE),
    RequiresModule(PlatformModuleKey.FINANCE),
  );

// ── LP commitments — editing ────────────────────────────────────

@ApiTags('CRM — Finance — Fund Accounting')
@Guarded()
@Controller('finance/funds/:fundId/commitments')
export class CapitalCommitmentEditController {
  constructor(private readonly service: CapitalCommitmentService) {}

  @Patch(':commitmentId')
  @ApiOperation({
    summary: "Edit an LP's contact, AML/KYC and subscription details",
  })
  update(
    @Param('fundId') fundId: string,
    @Param('commitmentId') commitmentId: string,
    @Body() dto: UpdateCapitalCommitmentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.update(t || u, fundId, commitmentId, dto);
  }
}

// ── Capital calls — drafts and notices ──────────────────────────

@ApiTags('CRM — Finance — Fund Accounting')
@Guarded()
@Controller('finance/funds/:fundId/capital-calls')
export class CapitalCallNoticeController {
  constructor(
    private readonly calls: CapitalCallService,
    private readonly notices: FundNoticeService,
    private readonly audit: TrustAuditService,
  ) {}

  @Patch(':callId')
  @ApiOperation({ summary: 'Edit a draft capital call' })
  updateDraft(
    @Param('fundId') fundId: string,
    @Param('callId') callId: string,
    @Body() dto: CreateCapitalCallDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.calls.updateDraft(t || u, fundId, callId, dto);
  }

  @Post(':callId/issue')
  @ApiOperation({
    summary: 'Issue a draft call — freezes the pro-rata split across the LPs',
  })
  async issue(
    @Param('fundId') fundId: string,
    @Param('callId') callId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.calls.issueDraft(
      t || u,
      fundId,
      callId,
      (await this.audit.actor(u, req.ip)).name,
    );
  }

  @Delete(':callId')
  @ApiOperation({
    summary: 'Delete a draft call (an issued call cannot be deleted)',
  })
  deleteDraft(
    @Param('fundId') fundId: string,
    @Param('callId') callId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.calls.deleteDraft(t || u, fundId, callId);
  }

  @Get(':callId/notices')
  @ApiOperation({ summary: 'One notice per LP, as it would be sent' })
  preview(
    @Param('fundId') fundId: string,
    @Param('callId') callId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.notices.preview(t || u, fundId, callId);
  }

  @Get(':callId/notices/pdf')
  @ApiOperation({ summary: "The notices as a PDF — one LP's, or every LP's" })
  async pdf(
    @Param('fundId') fundId: string,
    @Param('callId') callId: string,
    @Query('commitmentId') commitmentId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const f = await this.notices.pdf(t || u, fundId, callId, commitmentId);
    send(res, { ...f, mimeType: 'application/pdf' });
  }

  @Post(':callId/notices/send')
  @ApiOperation({
    summary: 'Send the notices to the LPs now, or schedule them for later',
  })
  async sendNotices(
    @Param('fundId') fundId: string,
    @Param('callId') callId: string,
    @Body() dto: SendCallNoticesDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.notices.send(
      t || u,
      fundId,
      callId,
      dto,
      (await this.audit.actor(u, req.ip)).name,
    );
  }
}

// ── Capital account statements ──────────────────────────────────

@ApiTags('CRM — Finance — Fund Accounting')
@Guarded()
@Controller('finance/funds/:fundId/statements')
export class FundStatementController {
  constructor(
    private readonly service: FundStatementService,
    private readonly audit: TrustAuditService,
  ) {}

  @Get('commitments/:commitmentId')
  @ApiOperation({ summary: "One LP's capital account statement" })
  get(
    @Param('fundId') fundId: string,
    @Param('commitmentId') commitmentId: string,
    @Query('period') period: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('comparative') comparative: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getStatement(t || u, fundId, commitmentId, {
      period,
      from,
      to,
      comparative: comparative === 'true',
    });
  }

  @Get('commitments/:commitmentId/pdf')
  @ApiOperation({ summary: "One LP's capital account statement as a PDF" })
  async pdf(
    @Param('fundId') fundId: string,
    @Param('commitmentId') commitmentId: string,
    @Query('period') period: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const f = await this.service.statementPdf(t || u, fundId, commitmentId, {
      period,
      from,
      to,
    });
    send(res, { ...f, mimeType: 'application/pdf' });
  }

  @Post('generate')
  @ApiOperation({
    summary:
      'Generate statements for selected LPs (PDF / XLSX), optionally delivering them',
  })
  async generate(
    @Param('fundId') fundId: string,
    @Body() dto: GenerateStatementsDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.generate(
      t || u,
      fundId,
      dto,
      (await this.audit.actor(u, req.ip)).name,
    );
  }
}

// ── LP report library ───────────────────────────────────────────

@ApiTags('CRM — Finance — Fund Accounting')
@Guarded()
@Controller('finance/funds/:fundId/lp-reports')
export class FundReportController {
  constructor(
    private readonly service: FundReportService,
    private readonly audit: TrustAuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Reports generated or uploaded for LPs' })
  list(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.list(t || u, fundId);
  }

  @Post('generate')
  @ApiOperation({ summary: 'Generate an LP report' })
  async generate(
    @Param('fundId') fundId: string,
    @Body() dto: GenerateLpReportDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.generate(
      t || u,
      fundId,
      dto,
      (await this.audit.actor(u, req.ip)).name,
    );
  }

  @Post('upload')
  @UseInterceptors(reportUpload)
  @ApiOperation({
    summary:
      'Upload a report prepared elsewhere (audited accounts, tax reports)',
  })
  async upload(
    @Param('fundId') fundId: string,
    @Body() dto: UploadFundReportDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.upload(
      t || u,
      fundId,
      dto,
      file,
      (await this.audit.actor(u, req.ip)).name,
    );
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send a report in the library to LPs' })
  sendReport(
    @Param('fundId') fundId: string,
    @Param('id') id: string,
    @Body() dto: SendFundReportDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.send(t || u, fundId, id, dto);
  }

  @Get(':id/download')
  async download(
    @Param('fundId') fundId: string,
    @Param('id') id: string,
    @Query('file') file: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    send(
      res,
      await this.service.download(t || u, fundId, id, Number(file) || 0),
    );
  }

  @Delete(':id')
  remove(
    @Param('fundId') fundId: string,
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.remove(t || u, fundId, id);
  }
}

// ── Side letters ────────────────────────────────────────────────

@ApiTags('CRM — Finance — Fund Accounting')
@Guarded()
@Controller('finance/funds/:fundId/side-letters')
export class FundSideLetterController {
  constructor(private readonly service: FundSideLetterService) {}

  @Get()
  @ApiOperation({
    summary:
      'Side letters with provisions, MFN offers and the LPAC seats they guarantee',
  })
  list(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.list(t || u, fundId);
  }

  @Post()
  create(
    @Param('fundId') fundId: string,
    @Body() dto: CreateSideLetterDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, fundId, dto);
  }

  @Patch(':id')
  update(
    @Param('fundId') fundId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSideLetterDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.update(t || u, fundId, id, dto);
  }

  @Post(':id/execute')
  @ApiOperation({
    summary:
      'Mark executed — applies fee terms and opens MFN elections for other LPs',
  })
  execute(
    @Param('fundId') fundId: string,
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.execute(t || u, fundId, id);
  }

  @Post(':id/provisions/:provisionId/compliance')
  setCompliance(
    @Param('fundId') fundId: string,
    @Param('id') id: string,
    @Param('provisionId') provisionId: string,
    @Body() dto: SetProvisionComplianceDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setCompliance(t || u, fundId, id, provisionId, dto);
  }

  @Post(':id/mfn/:flagId/:commitmentId')
  @ApiOperation({ summary: 'Record an LP electing (or declining) an MFN term' })
  elect(
    @Param('fundId') fundId: string,
    @Param('id') id: string,
    @Param('flagId') flagId: string,
    @Param('commitmentId') commitmentId: string,
    @Body() dto: RecordMfnElectionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordElection(
      t || u,
      fundId,
      id,
      flagId,
      commitmentId,
      dto,
    );
  }

  @Post(':id/document')
  @UseInterceptors(sideLetterUpload)
  @ApiOperation({ summary: 'Attach the side letter file (draft or signed)' })
  attach(
    @Param('fundId') fundId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.attachDocument(t || u, fundId, id, file);
  }

  @Delete(':id')
  remove(
    @Param('fundId') fundId: string,
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.remove(t || u, fundId, id);
  }
}

// ── Document vault ──────────────────────────────────────────────

@ApiTags('CRM — Finance — Fund Accounting')
@Guarded()
@Controller('finance/funds/:fundId/documents')
export class FundDocumentController {
  constructor(
    private readonly service: FundDocumentService,
    private readonly audit: TrustAuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'The fund document vault, grouped' })
  list(
    @Param('fundId') fundId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.list(t || u, fundId);
  }

  @Get('meta')
  @ApiOperation({
    summary: 'Categories, template library and merge fields for the dialogs',
  })
  meta(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.meta(t || u);
  }

  @Get('fields')
  @ApiOperation({
    summary:
      'Merge-field values for an LP / call / distribution (editor panel)',
  })
  fields(
    @Param('fundId') fundId: string,
    @Query('commitmentId') commitmentId: string,
    @Query('callId') callId: string,
    @Query('distributionId') distributionId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.buildFields(t || u, fundId, {
      commitmentId,
      callId,
      distributionId,
    });
  }

  @Post()
  @UseInterceptors(vaultUpload)
  @ApiOperation({ summary: 'Upload a document to the vault' })
  async upload(
    @Param('fundId') fundId: string,
    @Body() dto: UploadFundDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.upload(
      t || u,
      fundId,
      dto,
      file,
      (await this.audit.actor(u, req.ip)).name,
    );
  }

  @Post('draft')
  @ApiOperation({ summary: 'Draft a document from a template (or blank)' })
  async draft(
    @Param('fundId') fundId: string,
    @Body() dto: DraftFundDocumentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.draft(
      t || u,
      fundId,
      dto,
      (await this.audit.actor(u, req.ip)).name,
    );
  }

  @Get(':id')
  getOne(
    @Param('fundId') fundId: string,
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getOne(t || u, fundId, id);
  }

  @Patch(':id')
  update(
    @Param('fundId') fundId: string,
    @Param('id') id: string,
    @Body()
    dto: UpdateFundDocumentDto & { mergeValues?: Record<string, string> },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.update(t || u, fundId, id, dto);
  }

  @Get(':id/download')
  async download(
    @Param('fundId') fundId: string,
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    send(res, await this.service.download(t || u, fundId, id));
  }

  @Delete(':id')
  remove(
    @Param('fundId') fundId: string,
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.remove(t || u, fundId, id);
  }
}
