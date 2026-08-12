import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { KbArticle, KbArticleDocument, KbAudience, KbStatus } from '../schemas';
import {
  CreateKbArticleDto,
  UpdateKbArticleDto,
  VoteKbArticleDto,
} from '../dtos';

@Injectable()
export class KbArticleService {
  constructor(
    @InjectModel(KbArticle.name)
    private readonly model: Model<KbArticleDocument>,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const count = await this.model.countDocuments({ tenantId });
    return `KB-${String(count + 1).padStart(3, '0')}`;
  }

  async getAll(
    tenantId: string,
    filters: {
      audience?: KbAudience;
      status?: KbStatus;
      category?: string;
    } = {},
  ) {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (filters.audience) query.audience = filters.audience;
    if (filters.status) query.status = filters.status;
    if (filters.category) query.category = filters.category;
    return this.model.find(query).sort({ createdAt: -1 }).lean();
  }

  async getById(tenantId: string, id: string) {
    const a = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!a) throw new NotFoundException('Article not found');
    return a;
  }

  async create(tenantId: string, dto: CreateKbArticleDto) {
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      title: dto.title,
      category: dto.category,
      audience: dto.audience,
      status: dto.status ?? KbStatus.DRAFT,
      tags: dto.tags ?? [],
      body: dto.body ?? '',
      author: dto.author,
      linkedTicketId: dto.linkedTicketId
        ? new Types.ObjectId(dto.linkedTicketId)
        : null,
    });
    return created.toObject();
  }

  async update(tenantId: string, id: string, dto: UpdateKbArticleDto) {
    const a = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!a) throw new NotFoundException('Article not found');
    if (dto.title !== undefined) a.title = dto.title;
    if (dto.category !== undefined) a.category = dto.category;
    if (dto.audience !== undefined) a.audience = dto.audience;
    if (dto.status !== undefined) a.status = dto.status;
    if (dto.tags !== undefined) a.tags = dto.tags;
    if (dto.body !== undefined) a.body = dto.body;
    await a.save();
    return a.toObject();
  }

  async delete(tenantId: string, id: string) {
    const res = await this.model.deleteOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!res.deletedCount) throw new NotFoundException('Article not found');
    return { deleted: true };
  }

  async recordView(tenantId: string, id: string) {
    const a = await this.model.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      { $inc: { views: 1 } },
      { new: true },
    );
    if (!a) throw new NotFoundException('Article not found');
    return a.toObject();
  }

  async vote(tenantId: string, id: string, dto: VoteKbArticleDto) {
    const inc = dto.helpful ? { helpful: 1 } : { notHelpful: 1 };
    const a = await this.model.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      { $inc: inc },
      { new: true },
    );
    if (!a) throw new NotFoundException('Article not found');
    return a.toObject();
  }

  // Same keyword-overlap scoring the confirmed prototype used,
  // applied to real published articles for the given audience.
  // Article counts for a professional services firm are small
  // enough that in-memory scoring over an already-scoped query is
  // simpler and just as correct as standing up Mongo text search.
  async suggestArticles(
    tenantId: string,
    query: string,
    audience: KbAudience,
    limit = 3,
  ) {
    const candidates = await this.getAll(tenantId, {
      audience,
      status: KbStatus.PUBLISHED,
    });
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    return candidates
      .map((a: any) => {
        const hay =
          `${a.title} ${a.category} ${a.tags.join(' ')}`.toLowerCase();
        const score = words.reduce((s, w) => (hay.includes(w) ? s + 1 : s), 0);
        return { a, score };
      })
      .sort((x, y) => y.score - x.score)
      .slice(0, limit)
      .map((x) => x.a);
  }
}
