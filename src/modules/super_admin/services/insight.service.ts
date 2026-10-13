import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Insight, InsightDocument, InsightStatus } from '../schemas';
import { UpsertInsightDto } from '../dtos';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

@Injectable()
export class InsightService {
  constructor(
    @InjectModel(Insight.name)
    private readonly model: Model<InsightDocument>,
  ) {}

  // A slugified title can collide with an existing article — suffix
  // with -2, -3, ... until it's free, same spirit as the ESG
  // framework's slugify-then-disambiguate convention.
  private async uniqueSlug(base: string, excludeId?: string) {
    let candidate = slugify(base) || `insight-${Date.now()}`;
    let n = 2;
    while (
      await this.model.exists({
        slug: candidate,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
    ) {
      candidate = `${slugify(base)}-${n++}`;
    }
    return candidate;
  }

  // ── Super Admin — sees everything, draft and published ────────

  async getAllForAdmin() {
    return this.model.find().sort({ updatedAt: -1 }).lean();
  }

  async getOneForAdmin(id: string) {
    const e = await this.model.findById(id).lean();
    if (!e) throw new NotFoundException('Insight not found');
    return e;
  }

  async create(dto: UpsertInsightDto) {
    const slug = await this.uniqueSlug(dto.slug || dto.title);
    const created = await this.model.create({
      ...dto,
      slug,
      publishedAt: dto.status === InsightStatus.PUBLISHED ? new Date() : null,
    });
    return created.toObject();
  }

  async update(id: string, dto: UpsertInsightDto) {
    const existing = await this.model.findById(id);
    if (!existing) throw new NotFoundException('Insight not found');

    const slug =
      dto.slug && dto.slug !== existing.slug
        ? await this.uniqueSlug(dto.slug, id)
        : existing.slug;

    Object.assign(existing, dto, { slug });
    if (dto.status === InsightStatus.PUBLISHED && !existing.publishedAt) {
      existing.publishedAt = new Date();
    }
    await existing.save();
    return existing.toObject();
  }

  // Lightweight publish/unpublish toggle, separate from a full edit —
  // same convention as KnowledgeBaseService.setStatus.
  async setStatus(id: string, status: InsightStatus) {
    const existing = await this.model.findById(id);
    if (!existing) throw new NotFoundException('Insight not found');
    existing.status = status;
    if (status === InsightStatus.PUBLISHED && !existing.publishedAt) {
      existing.publishedAt = new Date();
    }
    await existing.save();
    return existing.toObject();
  }

  async delete(id: string) {
    const res = await this.model.deleteOne({ _id: id });
    if (!res.deletedCount) throw new NotFoundException('Insight not found');
    return { deleted: true };
  }

  // ── Public website — published only ────────────────────────────

  async getPublished() {
    return this.model
      .find({ status: InsightStatus.PUBLISHED })
      .select('-content')
      .sort({ publishedAt: -1 })
      .lean();
  }

  async getPublishedBySlug(slug: string) {
    const e = await this.model
      .findOne({ slug, status: InsightStatus.PUBLISHED })
      .lean();
    if (!e) throw new NotFoundException('Insight not found');
    return e;
  }
}
