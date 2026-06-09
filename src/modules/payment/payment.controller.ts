import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Request } from 'express';

import { PaymentService } from './services/payment.service';
import { Currency, DocumentType } from './payment.schema';
import { UserTypes, CurrentUser, Public } from '../../common/decorators/index';
import { UserType } from '../../common/interfaces/user-role.enum';
import { PaginationDto } from '../../common/pagination.dto';

// ── DTOs ──────────────────────────────────────────────────────

export class InitiateUpgradeDto {
  @IsString()
  plan: string;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;
}

export class RecordManualPaymentDto {
  @IsString()
  tenantId: string;

  @IsString()
  plan: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsEnum(Currency)
  currency: Currency;

  @IsEnum(DocumentType)
  documentType: DocumentType; // 'invoice' or 'receipt'

  @IsOptional()
  @IsString()
  paymentReference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ConfirmInvoicePaymentDto {
  @IsOptional()
  @IsString()
  paymentReference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ─────────────────────────────────────────────────────────────
// TENANT — payment initiation and history
// ─────────────────────────────────────────────────────────────

@ApiTags('Tenant — Payments')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('tenant/payments')
export class TenantPaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * POST /tenant/payments/initiate-upgrade
   * Tenant selects a plan, we create a DPO token, return checkout URL.
   * Frontend redirects tenant to checkoutUrl.
   */
  @Post('initiate-upgrade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate plan upgrade payment via DPO',
    description:
      'Creates a DPO payment token for the selected plan. ' +
      'Returns a checkoutUrl — redirect the tenant to this URL. ' +
      'DPO will call our callback when payment completes.',
  })
  initiateUpgrade(
    @CurrentUser('sub') tenantId: string,
    @Body() dto: InitiateUpgradeDto,
  ) {
    return this.paymentService.initiateUpgradePayment(
      tenantId,
      dto.plan,
      dto.currency,
    );
  }

  /**
   * GET /tenant/payments/history
   * Tenant views their own payment history.
   */
  @Get('history')
  @ApiOperation({ summary: 'Get tenant payment history' })
  getHistory(@CurrentUser('sub') tenantId: string) {
    return this.paymentService.getTenantTransactions(tenantId);
  }
}

// ─────────────────────────────────────────────────────────────
// PUBLIC — DPO callback (no auth — called by DPO server)
// ─────────────────────────────────────────────────────────────

@ApiTags('Public — Payment Callbacks')
@Controller('payments/callback')
export class PaymentCallbackController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * POST /payments/callback/dpo
   * DPO calls this after payment completes (BackURL).
   * Must return HTTP 200 — DPO retries on failure.
   */
  @Post('dpo')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'DPO payment callback [public — called by DPO server]',
    description:
      'DPO calls this URL after payment. ' +
      'Verifies the payment, activates subscription, sends receipt. ' +
      'Always returns 200 to prevent DPO retries.',
  })
  async dpoPushCallback(@Req() req: Request, @Body() body: any) {
    // DPO may send params as query string OR body — check both
    const params = { ...req.query, ...body };
    await this.paymentService.handleDpoCallback(params);
    return { status: 'ok' };
  }

  /**
   * GET /payments/callback/dpo
   * DPO redirect after payment (RedirectURL) — browser redirect, not server callback.
   * We don't do processing here; frontend reads the ?payment=success query param.
   */
  @Get('dpo')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'DPO redirect callback [public]' })
  dpoRedirect(@Query() query: any) {
    // Frontend handles this — just return OK so there's no 404
    return { status: 'ok', message: 'Payment processed' };
  }
}

// ─────────────────────────────────────────────────────────────
// SUPER ADMIN — manual payments, transactions, stats
// ─────────────────────────────────────────────────────────────

@ApiTags('SuperAdmin — Payments')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.SUPER_ADMIN)
@Controller('super-admin/payments')
export class SuperAdminPaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * POST /super-admin/payments/manual
   * Super admin records a manual payment (bank transfer etc.)
   * when creating a tenant on a paid plan.
   * documentType: 'receipt' → tenant already paid, send receipt + credentials
   * documentType: 'invoice' → tenant hasn't paid, send invoice only (no credentials)
   */
  @Post('manual')
  @ApiOperation({
    summary: 'Record manual payment for a tenant',
    description:
      'Use after creating a tenant on a paid plan. ' +
      'receipt: payment confirmed — activates account, sends receipt + credentials. ' +
      'invoice: payment pending — sends invoice only, no credentials until confirmed.',
  })
  async recordManual(
    @Body() dto: RecordManualPaymentDto,
    @CurrentUser('sub') adminId: string,
  ) {
    const transaction = await this.paymentService.recordManualPayment({
      ...dto,
      recordedBy: adminId,
    });

    // Send appropriate email
    if (dto.documentType === DocumentType.INVOICE) {
      await this.paymentService.sendInvoiceEmailForTransaction(
        transaction._id.toString(),
      );
    } else {
      await this.paymentService.sendReceiptEmailForTransaction(
        transaction._id.toString(),
      );
    }

    return { success: true, transaction };
  }

  /**
   * PATCH /super-admin/payments/:id/confirm
   * Super admin marks an invoice as paid.
   * Activates tenant account → sends credentials + receipt email.
   */
  @Patch(':id/confirm')
  @ApiOperation({
    summary: 'Confirm invoice payment — activates tenant account',
    description:
      'Marks a pending invoice as paid. ' +
      'Activates the tenant account and sends login credentials + receipt email.',
  })
  confirmPayment(
    @Param('id') transactionId: string,
    @Body() dto: ConfirmInvoicePaymentDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.paymentService.confirmInvoicePayment(transactionId, {
      ...dto,
      confirmedBy: adminId,
    });
  }

  /**
   * GET /super-admin/payments/transactions
   * All transactions — paginated, filterable.
   */
  @Get('transactions')
  @ApiOperation({ summary: 'List all transactions' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'plan', required: false })
  @ApiQuery({ name: 'currency', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getAllTransactions(
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
    @Query('tenantId') tenantId?: string,
    @Query('plan') plan?: string,
    @Query('currency') currency?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.paymentService.getAllTransactions(pagination, {
      status,
      tenantId,
      plan,
      currency,
      from,
      to,
    });
  }

  /**
   * GET /super-admin/payments/stats
   * Revenue stats for the transactions dashboard.
   */
  @Get('stats')
  @ApiOperation({ summary: 'Transaction stats and revenue summary' })
  getStats() {
    return this.paymentService.getTransactionStats();
  }
}
