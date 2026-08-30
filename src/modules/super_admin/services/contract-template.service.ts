import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
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
  PlatformTemplateFolder,
  PlatformTemplateFolderDocument,
} from '../schemas';
import {
  CreatePlatformContractTemplateDto,
  CreatePlatformTemplateFolderDto,
  UpdatePlatformContractTemplateDto,
  UpdatePlatformTemplateFolderDto,
  UploadPlatformContractTemplateDto,
} from '../dtos';

@Injectable()
export class PlatformTemplateFolderService {
  constructor(
    @InjectModel(PlatformTemplateFolder.name)
    private readonly model: Model<PlatformTemplateFolderDocument>,
    @InjectModel(PlatformContractTemplate.name)
    private readonly templateModel: Model<PlatformContractTemplateDocument>,
  ) {}

  async getAll() {
    const folders = await this.model.find().sort({ name: 1 }).lean();
    // Real counts per folder, computed live from the actual template
    // collection — not a stored number that could drift as templates
    // move in and out.
    const counts = await this.templateModel.aggregate([
      { $match: { folderId: { $ne: null } } },
      { $group: { _id: '$folderId', count: { $sum: 1 } } },
    ]);
    const countByFolder = new Map(counts.map((c) => [String(c._id), c.count]));
    return folders.map((f) => ({
      ...f,
      templateCount: countByFolder.get(String(f._id)) ?? 0,
    }));
  }

  async create(dto: CreatePlatformTemplateFolderDto, createdBy: string) {
    const existing = await this.model.findOne({ name: dto.name });
    if (existing) {
      throw new ConflictException('A folder with this name already exists.');
    }
    const created = await this.model.create({
      name: dto.name,
      description: dto.description ?? '',
      createdBy,
    });
    return created.toObject();
  }

  async update(id: string, dto: UpdatePlatformTemplateFolderDto) {
    const f = await this.model.findById(id);
    if (!f) throw new NotFoundException('Folder not found');
    if (dto.name !== f.name) {
      const existing = await this.model.findOne({ name: dto.name });
      if (existing) {
        throw new ConflictException('A folder with this name already exists.');
      }
    }
    f.name = dto.name;
    f.description = dto.description ?? '';
    await f.save();
    return f.toObject();
  }

  // Deliberately refuses to delete a non-empty folder rather than
  // silently orphaning its templates to "uncategorized" — moving
  // them out is a real decision the admin should make explicitly.
  async delete(id: string) {
    const f = await this.model.findById(id);
    if (!f) throw new NotFoundException('Folder not found');
    const templateCount = await this.templateModel.countDocuments({
      folderId: id,
    });
    if (templateCount > 0) {
      throw new ConflictException(
        `This folder has ${templateCount} template(s) in it. Move or delete them first.`,
      );
    }
    await f.deleteOne();
    return { deleted: true };
  }
}

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

  async getAll(folderId?: string, moduleKey?: string, areaKey?: string) {
    const query: any = {};
    if (folderId === 'uncategorized') query.folderId = null;
    else if (folderId) query.folderId = folderId;
    if (moduleKey) query.moduleKey = moduleKey;
    if (areaKey) query.areaKey = areaKey;
    return this.model.find(query).sort({ updatedAt: -1 }).lean();
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
      folderId: dto.folderId ?? null,
      moduleKey: dto.moduleKey ?? '',
      areaKey: dto.areaKey ?? '',
      sourceType: TemplateSourceType.AUTHORED,
      content: dto.content,
      version: dto.version ?? '1.0',
      status: PlatformTemplateStatus.DRAFT,
      createdBy,
    });
    return created.toObject();
  }

  // Real file(s) on disk (Multer has already saved them by the time
  // this runs) — each becomes its own, genuinely separate template
  // record, all sharing the metadata given once in the dialog
  // (category, jurisdiction, folder, module/area). With a single
  // file, the given title is used as-is; with several, there's no
  // way to give each a different title in one form submission, so
  // each file's own real name (extension stripped) becomes that
  // template's title instead — never a fabricated or duplicated one.
  async uploadMany(
    files: Express.Multer.File[],
    dto: UploadPlatformContractTemplateDto,
    createdBy: string,
  ) {
    if (!files?.length) throw new BadRequestException('No file uploaded.');

    const created = await Promise.all(
      files.map(async (file) => {
        const content = await this.extractDocxHtml(file.path);
        const title =
          files.length === 1 && dto.title
            ? dto.title
            : file.originalname.replace(/\.[^/.]+$/, '');

        const doc = await this.model.create({
          title,
          category: dto.category,
          jurisdiction: dto.jurisdiction ?? '',
          description: dto.description ?? '',
          folderId: dto.folderId ?? null,
          moduleKey: dto.moduleKey ?? '',
          areaKey: dto.areaKey ?? '',
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
        return doc.toObject();
      }),
    );

    return created;
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
    if (dto.folderId !== undefined) {
      t.folderId = dto.folderId ? (dto.folderId as any) : null;
    }
    if (dto.moduleKey !== undefined) t.moduleKey = dto.moduleKey;
    if (dto.areaKey !== undefined) t.areaKey = dto.areaKey;
    await t.save();
    return t.toObject();
  }

  // Works for either source type — folder placement is orthogonal
  // to a template's real content, so this doesn't share update()'s
  // authored-only guard.
  async setFolder(id: string, folderId: string | null) {
    const t = await this.model.findById(id);
    if (!t) throw new NotFoundException('Template not found');
    t.folderId = (folderId || null) as any;
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
