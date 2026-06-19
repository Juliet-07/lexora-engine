import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PayslipTemplate, PayslipTemplateDocument } from '../schemas';
import { UpdatePayslipTemplateDto } from '../dtos';

@Injectable()
export class PayslipTemplateService {
  constructor(
    @InjectModel(PayslipTemplate.name)
    private readonly templateModel: Model<PayslipTemplateDocument>,
  ) {}

  async getOrCreateTemplate(
    tenantId: string,
  ): Promise<PayslipTemplateDocument> {
    const tId = new Types.ObjectId(tenantId);
    const existing = await this.templateModel.findOne({ tenantId: tId });
    if (existing) return existing;

    return this.templateModel.create({ tenantId: tId });
  }

  async updateTemplate(
    tenantId: string,
    dto: UpdatePayslipTemplateDto,
  ): Promise<PayslipTemplateDocument> {
    const tId = new Types.ObjectId(tenantId);
    return this.templateModel.findOneAndUpdate(
      { tenantId: tId },
      { $set: dto },
      { upsert: true, new: true },
    );
  }
}
