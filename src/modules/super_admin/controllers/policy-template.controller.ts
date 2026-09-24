import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PolicyTemplateService } from '../services';
import { UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

@ApiTags('GRC — Policy Templates')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/compliance/policy-templates')
export class PolicyTemplateController {
  constructor(private readonly service: PolicyTemplateService) {}

  @Get()
  getPublished(@Query('category') category?: string) {
    return this.service.getPublished(category);
  }
}
