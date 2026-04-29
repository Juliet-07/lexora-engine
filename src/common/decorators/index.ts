import {
  SetMetadata,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const USER_TYPES_KEY = 'userTypes';

/** Mark a route as publicly accessible (no JWT required) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restrict route to specific roles e.g. @Roles(TenantRole.TENANT_OWNER) */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/** Restrict route to specific user types e.g. @UserTypes(UserType.SUPER_ADMIN) */
export const UserTypes = (...types: string[]) =>
  SetMetadata(USER_TYPES_KEY, types);

/** Inject the current authenticated user (or a specific field) */
export const CurrentUser = createParamDecorator(
  (field: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return field ? user?.[field] : user;
  },
);
