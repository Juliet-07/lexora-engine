import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SlaProfile, SlaProfileDocument } from '../schemas';
import { UpsertSlaProfileDto } from '../dtos';

@Injectable()
export class SlaProfileService {
  constructor(
    @InjectModel(SlaProfile.name)
    private readonly model: Model<SlaProfileDocument>,
  ) {}

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ tier: 1 })
      .lean();
  }

  async getById(tenantId: string, id: string) {
    const p = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!p) throw new NotFoundException('SLA profile not found');
    return p;
  }

  async create(tenantId: string, dto: UpsertSlaProfileDto) {
    const created = await this.model.create({
      ...dto,
      tenantId: new Types.ObjectId(tenantId),
    });
    return created.toObject();
  }

  async update(tenantId: string, id: string, dto: UpsertSlaProfileDto) {
    const p = await this.model.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      { $set: dto },
      { new: true },
    );
    if (!p) throw new NotFoundException('SLA profile not found');
    return p.toObject();
  }

  async delete(tenantId: string, id: string) {
    const res = await this.model.deleteOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!res.deletedCount) throw new NotFoundException('SLA profile not found');
    return { deleted: true };
  }
}
