import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import {
  InvoiceService,
  PaymentService,
  PaymentPlanService,
} from '../services';
import {
  CreateInvoiceDto,
  CreateInvoiceFromWipDto,
  RecordPaymentDto,
  AddDunningEventDto,
  WriteOffInvoiceDto,
  CreatePaymentPlanDto,
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
