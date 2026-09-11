import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Res,
  Query,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { Response } from 'express';
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
import { LitigationCaseService } from '../services';
import { MessageDirection } from '../schemas';
import {
  CreateLitigationCaseDto,
  UpdateLitigationDetailsDto,
  UpdateLitigationStageDto,
  AddLitigationPleadingDto,
  UpdateLitigationPleadingDto,
  AddLitigationCourtDateDto,
  AddLitigationDisbursementDto,
  AddLitigationTimelineEntryDto,
  RecordLitigationOutcomeDto,
  SendLitigationPartyEmailDto,
  CreateMessageDto,
  CreateLitigationDraftDto,
  SaveLitigationDraftVersionDto,
  UpdateLitigationDraftStatusDto,
  CreateLitigationFolderDto,
  CreateLitigationDeadlineRuleDto,
  UpdateLitigationDeadlineRuleDto,
  LogLitigationTenantTimeDto,
} from '../dtos';

const litigationDocumentStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const p = join(process.cwd(), 'uploads', 'crm', 'litigation-cases');
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
    cb(null, p);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Projects — Litigation (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('crm/litigation-cases')
export class LitigationCaseController {
  constructor(private readonly service: LitigationCaseService) {}

  @Post()
  @ApiOperation({
    summary:
      'File litigation directly, with no prior ADR phase (the far more common path — escalating a real ADR case — uses POST crm/adr-cases/:id/escalate instead)',
  })
  create(
    @Body() dto: CreateLitigationCaseDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'All litigation cases' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  // ── Reporting — declared before :id below so "report" is never
  // swallowed as a case id. ──
  @Get('report')
  @ApiOperation({
    summary: 'Real, server-computed litigation case register stats',
  })
  getReport(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getReport(t || u);
  }

  @Get('report/export')
  @ApiOperation({ summary: 'Litigation case register as a PDF, house style' })
  async exportReportPdf(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.exportReportPdf(t || u);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="litigation-case-register-${new Date().toISOString().split('T')[0]}.pdf"`,
    });
    res.send(buffer);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'One litigation case, with combined ADR+litigation hours/fees/age computed live',
  })
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Patch(':id/details')
  @ApiOperation({ summary: 'Update court details / parties' })
  updateDetails(
    @Param('id') id: string,
    @Body() dto: UpdateLitigationDetailsDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateDetails(t || u, id, dto);
  }

  @Patch(':id/stage')
  @ApiOperation({
    summary: 'Move litigation stage — logs a real, narrated timeline entry',
  })
  setStage(
    @Param('id') id: string,
    @Body() dto: UpdateLitigationStageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setStage(t || u, id, dto);
  }

  @Post(':id/pleadings')
  @ApiOperation({ summary: 'Add a pleading to the tracker' })
  addPleading(
    @Param('id') id: string,
    @Body() dto: AddLitigationPleadingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addPleading(t || u, id, dto);
  }

  @Patch(':id/pleadings/:pleadingId')
  @ApiOperation({ summary: 'Mark a pleading filed / update its status' })
  updatePleading(
    @Param('id') id: string,
    @Param('pleadingId') pleadingId: string,
    @Body() dto: UpdateLitigationPleadingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updatePleading(t || u, id, pleadingId, dto);
  }

  @Post(':id/court-dates')
  @ApiOperation({ summary: 'Add a court date' })
  addCourtDate(
    @Param('id') id: string,
    @Body() dto: AddLitigationCourtDateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addCourtDate(t || u, id, dto);
  }

  @Post(':id/disbursements')
  @ApiOperation({ summary: 'Record a disbursement' })
  addDisbursement(
    @Param('id') id: string,
    @Body() dto: AddLitigationDisbursementDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addDisbursement(t || u, id, dto);
  }

  @Post(':id/timeline')
  @ApiOperation({
    summary: 'Add a manual timeline entry for a real-world milestone',
  })
  addTimelineEntry(
    @Param('id') id: string,
    @Body() dto: AddLitigationTimelineEntryDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addTimelineEntry(t || u, id, dto);
  }

  // ── Communication ────────────────────────────────────────────
  @Get(':id/messages')
  @ApiOperation({ summary: 'The tenant↔client message thread for this case' })
  getMessages(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMessages(t || u, id);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: "Send a message to the case mandate's client" })
  sendMessage(
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addMessage(t || u, id, MessageDirection.TENANT, dto);
  }

  @Post(':id/party-email')
  @ApiOperation({
    summary: 'Send an ad-hoc email to one or more case parties',
  })
  sendPartyEmail(
    @Param('id') id: string,
    @Body() dto: SendLitigationPartyEmailDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.sendPartyEmail(t || u, id, dto);
  }

  // ── Drafting ──────────────────────────────────────────────────
  @Get(':id/drafts')
  @ApiOperation({ summary: 'All drafts for this case' })
  getDrafts(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getDrafts(t || u, id);
  }

  @Post(':id/drafts')
  @ApiOperation({
    summary: 'Start a new draft — from a real platform template, or blank',
  })
  createDraft(
    @Param('id') id: string,
    @Body() dto: CreateLitigationDraftDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.createDraft(t || u, id, dto);
  }

  @Patch(':id/drafts/:draftId')
  @ApiOperation({ summary: 'Save a new version of the draft content' })
  saveDraftVersion(
    @Param('id') id: string,
    @Param('draftId') draftId: string,
    @Body() dto: SaveLitigationDraftVersionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.saveDraftVersion(t || u, id, draftId, 'You', dto);
  }

  @Patch(':id/drafts/:draftId/status')
  @ApiOperation({
    summary:
      'Move a draft through Draft → In review → Final. Final files a real document.',
  })
  updateDraftStatus(
    @Param('id') id: string,
    @Param('draftId') draftId: string,
    @Body() dto: UpdateLitigationDraftStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateDraftStatus(t || u, id, draftId, dto);
  }

  // ── Folders ───────────────────────────────────────────────────
  @Get(':id/folders')
  @ApiOperation({ summary: 'Real, named folders on this case' })
  getFolders(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getFolders(t || u, id);
  }

  @Post(':id/folders')
  @ApiOperation({ summary: 'Create a new folder' })
  createFolder(
    @Param('id') id: string,
    @Body() dto: CreateLitigationFolderDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.createFolder(t || u, id, dto.name);
  }

  // ── Documents ─────────────────────────────────────────────────
  @Get(':id/documents')
  @ApiOperation({ summary: 'All documents filed on this case' })
  getDocuments(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getDocuments(t || u, id);
  }

  @Post(':id/documents')
  @UseInterceptors(
    FileInterceptor('file', { storage: litigationDocumentStorage }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a document into a folder' })
  uploadDocument(
    @Param('id') id: string,
    @Query('folder') folder: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.uploadDocument(t || u, id, folder, 'You', file);
  }

  // ── Deadline rules ───────────────────────────────────────────
  @Get(':id/deadline-rules')
  @ApiOperation({
    summary: "This case's deadline rules, with live-computed due dates",
  })
  getDeadlineRules(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getDeadlineRules(t || u, id);
  }

  @Post(':id/deadline-rules')
  @ApiOperation({ summary: 'Add a new deadline rule' })
  createDeadlineRule(
    @Param('id') id: string,
    @Body() dto: CreateLitigationDeadlineRuleDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.createDeadlineRule(t || u, id, dto);
  }

  @Patch(':id/deadline-rules/:ruleId')
  @ApiOperation({ summary: 'Edit a deadline rule' })
  updateDeadlineRule(
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateLitigationDeadlineRuleDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateDeadlineRule(t || u, id, ruleId, dto);
  }

  @Post(':id/deadline-rules/:ruleId/mark-met')
  @ApiOperation({ summary: 'Mark a deadline rule as met, today' })
  markDeadlineRuleMet(
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.markDeadlineRuleMet(t || u, id, ruleId);
  }

  // ── Audit trail ───────────────────────────────────────────────
  @Get(':id/audit-trail/export')
  @ApiOperation({
    summary: "This case's full audit trail as a PDF, house style",
  })
  async exportAuditTrailPdf(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.exportAuditTrailPdf(t || u, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="audit-trail-${id}-${new Date().toISOString().split('T')[0]}.pdf"`,
    });
    res.send(buffer);
  }

  // ── Tenant time logging ──────────────────────────────────────
  @Post(':id/time')
  @ApiOperation({
    summary: "Log the tenant's own time on this case, valued directly",
  })
  logTenantTime(
    @Param('id') id: string,
    @Body() dto: LogLitigationTenantTimeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.logTenantTime(t || u, id, dto);
  }

  @Post(':id/outcome')
  @ApiOperation({ summary: 'Record the judgment / outcome' })
  recordOutcome(
    @Param('id') id: string,
    @Body() dto: RecordLitigationOutcomeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordOutcome(t || u, id, dto);
  }

  @Post(':id/consent-judgment')
  @ApiOperation({
    summary:
      'Record settlement reached mid-litigation — consent judgment, case closed',
  })
  recordConsentJudgment(
    @Param('id') id: string,
    @Body('terms') terms: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordConsentJudgment(t || u, id, terms);
  }

  @Post(':id/withdraw')
  @ApiOperation({ summary: 'Withdraw the case' })
  withdraw(
    @Param('id') id: string,
    @Body('reason') reason: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.withdraw(t || u, id, reason);
  }
}
