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

// Generating contracts inside a deal. A deal contract is a real Contract
// Management contract (origin 'grc_deal', linked back by dealId), so
// sending for signature, negotiation, amendments and the signed copy all
// work in the CRM contract tool exactly as for any other contract. These
// routes are guarded by the Deals module (not CRM), so a deal team can
// draft from a template even before they open Contract Management.
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

  @Get(':id/template-contracts')
  @ApiOperation({
    summary: 'Contracts drafted from templates inside this deal',
  })
  list(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.listContracts(t || u, id);
  }

  @Post(':id/template-contracts')
  @ApiOperation({
    summary:
      'Generate a contract in this deal from a published template; it appears in Contract Management linked to the deal',
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
