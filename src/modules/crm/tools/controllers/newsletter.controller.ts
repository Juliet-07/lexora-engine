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
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import {
  SegmentService,
  CampaignService,
  NewsletterDraftService,
  ClientNewsletterService,
  AlertService,
} from '../services';
import {
  CreateSegmentDto,
  UpdateSegmentDto,
  CreateCampaignDto,
  PreviewNewsletterDto,
  UpdateCampaignDto,
  ScheduleCampaignDto,
  SendTestDto,
  MarkDraftConvertedDto,
  CreateAlertDto,
  UpdateAlertDto,
  ScheduleAlertDto,
  SendTestAlertDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Tools — Newsletters')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('tools/segments')
export class SegmentController {
  constructor(private readonly service: SegmentService) {}

  @Get()
  @ApiOperation({
    summary: 'All segments, each with a real, live-resolved member count',
  })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Post()
  @ApiOperation({ summary: 'Create a segment' })
  create(
    @Body() dto: CreateSegmentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a segment' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSegmentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.update(t || u, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a segment' })
  delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.delete(t || u, id);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Real, live-resolved members of a segment' })
  getMembers(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getResolvedMembers(t || u, id);
  }
}

// Images / GIFs for template newsletters. Stored per tenant and
// returned as an absolute URL (APP_URL-prefixed) because the image
// has to resolve inside a recipient's inbox, not just inside this app.
const NEWSLETTER_IMAGE_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};
const newsletterImageConfig = {
  storage: memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB — GIFs run large
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) =>
    NEWSLETTER_IMAGE_EXT[file.mimetype]
      ? cb(null, true)
      : cb(
          new BadRequestException(
            'Only PNG, JPG, GIF, or WEBP images are accepted.',
          ),
          false,
        ),
};

@ApiTags('CRM — Tools — Newsletters')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('tools/campaigns')
export class CampaignController {
  constructor(private readonly service: CampaignService) {}

  @Get()
  @ApiOperation({ summary: 'All campaigns' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One campaign' })
  getById(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Post('media')
  @UseInterceptors(FileInterceptor('file', newsletterImageConfig))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload an image / GIF for a template newsletter — returns an absolute URL',
  })
  uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    const tenant = String(t || u);
    const dir = join(process.cwd(), 'uploads', 'newsletters', tenant);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const filename = `${randomUUID()}${NEWSLETTER_IMAGE_EXT[file.mimetype]}`;
    writeFileSync(join(dir, filename), file.buffer);
    const base =
      process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
    return { url: `${base}/uploads/newsletters/${tenant}/${filename}` };
  }

  @Post('preview')
  @ApiOperation({
    summary:
      'Render a template newsletter exactly as recipients will receive it — nothing is saved or sent',
  })
  preview(
    @Body() dto: PreviewNewsletterDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.previewTemplate(t || u, dto);
  }

  @Post()
  @ApiOperation({
    summary:
      "Create a campaign — snapshots the target segment's real members at creation time",
  })
  create(
    @Body() dto: CreateCampaignDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Edit a campaign — allowed while Draft or Scheduled; refused once Sending or Sent',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.update(t || u, id, dto);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate a campaign as a new draft' })
  duplicate(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.duplicate(t || u, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a campaign' })
  delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.delete(t || u, id);
  }

  @Post(':id/schedule')
  @ApiOperation({ summary: 'Schedule a draft campaign for a future send' })
  schedule(
    @Param('id') id: string,
    @Body() dto: ScheduleCampaignDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.schedule(t || u, id, dto);
  }

  @Post(':id/unschedule')
  @ApiOperation({
    summary: 'Cancel a scheduled send and return the campaign to Draft',
  })
  unschedule(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.unschedule(t || u, id);
  }

  @Post(':id/send-now')
  @ApiOperation({
    summary: 'Send immediately — real SMTP sends to every real recipient',
  })
  sendNow(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.sendNow(t || u, id);
  }

  @Post(':id/send-test')
  @ApiOperation({ summary: 'Send a real test email to one address' })
  sendTest(
    @Param('id') id: string,
    @Body() dto: SendTestDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.sendTest(t || u, id, dto);
  }
}

