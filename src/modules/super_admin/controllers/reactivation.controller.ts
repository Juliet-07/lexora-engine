import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsEnum, IsEmail } from 'class-validator';
import { Public } from 'src/common/decorators';
import { SubscriptionExpiryService } from '../services/subscription-expiry.service';
import { PaymentService } from '../../payment/services';
import { Currency } from '../../payment/payment.schema';

class RequestUpgradeDto {
  @IsString() plan: string;
  @IsEnum(Currency) currency: Currency;
}
class ResendReactivationDto {
  @IsEmail() email: string;
}

// Real, public, token-gated flow for a tenant genuinely locked out
// (inactive/suspended after their subscription expired) — the same
// real pattern already proven for password reset and contract
// signing. No JWT, no login required; the token itself is the only
// thing checked, and it never reveals which emails exist.
@ApiTags('Public — Tenant Reactivation')
@Public()
@Controller('public/reactivation')
export class ReactivationController {
  constructor(
    private readonly expiryService: SubscriptionExpiryService,
    private readonly paymentService: PaymentService,
  ) {}

  @Post('resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend a fresh reactivation link for a locked-out tenant',
    description:
      'Always returns a generic success message regardless of whether the email is registered or locked out.',
  })
  resend(@Body() dto: ResendReactivationDto) {
    return this.expiryService.resendReactivationLink(dto.email);
  }

  @Get(':token')
  @ApiOperation({
    summary: 'Real tenant info behind a reactivation token',
  })
  async getByToken(@Param('token') token: string) {
    const tenant = await this.expiryService.getTenantByReactivationToken(token);
    if (!tenant) {
      throw new NotFoundException(
        'This reactivation link is invalid or has expired.',
      );
    }
    const [openInvoice, availablePlans] = await Promise.all([
      this.paymentService.getOpenTransaction(tenant.tenantId),
      this.paymentService.getAvailablePlans(),
    ]);
    return { ...tenant, openInvoice, availablePlans };
  }

  @Post(':token/request-upgrade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Real, no-gateway reactivation invoice request',
    description:
      'Same real invoice-and-email flow a logged-in tenant uses to request an upgrade.',
  })
  async requestUpgrade(
    @Param('token') token: string,
    @Body() dto: RequestUpgradeDto,
  ) {
    const tenant = await this.expiryService.getTenantByReactivationToken(token);
    if (!tenant) {
      throw new NotFoundException(
        'This reactivation link is invalid or has expired.',
      );
    }
    return this.paymentService.tenantRequestUpgrade(
      tenant.tenantId,
      dto.plan,
      dto.currency,
    );
  }

  @Post(':token/mark-paid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'A locked-out tenant\'s own "I\'ve made payment" declaration',
  })
  async markPaid(
    @Param('token') token: string,
    @Body('transactionId') transactionId: string,
  ) {
    const tenant = await this.expiryService.getTenantByReactivationToken(token);
    if (!tenant) {
      throw new NotFoundException(
        'This reactivation link is invalid or has expired.',
      );
    }
    return this.paymentService.tenantMarkPaymentClaimed(
      tenant.tenantId,
      transactionId,
    );
  }
}
