import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Precedent, PrecedentDocument, DealType } from '../schemas';

@Injectable()
export class PrecedentService {
  constructor(
    @InjectModel(Precedent.name)
    private readonly model: Model<PrecedentDocument>,
  ) {}

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ name: 1 })
      .lean();
  }

  async create(
    tenantId: string,
    dto: {
      name: string;
      type: DealType;
      jurisdiction?: string;
      sections: { clauseId?: string; title: string; body: string }[];
    },
  ) {
    return this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      type: dto.type,
      jurisdiction: dto.jurisdiction ?? 'Rwanda',
      sections: dto.sections.map((s) => ({
        clauseId: s.clauseId ? new Types.ObjectId(s.clauseId) : null,
        title: s.title,
        body: s.body,
      })),
    });
  }
}
