import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { EngagementLetterService } from '../services/engagement-letter.service';
import {
  UserTypes,
  Roles,
  CurrentUser,
  Public,
} from '../../../common/decorators/index';
import {
  UserType,
  TenantRole,
} from '../../../common/interfaces/user-role.enum';

// ── Multer storage config ────────────────────────────────────
// Saves PDFs to /uploads/engagement/ with a UUID filename
const engagementStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(process.cwd(), 'uploads', 'engagement');
    if (!existsSync(uploadPath)) {
      mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const pdfFileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new BadRequestException('Only PDF files are accepted.'), false);
  }
};

@ApiTags('Engagement Letter')
@ApiBearerAuth('bearerAuth')
@Controller('tenant/engagement')
export class EngagementLetterController {
  constructor(private readonly engagementService: EngagementLetterService) {}

  // ═══════════════════════════════════════════════════════════
  // PUBLIC — No auth (prospect hasn't got credentials yet)
  // ═══════════════════════════════════════════════════════════

  /**
   * GET /tenant/engagement/sign/:token
   * Returns document metadata + PDF URL for the public signing page.
   */
  @Get('sign/:token')
  @Public()
  @ApiOperation({ summary: 'Get engagement document for signing [public]' })
  getLetterByToken(@Param('token') token: string) {
    return this.engagementService.getLetterByToken(token);
  }

  /**
   * POST /tenant/engagement/sign/:token
   * Prospect submits their name to sign. Triggers:
   *  - DB record update
   *  - Signed certificate PDF generated
   *  - Certificate emailed to both parties
   *  - Client credentials emailed
   */
  @Post('sign/:token')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign engagement document [public]' })
  signLetter(
    @Param('token') token: string,
    @Body() body: { confirmedName: string },
    @Req() req: any,
  ) {
    const ipAddress =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.connection?.remoteAddress ||
      null;
    return this.engagementService.signLetter(token, {
      confirmedName: body.confirmedName,
      ipAddress,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // TENANT — Manage their engagement document
  // ═══════════════════════════════════════════════════════════

  /**
   * POST /tenant/engagement/upload
   * Tenant uploads their PDF. Replaces existing if already uploaded.
   * Multipart form — fields: documentType, title, file
   */
  @Post('upload')
  @UserTypes(UserType.TENANT)
  @Roles(TenantRole.TENANT_OWNER, TenantRole.TENANT_ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: engagementStorage,
      fileFilter: pdfFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'documentType', 'title'],
      properties: {
        file: { type: 'string', format: 'binary' },
        documentType: {
          type: 'string',
          enum: ['engagement_letter', 'terms_and_agreement'],
        },
        title: {
          type: 'string',
          example: 'Terms of Engagement & Client Authorization',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload engagement letter or T&C PDF [owner, admin]',
  })
  uploadLetter(
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      documentType: 'engagement_letter' | 'terms_and_agreement';
      title: string;
    },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.engagementService.uploadLetter(t || u, file, body);
  }

  /**
   * GET /tenant/engagement/my-document
   * Returns the tenant's current engagement document metadata.
   */
  @Get('my-document')
  @UserTypes(UserType.TENANT)
  @ApiOperation({ summary: 'Get my current engagement document' })
  getMyLetter(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.engagementService.getMyLetter(t || u);
  }

  /**
   * DELETE /tenant/engagement/my-document
   * Deletes the PDF and the DB record.
   */
  @Delete('my-document')
  @UserTypes(UserType.TENANT)
  @Roles(TenantRole.TENANT_OWNER, TenantRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Delete engagement document [owner, admin]' })
  deleteLetter(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.engagementService.deleteLetter(t || u);
  }

  /**
   * PATCH /tenant/engagement/bypass
   * Tenant explicitly toggles the signing requirement on/off.
   * Body: { bypass: boolean }
   */
  @Patch('bypass')
  @UserTypes(UserType.TENANT)
  @Roles(TenantRole.TENANT_OWNER, TenantRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Toggle engagement signing bypass [owner, admin]',
    description:
      'When bypass=true, clients will receive credentials immediately on creation ' +
      'without needing to sign an engagement document. ' +
      'This should be a conscious decision — the UI should make the implication clear.',
  })
  setBypass(
    @Body() body: { bypass: boolean },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.engagementService.setBypass(t || u, body.bypass);
  }

  /**
   * GET /tenant/engagement/signings
   * Lists all client signing records for this tenant.
   */
  @Get('signings')
  @UserTypes(UserType.TENANT)
  @ApiOperation({ summary: 'View all client engagement signing records' })
  getSignings(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.engagementService.getSigningStatus(t || u);
  }

  /**
   * POST /tenant/engagement/resend/:clientId
   * Resends the signing link to a client (expires old token first).
   */
  @Post('resend/:clientId')
  @UserTypes(UserType.TENANT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend signing link to client' })
  resend(
    @Param('clientId') clientId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.engagementService.resendSigningLink(clientId, t || u);
  }

  /**
   * POST /tenant/engagement/mark-signed-offline/:clientId
   * Records that a client signed offline (outside the platform).
   * Handles existing clients who signed before the platform existed.
   */
  @Post('mark-signed-offline/:clientId')
  @UserTypes(UserType.TENANT)
  @Roles(
    TenantRole.TENANT_OWNER,
    TenantRole.TENANT_ADMIN,
    TenantRole.TENANT_COMPLIANCE,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark client as signed offline [owner, admin, compliance]',
    description:
      'For clients who signed their engagement letter outside the platform. ' +
      'Records the signing date and adds an audit trail entry.',
  })
  markOffline(
    @Param('clientId') clientId: string,
    @Body() dto: { signedDate: string; note?: string },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.engagementService.markSignedOffline(clientId, t || u, dto);
  }
}
