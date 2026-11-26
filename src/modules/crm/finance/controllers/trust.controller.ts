import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiConsumes,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import {
  TrustLedgerService,
  TrustMovementService,
  TrustAuditService,
  TrustInterestService,
  TrustReportService,
} from '../services';
import { TRUST_REPORT_KINDS } from '../services/trust-report.service';
import type { TrustReportKind } from '../services/trust-report.service';
import {
  CreateTrustLedgerDto,
  UpdateTrustLedgerDto,
  TrustLedgerStatusDto,
  RecordTrustDepositDto,
  RequestTrustDrawdownDto,
  AuthoriseTrustDrawdownDto,
  RejectTrustDrawdownDto,
  CreditTrustInterestDto,
  EmailTrustStatementsDto,
} from '../dtos';
import { TrustLinkType } from '../schemas';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

// Supporting evidence for trust movements — wire confirmations, bank
// statement extracts, bills, engagement letters. Stored per tenant,
// UUID-named, served back through the same /uploads static route as
// every other upload feature.
const trustDocStorage = diskStorage({
  destination: (req: any, _file, cb) => {
    const tenant = String(req.user?.tenantId || req.user?.sub || 'unknown');
    const uploadPath = join(process.cwd(), 'uploads', 'trust', tenant);
    if (!existsSync(uploadPath)) mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});
const TRUST_DOC_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];
const trustDocInterceptor = FilesInterceptor('documents', 8, {
  storage: trustDocStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) =>
    TRUST_DOC_TYPES.includes(file.mimetype)
      ? cb(null, true)
      : cb(
          new Error('Supporting documents must be a PDF, JPG or PNG file.'),
          false,
        ),
});

@ApiTags('CRM — Finance — Trust Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.FINANCE)
@Controller('finance/trust-ledgers')
export class TrustLedgerController {
  constructor(
    private readonly service: TrustLedgerService,
    private readonly audit: TrustAuditService,
    private readonly interest: TrustInterestService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'All trust ledgers, with real live-computed balances',
  })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get('integrity/:bankAccountId')
  @ApiOperation({
    summary:
      "The real no-commingling check — sum of every client ledger vs the trust bank account's own real balance, with the per-client breakdown",
  })
  getIntegrityCheck(
    @Param('bankAccountId') bankAccountId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getIntegrityCheck(t || u, bankAccountId);
  }

  @Post('reconciliation/run')
  @ApiOperation({
    summary:
      'Run the three-way reconciliation for one trust account (or all) and record the result',
  })
  async runReconciliation(
    @Body() body: { bankAccountId?: string },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.runReconciliation(
      t || u,
      body?.bankAccountId,
      await this.audit.actor(u, req.ip),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'One trust ledger' })
  getById(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a client trust ledger, linked to a real Trust-type bank account',
  })
  async create(
    @Body() dto: CreateTrustLedgerDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.create(t || u, dto, await this.audit.actor(u, req.ip));
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Change a ledger’s mandate, interest terms, limits, replenishment and portal settings',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTrustLedgerDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    const tenant = t || u;
    const accrued =
      dto.interestRate !== undefined || dto.interestTreatment !== undefined
        ? ((await this.interest.getPerformance(tenant, id)).rows[0]
            ?.uncreditedAccrued ?? 0)
        : 0;
    return this.service.update(
      tenant,
      id,
      dto,
      await this.audit.actor(u, req.ip),
      accrued,
    );
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Freeze, unfreeze or close a ledger' })
  async setStatus(
    @Param('id') id: string,
    @Body() dto: TrustLedgerStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.setStatus(
      t || u,
      id,
      dto.status,
      dto.reason,
      await this.audit.actor(u, req.ip),
    );
  }

  @Post(':id/reconcile')
  @ApiOperation({ summary: 'Monthly sign-off for a client ledger' })
  async markReconciled(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.markReconciled(
      t || u,
      id,
      await this.audit.actor(u, req.ip),
    );
  }
}

