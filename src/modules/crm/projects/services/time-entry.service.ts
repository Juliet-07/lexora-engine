import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TimeEntry,
  TimeEntryDocument,
  TimesheetStatus,
  WipBillingStatus,
} from '../schemas';
import {
  CreateTimeEntryDto,
  UpdateTimeEntryDto,
  RejectTimeEntryDto,
} from '../dtos';
import { RateCardService } from './rate-card.service';

@Injectable()
export class TimeEntryService {
  constructor(
    @InjectModel(TimeEntry.name)
    private readonly model: Model<TimeEntryDocument>,
    private readonly rateCardService: RateCardService,
  ) {}

  async getAll(
    tenantId: string,
    filters: {
      mandateId?: string;
      memberUserId?: string;
      status?: TimesheetStatus;
    } = {},
  ) {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (filters.mandateId)
      query.mandateId = new Types.ObjectId(filters.mandateId);
    if (filters.memberUserId)
      query.memberUserId = new Types.ObjectId(filters.memberUserId);
    if (filters.status) query.status = filters.status;
    return this.model.find(query).sort({ date: -1, createdAt: -1 }).lean();
  }

  async getById(tenantId: string, id: string) {
    const e = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!e) throw new NotFoundException('Time entry not found');
    return e;
  }

  async create(tenantId: string, dto: CreateTimeEntryDto) {
    const { rate, currency } = await this.rateCardService.getRateForEmployee(
      tenantId,
      dto.memberUserId,
    );
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      memberUserId: new Types.ObjectId(dto.memberUserId),
      member: dto.member,
      mandateId: new Types.ObjectId(dto.mandateId),
      mandateName: dto.mandateName,
      taskId: dto.taskId ? new Types.ObjectId(dto.taskId) : null,
      taskTitle: dto.taskTitle ?? 'Ad-hoc work',
      narrative: dto.narrative ?? '',
      date: new Date(dto.date),
      hours: dto.hours,
      billable: dto.billable ?? true,
      rate: dto.billable === false ? 0 : rate,
      currency,
      status: TimesheetStatus.DRAFT,
    });
    return created.toObject();
  }

  private async getOwnedDraftOrRejected(tenantId: string, id: string) {
    const e = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!e) throw new NotFoundException('Time entry not found');
    return e;
  }

  // Editing a rejected entry moves it back to Draft — that's the
  // "fix it and try again" path, not a separate resubmit action.
  async update(tenantId: string, id: string, dto: UpdateTimeEntryDto) {
    const e = await this.getOwnedDraftOrRejected(tenantId, id);
    if (![TimesheetStatus.DRAFT, TimesheetStatus.REJECTED].includes(e.status)) {
      throw new BadRequestException(
        'Only draft or rejected entries can be edited',
      );
    }
    if (dto.narrative !== undefined) e.narrative = dto.narrative;
    if (dto.date !== undefined) e.date = new Date(dto.date);
    if (dto.hours !== undefined) e.hours = dto.hours;
    if (dto.billable !== undefined) {
      e.billable = dto.billable;
      if (!dto.billable) e.rate = 0;
    }
    if (e.status === TimesheetStatus.REJECTED) {
      e.status = TimesheetStatus.DRAFT;
      e.rejectReason = null;
    }
    await e.save();
    return e.toObject();
  }

  async delete(tenantId: string, id: string) {
    const e = await this.getOwnedDraftOrRejected(tenantId, id);
    if (e.status !== TimesheetStatus.DRAFT) {
      throw new BadRequestException('Only draft entries can be deleted');
    }
    await e.deleteOne();
    return { deleted: true };
  }

  // ── Approval workflow ────────────────────────────────────────

  private async transition(
    tenantId: string,
    id: string,
    from: TimesheetStatus[],
    to: TimesheetStatus,
    extra?: Partial<Pick<TimeEntry, 'rejectReason'>>,
  ) {
    const e = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!e) throw new NotFoundException('Time entry not found');
    if (!from.includes(e.status)) {
      throw new BadRequestException(
        `Can't move from ${e.status} to ${to} directly`,
      );
    }
    e.status = to;
    e.rejectReason = extra?.rejectReason ?? null;
    await e.save();
    return e.toObject();
  }

  async submit(tenantId: string, id: string) {
    return this.transition(
      tenantId,
      id,
      [TimesheetStatus.DRAFT],
      TimesheetStatus.SUBMITTED,
    );
  }

  async leadApprove(tenantId: string, id: string) {
    return this.transition(
      tenantId,
      id,
      [TimesheetStatus.SUBMITTED],
      TimesheetStatus.LEAD_APPROVED,
    );
  }

  async approve(tenantId: string, id: string) {
    return this.transition(
      tenantId,
      id,
      [TimesheetStatus.SUBMITTED, TimesheetStatus.LEAD_APPROVED],
      TimesheetStatus.APPROVED,
    );
  }

  async reject(tenantId: string, id: string, dto: RejectTimeEntryDto) {
    return this.transition(
      tenantId,
      id,
      [TimesheetStatus.SUBMITTED, TimesheetStatus.LEAD_APPROVED],
      TimesheetStatus.REJECTED,
      { rejectReason: dto.reason },
    );
  }

  // ── Computed aggregates — what Task.loggedHrs and Mandate.wip
  // actually derive from. Only Approved time counts; Draft,
  // Submitted, Lead Approved and Rejected are all not-yet-real by
  // definition of the approval workflow existing at all. ──────────

  async getApprovedHoursForTask(
    tenantId: string,
    taskId: string,
  ): Promise<number> {
    const result = await this.model.aggregate([
      {
        $match: {
          tenantId: new Types.ObjectId(tenantId),
          taskId: new Types.ObjectId(taskId),
          status: TimesheetStatus.APPROVED,
        },
      },
      { $group: { _id: null, total: { $sum: '$hours' } } },
    ]);
    return result[0]?.total ?? 0;
  }

  // Batch version — one aggregate covering every task at once,
  // rather than one query per task in a list. Used by
  // TaskService.getAll() to avoid N+1.
  async getApprovedHoursByTaskIds(
    tenantId: string,
    taskIds: string[],
  ): Promise<Map<string, number>> {
    if (!taskIds.length) return new Map();
    const rows = await this.model.aggregate([
      {
        $match: {
          tenantId: new Types.ObjectId(tenantId),
          taskId: { $in: taskIds.map((id) => new Types.ObjectId(id)) },
          status: TimesheetStatus.APPROVED,
        },
      },
      { $group: { _id: '$taskId', total: { $sum: '$hours' } } },
    ]);
    return new Map(rows.map((r) => [String(r._id), r.total]));
  }

  async getApprovedBillableValueForMandate(
    tenantId: string,
    mandateId: string,
  ): Promise<number> {
    const result = await this.model.aggregate([
      {
        $match: {
          tenantId: new Types.ObjectId(tenantId),
          mandateId: new Types.ObjectId(mandateId),
          status: TimesheetStatus.APPROVED,
          billable: true,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $multiply: ['$hours', '$rate'] } },
        },
      },
    ]);
    return result[0]?.total ?? 0;
  }

  // Batch version — same idea, for MandateService.getAll().
  async getApprovedBillableValueByMandateIds(
    tenantId: string,
    mandateIds: string[],
  ): Promise<Map<string, number>> {
    if (!mandateIds.length) return new Map();
    const rows = await this.model.aggregate([
      {
        $match: {
          tenantId: new Types.ObjectId(tenantId),
          mandateId: { $in: mandateIds.map((id) => new Types.ObjectId(id)) },
          status: TimesheetStatus.APPROVED,
          billable: true,
        },
      },
      {
        $group: {
          _id: '$mandateId',
          total: { $sum: { $multiply: ['$hours', '$rate'] } },
        },
      },
    ]);
    return new Map(rows.map((r) => [String(r._id), r.total]));
  }

  // ── WIP register — real Approved, billable time that hasn't been
  // invoiced yet. Not a separate entity: this is TimeEntry itself,
  // filtered and re-shaped. ─────────────────────────────────────

  async getWipRegister(tenantId: string, mandateId?: string) {
    const query: any = {
      tenantId: new Types.ObjectId(tenantId),
      status: TimesheetStatus.APPROVED,
      billable: true,
      invoiceId: null,
    };
    if (mandateId) query.mandateId = new Types.ObjectId(mandateId);
    return this.model.find(query).sort({ date: 1 }).lean();
  }

  private async getApprovedBillableEntry(tenantId: string, id: string) {
    const e = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
      status: TimesheetStatus.APPROVED,
      billable: true,
    });
    if (!e) {
      throw new NotFoundException(
        'Time entry not found, or not an approved billable entry',
      );
    }
    return e;
  }

  // The simple field-level moves. Orchestration with the real
  // WriteOff audit record happens one layer up, in Finance's
  // WipService — TimeEntryService stays a leaf, same as everywhere
  // else in this module.
  async approveForBilling(tenantId: string, id: string) {
    const e = await this.getApprovedBillableEntry(tenantId, id);
    e.billingStatus = WipBillingStatus.APPROVED_FOR_BILLING;
    await e.save();
    return e.toObject();
  }

  async writeDownWip(
    tenantId: string,
    id: string,
    writtenDownAmount: number,
    reason: string,
  ) {
    const e = await this.getApprovedBillableEntry(tenantId, id);
    e.billingStatus = WipBillingStatus.WRITTEN_DOWN;
    e.writtenDownAmount = writtenDownAmount;
    e.billingReviewReason = reason;
    await e.save();
    return e.toObject();
  }

  async writeOffWip(tenantId: string, id: string, reason: string) {
    const e = await this.getApprovedBillableEntry(tenantId, id);
    e.billingStatus = WipBillingStatus.WRITTEN_OFF;
    e.billingReviewReason = reason;
    await e.save();
    return e.toObject();
  }

  async holdWip(tenantId: string, id: string, reason?: string) {
    const e = await this.getApprovedBillableEntry(tenantId, id);
    e.billingStatus = WipBillingStatus.HELD;
    e.billingReviewReason = reason ?? null;
    await e.save();
    return e.toObject();
  }

  // Called once the entries are genuinely pulled onto a real
  // invoice — this is what removes them from the WIP register.
  async markInvoiced(tenantId: string, ids: string[], invoiceId: string) {
    await this.model.updateMany(
      { _id: { $in: ids }, tenantId: new Types.ObjectId(tenantId) },
      {
        $set: {
          billingStatus: WipBillingStatus.INVOICED,
          invoiceId: new Types.ObjectId(invoiceId),
        },
      },
    );
  }
}
