import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import {
  FileInterceptor,
  FileFieldsInterceptor,
} from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import {
  WhtService,
  VatService,
  PayrollTaxService,
  CitService,
  EbmService,
  TaxObligationService,
} from '../services';
import { RecordFilingFiles } from '../services/tax.service';
import {
  CreateTaxObligationDto,
  RecordTaxFilingDto,
  RejectTaxFilingDto,
  UpdateEbmReceiptDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

// Same real disk-storage convention used across the app's other
// upload features — /uploads/{feature}/ with a UUID filename, served
// back via main.ts's existing /uploads static route.
const ebmReceiptStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(process.cwd(), 'uploads', 'ebm-receipts');
    if (!existsSync(uploadPath)) mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});
const ebmReceiptFileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: any,
) => {
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        'Only PDF or image files (JPEG, PNG, WEBP) are accepted for an EBM receipt.',
      ),
      false,
    );
  }
};

// Filed returns and proofs of payment — stored per tenant, UUID-named,
// served back through the same /uploads static route as other uploads.
const taxFilingStorage = diskStorage({
  destination: (req: any, _file, cb) => {
    const tenant = String(req.user?.tenantId || req.user?.sub || 'unknown');
    const uploadPath = join(process.cwd(), 'uploads', 'tax-filings', tenant);
    if (!existsSync(uploadPath)) mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});
const RETURN_TYPES = [
  'application/pdf',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const POP_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const taxFilingFileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const ok =
    file.fieldname === 'returnFile'
      ? RETURN_TYPES.includes(file.mimetype)
      : POP_TYPES.includes(file.mimetype);
  if (ok) return cb(null, true);
  cb(
    new Error(
      file.fieldname === 'returnFile'
        ? 'The tax return has to be a PDF, XLSX or CSV file.'
        : 'The proof of payment has to be a PDF, PNG or JPG file.',
    ),
    false,
  );
};

@ApiTags('CRM — Finance — Tax')
@ApiBearerAuth()
// An employee with the Finance role can prepare tax obligations and
// record filings; the account owner has the final say (see
// TaxObligationService#approveFiling).
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.FINANCE)
@Controller('finance/tax-obligations')
export class TaxObligationController {
  constructor(
    private readonly service: TaxObligationService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  private async actorName(userId: string): Promise<string> {
    const u = await this.userModel
      .findById(userId)
      .select('firstName lastName tenantProfile.businessName')
      .lean();
    return (
      [u?.firstName, u?.lastName].filter(Boolean).join(' ') ||
      u?.tenantProfile?.businessName ||
      'A team member'
    );
  }

  @Post()
  @ApiOperation({ summary: 'Add an obligation to the tax calendar' })
  create(
    @Body() dto: CreateTaxObligationDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'The tax calendar' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get('responsible-options')
  @ApiOperation({
    summary: 'The people an obligation can be assigned to (owner + employees)',
  })
  responsibleOptions(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getResponsibleOptions(t || u);
  }

  @Post(':id/record-filing')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'returnFile', maxCount: 1 },
        { name: 'popFile', maxCount: 1 },
      ],
      {
        storage: taxFilingStorage,
        fileFilter: taxFilingFileFilter,
        limits: { fileSize: 25 * 1024 * 1024 },
      },
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['filedOn'],
      properties: {
        filedOn: { type: 'string', format: 'date' },
        amountPaid: { type: 'number' },
        notes: { type: 'string' },
        returnFile: { type: 'string', format: 'binary' },
        popFile: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary:
      'Record the filing — return + proof of payment. The owner files it outright; anyone else sends it to the owner for approval.',
  })
  async recordFiling(
    @Param('id') id: string,
    @Body() dto: RecordTaxFilingDto,
    @UploadedFiles() files: RecordFilingFiles,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('userType') userType: string,
  ) {
    return this.service.recordFiling(t || u, id, dto, files ?? {}, {
      id: u,
      name: await this.actorName(u),
      userType,
    });
  }

  @Post(':id/approve-filing')
  @ApiOperation({
    summary: 'Final approval of a recorded filing — the account owner only',
  })
  async approveFiling(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('userType') userType: string,
  ) {
    return this.service.approveFiling(t || u, id, {
      id: u,
      name: await this.actorName(u),
      userType,
    });
  }

  @Post(':id/reject-filing')
  @ApiOperation({
    summary: 'Send a recorded filing back with a reason — the owner only',
  })
  async rejectFiling(
    @Param('id') id: string,
    @Body() dto: RejectTaxFilingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('userType') userType: string,
  ) {
    return this.service.rejectFiling(t || u, id, dto.reason, {
      id: u,
      name: await this.actorName(u),
      userType,
    });
  }
}

