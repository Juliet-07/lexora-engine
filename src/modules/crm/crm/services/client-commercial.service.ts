import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ClientCommercial, ClientCommercialDocument } from '../schemas';
import { UpsertClientCommercialDto } from '../dtos';

// Ported faithfully from the confirmed prototype's clientCommercialStore.ts.
// Kept alongside the frontend's own copy deliberately: the "as you
// type" margin/health preview in the assignment dialog needs an
// instant client-side result before anything is saved, so the
// formula has to exist on both sides — this is the canonical one
// used for every already-saved profile.
export function healthScore(c: {
  lastInteraction: Date | string | null;
  invoiceDaysAvg: number;
  openTickets: number;
  satisfaction: number;
  riskRating: string;
}): number {
  const activity = c.lastInteraction ? 25 : 0;
  const payment = Math.max(
    0,
    Math.min(25, 25 - Math.round((c.invoiceDaysAvg - 30) / 2)),
  );
  const tickets = Math.max(0, 20 - c.openTickets * 4);
  const csat = Math.round((c.satisfaction / 5) * 20);
  const risk = c.riskRating === 'Low' ? 10 : c.riskRating === 'Medium' ? 6 : 2;
  return activity + payment + tickets + csat + risk;
}

export function healthBand(score: number): 'Healthy' | 'Watch' | 'At risk' {
  return score >= 75 ? 'Healthy' : score >= 50 ? 'Watch' : 'At risk';
}

@Injectable()
export class ClientCommercialService {
  constructor(
    @InjectModel(ClientCommercial.name)
    private readonly model: Model<ClientCommercialDocument>,
  ) {}

  private withComputed(c: any) {
    const score = healthScore(c);
    return { ...c, healthScore: score, healthBand: healthBand(score) };
  }

  // Keyed by clientUserId, matching the prototype's
  // Record<clientId, ClientCommercial> shape exactly — the frontend
  // does `commercials[c._id] ?? defaultCommercial(...)` and this
  // lets that pattern carry over with minimal rework.
  async getAllAsMap(tenantId: string) {
    const rows = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .lean();
    const map: Record<string, any> = {};
    for (const row of rows) {
      map[String(row.clientUserId)] = this.withComputed(row);
    }
    return map;
  }

  async getOne(tenantId: string, clientUserId: string) {
    const c = await this.model
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        clientUserId: new Types.ObjectId(clientUserId),
      })
      .lean();
    return c ? this.withComputed(c) : null;
  }

  // Always an upsert — matches the prototype's single saveCommercial()
  // with no separate create/update path.
  async upsert(
    tenantId: string,
    clientUserId: string,
    dto: UpsertClientCommercialDto,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const cId = new Types.ObjectId(clientUserId);
    const update: any = { ...dto };
    if (dto.slaProfileId !== undefined) {
      update.slaProfileId = dto.slaProfileId
        ? new Types.ObjectId(dto.slaProfileId)
        : null;
    }
    if (dto.lastInteraction !== undefined) {
      update.lastInteraction = dto.lastInteraction
        ? new Date(dto.lastInteraction)
        : null;
    }
    const saved = await this.model.findOneAndUpdate(
      { tenantId: tId, clientUserId: cId },
      { $set: update, $setOnInsert: { tenantId: tId, clientUserId: cId } },
      { upsert: true, new: true },
    );
    return this.withComputed(saved.toObject());
  }

  async clear(tenantId: string, clientUserId: string) {
    await this.model.deleteOne({
      tenantId: new Types.ObjectId(tenantId),
      clientUserId: new Types.ObjectId(clientUserId),
    });
    return { deleted: true };
  }
}
