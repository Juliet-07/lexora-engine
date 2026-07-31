import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Clause, ClauseDocument } from '../schemas';
import { CreateClauseDto, UpdateClauseDto } from '../dtos';

@Injectable()
export class ClauseService {
  constructor(
    @InjectModel(Clause.name) private readonly model: Model<ClauseDocument>,
  ) {}

  async create(tenantId: string, dto: CreateClauseDto) {
    return this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      category: dto.category,
      jurisdiction: dto.jurisdiction ?? 'Rwanda',
      body: dto.body,
      approved: false,
      version: 1,
    });
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ category: 1, title: 1 })
      .lean();
  }

  private async getRawDoc(
    tenantId: string,
    id: string,
  ): Promise<ClauseDocument> {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Clause not found');
    return c;
  }

  async update(tenantId: string, id: string, dto: UpdateClauseDto) {
    const c = await this.getRawDoc(tenantId, id);
    if (dto.title !== undefined) c.title = dto.title;
    if (dto.category !== undefined) c.category = dto.category;
    if (dto.jurisdiction !== undefined) c.jurisdiction = dto.jurisdiction;
    if (dto.body !== undefined) c.body = dto.body;
    await c.save();
    return c;
  }

  async toggleApproved(tenantId: string, id: string) {
    const c = await this.getRawDoc(tenantId, id);
    c.approved = !c.approved;
    await c.save();
    return c;
  }

  // A substantive edit implies re-review — increments version and
  // resets approval, same pattern as Governance Codes' "new version."
  async newVersion(tenantId: string, id: string) {
    const c = await this.getRawDoc(tenantId, id);
    c.version += 1;
    c.approved = false;
    await c.save();
    return c;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const deleted = await this.model.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Clause not found');
  }
}
