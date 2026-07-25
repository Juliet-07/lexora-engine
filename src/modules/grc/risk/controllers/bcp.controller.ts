import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BcpService } from '../services';
import {
  CreateBcpPlanDto,
  LogBcpTestDto,
  CreateRtoRpoDto,
  CreateCrisisContactDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

@ApiTags('GRC — Risk')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/risk/bcp')
export class BcpController {
  constructor(private readonly bcpService: BcpService) {}

  @Post('plans')
  createPlan(
    @Body() dto: CreateBcpPlanDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.createPlan(t || u, dto);
  }
  @Get('plans')
  getAllPlans(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.getAllPlans(t || u);
  }

  @Post('tests')
  logTest(
    @Body() dto: LogBcpTestDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.logTest(t || u, dto);
  }
  @Get('tests')
  getAllTests(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.getAllTests(t || u);
  }

  @Post('rto-rpo')
  createRtoRpo(
    @Body() dto: CreateRtoRpoDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.createRtoRpo(t || u, dto);
  }
  @Get('rto-rpo')
  getAllRtoRpo(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.getAllRtoRpo(t || u);
  }

  @Post('crisis-contacts')
  createContact(
    @Body() dto: CreateCrisisContactDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.createContact(t || u, dto);
  }
  @Get('crisis-contacts')
  getAllContacts(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.getAllContacts(t || u);
  }
}
