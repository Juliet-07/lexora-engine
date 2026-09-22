import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
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
  constructor(
    @InjectModel(PlatformContractTemplate.name)
    private readonly model: Model<PlatformContractTemplateDocument>,
  ) {}

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

  // Uploading a template file is no longer supported — every
  // template, including one that predates this change and was
  // originally uploaded, is authored and edited directly here from
  // now on. That's the only way a template reliably ends up using
  // the real {{token}} merge fields (see contract-merge-fields.ts on
  // the frontend) instead of static text a tenant has to hand-edit
  // per contract. A legacy uploaded template's extracted content and
  // original file (fileUrl/fileName/filePath, sourceType:
  // 'uploaded') are left as-is for historical reference and are
  // still editable through this same method — there's no separate
  // "authored only" restriction any more.
  async update(id: string, dto: UpdatePlatformContractTemplateDto) {
    const t = await this.model.findById(id);
    if (!t) throw new NotFoundException('Template not found');
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
