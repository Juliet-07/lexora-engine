// src/common/guards/roles.guard.ts
import {
  Injectable, CanActivate, ExecutionContext, ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, USER_TYPES_KEY, IS_PUBLIC_KEY } from '../decorators/index';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    // Skip if public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const requiredTypes = this.reflector.getAllAndOverride<string[]>(USER_TYPES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    // No restrictions — allow through
    if (!requiredRoles?.length && !requiredTypes?.length) return true;

    const { user } = ctx.switchToHttp().getRequest();

    // No user on a protected route
    if (!user) throw new ForbiddenException('Access denied');

    // Check userType
    if (requiredTypes?.length && !requiredTypes.includes(user.userType)) {
      throw new ForbiddenException(
        `Access restricted. Required user type: ${requiredTypes.join(', ')}`,
      );
    }

    // Check roles
    if (requiredRoles?.length) {
      const hasRole = requiredRoles.some((r) => user.roles?.includes(r));
      if (!hasRole) {
        throw new ForbiddenException(
          `Access restricted. Required role: ${requiredRoles.join(', ')}`,
        );
      }
    }

    return true;
  }
}