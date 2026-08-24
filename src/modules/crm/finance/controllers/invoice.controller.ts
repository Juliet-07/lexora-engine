import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Res,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { Response } from 'express';
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
  InvoiceService,
  PaymentService,
  PaymentPlanService,
  ClientInvoiceService,
  RemittanceAccountService,
} from '../services';
import {
  CreateInvoiceDto,
  CreateInvoiceFromWipDto,
  RecordPaymentDto,
  AddDunningEventDto,
  WriteOffInvoiceDto,
  CreatePaymentPlanDto,
  CreateRemittanceAccountDto,
  SetClientInvoiceStatusDto,
} from '../dtos';
import { InvoiceStage } from '../schemas';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Finance — Invoicing')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/invoices')
export class InvoiceController {
  constructor(
    private readonly service: InvoiceService,
    private readonly paymentService: PaymentService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a manual draft invoice' })
  create(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Post('from-wip')
  @ApiOperation({
    summary: 'Create a draft invoice from selected real WIP entries',
  })
  createFromWip(
    @Body() dto: CreateInvoiceFromWipDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.createFromWip(t || u, dto);
  }

  @Get()
  @ApiQuery({ name: 'mandateId', required: false })
  @ApiQuery({ name: 'clientUserId', required: false })
  @ApiQuery({ name: 'stage', required: false, enum: InvoiceStage })
  @ApiOperation({ summary: 'All invoices, optionally filtered' })
  getAll(
    @Query('mandateId') mandateId: string | undefined,
    @Query('clientUserId') clientUserId: string | undefined,
    @Query('stage') stage: InvoiceStage | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAll(t || u, { mandateId, clientUserId, stage });
  }

  @Get(':id')
  @ApiOperation({ summary: 'One invoice' })
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Draft → In Review' })
  submit(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.submitForReview(t || u, id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'In Review → Approved' })
  approve(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.approve(t || u, id);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Approved → Sent (delivered to client)' })
  send(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.send(t || u, id);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Record a payment against this invoice' })
  recordPayment(
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.paymentService.record(t || u, id, dto);
  }

  @Post(':id/write-off')
  @ApiOperation({ summary: 'Write off as bad debt after review' })
  writeOff(
    @Param('id') id: string,
    @Body() dto: WriteOffInvoiceDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.writeOff(t || u, id, dto.reason, dto.approvedBy);
  }

  @Post(':id/dunning-events')
  @ApiOperation({
    summary: 'Log a credit control action (call, reminder, escalation, etc.)',
  })
  addDunningEvent(
    @Param('id') id: string,
    @Body() dto: AddDunningEventDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addDunningEvent(t || u, id, dto);
  }

  @Post(':id/dunning-pause')
  @ApiOperation({ summary: 'Pause or resume dunning' })
  setDunningPaused(
    @Param('id') id: string,
    @Body() body: { paused: boolean },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setDunningPaused(t || u, id, body.paused);
  }

  @Post(':id/dismiss-client-action')
  @ApiOperation({
    summary:
      "Clear a client's claim without recording a payment — it was premature, mistaken, or resolved another way",
  })
  dismissClientAction(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.dismissClientAction(t || u, id);
  }
}

@ApiTags('CRM — Finance — Invoicing')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/payments')
export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  @Get()
  @ApiQuery({ name: 'invoiceId', required: false })
  @ApiOperation({
    summary: 'All recorded payments, optionally filtered by invoice',
  })
  getAll(
    @Query('invoiceId') invoiceId: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAll(t || u, invoiceId);
  }
}

@ApiTags('CRM — Finance — Invoicing')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/payment-plans')
export class PaymentPlanController {
  constructor(private readonly service: PaymentPlanService) {}

  @Post()
  @ApiOperation({
    summary: 'Agree a payment plan for an overdue invoice — pauses dunning',
  })
  create(
    @Body() dto: CreatePaymentPlanDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'All payment plans' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Post(':planId/instalments/:instalmentId/paid')
  @ApiOperation({
    summary: 'Mark an instalment paid — applies it to the invoice balance',
  })
  markInstalmentPaid(
    @Param('planId') planId: string,
    @Param('instalmentId') instalmentId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.markInstalmentPaid(t || u, planId, instalmentId);
  }
}

// Same real disk-storage convention used across the app's other
// upload features — /uploads/{feature}/ with a UUID filename,
// served back via main.ts's existing /uploads static route.
const proofOfPaymentStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(process.cwd(), 'uploads', 'proof-of-payment');
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
const proofOfPaymentFileFilter = (
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
        'Only PDF or image files (JPEG, PNG, WEBP) are accepted for proof of payment.',
      ),
      false,
    );
  }
};

// ── Client-facing — the tenant's own client viewing invoices
// issued to them. Same crm/client-* URL convention client-projects,
// client-tickets and client-kb-articles already use, so the client
// app's existing auth/routing setup covers this without changes.
@ApiTags('CRM — Client Invoices')
@ApiBearerAuth()
@UserTypes(UserType.CLIENT)
@Controller('crm/client-invoices')
export class ClientInvoiceController {
  constructor(private readonly service: ClientInvoiceService) {}

  @Get()
  @ApiOperation({
    summary: 'My own invoices — only stages the client should see',
  })
  getMyInvoices(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMyInvoices(t || u, u);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      "One of my own invoices, with the tenant's remittance details — marks it opened, which the tenant's credit control relies on",
  })
  getMyInvoice(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMyInvoice(t || u, u, id);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download as PDF — includes real payment details' })
  async downloadPdf(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const { buffer, ref } = await this.service.downloadMyInvoicePdf(
      t || u,
      u,
      id,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${ref}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Post(':id/status')
  @UseInterceptors(
    FileInterceptor('proofOfPayment', {
      storage: proofOfPaymentStorage,
      fileFilter: proofOfPaymentFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['Paid', 'Cancelled'] },
        note: { type: 'string' },
        proofOfPayment: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary:
      "Mark the invoice Paid or Cancelled from the client's side, optionally attaching proof of payment — a claim the tenant sees and confirms, not a real payment by itself",
  })
  markStatus(
    @Param('id') id: string,
    @Body() dto: SetClientInvoiceStatusDto,
    @UploadedFile() proofOfPayment: Express.Multer.File | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.markStatus(t || u, u, id, dto, proofOfPayment);
  }
}

// ── Remittance accounts — the tenant's own real bank details for
// receiving client payments. Tenant-facing CRUD, surfaced read-only
// to clients via ClientInvoiceService.getMyInvoice and on the PDF. ──
@ApiTags('CRM — Finance — Remittance Accounts')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/remittance-accounts')
export class RemittanceAccountController {
  constructor(private readonly service: RemittanceAccountService) {}

  @Get()
  @ApiOperation({ summary: 'All remittance accounts' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Post()
  @ApiOperation({ summary: 'Add a remittance account' })
  create(
    @Body() dto: CreateRemittanceAccountDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a remittance account' })
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateRemittanceAccountDto>,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.update(t || u, id, dto);
  }

  @Post(':id/active')
  @ApiOperation({
    summary:
      'Activate or deactivate — deactivated accounts stop showing on client invoices and PDFs',
  })
  setActive(
    @Param('id') id: string,
    @Body() body: { active: boolean },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setActive(t || u, id, body.active);
  }
}
