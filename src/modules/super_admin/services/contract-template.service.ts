import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as mammoth from 'mammoth';
import {
  PlatformContractTemplate,
  PlatformContractTemplateDocument,
  PlatformTemplateStatus,
  TemplateSourceType,
} from '../schemas';
import {
  CreatePlatformContractTemplateDto,
  UpdatePlatformContractTemplateDto,
  UploadPlatformContractTemplateDto,
} from '../dto/contract-template.dto';

@Injectable()
export class PlatformContractTemplateService {
  private readonly logger = new Logger(PlatformContractTemplateService.name);

  constructor(
    @InjectModel(PlatformContractTemplate.name)
    private readonly model: Model<PlatformContractTemplateDocument>,
  ) {}

  // Real docx-to-HTML extraction — an uploaded Word document's real
  // text becomes real, editable content (same field authored
  // templates use), so a tenant can preview and edit it just like
  // an authored one, and it can be merge-field substituted when
  // generating a contract. A corrupt/unusual .docx shouldn't block
  // the upload outright — falls back to an honest note instead of
  // failing the whole request.
  private async extractDocxHtml(filePath: string): Promise<string> {
    try {
      const result = await mammoth.convertToHtml({ path: filePath });
      return result.value;
    } catch (err) {
      this.logger.error(
        `Failed to extract content from ${filePath}: ${err?.message}`,
      );
      return "<p><em>This document's content could not be automatically extracted. Download the original file to view it.</em></p>";
    }
  }

  // Same real conversion EngagementLetterService already uses —
  // filePath may be absolute or relative, so only the part from
  // 'uploads/' onwards is kept, then prefixed with the real
  // configured APP_URL.
  private toFileUrl(filePath: string): string {
    const rawPath = filePath.replace(/\\/g, '/');
    const uploadsIndex = rawPath.indexOf('uploads/');
    const relativePath =
      uploadsIndex !== -1 ? rawPath.slice(uploadsIndex) : rawPath;
    return `${process.env.APP_URL}/${relativePath}`;
  }

  async getAll() {
    return this.model.find().sort({ updatedAt: -1 }).lean();
  }

  async getById(id: string) {
    const t = await this.model.findById(id).lean();
    if (!t) throw new NotFoundException('Template not found');
    return t;
  }

  async create(dto: CreatePlatformContractTemplateDto, createdBy: string) {
    const created = await this.model.create({
      title: dto.title,
      category: dto.category,
      jurisdiction: dto.jurisdiction ?? '',
      description: dto.description ?? '',
      sourceType: TemplateSourceType.AUTHORED,
      content: dto.content,
      version: dto.version ?? '1.0',
      status: PlatformTemplateStatus.DRAFT,
      createdBy,
    });
    return created.toObject();
  }

  // Real file on disk (Multer has already saved it by the time this
  // runs) — a genuinely different kind of template from an authored
  // one, not authored content pretending to have a file attached.
  async upload(
    file: Express.Multer.File,
    dto: UploadPlatformContractTemplateDto,
    createdBy: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const content = await this.extractDocxHtml(file.path);

    const created = await this.model.create({
      title: dto.title,
      category: dto.category,
      jurisdiction: dto.jurisdiction ?? '',
      description: dto.description ?? '',
      sourceType: TemplateSourceType.UPLOADED,
      content,
      fileUrl: this.toFileUrl(file.path),
      fileName: file.originalname,
      fileMimeType: file.mimetype,
      filePath: file.path,
      version: dto.version ?? '1.0',
      status: PlatformTemplateStatus.DRAFT,
      createdBy,
    });
    return created.toObject();
  }

  // Replaces an uploaded template's real file — same real
  // delete-old-then-save-new discipline EngagementLetterService
  // uses on re-upload, so a stale file never lingers on disk.
  async replaceFile(id: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const t = await this.model.findById(id);
    if (!t) throw new NotFoundException('Template not found');
    if (t.sourceType !== TemplateSourceType.UPLOADED) {
      throw new BadRequestException(
        'This template is authored, not uploaded — edit its content instead of replacing a file.',
      );
    }
    if (t.filePath && fs.existsSync(t.filePath)) {
      fs.unlinkSync(t.filePath);
    }
    t.fileUrl = this.toFileUrl(file.path);
    t.fileName = file.originalname;
    t.fileMimeType = file.mimetype;
    t.filePath = file.path;
    t.content = await this.extractDocxHtml(file.path);
    await t.save();
    return t.toObject();
  }

  async update(id: string, dto: UpdatePlatformContractTemplateDto) {
    const t = await this.model.findById(id);
    if (!t) throw new NotFoundException('Template not found');
    if (t.sourceType !== TemplateSourceType.AUTHORED) {
      throw new BadRequestException(
        'This template was uploaded as a file — replace the file instead of editing content.',
      );
    }
    t.title = dto.title;
    t.category = dto.category;
    t.jurisdiction = dto.jurisdiction ?? '';
    t.description = dto.description ?? '';
    t.content = dto.content;
    t.version = dto.version ?? t.version;
    await t.save();
    return t.toObject();
  }

  async delete(id: string) {
    const t = await this.model.findById(id);
    if (!t) throw new NotFoundException('Template not found');
    // Real cleanup — an uploaded template's real file on disk is
    // deleted along with its record, not left orphaned.
    if (t.filePath && fs.existsSync(t.filePath)) {
      fs.unlinkSync(t.filePath);
    }
    await t.deleteOne();
    return { deleted: true };
  }

  // Real publish/unpublish toggle — no separate "publish" endpoint
  // needed, since the only thing that changes is this one field.
  async setStatus(id: string, status: PlatformTemplateStatus) {
    const t = await this.model.findById(id);
    if (!t) throw new NotFoundException('Template not found');
    t.status = status;
    await t.save();
    return t.toObject();
  }
}
