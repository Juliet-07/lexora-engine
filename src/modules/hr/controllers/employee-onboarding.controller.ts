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
  ApiQuery,
} from '@nestjs/swagger';
import { OnboardingService } from '../services';
import {
  CreateOnboardingDocumentDto,
  UpdateOnboardingDocumentDto,
} from '../dtos';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';

// ── Multer storage — uploads/employee/onboarding/ ──────────────
// Mirrors the existing uploads/engagement and uploads/onboarding
// patterns. "employee" is the general namespace for anything tied
// to employee records (onboarding docs now, payslips etc. later).
const onboardingStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(process.cwd(), 'uploads', 'employee', 'onboarding');
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

@ApiTags('HR — Onboarding (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/onboarding-documents')
export class HrOnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get()
  @ApiQuery({ name: 'includeInactive', required: false })
  @ApiOperation({ summary: 'List onboarding documents for this tenant' })
  getDocuments(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.onboardingService.getDocuments(
      t || u,
      includeInactive === 'true',
    );
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: onboardingStorage,
      fileFilter: pdfFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'type'],
      properties: {
        title: { type: 'string', example: 'Code of Conduct' },
        type: { type: 'string', enum: ['text', 'pdf'] },
        content: {
          type: 'string',
          description: 'Required when type is "text"',
        },
        order: { type: 'number' },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Required when type is "pdf"',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Create an onboarding document (text or PDF upload)',
  })
  createDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateOnboardingDocumentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.onboardingService.createDocument(t || u, dto, file);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: onboardingStorage,
      fileFilter: pdfFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update an onboarding document (optionally replace PDF)',
  })
  updateDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UpdateOnboardingDocumentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.onboardingService.updateDocument(t || u, id, dto, file);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an onboarding document' })
  async deleteDocument(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.onboardingService.deleteDocument(t || u, id);
    return { success: true };
  }

  // ── Admin view of a specific employee's onboarding record ──
  // Used by the Employee Detail Sheet's Onboarding tab.
  // Lives here rather than hr.controller.ts to keep onboarding
  // concerns together; route is still under /hr so it's admin-only.

  @Get('employee/:employeeId')
  @ApiOperation({
    summary: "Get a specific employee's onboarding acknowledgement record",
  })
  getEmployeeRecord(
    @Param('employeeId') employeeId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.onboardingService.getEmployeeOnboardingRecord(
      employeeId,
      t || u,
    );
  }
}
