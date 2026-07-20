import { SetMetadata } from '@nestjs/common';
import { PlatformModuleKey } from '../interfaces/user-role.enum';

export const MODULE_ACCESS_KEY = 'moduleAccess';
export const RequiresModule = (...modules: PlatformModuleKey[]) =>
  SetMetadata(MODULE_ACCESS_KEY, modules);
