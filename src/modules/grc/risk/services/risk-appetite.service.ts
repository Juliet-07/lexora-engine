import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RiskAppetiteVersion,
  RiskAppetiteVersionDocument,
  RiskCategory,
  RiskPosture,
} from '../schemas';
import { SaveAppetiteVersionDto } from '../dtos';

const DEFAULT_ENTRIES = Object.values(RiskCategory).map((category) => ({
  category,
  posture: RiskPosture.OPEN,
  qualitative: '',
  maxLossPerEvent: 0,
  maxAggregateExposure: 0,
  amberThresholdPct: 20,
}));

@Injectable()
export class RiskAppetiteService {
  constructor(
    @InjectModel(RiskAppetiteVersion.name)
    private readonly versionModel: Model<RiskAppetiteVersionDocument>,
  ) {}

  // "Current" = the most recent version — never a separately maintained
  // record that could drift out of sync with history. A brand-new
  // tenant with no saved version yet gets sensible defaults so risk
  // zone computation never breaks.
  async getCurrent(tenantId: string) {
    const latest = await this.versionModel
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
    return latest?.entries ?? DEFAULT_ENTRIES;
  }

  async saveNewVersion(tenantId: string, dto: SaveAppetiteVersionDto) {
    return this.versionModel.create({
      tenantId: new Types.ObjectId(tenantId),
      note: dto.note,
      entries: dto.entries,
    });
  }

  async getHistory(tenantId: string) {
    return this.versionModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }
}
