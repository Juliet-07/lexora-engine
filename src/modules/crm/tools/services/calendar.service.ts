import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CalendarEvent,
  CalendarEventDocument,
  CalendarLayer,
} from '../schemas';
import { CreateCalendarEventDto, UpdateCalendarEventDto } from '../dtos';
import { ContractService } from './contract.service';
import { ComplianceObligationService } from 'src/modules/grc/compliance/services/obligation.service';
import { AdrCaseService } from 'src/modules/crm/projects/services/adr-case.service';
import { LitigationCaseService } from 'src/modules/crm/projects/services/litigation-case.service';

// ── Real manual events — Personal/Team/Client, or an ad-hoc one-off
// under any layer. Standard CRUD, nothing derived here. ───────────

@Injectable()
export class CalendarEventService {
  constructor(
    @InjectModel(CalendarEvent.name)
    private readonly model: Model<CalendarEventDocument>,
  ) {}

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ date: 1, time: 1 })
      .lean();
  }

  async create(tenantId: string, dto: CreateCalendarEventDto) {
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      date: dto.date,
      time: dto.time,
      layer: dto.layer,
      location: dto.location ?? '',
      virtualProvider: dto.virtualProvider ?? null,
      virtualLink: dto.virtualLink ?? '',
      recurrence: dto.recurrence ?? 'None',
      createdBy: dto.createdBy ?? '',
    });
    return created.toObject();
  }

  async update(tenantId: string, id: string, dto: UpdateCalendarEventDto) {
    const e = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!e) throw new NotFoundException('Event not found');
    e.title = dto.title;
    e.date = dto.date;
    e.time = dto.time;
    e.layer = dto.layer;
    e.location = dto.location ?? '';
    e.virtualProvider = dto.virtualProvider ?? null;
    e.virtualLink = dto.virtualLink ?? '';
    e.recurrence = dto.recurrence ?? ('None' as any);
    await e.save();
    return e.toObject();
  }

  async delete(tenantId: string, id: string) {
    const res = await this.model.deleteOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!res.deletedCount) throw new NotFoundException('Event not found');
    return { deleted: true };
  }
}

// ── Real aggregation — the Contract, Compliance, and ADR layers are
// never separately stored; each is computed live from the real
// source records every time this is called, so they can never drift
// from what those records actually say. Manual events from
// CalendarEventService are merged in alongside them into one unified
// list matching the shape the calendar UI already expects. ─────────

@Injectable()
export class CalendarAggregationService {
  constructor(
    private readonly eventService: CalendarEventService,
    private readonly contractService: ContractService,
    private readonly complianceObligationService: ComplianceObligationService,
    private readonly adrCaseService: AdrCaseService,
    private readonly litigationCaseService: LitigationCaseService,
  ) {}

  private splitDateTime(d: Date | string): { date: string; time: string } {
    const dt = new Date(d);
    return {
      date: dt.toISOString().slice(0, 10),
      time: dt.toISOString().slice(11, 16),
    };
  }

  private async getContractEvents(tenantId: string) {
    const contracts = await this.contractService.getAll(tenantId);
    const events: any[] = [];
    for (const c of contracts as any[]) {
      if (c.expiresOn) {
        const { date, time } = this.splitDateTime(c.expiresOn);
        events.push({
          id: `contract-expiry-${c._id}`,
          title: `Renewal window — ${c.title}`,
          date,
          time,
          layer: CalendarLayer.CONTRACT,
          source: c.ref,
          location: '—',
          editable: false,
        });
      }
      for (const o of c.obligations ?? []) {
        if (o.done) continue;
        const { date, time } = this.splitDateTime(o.due);
        events.push({
          id: `contract-obligation-${o._id}`,
          title: `${o.label} — ${c.title}`,
          date,
          time,
          layer: CalendarLayer.CONTRACT,
          source: c.ref,
          location: '—',
          editable: false,
        });
      }
    }
    return events;
  }

  private async getComplianceEvents(tenantId: string) {
    const obligations = await this.complianceObligationService.getAll(tenantId);
    return (obligations as any[]).map((o) => {
      const { date, time } = this.splitDateTime(o.nextDueDate);
      return {
        id: `compliance-${o._id}`,
        title: o.title,
        date,
        time,
        layer: CalendarLayer.COMPLIANCE,
        source: o.reference,
        location: '—',
        editable: false,
      };
    });
  }

  private async getAdrEvents(tenantId: string) {
    const cases = await this.adrCaseService.getAll(tenantId);
    const events: any[] = [];
    for (const c of cases as any[]) {
      for (const s of c.sessions ?? []) {
        const { date, time } = this.splitDateTime(s.date);
        events.push({
          id: `adr-${c._id}-${s._id ?? s.date}`,
          title: `${c.type} session — ${c.title}`,
          date,
          time,
          layer: CalendarLayer.ADR,
          source: c.ref,
          location: s.venue || (s.mode === 'Virtual' ? 'Virtual' : '—'),
          editable: false,
        });
      }
    }
    return events;
  }

  private async getLitigationEvents(tenantId: string) {
    const cases = await this.litigationCaseService.getAll(tenantId);
    const events: any[] = [];
    for (const c of cases as any[]) {
      for (const d of c.courtDates ?? []) {
        const { date, time } = this.splitDateTime(d.date);
        events.push({
          id: `litigation-${c._id}-${d._id ?? d.date}`,
          title: `${d.title} — ${c.title}`,
          date,
          time: d.time || time,
          layer: CalendarLayer.LITIGATION,
          source: c.ref,
          location: d.location || '—',
          editable: false,
        });
      }
    }
    return events;
  }

  async getAll(tenantId: string) {
    const [
      manual,
      contractEvents,
      complianceEvents,
      adrEvents,
      litigationEvents,
    ] = await Promise.all([
      this.eventService.getAll(tenantId),
      this.getContractEvents(tenantId),
      this.getComplianceEvents(tenantId),
      this.getAdrEvents(tenantId),
      this.getLitigationEvents(tenantId),
    ]);

    const manualEvents = (manual as any[]).map((e) => ({
      id: e._id,
      title: e.title,
      date: e.date,
      time: e.time,
      layer: e.layer,
      source: 'Manual',
      location: e.location || '—',
      virtualProvider: e.virtualProvider,
      virtualLink: e.virtualLink,
      recurrence: e.recurrence,
      editable: true,
    }));

    return [
      ...manualEvents,
      ...contractEvents,
      ...complianceEvents,
      ...adrEvents,
      ...litigationEvents,
    ].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  }
}
