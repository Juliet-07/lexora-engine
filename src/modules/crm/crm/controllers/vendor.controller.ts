import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import { VendorService } from '../services';
import {
  CreateVendorDto,
  UpdateVendorDto,
  SetVendorStatusDto,
  AddVendorNoteDto,
  SaveVendorContractDto,
  AdvanceContractDto,
  RequestVendorApprovalDto,
  DecideVendorApprovalDto,
  AddVendorSpendDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

const vendorEvidenceStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const p = join(process.cwd(), 'uploads', 'crm', 'vendors');
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
    cb(null, p);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

@ApiTags('CRM — Vendor Management')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('crm/vendors')
export class VendorController {
  constructor(private readonly service: VendorService) {}

  @Get()
  @ApiOperation({ summary: 'All vendors' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get('eligible-approvers')
  @ApiOperation({
    summary:
      'Employees eligible to be a vendor approver — Head of Department or Manager only',
  })
  getEligibleApprovers(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getEligibleApprovers(t || u);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One vendor' })
  getById(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Post()
  @ApiOperation({ summary: 'Register a new vendor' })
  create(
    @Body() dto: CreateVendorDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update vendor details' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVendorDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.update(t || u, id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change vendor status directly' })
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetVendorStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setStatus(t || u, id, dto.status);
  }

  // ── Due diligence ──────────────────────────────────────────
  @Post(':id/dd-items/:itemId/evidence')
  @UseInterceptors(FileInterceptor('file', { storage: vendorEvidenceStorage }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload the required evidence document for a checklist item — this is what marks it done',
  })
  uploadDdEvidence(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.uploadDdEvidence(t || u, id, itemId, 'You', file);
  }

  @Delete(':id/dd-items/:itemId/evidence')
  @ApiOperation({ summary: 'Remove evidence, reverting the item to not done' })
  removeDdEvidence(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.removeDdEvidence(t || u, id, itemId);
  }

  // ── Notes ──────────────────────────────────────────────────
  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a note' })
  addNote(
    @Param('id') id: string,
    @Body() dto: AddVendorNoteDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addNote(t || u, id, 'You', dto);
  }

  // ── Contracts ──────────────────────────────────────────────
  @Post(':id/contracts')
  @ApiOperation({ summary: 'Create or update a contract' })
  saveContract(
    @Param('id') id: string,
    @Body() dto: SaveVendorContractDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.saveContract(t || u, id, dto);
  }

  @Patch(':id/contracts/:contractId/status')
  @ApiOperation({ summary: 'Advance a contract through its lifecycle' })
  advanceContract(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Body() dto: AdvanceContractDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.advanceContract(t || u, id, contractId, dto);
  }

  @Delete(':id/contracts/:contractId')
  @ApiOperation({ summary: 'Delete a contract' })
  deleteContract(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.deleteContract(t || u, id, contractId);
  }

  // ── Approval ───────────────────────────────────────────────
  @Post(':id/approval/request')
  @ApiOperation({
    summary:
      'Request approval from a chosen employee — must be a Head of Department or Manager',
  })
  requestApproval(
    @Param('id') id: string,
    @Body() dto: RequestVendorApprovalDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.requestApproval(t || u, id, dto);
  }

  @Post(':id/approval/decide')
  @ApiOperation({ summary: 'Approve or reject a pending approval request' })
  decideApproval(
    @Param('id') id: string,
    @Body() dto: DecideVendorApprovalDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.decideApproval(t || u, id, dto);
  }

  // ── Spend ──────────────────────────────────────────────────
  @Post(':id/spend')
  @ApiOperation({ summary: 'Record or update a month of spend' })
  addSpendEntry(
    @Param('id') id: string,
    @Body() dto: AddVendorSpendDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addSpendEntry(t || u, id, dto);
  }
}
