import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WhtCertificate,
  WhtCertificateDocument,
  WhtDirection,
} from '../schemas';

// Kept in its own file, deliberately — both purchases.service.ts
// (bill payments to WHT-liable vendors) and tax.service.ts's VAT/CIT
// services (which depend on BillService) need this. Defining it
// inside tax.service.ts would make purchases.service.ts import from
// tax.service.ts while tax.service.ts imports from
// purchases.service.ts — a real circular module import, not just an
// awkward one. A true leaf with zero service dependencies avoids it
// entirely, and this is genuinely the single source of truth for
// WHT: invoicing and bill payments both call record() here rather
// than computing their own separate WHT figure.
@Injectable()
export class WhtService {
  constructor(
    @InjectModel(WhtCertificate.name)
    private readonly model: Model<WhtCertificateDocument>,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.model.countDocuments({
      tenantId,
      certificateRef: new RegExp(`^WHT-${year}-`),
    });
    return `WHT-${year}-${String(count + 1).padStart(3, '0')}`;
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ date: -1 })
      .lean();
  }

  async record(
    tenantId: string,
    entry: {
      direction: WhtDirection;
      counterparty: string;
      sourceRef: string;
      sourceId: string;
      gross: number;
      rate?: number;
    },
  ) {
    const tId = new Types.ObjectId(tenantId);
    const rate = entry.rate ?? 15;
    const wht = (entry.gross * rate) / 100;
    const net = entry.gross - wht;
    const certificateRef = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      certificateRef,
      direction: entry.direction,
      counterparty: entry.counterparty,
      sourceRef: entry.sourceRef,
      sourceId: new Types.ObjectId(entry.sourceId),
      gross: entry.gross,
      rate,
      wht,
      net,
      date: new Date(),
    });
    return created.toObject();
  }
}
