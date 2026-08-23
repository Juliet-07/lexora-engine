import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  SegmentService,
  CampaignService,
  NewsletterDraftService,
  ClientNewsletterService,
} from '../services';
import {
  CreateSegmentDto,
  UpdateSegmentDto,
  CreateCampaignDto,
  UpdateCampaignDto,
  ScheduleCampaignDto,
  SendTestDto,
  MarkDraftConvertedDto,
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