@ApiTags('CRM — Finance — Tax')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.FINANCE)
@Controller('finance/vat')
export class VatController {
  constructor(private readonly service: VatService) {}

  // Read-only for finance staff too — it is the same Tax page.
  @UserTypes(UserType.TENANT, UserType.EMPLOYEE)
  @RequiresModule(PlatformModuleKey.FINANCE)
  @Get()
  @ApiQuery({
    name: 'period',
    required: false,
    description: 'YYYY-MM, defaults to current month',
  })
  @ApiQuery({ name: 'displayCurrency', required: false })
  @ApiOperation({ summary: 'Real output/input VAT return for a period' })
  getReturn(
    @Query('period') period: string | undefined,
    @Query('displayCurrency') displayCurrency: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getReturn(t || u, period, displayCurrency);
  }
}

@ApiTags('CRM — Finance — Tax')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.FINANCE)
@Controller('finance/payroll-tax')
export class PayrollTaxController {
  constructor(private readonly service: PayrollTaxService) {}

  // Read-only for finance staff too — it is the same Tax page.
  @UserTypes(UserType.TENANT, UserType.EMPLOYEE)
  @RequiresModule(PlatformModuleKey.FINANCE)
  @Get()
  @ApiOperation({
    summary: 'Real PAYE/RSSB remittances, sourced from actual HR payroll runs',
  })
  getRemittances(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getRemittances(t || u);
  }
}

@ApiTags('CRM — Finance — Tax')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.FINANCE)
@Controller('finance/cit')
export class CitController {
  constructor(private readonly service: CitService) {}

  // Read-only for finance staff too — it is the same Tax page.
  @UserTypes(UserType.TENANT, UserType.EMPLOYEE)
  @RequiresModule(PlatformModuleKey.FINANCE)
  @Get()
  @ApiQuery({ name: 'displayCurrency', required: false })
  @ApiOperation({
    summary: 'Provisional CIT at 28%, computed from real revenue/expenses',
  })
  getProvision(
    @Query('displayCurrency') displayCurrency: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getProvision(t || u, displayCurrency);
  }
}

@ApiTags('CRM — Finance — Tax')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.FINANCE)
@Controller('finance/wht')
export class WhtController {
  constructor(private readonly service: WhtService) {}

  // Read-only for finance staff too — it is the same Tax page.
  @UserTypes(UserType.TENANT, UserType.EMPLOYEE)
  @RequiresModule(PlatformModuleKey.FINANCE)
  @Get()
  @ApiOperation({
    summary:
      'The WHT register — single source of truth, populated automatically',
  })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }
}

@ApiTags('CRM — Finance — Tax')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.FINANCE)
@Controller('finance/ebm')
export class EbmController {
  constructor(private readonly service: EbmService) {}

  // Read-only for finance staff too — it is the same Tax page.
  @UserTypes(UserType.TENANT, UserType.EMPLOYEE)
  @RequiresModule(PlatformModuleKey.FINANCE)
  @Get()
  @ApiOperation({ summary: 'EBM sync status for real invoices' })
  getStatus(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getStatus(t || u);
  }

  @Post(':invoiceId/resync')
  @ApiOperation({ summary: 'Re-sync a document to EBM' })
  resync(
    @Param('invoiceId') invoiceId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.resync(t || u, invoiceId);
  }

  @Post(':invoiceId/receipt')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: ebmReceiptStorage,
      fileFilter: ebmReceiptFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['receiptNumber'],
      properties: {
        receiptNumber: { type: 'string' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary:
      'Record the real EBM receipt number (never auto-generated) and optionally attach a photo/scan of the actual receipt',
  })
  updateReceipt(
    @Param('invoiceId') invoiceId: string,
    @Body() dto: UpdateEbmReceiptDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateReceipt(
      t || u,
      invoiceId,
      dto.receiptNumber,
      file,
    );
  }

  @Delete(':invoiceId/receipt')
  @ApiOperation({
    summary:
      'Clear a manually-recorded EBM receipt (number + attached file) and revert the document back to Pending sync status',
  })
  deleteReceipt(
    @Param('invoiceId') invoiceId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.deleteReceipt(t || u, invoiceId);
  }
}
