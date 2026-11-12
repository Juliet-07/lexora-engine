import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientCommercial, ClientCommercialDocument } from '../schemas';
import { UpsertClientCommercialDto } from '../dtos';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import {
  ClientProfileRecord,
  ClientProfileDocument,
} from 'src/modules/tenant/schemas/client-profile.schema';
import {
  Employee,
  EmployeeDocument,
} from 'src/modules/hr/schemas/employee.schema';

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
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(ClientProfileRecord.name)
    private readonly profileModel: Model<ClientProfileDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly eventEmitter: EventEmitter2,
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

  // Resolves the employee the tenant means by this RM entry: the
  // chosen HR employee id, or — for the typed-name fallback and for
  // rows saved before ids existed — the one employee whose full name
  // matches. A name that matches nobody (or several people) stays a
  // plain label and assigns no one.
  private async resolveRm(
    tenantId: Types.ObjectId,
    id: string | undefined,
    name: string | undefined,
  ) {
    if (id) {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException('Unknown relationship manager.');
      }
      const emp = await this.employeeModel
        .findOne({ _id: id, tenantId })
        .select('firstName lastName email userId')
        .lean();
      if (!emp) throw new BadRequestException('Unknown relationship manager.');
      return emp as any;
    }
    const wanted = (name ?? '').trim().toLowerCase();
    if (!wanted) return null;
    const matches = await this.employeeModel
      .find({ tenantId })
      .select('firstName lastName email userId')
      .lean();
    const hit = (matches as any[]).filter(
      (e) => `${e.firstName} ${e.lastName}`.trim().toLowerCase() === wanted,
    );
    return hit.length === 1 ? hit[0] : null;
  }

  // Always an upsert — matches the prototype's single saveCommercial()
  // with no separate create/update path.
  //
  // Choosing a relationship manager is what actually assigns the
  // client: the RM employee's login becomes the client profile's
  // assignedTo (the field their workspace's "My Clients" is scoped
  // by) and they're told — in-app and by email — the moment it
  // changes. Previously only the RM's name was saved as text, so the
  // employee never saw the client.
  async upsert(
    tenantId: string,
    clientUserId: string,
    dto: UpsertClientCommercialDto,
    assignedByUserId?: string,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const cId = new Types.ObjectId(clientUserId);
    const { relationshipManagerId, ...rest } = dto;
    const update: any = { ...rest };
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

    let rmNotice: string | null = null;
    let rmNotified = false;
    const touchesRm =
      relationshipManagerId !== undefined ||
      dto.relationshipManager !== undefined;
    let notify: { userId: string; name: string } | null = null;

    if (touchesRm) {
      const emp = await this.resolveRm(
        tId,
        relationshipManagerId,
        dto.relationshipManager,
      );
      const cleared =
        !emp &&
        (relationshipManagerId === '' ||
          (relationshipManagerId === undefined &&
            !(dto.relationshipManager ?? '').trim()));
      const profile = await this.profileModel
        .findOne({ userId: cId })
        .select('assignedTo')
        .lean();
      const prevAssignee = profile?.assignedTo
        ? String(profile.assignedTo)
        : null;

      if (emp) {
        update.relationshipManager = `${emp.firstName} ${emp.lastName}`.trim();
        update.relationshipManagerEmployeeId = emp._id;
        if (emp.userId) {
          await this.profileModel.updateOne(
            { userId: cId },
            { $set: { assignedTo: emp.userId } },
          );
          if (String(emp.userId) !== prevAssignee) {
            notify = {
              userId: String(emp.userId),
              name: update.relationshipManager,
            };
          }
        } else {
          // No portal login yet → nothing to scope by or notify. Drop
          // the previous assignee so the old RM doesn't keep access.
          await this.profileModel.updateOne(
            { userId: cId },
            { $set: { assignedTo: null } },
          );
          rmNotice = `${update.relationshipManager} has no portal login yet, so they can't see this client or be notified until their account is set up.`;
        }
      } else if (cleared) {
        update.relationshipManager = '';
        update.relationshipManagerEmployeeId = null;
        await this.profileModel.updateOne(
          { userId: cId },
          { $set: { assignedTo: null } },
        );
      } else {
        // A typed name that matches no employee: a label only.
        update.relationshipManagerEmployeeId = null;
        rmNotice =
          'That name does not match an employee, so the client was not assigned to anyone’s workspace.';
      }
    }

    const saved = await this.model.findOneAndUpdate(
      { tenantId: tId, clientUserId: cId },
      { $set: update, $setOnInsert: { tenantId: tId, clientUserId: cId } },
      { upsert: true, new: true },
    );

    if (notify) {
      const client = await this.userModel
        .findById(cId)
        .select('firstName lastName businessName')
        .lean();
      const clientName =
        (client as any)?.businessName ||
        `${(client as any)?.firstName ?? ''} ${(client as any)?.lastName ?? ''}`.trim() ||
        'a client';
      this.eventEmitter.emit('tenant.client.assigned', {
        tenantId,
        employeeUserId: notify.userId,
        clientUserId,
        clientName,
        assignedByUserId: assignedByUserId ?? null,
      });
      rmNotified = true;
    }

    return {
      ...this.withComputed(saved.toObject()),
      rmNotice,
      rmNotified,
    };
  }

  async clear(tenantId: string, clientUserId: string) {
    await this.model.deleteOne({
      tenantId: new Types.ObjectId(tenantId),
      clientUserId: new Types.ObjectId(clientUserId),
    });
    return { deleted: true };
  }
}
