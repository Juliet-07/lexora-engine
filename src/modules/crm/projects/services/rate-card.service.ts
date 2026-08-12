import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RateCard, RateCardDocument } from '../schemas';
import { UpsertRateCardDto } from '../dtos';

@Injectable()
export class RateCardService {
  constructor(
    @InjectModel(RateCard.name)
    private readonly model: Model<RateCardDocument>,
  ) {}

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ member: 1 })
      .lean();
  }

  async upsert(tenantId: string, dto: UpsertRateCardDto) {
    const tId = new Types.ObjectId(tenantId);
    const employeeId = new Types.ObjectId(dto.employeeUserId);
    const saved = await this.model.findOneAndUpdate(
      { tenantId: tId, employeeUserId: employeeId },
      {
        $set: {
          member: dto.member,
          role: dto.role ?? '',
          standardRate: dto.standardRate,
          currency: dto.currency ?? 'USD',
        },
        $setOnInsert: { tenantId: tId, employeeUserId: employeeId },
      },
      { upsert: true, new: true },
    );
    return saved.toObject();
  }

  // Used when snapshotting a rate onto a new time entry. No rate
  // card yet is a legitimate state (not every employee has one set
  // up immediately) — returns 0 rather than throwing, and the
  // caller decides what to do with that.
  async getRateForEmployee(tenantId: string, employeeUserId: string) {
    const card = await this.model
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        employeeUserId: new Types.ObjectId(employeeUserId),
      })
      .lean();
    return { rate: card?.standardRate ?? 0, currency: card?.currency ?? 'USD' };
  }
}
