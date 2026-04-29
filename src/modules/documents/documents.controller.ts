import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import {
  UploadDocumentDto,
  UpdateDocumentDto,
  SendDocumentDto,
  UpdateDocumentStatusDto,
  CreateTemplateDto,
} from './dto/document.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/index';
import { PaginationDto } from '../../common/pagination.dto';

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Post()
  @ApiOperation({ summary: 'Upload / register a document' })
  upload(
    @Body() dto: UploadDocumentDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.uploadDocument(dto, orgId, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List all documents' })
  @ApiQuery({ name: 'clientId', required: false })
  findAll(
    @CurrentUser('organizationId') orgId: string,
    @Query() pagination: PaginationDto,
    @Query('clientId') clientId?: string,
  ) {
    return this.service.findAll(orgId, pagination, clientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document by ID' })
  findOne(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.findById(id, orgId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update document' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.updateDocument(id, dto, orgId);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send document to client for signature' })
  send(
    @Param('id') id: string,
    @Body() dto: SendDocumentDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.sendDocumentToClient(id, dto, orgId);
  }

  @Patch(':id/sign/:userId')
  @ApiOperation({ summary: 'Record signature on a document' })
  sign(
    @Param('id') docId: string,
    @Param('userId') userId: string,
    @Query('signatureUrl') signatureUrl: string,
  ) {
    return this.service.trackSignature(docId, userId, signatureUrl);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update document status' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentStatusDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.updateStatus(id, dto, orgId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete document' })
  delete(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.deleteDocument(id, orgId);
  }

  // Templates
  @Post('templates')
  @ApiOperation({ summary: 'Create document template' })
  createTemplate(
    @Body() dto: CreateTemplateDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.createTemplate(dto, orgId, userId);
  }

  @Get('templates/all')
  @ApiOperation({ summary: 'Get all document templates' })
  getTemplates(@CurrentUser('organizationId') orgId: string) {
    return this.service.getTemplates(orgId);
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Get template by ID' })
  getTemplate(@Param('id') id: string) {
    return this.service.getTemplateById(id);
  }
}
