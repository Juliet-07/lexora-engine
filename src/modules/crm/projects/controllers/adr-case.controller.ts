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
import { AdrCaseService } from '../services';
import { MessageDirection } from '../schemas';

const documentStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const p = join(process.cwd(), 'uploads', 'crm', 'adr-cases');
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
    cb(null, p);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

import {
  CreateAdrCaseDto,
  UpdateAdrCaseDetailsDto,
  UpdateAdrStageDto,
  AddAdrSessionDto,
  UpdateAdrSessionDto,
  RecordAdrSettlementDto,
  RecordAdrOutcomeDto,
  RestartAdrAsTypeDto,
  WithdrawAdrCaseDto,
  AddAdrTimelineEntryDto,
  AddAdrChecklistItemDto,
  SetAdrChecklistItemDoneDto,
  AddAdrDisbursementDto,
  EscalateToLitigationDto,
  SendAdrPartyEmailDto,
  CreateMessageDto,
  CreateAdrDraftDto,
  SaveAdrDraftVersionDto,
  UpdateAdrDraftStatusDto,
  CreateAdrFolderDto,
  CreateAdrDeadlineRuleDto,
  UpdateAdrDeadlineRuleDto,
  RecordAdrClosureDto,
  LinkAdrSettlementDeedDto,
  LogAdrTenantTimeDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Projects — ADR (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('crm/adr-cases')
export class AdrCaseController {
  constructor(private readonly service: AdrCaseService) {}

  @Post()
  @ApiOperation({ summary: 'File a new ADR case' })
  create(
    @Body() dto: CreateAdrCaseDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'All ADR cases' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  // ── Reporting — declared before :id below so "report" is never
  // swallowed as a case id. ──
  @Get('report')
  @ApiOperation({ summary: 'Real, server-computed ADR case register stats' })
  getReport(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getReport(t || u);
  }

  @Get('report/export')
  @ApiOperation({ summary: 'ADR case register as a PDF, house style' })
  async exportReportPdf(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.exportReportPdf(t || u);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="adr-case-register-${new Date().toISOString().split('T')[0]}.pdf"`,
    });
    res.send(buffer);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One case' })
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Patch(':id/details')
  @ApiOperation({
    summary: 'Update case-detail fields (category, venue, parties, etc.)',
  })
  updateDetails(
    @Param('id') id: string,
    @Body() dto: UpdateAdrCaseDetailsDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateDetails(t || u, id, dto);
  }

  @Patch(':id/stage')
  @ApiOperation({
    summary: 'Move stage — logs a real, narrated timeline entry',
  })
  setStage(
    @Param('id') id: string,
    @Body() dto: UpdateAdrStageDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setStage(t || u, id, dto);
  }

  @Post(':id/sessions')
  @ApiOperation({ summary: 'Schedule a session' })
  addSession(
    @Param('id') id: string,
    @Body() dto: AddAdrSessionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addSession(t || u, id, dto);
  }

  @Patch(':id/sessions/:sessionId')
  @ApiOperation({
    summary: 'Mark a session held / cancelled, record its outcome',
  })
  updateSession(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateAdrSessionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateSession(t || u, id, sessionId, dto);
  }

  @Post(':id/settlement')
  @ApiOperation({ summary: 'Record a settlement' })
  recordSettlement(
    @Param('id') id: string,
    @Body() dto: RecordAdrSettlementDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordSettlement(t || u, id, dto);
  }

  @Post(':id/settlement/deed')
  @ApiOperation({
    summary:
      "Link a real document from this case's Documents as the settlement deed",
  })
  linkSettlementDeed(
    @Param('id') id: string,
    @Body() dto: LinkAdrSettlementDeedDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.linkSettlementDeed(t || u, id, dto);
  }

  @Post(':id/closure')
  @ApiOperation({
    summary:
      'Record real closure details — client satisfaction, lessons learned, precedent value',
  })
  recordClosure(
    @Param('id') id: string,
    @Body() dto: RecordAdrClosureDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordClosure(t || u, id, dto);
  }

  @Post(':id/time')
  @ApiOperation({
    summary: "Log the tenant's own time on this case, valued directly",
  })
  logTenantTime(
    @Param('id') id: string,
    @Body() dto: LogAdrTenantTimeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.logTenantTime(t || u, id, dto);
  }

  @Post(':id/outcome')
  @ApiOperation({ summary: 'Record an award / outcome' })
  recordOutcome(
    @Param('id') id: string,
    @Body() dto: RecordAdrOutcomeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordOutcome(t || u, id, dto);
  }

  @Post(':id/restart-as')
  @ApiOperation({
    summary:
      'Restart as a different ADR type after a failed round (e.g. mediation → arbitration) — resets to Notice stage',
  })
  restartAsType(
    @Param('id') id: string,
    @Body() dto: RestartAdrAsTypeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.restartAsType(t || u, id, dto);
  }

  @Post(':id/withdraw')
  @ApiOperation({ summary: 'Withdraw the case' })
  withdraw(
    @Param('id') id: string,
    @Body() dto: WithdrawAdrCaseDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.withdraw(t || u, id, dto);
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
    @Body() dto: SendAdrPartyEmailDto,
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
    @Body() dto: CreateAdrDraftDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.createDraft(t || u, id, dto);
  }

  @Patch(':id/drafts/:draftId')
  @ApiOperation({
    summary: 'Save a new version of the draft content',
  })
  saveDraftVersion(
    @Param('id') id: string,
    @Param('draftId') draftId: string,
    @Body() dto: SaveAdrDraftVersionDto,
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
    @Body() dto: UpdateAdrDraftStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateDraftStatus(t || u, id, draftId, dto);
  }

  // ── Documents ─────────────────────────────────────────────────
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
    @Body() dto: CreateAdrFolderDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.createFolder(t || u, id, dto.name);
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
    @Body() dto: CreateAdrDeadlineRuleDto,
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
    @Body() dto: UpdateAdrDeadlineRuleDto,
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
  @UseInterceptors(FileInterceptor('file', { storage: documentStorage }))
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

  @Post(':id/timeline')
  @ApiOperation({
    summary: 'Add a manual timeline entry for a real-world milestone',
  })
  addTimelineEntry(
    @Param('id') id: string,
    @Body() dto: AddAdrTimelineEntryDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addTimelineEntry(t || u, id, dto);
  }

  @Post(':id/checklist')
  @ApiOperation({ summary: 'Add a prep checklist item' })
  addChecklistItem(
    @Param('id') id: string,
    @Body() dto: AddAdrChecklistItemDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addChecklistItem(t || u, id, dto);
  }

  @Patch(':id/checklist/:itemId')
  @ApiOperation({ summary: 'Check / uncheck a prep checklist item' })
  setChecklistItemDone(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: SetAdrChecklistItemDoneDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setChecklistItemDone(t || u, id, itemId, dto);
  }

  @Post(':id/disbursements')
  @ApiOperation({ summary: 'Record a disbursement' })
  addDisbursement(
    @Param('id') id: string,
    @Body() dto: AddAdrDisbursementDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addDisbursement(t || u, id, dto);
  }

  @Post(':id/escalate')
  @ApiOperation({
    summary:
      'Escalate to litigation — creates the linked litigation case, preserves ADR history',
  })
  escalate(
    @Param('id') id: string,
    @Body() dto: EscalateToLitigationDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.escalateToLitigation(t || u, id, dto);
  }
}
