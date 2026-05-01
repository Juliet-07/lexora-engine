import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TenantSubscription } from '../../super_admin/schemas';
import {
  PlatformModuleKey,
  UserType,
} from '../../../common/interfaces/user-role.enum';

export const REQUIRES_MODULE_KEY = 'requiresModule';

/**
 * Decorate a controller or route with the module key it requires.
 * e.g. @RequiresModule(PlatformModuleKey.KYC)
 *
 * SuperAdmins bypass this guard entirely.
 * Tenants and their staff must have the module in their activeModules.
 */
export const RequiresModule = (moduleKey: PlatformModuleKey) =>
  SetMetadata(REQUIRES_MODULE_KEY, moduleKey);

@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(TenantSubscription.name)
    private readonly subscriptionModel: Model<any>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const requiredModule = this.reflector.getAllAndOverride<PlatformModuleKey>(
      REQUIRES_MODULE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    // No module requirement on this route — allow
    if (!requiredModule) return true;

    const { user } = ctx.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Access denied');

    // SuperAdmin bypasses module restrictions
    if (user.userType === UserType.SUPER_ADMIN) return true;

    // Resolve tenantId — for tenant users it's their own ID,
    // for staff it's stored in tenantId on their JWT payload
    const tenantId = user.tenantId || user.sub;

    const subscription = await this.subscriptionModel
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .select('activeModules status')
      .lean();

    if (!subscription) {
      throw new ForbiddenException('No active subscription found');
    }

    if (!subscription.activeModules?.includes(requiredModule)) {
      throw new ForbiddenException(
        `Your subscription plan does not include the "${requiredModule}" module. ` +
          `Please upgrade your plan to access this feature.`,
      );
    }

    return true;
  }
}
