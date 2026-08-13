import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WriteOff,
  WriteOffDocument,
  WriteOffStage,
  WriteOffStatus,
} from '../schemas';

@Injectable()
export class WriteOffService {
  constructor(
    @InjectModel(WriteOff.name)
    private readonly model: Model<WriteOffDocument>,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const count = await this.model.countDocuments({ tenantId });
    return `WO-${String(count + 1).padStart(3, '0')}`;
  }

  async getAll(tenantId: string, stage?: WriteOffStage) {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (stage) query.stage = stage;
    return this.model.find(query).sort({ createdAt: -1 }).lean();
  }

  // Called by WipService, InvoiceService and CreditNoteService — the
  // one place a WriteOff record actually gets created, so there's
  // one real audit trail across all three checkpoints instead of
  // each caller writing its own slightly different record.
  async record(
    tenantId: string,
    entry: {
      stage: WriteOffStage;
      reference: string;
      clientName: string;
      mandateName: string;
      amount: number;
      reason: string;
      approvedBy: string;
      status?: WriteOffStatus;
    },
  ) {
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      ...entry,
      status: entry.status ?? WriteOffStatus.PENDING_APPROVAL,
    });
    return created.toObject();
  }
}
