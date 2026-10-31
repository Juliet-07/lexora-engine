import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Res } from '@nestjs/common';
import { Response } from 'express';
import { ContractTemplateService } from '../services/contract-template.service';
import { ContractService } from '../services/contract.service';
import {
  GenerateContractFromCandidateDto,
  GenerateContractForEmployeeDto,
  SendContractDto,
  TenantRespondToCommentDto,
  EditContractBodyDto,
  CountersignContractDto,
  IssueLetterDto,
} from '../dtos';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import { resolveBusinessName } from '../../../common/utils/resolve-business-name.util';
import { loadTenantCompany } from '../../../common/utils/contract-common-fields';

// Read-only: a contract template is now authored and published by
// the super admin (Contract Templates, module "hr") — the tenant
// picks from the published list here but can no longer create,
// edit, or delete one.
@ApiTags('HR — Contract Templates (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/contracts/templates')
export class ContractTemplateController {
  constructor(private readonly templateService: ContractTemplateService) {}

  @Get()
  @ApiQuery({ name: 'workerCategory', required: false })
  @ApiOperation({
    summary:
      'List published HR contract templates, optionally filtered by worker category',
  })
  getAll(@Query('workerCategory') workerCategory?: string) {
    return this.templateService.getAll(workerCategory);
  }

  @Get(':templateId')
  @ApiOperation({ summary: 'Get a single published contract template' })
  getOne(@Param('templateId') templateId: string) {
    return this.templateService.getById(templateId);
  }
}

@ApiTags('HR — Contracts (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/contracts')
export class ContractController {
  constructor(
    private readonly contractService: ContractService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  @Get('hired-without-contract')
  @ApiOperation({
    summary: 'List hired candidates who do not yet have a contract',
  })
  getHiredWithoutContract(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.contractService.getHiredCandidatesWithoutContract(t || u);
  }

  @Post('generate-from-candidate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Generate a contract from a candidate (the Hired → contract integration point)',
  })
  async generateFromCandidate(
    @Body() dto: GenerateContractFromCandidateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenant = await loadTenantCompany(this.userModel, t || u);
    return this.contractService.generateFromCandidate(t || u, tenant, dto);
  }

  @Post('generate-for-employee')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate a contract directly for an existing employee',
  })
  async generateForEmployee(
    @Body() dto: GenerateContractForEmployeeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenant = await loadTenantCompany(this.userModel, t || u);
    return this.contractService.generateForEmployee(t || u, tenant, dto);
  }

  @Get()
  @ApiQuery({ name: 'status', required: false })
  @ApiOperation({ summary: 'List all contracts for this tenant' })
  getAll(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query('status') status?: string,
  ) {
    return this.contractService.getAll(t || u, status);
  }

  @Get(':contractId')
  @ApiOperation({
    summary: 'Get a single contract, including its full interaction history',
  })
  getOne(
    @Param('contractId') contractId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.contractService.getById(t || u, contractId);
  }

  @Post(':contractId/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send (or re-send) a contract for signature' })
  async send(
    @Param('contractId') contractId: string,
    @Body() dto: SendContractDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const businessName = await resolveBusinessName(this.userModel, t || u);
    return this.contractService.send(
      t || u,
      contractId,
      businessName,
      dto.expiresInHours,
    );
  }

  @Post(':contractId/respond')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Respond to the signer's comment/negotiation" })
  respond(
    @Param('contractId') contractId: string,
    @Body() dto: TenantRespondToCommentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.contractService.respondToComment(t || u, contractId, u, dto);
  }

  @Patch(':contractId/body')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Edit the body of a contract (only while status is "draft" or "sent")',
  })
  editBody(
    @Param('contractId') contractId: string,
    @Body() dto: EditContractBodyDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.contractService.editBody(t || u, contractId, dto);
  }

  @Delete(':contractId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a contract that is still a draft',
  })
  async deleteContract(
    @Param('contractId') contractId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.contractService.deleteContract(t || u, contractId);
    return { deleted: true };
  }

  @Post(':contractId/countersign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Countersign a contract as the tenant — only after the signer has already signed',
  })
  countersign(
    @Param('contractId') contractId: string,
    @Body() dto: CountersignContractDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: Request,
  ) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      null;
    const userAgent = req.headers['user-agent'] || null;
    return this.contractService.countersign(
      t || u,
      contractId,
      u,
      dto,
      ipAddress,
      userAgent,
    );
  }

  @Post(':contractId/issue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Issue a one-way letter (requiresSignature: false) — signs, renders, and emails it in one step',
  })
  async issueLetter(
    @Param('contractId') contractId: string,
    @Body() dto: IssueLetterDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Req() req: Request,
  ) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      null;
    const userAgent = req.headers['user-agent'] || null;
    const businessName = await resolveBusinessName(this.userModel, t || u);
    return this.contractService.issueLetter(
      t || u,
      contractId,
      u,
      dto,
      ipAddress,
      userAgent,
      businessName,
    );
  }

  @Post(':contractId/send-signed-copy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Email the fully executed (both-signed) copy to the signer',
  })
  async sendSignedCopy(
    @Param('contractId') contractId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const businessName = await resolveBusinessName(this.userModel, t || u);
    return this.contractService.sendSignedCopy(
      t || u,
      contractId,
      businessName,
    );
  }

  @Get(':contractId/pdf')
  @ApiOperation({ summary: 'Download the fully executed contract as PDF' })
  async downloadPdf(
    @Param('contractId') contractId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const businessName = await resolveBusinessName(this.userModel, t || u);
    const buffer = await this.contractService.getSignedContractPdf(
      t || u,
      contractId,
      businessName,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="contract-${contractId}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}
