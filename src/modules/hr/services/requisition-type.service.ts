import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RequisitionType, RequisitionTypeDocument } from '../schemas';
import { UpdateRequisitionTypesDto } from '../dtos/requisition.dto';

const DEFAULT_REQUISITION_TYPES: { key: string; label: string }[] = [
  { key: 'hiring', label: 'Hiring' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'budget', label: 'Budget' },
  { key: 'travel', label: 'Travel' },
  { key: 'training', label: 'Training' },
];

@Injectable()
export class RequisitionTypeService {
  constructor(
    @InjectModel(RequisitionType.name)
    private readonly typeModel: Model<RequisitionTypeDocument>,
  ) {}

  async getOrCreate(tenantId: string): Promise<RequisitionTypeDocument> {
    const tId = new Types.ObjectId(tenantId);
    const existing = await this.typeModel.findOne({ tenantId: tId });
    if (existing) return existing;
    return this.typeModel.create({
      tenantId: tId,
      items: DEFAULT_REQUISITION_TYPES,
    });
  }

  async update(
    tenantId: string,
    dto: UpdateRequisitionTypesDto,
  ): Promise<RequisitionTypeDocument> {
    const tId = new Types.ObjectId(tenantId);
    return this.typeModel.findOneAndUpdate(
      { tenantId: tId },
      { tenantId: tId, items: dto.items },
      { upsert: true, new: true },
    );
  }
}
