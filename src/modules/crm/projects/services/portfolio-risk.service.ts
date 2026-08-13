import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PortfolioRisk, PortfolioRiskDocument } from '../schemas';
import {
  CreatePortfolioRiskDto,
  UpdateRiskStatusDto,
  AddRiskNoteDto,
} from '../dtos';

@Injectable()
export class PortfolioRiskService {
  constructor(
    @InjectModel(PortfolioRisk.name)
    private readonly model: Model<PortfolioRiskDocument>,
  ) {}

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  private async getRawDoc(tenantId: string, id: string) {
    const r = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!r) throw new NotFoundException('Risk not found');
    return r;
  }

  async create(tenantId: string, dto: CreatePortfolioRiskDto) {
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      mandateId: new Types.ObjectId(dto.mandateId),
      mandateName: dto.mandateName,
      type: dto.type,
      severity: dto.severity,
      owner: dto.owner ?? '',
      impact: dto.impact ?? '',
    });
    return created.toObject();
  }

  async setStatus(tenantId: string, id: string, dto: UpdateRiskStatusDto) {
    const r = await this.getRawDoc(tenantId, id);
    r.status = dto.status;
    await r.save();
    return r.toObject();
  }

  async escalate(tenantId: string, id: string) {
    const r = await this.getRawDoc(tenantId, id);
    r.status = 'Escalated' as any;
    await r.save();
    return r.toObject();
  }

  async addNote(tenantId: string, id: string, dto: AddRiskNoteDto) {
    const r = await this.getRawDoc(tenantId, id);
    r.notes.push({ author: dto.author, body: dto.body, at: new Date() } as any);
    await r.save();
    return r.toObject();
  }
}
