import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MODULE_ACCESS_KEY } from '../decorators/requires-module.decorator';
import { IS_PUBLIC_KEY } from '../decorators/index';
import {
  UserType,
  PlatformModuleKey,
  StaffRole,
  STAFF_ROLE_MODULE_ACCESS,
} from '../interfaces/user-role.enum';

// Sits ALONGSIDE RolesGuard, not instead of it. A root Tenant/Owner
// account (userType TENANT) always passes — no role check, full
// access. An Employee-typed account only passes if one of their
// assigned staff roles maps to the required module.
@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const requiredModules = this.reflector.getAllAndOverride<
      PlatformModuleKey[]
    >(MODULE_ACCESS_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!requiredModules?.length) return true;

    const { user } = ctx.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Access denied');

    if (user.userType === UserType.TENANT) return true;

    if (user.userType === UserType.EMPLOYEE) {
      const userRoles: string[] = user.roles ?? [];
      const hasAccess = userRoles.some((role) => {
        const grantedModules = STAFF_ROLE_MODULE_ACCESS[role as StaffRole];
        return grantedModules?.some((m) => requiredModules.includes(m));
      });
      if (hasAccess) return true;
    }

    throw new ForbiddenException(
      `Access restricted. This account does not have access to: ${requiredModules.join(', ')}`,
    );
  }
}
