import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { CommentService } from '../services';
import { AddCommentDto, EditCommentDto, ToggleReactionDto } from '../dtos';
import { CommentSubjectType } from '../schemas';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  ContractService,
  TenantContractTemplateService,
  TenantLetterheadService,
} from '../services';
import {
  CreateContractDto,
  ExecuteContractDto,
  AddNegotiationRoundDto,
  AddAmendmentDto,
  AddObligationDto,
  CreateTenantTemplateDto,
  UpdateTenantTemplateDto,
  UploadTenantTemplateDto,
  SetObligationDoneDto,
} from '../dtos';

@ApiTags('CRM — Tools — Contracts')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('tools/comments')
export class CommentController {
  constructor(private readonly service: CommentService) {}

  @Get(':subjectType/:subjectId')
  @ApiOperation({
    summary:
      'Real threaded comments for a subject, reconstructed as a tree from flat storage',
  })
  getThread(
    @Param('subjectType') subjectType: CommentSubjectType,
    @Param('subjectId') subjectId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getThread(t || u, subjectType, subjectId);
  }

  @Post(':subjectType/:subjectId')
  @ApiOperation({ summary: 'Add a comment or, with parentId, a real reply' })
  addComment(
    @Param('subjectType') subjectType: CommentSubjectType,
    @Param('subjectId') subjectId: string,
    @Body() dto: AddCommentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addComment(t || u, subjectType, subjectId, dto);
  }

  @Patch(':commentId')
  @ApiOperation({ summary: 'Edit a comment' })
  editComment(
    @Param('commentId') commentId: string,
    @Body() dto: EditCommentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.editComment(t || u, commentId, dto);
  }

  @Delete(':commentId')
  @ApiOperation({ summary: 'Soft-delete a comment — replies stay intact' })
  deleteComment(
    @Param('commentId') commentId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.deleteComment(t || u, commentId);
  }

  @Post(':commentId/react')
  @ApiOperation({ summary: 'Toggle a real reaction on a comment' })
  toggleReaction(
    @Param('commentId') commentId: string,
    @Body() dto: ToggleReactionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.toggleReaction(t || u, commentId, dto);
  }

  @Get('mention-directory')
  @ApiOperation({
    summary: 'Real employee directory for @mention autocomplete',
  })
  getMentionDirectory(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getMentionDirectory(t || u);
  }
}

@ApiTags('CRM — Tools — Contracts')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('tools/contracts')
export class ContractController {
  constructor(private readonly service: ContractService) {}

  @Get()
  @ApiOperation({ summary: 'All contracts' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get('expiring')
  @ApiQuery({ name: 'withinDays', required: false })
  @ApiOperation({
    summary: 'Real, live-computed contracts expiring within a window',
  })
  getExpiring(
    @Query('withinDays') withinDays: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getExpiring(
      t || u,
      withinDays ? Number(withinDays) : undefined,
    );
  }

  @Get('obligations-due')
  @ApiQuery({ name: 'withinDays', required: false })
  @ApiOperation({
    summary: 'Real, live-computed obligations due across all contracts',
  })
  getObligationsDue(
    @Query('withinDays') withinDays: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getObligationsDue(
      t || u,
      withinDays ? Number(withinDays) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'One contract' })
  getById(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a contract, starting at Draft' })
  create(
    @Body() dto: CreateContractDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Post(':id/advance')
  @ApiOperation({ summary: 'Advance to the next real stage in sequence' })
  advanceStage(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.advanceStage(t || u, id);
  }

  @Post(':id/execute')
  @ApiOperation({
    summary:
      'Capture signature — moves to Active with real executed/effective dates',
  })
  executeContract(
    @Param('id') id: string,
    @Body() dto: ExecuteContractDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.executeContract(t || u, id, dto);
  }

  @Post(':id/initiate-renewal')
  @ApiOperation({ summary: 'Move a contract into Renewal' })
  initiateRenewal(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.initiateRenewal(t || u, id);
  }

  @Post(':id/toggle-auto-renew')
  @ApiOperation({ summary: 'Toggle auto-renewal' })
  toggleAutoRenew(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.toggleAutoRenew(t || u, id);
  }

  @Post(':id/rounds')
  @ApiOperation({ summary: 'Add a negotiation round' })
  addNegotiationRound(
    @Param('id') id: string,
    @Body() dto: AddNegotiationRoundDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addNegotiationRound(t || u, id, dto);
  }

  @Post(':id/amendments')
  @ApiOperation({ summary: 'Add an amendment' })
  addAmendment(
    @Param('id') id: string,
    @Body() dto: AddAmendmentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addAmendment(t || u, id, dto);
  }

  @Post(':id/obligations')
  @ApiOperation({ summary: 'Add an obligation' })
  addObligation(
    @Param('id') id: string,
    @Body() dto: AddObligationDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addObligation(t || u, id, dto);
  }

  @Post(':id/obligations/:obligationId/done')
  @ApiOperation({ summary: 'Mark an obligation done or not done' })
  setObligationDone(
    @Param('id') id: string,
    @Param('obligationId') obligationId: string,
    @Body() dto: SetObligationDoneDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setObligationDone(t || u, id, obligationId, dto);
  }
}

// ── Same real disk-storage convention already used for platform
// templates and engagement letters — /uploads/{feature}/ with a
// UUID filename, served back via main.ts's existing /uploads
// static prefix. ───────────────────────────────────────────────
const tenantTemplateStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(
      process.cwd(),
      'uploads',
      'tenant-contract-templates',
    );
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
const letterheadStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(process.cwd(), 'uploads', 'letterheads');
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

const templateFileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const allowed = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new BadRequestException(
        'Only PDF or Word documents (.pdf, .doc, .docx) are accepted.',
      ),
      false,
    );
  }
};
const imageFileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new BadRequestException('Only image files are accepted.'), false);
  }
};

@ApiTags('CRM — Tools — Contracts')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('tools/contract-templates')
export class TenantContractTemplateController {
  constructor(private readonly service: TenantContractTemplateService) {}

  @Get()
  @ApiOperation({ summary: 'My own contract templates' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get('available')
  @ApiOperation({
    summary:
      'Real picker — published platform templates merged with my own, each tagged with a real source',
  })
  getAvailable(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAvailableTemplates(t || u);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my own templates' })
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an authored (rich-text) template' })
  create(
    @Body() dto: CreateTenantTemplateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: tenantTemplateStorage,
      fileFilter: templateFileFilter,
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'title', 'type'],
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        type: { type: 'string' },
        jurisdiction: { type: 'string' },
        description: { type: 'string' },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload an existing PDF or Word document as my own template',
  })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadTenantTemplateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.upload(t || u, file, dto);
  }

  @Post(':id/replace-file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: tenantTemplateStorage,
      fileFilter: templateFileFilter,
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: "Replace an uploaded template's real file" })
  replaceFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.replaceFile(t || u, id, file);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an authored template' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantTemplateDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.update(t || u, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a template — real file on disk is removed too, if any',
  })
  delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.delete(t || u, id);
  }
}

@ApiTags('CRM — Tools — Contracts')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('tools/letterhead')
export class TenantLetterheadController {
  constructor(private readonly service: TenantLetterheadService) {}

  @Get()
  @ApiOperation({ summary: 'My real uploaded letterhead, if any' })
  getMine(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getMine(t || u);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: letterheadStorage,
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Upload (or replace) my letterhead' })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.upload(t || u, file);
  }

  @Delete()
  @ApiOperation({ summary: 'Remove my letterhead' })
  delete(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.delete(t || u);
  }
}
