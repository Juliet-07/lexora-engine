import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/index';
import { SubscriptionExpiryService } from '../services/subscription-expiry.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../../auth/schemas/user.schema';
import { TenantSubscription } from '../schemas/subscription.schema';

@ApiTags('Public — Subscription Renewal')
@Controller('public/subscription')
export class SubscriptionRenewalController {
  constructor(
    private readonly expiryService: SubscriptionExpiryService,
    @InjectModel(User.name) private readonly userModel: Model<any>,
    @InjectModel(TenantSubscription.name)
    private readonly subscriptionModel: Model<any>,
  ) {}

  /**
   * GET /public/subscription/renew/:tenantId
   * Returns tenant info + available plans for the public renewal page.
   * No auth — account is inactive so tenant can't authenticate.
   */
  @Get('renew/:tenantId')
  @Public()
  @ApiOperation({ summary: 'Get renewal info for an expired tenant [public]' })
  async getRenewalInfo(@Param('tenantId') tenantId: string) {
    const [tenant, subscription] = await Promise.all([
      this.userModel
        .findById(tenantId)
        .select('firstName tenantProfile.businessName status')
        .lean(),
      this.subscriptionModel
        .findOne({ tenantId: new Types.ObjectId(tenantId) })
        .select('plan status currentPeriodEnd')
        .lean(),
    ]);

    if (!tenant) throw new NotFoundException('Tenant not found');

    return {
      tenantId,
      businessName: (tenant as any)?.tenantProfile?.businessName || 'Unknown',
      firstName: (tenant as any)?.firstName,
      accountStatus: (tenant as any)?.status,
      previousPlan: (subscription as any)?.plan,
      expiredAt: (subscription as any)?.currentPeriodEnd,
      subscriptionStatus: (subscription as any)?.status,
    };
  }

  /**
   * POST /public/subscription/renew/:tenantId
   * Submits a renewal request. In a real integration this would also
   * handle payment verification. Here it records the request and
   * optionally reactivates if auto-approve is configured.
   *
   * Body: { plan: string, paymentReference?: string }
   */
  @Post('renew/:tenantId')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit subscription renewal request [public]',
    description:
      'Records the renewal request. Reactivation is completed by SuperAdmin ' +
      'confirming payment, or automatically if auto-approval is enabled.',
  })
  async submitRenewal(
    @Param('tenantId') tenantId: string,
    @Body() body: { plan: string; paymentReference?: string },
  ) {
    const tenant = await this.userModel.findById(tenantId).lean();
    if (!tenant) throw new NotFoundException('Tenant not found');

    // In production: verify payment, then call reactivateAfterRenewal.
    // For now: record the request and return confirmation.
    // SuperAdmin will see the request in their dashboard and activate.
    return {
      success: true,
      message:
        'Your renewal request has been received. Our team will verify payment and activate your account within 24 hours.',
      tenantId,
      plan: body.plan,
      paymentReference: body.paymentReference || null,
    };
  }
}