@ApiTags('CRM — Tools — Newsletters')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('tools/newsletter-drafts')
export class NewsletterDraftController {
  constructor(private readonly service: NewsletterDraftService) {}

  @Get()
  @ApiOperation({ summary: 'All newsletter drafts' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Post('generate')
  @ApiOperation({
    summary:
      'Generate a real draft from regulatory changes not yet covered by a prior draft',
  })
  generate(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.generateFromRegulatoryFeed(t || u);
  }

  @Post(':id/mark-converted')
  @ApiOperation({ summary: 'Mark a draft as converted into a real campaign' })
  markConverted(
    @Param('id') id: string,
    @Body() dto: MarkDraftConvertedDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.markConverted(t || u, id, dto.campaignId);
  }
}

@ApiTags('CRM — Tools — Newsletters')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('tools/alerts')
export class AlertController {
  constructor(private readonly service: AlertService) {}

  @Get()
  @ApiOperation({ summary: 'All alerts' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One alert' })
  getById(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Post()
  @ApiOperation({
    summary:
      "Create an alert — snapshots the target segment's real members at creation time",
  })
  create(
    @Body() dto: CreateAlertDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Edit an alert — allowed while Draft or Scheduled; refused once Sending or Sent',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAlertDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.update(t || u, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an alert' })
  delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.delete(t || u, id);
  }

  @Post(':id/schedule')
  @ApiOperation({ summary: 'Schedule a draft alert for a future send' })
  schedule(
    @Param('id') id: string,
    @Body() dto: ScheduleAlertDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.schedule(t || u, id, dto);
  }

  @Post(':id/unschedule')
  @ApiOperation({
    summary: 'Cancel a scheduled send and return the alert to Draft',
  })
  unschedule(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.unschedule(t || u, id);
  }

  @Post(':id/send-now')
  @ApiOperation({
    summary:
      'Approve and send immediately — real SMTP sends to every real recipient',
  })
  sendNow(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.sendNow(t || u, id);
  }

  @Post(':id/send-test')
  @ApiOperation({ summary: 'Send a real test email to one address' })
  sendTest(
    @Param('id') id: string,
    @Body() dto: SendTestAlertDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.sendTest(t || u, id, dto);
  }
}

// ── Client-facing — the tenant's own client viewing newsletters
// sent to them. Same crm/client-* URL convention client-invoices,
// client-projects and client-tickets already use, so the client
// app's existing auth/routing setup covers this without changes.
@ApiTags('CRM — Tools — Newsletters')
@ApiBearerAuth()
@UserTypes(UserType.CLIENT)
@Controller('crm/client-newsletters')
export class ClientNewsletterController {
  constructor(private readonly service: ClientNewsletterService) {}

  @Get()
  @ApiOperation({ summary: 'My own real, sent newsletters' })
  getMyNewsletters(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMyNewsletters(t || u, u);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'One of my own newsletters — marks it opened, a real signal set only when I actually view it',
  })
  getMyNewsletter(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMyNewsletter(t || u, u, id);
  }
}

// ── Board Portal — "renders in the page for Newsletter" (PO, Oct
// 2026). Same real-sent-only / real-recipient-only shape as
// ClientNewsletterController above, scoped to the caller's own
// BoardMember record via CampaignService.resolveBoardMember.
@ApiTags('CRM — Tools — Newsletters')
@ApiBearerAuth()
@UserTypes(UserType.BOARD_MEMBER)
@Controller('board-portal/newsletters')
export class BoardPortalNewsletterController {
  constructor(private readonly service: CampaignService) {}

  @Get()
  @ApiOperation({ summary: 'My own real, sent newsletters' })
  getMyNewsletters(@CurrentUser('sub') userId: string) {
    return this.service.getMyBoardPortalNewsletters(userId);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'One of my own newsletters — marks it opened, a real signal set only when I actually view it',
  })
  getMyNewsletter(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.service.getMyBoardPortalNewsletter(userId, id);
  }
}
