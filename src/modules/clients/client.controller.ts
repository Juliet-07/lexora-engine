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
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiConsumes,
  ApiBody,
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
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { diskStorage } from 'multer';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString, MinLength } from 'class-validator';

// ─────────────────────────────────────────────────────────────
// MULTER CONFIG — saves to ./uploads/onboarding/
// ─────────────────────────────────────────────────────────────

const uploadStorage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'onboarding'),
  filename: (_req, file, cb) => {
    // uuid + original extension → prevents collisions and path traversal
    const safeName = `${uuidv4()}${extname(file.originalname).toLowerCase()}`;
    cb(null, safeName);
  },
});

const allowedMimeTypes = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const fileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: (err: Error | null, accept: boolean) => void,
) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new BadRequestException(
        'Only PDF, JPG, PNG, DOC, DOCX files are allowed',
      ),
      false,
    );
  }
};

export class RespondToAlertDto {
  @IsString()
  @MinLength(10, { message: 'Response must be at least 10 characters.' })
  note: string;

  @IsOptional()
  @IsString()
  documentUrl?: string;
}

// ─────────────────────────────────────────────────────────────
// CLIENT DASHBOARD
// ─────────────────────────────────────────────────────────────
@ApiTags('Client — Dashboard')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.CLIENT)
@Controller('client')
export class ClientDashboardController {
  constructor(private readonly dashboardService: ClientDashboardService) {}

  // ─────────────────────────────────────────────────────────────
  // DASHBOARD
  // ─────────────────────────────────────────────────────────────
  @Get('dashboard')
  @ApiOperation({
    summary: 'Client dashboard — profile, onboarding status, KYC status',
  })
  getDashboard(@CurrentUser('sub') clientId: string) {
    return this.dashboardService.getDashboard(clientId);
  }

  // ─────────────────────────────────────────────────────────────
  // ALERTS
  // ─────────────────────────────────────────────────────────────
  @Get('alerts')
  @ApiOperation({
    summary: 'Get all compliance alerts for this client',
    description:
      'Returns summary counts (open, acknowledged, resolved) and the full ' +
      'alert list sorted newest first. Open alerts require a response.',
  })
  getMyAlerts(@CurrentUser('sub') clientId: string) {
    return this.dashboardService.getMyAlerts(clientId);
  }

  @Get('alerts/:id')
  @ApiOperation({ summary: 'Get a single compliance alert by ID' })
  getMyAlertById(
    @Param('id') id: string,
    @CurrentUser('sub') clientId: string,
  ) {
    return this.dashboardService.getMyAlertById(id, clientId);
  }

  @Post('alerts/:id/respond')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Acknowledge alert and submit a response',
    description:
      'Client confirms they have seen the alert and provides their explanation. ' +
      'Optionally attach a document URL as supporting evidence. ' +
      'Alert moves from OPEN to ACKNOWLEDGED. Can only respond once.',
  })
  respondToAlert(
    @Param('id') id: string,
    @CurrentUser('sub') clientId: string,
    @Body() dto: RespondToAlertDto,
  ) {
    return this.dashboardService.respondToAlert(id, clientId, dto);
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

  @Post('upload')
  @ApiOperation({
    summary: 'Upload a document file',
    description:
      'Uploads a file to the server storage and returns the URL. ' +
      'Then call POST /client/onboarding/documents with that URL to attach it to the form. ' +
      'Accepted: PDF, JPG, PNG, DOC, DOCX. Max size: 10MB.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: uploadStorage,
      fileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('No file received.');

    // Build the accessible URL — works locally and in production
    // In production: set APP_URL=https://api.yourdomain.com in .env
    const baseUrl =
      process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
    const fileUrl = `${baseUrl}/uploads/onboarding/${file.filename}`;

    return {
      success: true,
      fileUrl,
      originalName: file.originalname,
      fileName: file.filename,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  // ── Attach document URL to onboarding record ─────────────
  @Post('documents')
  @ApiOperation({
    summary: 'Attach an uploaded document to the onboarding form',
    description:
      'After uploading the file via POST /client/onboarding/upload, ' +
      'submit the returned `fileUrl` here to attach it to the form.',
  })
  addDocument(
    @CurrentUser('sub') clientId: string,
    @Body() dto: AddDocumentDto,
  ) {
    return this.onboardingService.addDocument(clientId, dto);
  }

  // Remove document
  @Delete('documents')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a document by URL' })
  removeDocument(
    @CurrentUser('sub') clientId: string,
    @Body() dto: RemoveDocumentDto,
  ) {
    return this.onboardingService.removeDocument(clientId, dto);
  }

  // ── Final submit ──────────────────────────────────────────
  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit the onboarding form',
    description:
      'Locks the form. All three declaration booleans must be true and ' +
      'signature must be provided. Sets kycStatus to "submitted".',
  })
  submit(
    @CurrentUser('sub') clientId: string,
    @Body() dto: SubmitOnboardingDto,
    @Req() req: Request,
  ) {
    return this.onboardingService.submit(clientId, dto, req.ip || '');
  }
}
