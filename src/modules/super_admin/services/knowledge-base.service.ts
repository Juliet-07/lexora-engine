import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  KnowledgeEntry,
  KnowledgeEntryDocument,
  KnowledgeStatus,
} from '../schemas';
import { UpsertKnowledgeEntryDto } from '../dtos';

@Injectable()
export class KnowledgeBaseService {
  constructor(
    @InjectModel(KnowledgeEntry.name)
    private readonly model: Model<KnowledgeEntryDocument>,
  ) {}

  // ── Super Admin — sees everything, draft and published ────────

  async getAllForAdmin() {
    return this.model.find().sort({ updatedAt: -1 }).lean();
  }

  async getOneForAdmin(id: string) {
    const e = await this.model.findById(id).lean();
    if (!e) throw new NotFoundException('Entry not found');
    return e;
  }

  async create(dto: UpsertKnowledgeEntryDto) {
    const created = await this.model.create({
      ...dto,
      publishedAt: dto.status === KnowledgeStatus.PUBLISHED ? new Date() : null,
    });
    return created.toObject();
  }

  async update(id: string, dto: UpsertKnowledgeEntryDto) {
    const existing = await this.model.findById(id);
    if (!existing) throw new NotFoundException('Entry not found');
    Object.assign(existing, dto);
    if (dto.status === KnowledgeStatus.PUBLISHED && !existing.publishedAt) {
      existing.publishedAt = new Date();
    }
    await existing.save();
    return existing.toObject();
  }

  // The lightweight publish/unpublish toggle — separate from a full
  // edit, matching the confirmed library's per-row action and the
  // editor's dedicated Unpublish button.
  async setStatus(id: string, status: KnowledgeStatus) {
    const existing = await this.model.findById(id);
    if (!existing) throw new NotFoundException('Entry not found');
    existing.status = status;
    if (status === KnowledgeStatus.PUBLISHED && !existing.publishedAt) {
      existing.publishedAt = new Date();
    }
    await existing.save();
    return existing.toObject();
  }

  async delete(id: string) {
    const res = await this.model.deleteOne({ _id: id });
    if (!res.deletedCount) throw new NotFoundException('Entry not found');
    return { deleted: true };
  }

  // ── Tenant-facing — published only ─────────────────────────────

  async getPublished() {
    return this.model
      .find({ status: KnowledgeStatus.PUBLISHED })
      .sort({ publishedAt: -1 })
      .lean();
  }
}
