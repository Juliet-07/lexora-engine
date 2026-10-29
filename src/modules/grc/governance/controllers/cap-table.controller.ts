import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { Request, Response } from 'express';
import {
  CapTableService,
  SHAREHOLDER_DOC_DIR,
} from '../services/cap-table.service';
import {
  AddShareholderDto,
  CreateConvertibleDto,
  CreateShareClassDto,
  CreateShareholderDocumentDto,
  CreateShareTransactionDto,
  CreateVestingDto,
  UpdateConvertibleDto,
  UpdateShareClassDto,
  UpdateShareholderDocumentDto,
  UpdateVestingDto,
} from '../dtos/cap-table.dto';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

const ALLOWED = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
];
const fileFilter = (_req: any, file: Express.Multer.File, cb: any) =>
  ALLOWED.includes(file.mimetype)
    ? cb(null, true)
    : cb(new BadRequestException('Unsupported file type.'), false);

const storageIn = (...segments: string[]) =>
  diskStorage({
    destination: (_req, _file, cb) => {
      const dir = segments.length
        ? join(process.cwd(), 'uploads', ...segments)
        : SHAREHOLDER_DOC_DIR;
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) =>
      cb(null, `${uuidv4()}${extname(file.originalname)}`),
  });

// Shareholders' documents go to a NON-public folder (see
// SHAREHOLDER_DOC_DIR) — everything else follows the other GRC
// document uploads under /uploads.
const privateDocUpload = FileInterceptor('file', {
  storage: storageIn(),
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 },
});
const convertibleDocUpload = FileInterceptor('file', {
  storage: storageIn('grc', 'convertibles'),
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 },
});

const clientIp = (req: Request) =>
  (String(req.headers['x-forwarded-for'] ?? '')
    .split(',')[0]
    .trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    '') as string;

// Governance → Organisation Structure → Cap Table & Share Register.
@ApiTags('GRC — Governance — Cap Table')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/governance/cap-table')
export class CapTableController {
  constructor(private readonly service: CapTableService) {}

  @Get()
  @ApiOperation({
    summary:
      'Share register — classes, holders (derived from the ledger), totals',
  })
  overview(@CurrentUser('tenantId') t: string, @CurrentUser('sub') u: string) {
    return this.service.getOverview(t || u);
  }

  @Get('fx')
  @ApiOperation({
    summary:
      'Rate from the tenant base currency into a display currency (all amounts are stored in base currency)',
  })
  fx(
    @Query('currency') currency: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.getFx(t || u, currency);
  }

  @Post('shareholders')
  @ApiOperation({
    summary:
      'Add a shareholder — a new person, or an existing node (e.g. a board member) taking the Shareholder role — with an optional first issuance',
  })
  addShareholder(
    @Body() dto: AddShareholderDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.addShareholder(t || u, dto);
  }

  // ── Classes ───────────────────────────────────────────────────
  @Post('classes')
  createClass(
    @Body() dto: CreateShareClassDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.createClass(t || u, dto);
  }
  @Patch('classes/:id')
  updateClass(
    @Param('id') id: string,
    @Body() dto: UpdateShareClassDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.updateClass(t || u, id, dto);
  }
  @Delete('classes/:id')
  deleteClass(
    @Param('id') id: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.deleteClass(t || u, id);
  }

  // ── Transactions ──────────────────────────────────────────────
  @Get('transactions')
  transactions(
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.listTransactions(t || u);
  }
  @Post('transactions')
  @ApiOperation({
    summary: 'Record an issuance, transfer, buyback or valuation',
  })
  createTransaction(
    @Body() dto: CreateShareTransactionDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.createTransaction(t || u, dto);
  }
  @Delete('transactions/:id')
  deleteTransaction(
    @Param('id') id: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.deleteTransaction(t || u, id);
  }

  // ── Vesting ───────────────────────────────────────────────────
  @Get('vesting')
  vesting(@CurrentUser('tenantId') t: string, @CurrentUser('sub') u: string) {
    return this.service.listVesting(t || u);
  }
  @Post('vesting')
  createVesting(
    @Body() dto: CreateVestingDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.createVesting(t || u, dto);
  }
  @Patch('vesting/:id')
  updateVesting(
    @Param('id') id: string,
    @Body() dto: UpdateVestingDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.updateVesting(t || u, id, dto);
  }
  @Delete('vesting/:id')
  deleteVesting(
    @Param('id') id: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.deleteVesting(t || u, id);
  }

  // ── Convertible instruments ───────────────────────────────────
  @Get('convertibles')
  convertibles(
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.listConvertibles(t || u);
  }
  @Post('convertibles')
  createConvertible(
    @Body() dto: CreateConvertibleDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.createConvertible(t || u, dto);
  }
  @Patch('convertibles/:id')
  updateConvertible(
    @Param('id') id: string,
    @Body() dto: UpdateConvertibleDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.updateConvertible(t || u, id, dto);
  }
  @Delete('convertibles/:id')
  deleteConvertible(
    @Param('id') id: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.deleteConvertible(t || u, id);
  }
  @Post('convertibles/:id/documents')
  @UseInterceptors(convertibleDocUpload)
  @ApiConsumes('multipart/form-data')
  addConvertibleDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.addConvertibleDocument(t || u, id, file);
  }
  @Delete('convertibles/:id/documents/:index')
  removeConvertibleDocument(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.removeConvertibleDocument(t || u, id, Number(index));
  }

  // ── Shareholders' documents (private store + access log) ──────
  @Get('documents')
  documents(@CurrentUser('tenantId') t: string, @CurrentUser('sub') u: string) {
    return this.service.listDocuments(t || u);
  }

  @Get('documents/access-log')
  @ApiOperation({
    summary:
      'Who uploaded, viewed, downloaded or deleted shareholder documents',
  })
  accessLog(@CurrentUser('tenantId') t: string, @CurrentUser('sub') u: string) {
    return this.service.accessLog(t || u);
  }

  @Post('documents')
  @UseInterceptors(privateDocUpload)
  @ApiConsumes('multipart/form-data')
  createDocument(
    @Body() dto: CreateShareholderDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.createDocument(t || u, u, clientIp(req), dto, file);
  }

  @Patch('documents/:id')
  updateDocument(
    @Param('id') id: string,
    @Body() dto: UpdateShareholderDocumentDto,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.updateDocument(t || u, id, dto);
  }

  @Post('documents/:id/files')
  @UseInterceptors(privateDocUpload)
  @ApiConsumes('multipart/form-data')
  addDocumentFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.addDocumentFile(t || u, u, clientIp(req), id, file);
  }

  @Get('documents/:id/files/:index')
  @ApiOperation({
    summary:
      'Stream a stored file (authenticated and logged). ?action=download for a download, otherwise it is logged as a view.',
  })
  async openDocumentFile(
    @Param('id') id: string,
    @Param('index') index: string,
    @Query('action') action: string,
    @Req() req: Request,
    @Res() res: Response,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    const download = action === 'download';
    const { stream, name, mimeType } = await this.service.openDocumentFile(
      t || u,
      u,
      clientIp(req),
      id,
      Number(index),
      download ? 'Downloaded' : 'Viewed',
    );
    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    stream.pipe(res);
  }

  @Delete('documents/:id')
  deleteDocument(
    @Param('id') id: string,
    @Req() req: Request,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.deleteDocument(t || u, u, clientIp(req), id);
  }
}
