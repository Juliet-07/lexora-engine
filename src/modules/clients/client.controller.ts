import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';

import { OnboardingService } from './services/onboarding.service';
import { ClientDashboardService } from './services/client-dashboard.service';
import {
  SaveOnboardingDto,
  SubmitOnboardingDto,
  AddDocumentDto,
  RemoveDocumentDto,
} from './dto/onboarding.dto';
import { OnboardingStatus } from './schemas/onboarding.schema';
import { UserTypes, Roles, CurrentUser } from '../../common/decorators/index';
import { UserType, TenantRole } from '../../common/interfaces/user-role.enum';

// ─────────────────────────────────────────────────────────────
// CLIENT DASHBOARD
// ─────────────────────────────────────────────────────────────
@ApiTags('Client — Dashboard')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.CLIENT)
@Controller('client')
export class ClientDashboardController {
  constructor(private readonly dashboardService: ClientDashboardService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Client dashboard — profile, onboarding status, KYC status',
  })
  getDashboard(@CurrentUser('sub') clientId: string) {
    return this.dashboardService.getDashboard(clientId);
  }
}

// ─────────────────────────────────────────────────────────────
// CLIENT ONBOARDING — 4 endpoints, matches the frontend exactly
// ─────────────────────────────────────────────────────────────
@ApiTags('Client — Onboarding')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.CLIENT)
@Controller('client/onboarding')
export class ClientOnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get()
  @ApiOperation({
    summary: 'Get onboarding form',
    description:
      'Returns current draft with all saved fields in `formData`. ' +
      'Auto-creates an empty draft on first visit. ' +
      'Use `formData` to pre-populate the form on page load. ' +
      '`sectionCompletion` restores the progress bar.',
  })
  get(@CurrentUser('sub') clientId: string) {
    return this.onboardingService.get(clientId);
  }

  @Patch('save')
  @ApiOperation({
    summary: 'Save draft',
    description:
      'Merges incoming `formData` onto the existing draft. ' +
      'Only fields you send are updated — everything else is untouched. ' +
      'Call on every step change and on the Save Draft button.',
  })
  save(@CurrentUser('sub') clientId: string, @Body() dto: SaveOnboardingDto) {
    return this.onboardingService.save(clientId, dto);
  }

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit final form',
    description:
      'Locks the form. Requires all three consent booleans and a signature. ' +
      'Sets kycStatus to submitted. Form becomes read-only.',
  })
  submit(
    @CurrentUser('sub') clientId: string,
    @Body() dto: SubmitOnboardingDto,
    @Req() req: Request,
  ) {
    return this.onboardingService.submit(clientId, dto, req.ip || '');
  }

  @Post('documents')
  @ApiOperation({
    summary: 'Attach document (Azure Blob URL)',
    description:
      'Upload to Azure first via your existing uploader, then POST the URL here.',
  })
  addDocument(
    @CurrentUser('sub') clientId: string,
    @Body() dto: AddDocumentDto,
  ) {
    return this.onboardingService.addDocument(clientId, dto);
  }

  @Delete('documents')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a document by URL' })
  removeDocument(
    @CurrentUser('sub') clientId: string,
    @Body() dto: RemoveDocumentDto,
  ) {
    return this.onboardingService.removeDocument(clientId, dto);
  }
}
