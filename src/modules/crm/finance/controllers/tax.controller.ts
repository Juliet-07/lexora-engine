import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { CreateTaxObligationDto, UpdateEbmReceiptDto } from '../dtos';
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

@ApiTags('CRM — Finance — Tax')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/tax-obligations')
export class TaxObligationController {
  constructor(private readonly service: TaxObligationService) {}

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

  @Post(':id/file')
  @ApiOperation({ summary: 'Mark filed' })
  file(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.file(t || u, id);
  }
}

@ApiTags('CRM — Finance — Tax')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/vat')
export class VatController {
  constructor(private readonly service: VatService) {}

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
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/payroll-tax')
export class PayrollTaxController {
  constructor(private readonly service: PayrollTaxService) {}

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
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/cit')
export class CitController {
  constructor(private readonly service: CitService) {}

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
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/wht')
export class WhtController {
  constructor(private readonly service: WhtService) {}

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
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/ebm')
export class EbmController {
  constructor(private readonly service: EbmService) {}

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
}