@ApiTags('CRM — Finance — Trust Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.FINANCE)
@Controller('finance/trust-movements')
export class TrustMovementController {
  constructor(
    private readonly service: TrustMovementService,
    private readonly audit: TrustAuditService,
  ) {}

  @Get()
  @ApiQuery({ name: 'ledgerId', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiOperation({ summary: 'Trust movements, filterable' })
  getAll(
    @Query('ledgerId') ledgerId: string,
    @Query('type') type: string,
    @Query('status') status: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAll(t || u, { ledgerId, type, status, from, to });
  }

  @Get('by-source')
  @ApiOperation({
    summary:
      'Every trust drawdown made against one invoice, bill, mandate or deposit',
  })
  getBySource(
    @Query('linkType') linkType: TrustLinkType,
    @Query('linkId') linkId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    if (!Object.values(TrustLinkType).includes(linkType) || !linkId) {
      throw new BadRequestException('linkType and linkId are required');
    }
    return this.service.getBySource(t || u, linkType, linkId);
  }

  @Post('deposit')
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(trustDocInterceptor)
  @ApiOperation({
    summary:
      'Record a deposit with its source-of-funds declaration and evidence — posts immediately, no authorisation needed',
  })
  async recordDeposit(
    @Body() dto: RecordTrustDepositDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.recordDeposit(
      t || u,
      dto,
      files ?? [],
      await this.audit.actor(u, req.ip),
    );
  }

  @Post('drawdown')
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(trustDocInterceptor)
  @ApiOperation({
    summary:
      "Request a drawdown against a real source document — awaits a different person's authorisation before it takes effect (or save it as a draft)",
  })
  async requestDrawdown(
    @Body() dto: RequestTrustDrawdownDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.requestDrawdown(
      t || u,
      dto,
      files ?? [],
      await this.audit.actor(u, req.ip),
    );
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit a saved draft drawdown for approval' })
  async submitDraft(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.submitDraft(
      t || u,
      id,
      await this.audit.actor(u, req.ip),
    );
  }

  @Post(':id/documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(trustDocInterceptor)
  @ApiOperation({ summary: 'Attach more supporting documents to a movement' })
  async addDocuments(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.addDocuments(
      t || u,
      id,
      files ?? [],
      await this.audit.actor(u, req.ip),
    );
  }

  @Post(':id/authorise')
  @ApiOperation({
    summary:
      'Authorise a drawdown — real dual control by signed-in user; re-checks balance and source document',
  })
  async authoriseDrawdown(
    @Param('id') id: string,
    @Body() _dto: AuthoriseTrustDrawdownDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.authoriseDrawdown(
      t || u,
      id,
      await this.audit.actor(u, req.ip),
    );
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a drawdown request, or discard a draft' })
  async rejectDrawdown(
    @Param('id') id: string,
    @Body() dto: RejectTrustDrawdownDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.rejectDrawdown(
      t || u,
      id,
      dto.reason,
      await this.audit.actor(u, req.ip),
    );
  }
}

@ApiTags('CRM — Finance — Trust Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.FINANCE)
@Controller('finance/trust-interest')
export class TrustInterestController {
  constructor(
    private readonly service: TrustInterestService,
    private readonly audit: TrustAuditService,
  ) {}

  @Get()
  @ApiQuery({ name: 'ledgerId', required: false })
  @ApiOperation({
    summary:
      'How the interest on trust money is performing — rate, accrued, credited, projected and six months of history, per ledger',
  })
  getPerformance(
    @Query('ledgerId') ledgerId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getPerformance(t || u, ledgerId);
  }

  @Post('run')
  @ApiOperation({ summary: 'Run the accrual and put the result on the record' })
  async run(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.runAccrual(t || u, await this.audit.actor(u, req.ip));
  }

  @Post('credit-all')
  @ApiOperation({ summary: 'Credit the accrued interest on every ledger' })
  async creditAll(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.creditAllDue(t || u, await this.audit.actor(u, req.ip));
  }

  @Post(':ledgerId/credit')
  @ApiOperation({ summary: 'Credit the accrued interest on one ledger' })
  async credit(
    @Param('ledgerId') ledgerId: string,
    @Body() dto: CreditTrustInterestDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.creditInterest(
      t || u,
      ledgerId,
      dto.through,
      await this.audit.actor(u, req.ip),
    );
  }
}

@ApiTags('CRM — Finance — Trust Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.FINANCE)
@Controller('finance/trust-audit')
export class TrustAuditController {
  constructor(private readonly service: TrustAuditService) {}

  @Get()
  @ApiOperation({
    summary:
      'The immutable trust audit trail (the PDF is a trust-reports download)',
  })
  list(
    @Query('action') action: string,
    @Query('ledgerId') ledgerId: string,
    @Query('q') q: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.list(t || u, { action, ledgerId, q, from, to });
  }
}

@ApiTags('CRM — Finance — Trust Accounting')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.FINANCE)
@Controller('finance/trust-reports')
export class TrustReportController {
  constructor(
    private readonly service: TrustReportService,
    private readonly audit: TrustAuditService,
  ) {}

  @Post('email-statements')
  @ApiOperation({
    summary:
      'Email each client their trust statement (PDF) at their portal contact',
  })
  async emailStatements(
    @Body() dto: EmailTrustStatementsDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
  ) {
    return this.service.emailStatements(
      t || u,
      dto,
      await this.audit.actor(u, req.ip),
    );
  }

  @Get(':kind')
  @ApiQuery({ name: 'format', required: false, enum: ['pdf', 'xlsx', 'csv'] })
  @ApiOperation({
    summary: `Download a trust report: ${TRUST_REPORT_KINDS.join(', ')}`,
  })
  async download(
    @Param('kind') kind: TrustReportKind,
    @Query('format') format: 'pdf' | 'xlsx' | 'csv',
    @Query('ledgerId') ledgerId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('type') type: string,
    @Query('status') status: string,
    @Query('action') action: string,
    @Query('q') q: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const file = await this.service.generate(
      t || u,
      kind,
      format ?? 'pdf',
      { ledgerId, from, to, type, status, action, q },
      await this.audit.actor(u, req.ip),
    );
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
    });
    res.send(file.buffer);
  }
}
