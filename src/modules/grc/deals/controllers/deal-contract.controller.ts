import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { DealContractService } from '../services/deal-contract.service';
import { GenerateDealContractDto } from '../dtos/deal-contract.dto';

// Generating contracts inside a deal. A deal contract belongs to the deal
// (Deal.contracts[]) and is managed there — editing, comments, redlines,
// the review loop and execution — independently of Contract Management
// (CRM). These routes are guarded by the Deals module only.
@ApiTags('Deals & Transactions — Contracts from templates')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.DEALS)
@Controller('deals')
export class DealContractController {
  constructor(private readonly service: DealContractService) {}

  @Get(':id/contract-templates')
  @ApiOperation({
    summary:
      'Deal-contract templates the Super Admin has published (module GRC, area Deals)',
  })
  listTemplates(
    @Param('id') _id: string,
    @CurrentUser('sub') _u: string,
    @CurrentUser('tenantId') _t: string,
  ) {
    return this.service.listTemplates();
  }

  @Get(':id/contract-draft')
  @ApiQuery({ name: 'templateId', required: false })
  @ApiOperation({
    summary:
      "What the generate form opens with: values suggested from the deal, the deal's parties, and (with a template) which of its fields the deal can fill",
  })
  getDraft(
    @Param('id') id: string,
    @Query('templateId') templateId: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getDraft(t || u, id, templateId || undefined);
  }

  @Post(':id/template-contracts')
  @ApiOperation({
    summary:
      'Generate a contract in this deal from a published template; it is created inside the deal and managed there (editing, redlines, review, signing)',
  })
  generate(
    @Param('id') id: string,
    @Body() dto: GenerateDealContractDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.generate(t || u, id, dto);
  }
}
