import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
import { DealVariationService } from '../services/deal-variation.service';
import { DealChangeService } from '../services/deal-change.service';
import { ProposeChangeDto } from '../dtos/deal.dto';
import {
  AdvanceVariationDto,
  CreateVariationDto,
  UpdateVariationDto,
} from 'src/modules/crm/tools/dtos/contract.dto';
import {
  GenerateDealContractDto,
  GenerateTermSheetDto,
} from '../dtos/deal-contract.dto';

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
  constructor(
    private readonly service: DealContractService,
    private readonly variations: DealVariationService,
    private readonly changes: DealChangeService,
  ) {}

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

  // ── Term sheets ──────────────────────────────────────────────

  @Get(':id/term-sheet-templates')
  @ApiOperation({
    summary:
      'Term-sheet templates the Super Admin has published (module GRC, area Term sheets)',
  })
  listTermSheetTemplates(
    @Param('id') _id: string,
    @CurrentUser('sub') _u: string,
    @CurrentUser('tenantId') _t: string,
  ) {
    return this.service.listTemplates('term_sheet');
  }

  @Get(':id/term-sheet-draft')
  @ApiQuery({ name: 'templateId', required: false })
  @ApiOperation({
    summary:
      "What the generate-term-sheet dialog opens with: the two parties (the deal's client and counterparty), suggested values, and (with a template) which of its fields the deal can fill",
  })
  getTermSheetDraft(
    @Param('id') id: string,
    @Query('templateId') templateId: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getTermSheetDraft(t || u, id, templateId || undefined);
  }

  @Post(':id/term-sheets')
  @ApiOperation({
    summary:
      'Generate a term sheet in this deal from a published template; it is edited, reviewed and exported with the same tools as a contract',
  })
  generateTermSheet(
    @Param('id') id: string,
    @Body() dto: GenerateTermSheetDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.generateTermSheet(t || u, id, dto);
  }
  // ── Variations on an executed deal contract: amendments, addenda, side
  // letters, waivers, extensions (same rules as Contract Management) ──

  @Get(':id/contracts/:contractId/clauses')
  @ApiOperation({ summary: 'Clauses of a deal contract as it reads now' })
  getClauses(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.variations.getClauses(t || u, id, contractId);
  }

  @Get(':id/contracts/:contractId/variations/document')
  @ApiOperation({ summary: 'Contract text: current, original or redline' })
  @ApiQuery({
    name: 'mode',
    enum: ['current', 'original', 'redline'],
    required: false,
  })
  getVariationDocument(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Query('mode') mode: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const m = mode === 'original' || mode === 'redline' ? mode : 'current';
    return this.variations.getDocument(t || u, id, contractId, m);
  }

  @Post(':id/contracts/:contractId/variations')
  @ApiOperation({
    summary: 'Create a variation (draft, or straight to review)',
  })
  createVariation(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Body() dto: CreateVariationDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.variations.createVariation(t || u, u, id, contractId, dto);
  }

  @Patch(':id/contracts/:contractId/variations/:ref')
  @ApiOperation({ summary: 'Edit a draft variation' })
  updateVariation(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Param('ref') ref: string,
    @Body() dto: UpdateVariationDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.variations.updateVariation(t || u, u, id, contractId, ref, dto);
  }

  @Post(':id/contracts/:contractId/variations/:ref/advance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Move a variation along: draft → review → approved → executed (or back to draft)',
  })
  advanceVariation(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Param('ref') ref: string,
    @Body() dto: AdvanceVariationDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.variations.advanceVariation(
      t || u,
      u,
      id,
      contractId,
      ref,
      dto,
    );
  }

  @Delete(':id/contracts/:contractId/variations/:ref')
  @ApiOperation({ summary: 'Delete a draft variation' })
  deleteVariation(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Param('ref') ref: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.variations.deleteVariation(t || u, id, contractId, ref);
  }
  // ── Negotiation: tracked changes, accept / reject, rounds ──

  @Post(':id/contracts/:contractId/sections/:index/changes')
  @ApiOperation({
    summary: 'Propose new wording for a line (a tracked change)',
  })
  proposeChange(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Param('index') index: string,
    @Body() dto: ProposeChangeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.changes.propose(t || u, u, id, contractId, Number(index), dto);
  }

  @Post(':id/contracts/:contractId/changes/:decision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept all or reject all pending changes' })
  decideAll(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Param('decision') decision: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.changes.decideAll(
      t || u,
      u,
      id,
      contractId,
      decision === 'accept' ? 'accept' : 'reject',
    );
  }

  @Post(':id/contracts/:contractId/sections/:index/changes/:changeId/:decision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept or reject one tracked change' })
  decideChange(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Param('index') index: string,
    @Param('changeId') changeId: string,
    @Param('decision') decision: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.changes.decide(
      t || u,
      u,
      id,
      contractId,
      Number(index),
      changeId,
      decision === 'accept' ? 'accept' : 'reject',
    );
  }

  @Post(':id/contracts/:contractId/rounds/advance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'End this negotiation round; the other side takes the pen',
  })
  advanceRound(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.changes.advanceRound(t || u, id, contractId);
  }
}
