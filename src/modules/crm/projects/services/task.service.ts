import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument_ } from '../schemas';
import { CreateTaskDto, UpdateTaskDto } from '../dtos';
import { MandateService } from './mandate.service';
import { TimeEntryService } from './time-entry.service';

@Injectable()
export class TaskService {
  constructor(
    @InjectModel(Task.name) private readonly model: Model<TaskDocument_>,
    private readonly mandateService: MandateService,
    private readonly timeEntryService: TimeEntryService,
  ) {}

  // loggedHrs is now the sum of this task's Approved time entries —
  // not a directly-editable field. startDate falls back to createdAt
  // for tasks saved before that field existed, same normalization
  // pattern used elsewhere in this app. Progress derives from the
  // same computed loggedHrs, so it moves only once time is actually
  // approved, not the moment someone types a number in.
  private normalize(t: any, loggedHrs: number) {
    return {
      ...t,
      startDate: t.startDate ?? t.createdAt,
      loggedHrs,
      progress: t.estimateHrs
        ? Math.min(100, Math.round((loggedHrs / t.estimateHrs) * 100))
        : 0,
    };
  }

  async getAll(
    tenantId: string,
    filters: { mandateId?: string; assigneeUserId?: string } = {},
  ) {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (filters.mandateId)
      query.mandateId = new Types.ObjectId(filters.mandateId);
    if (filters.assigneeUserId)
      query.assigneeUserId = new Types.ObjectId(filters.assigneeUserId);
    const rows = await this.model.find(query).sort({ createdAt: -1 }).lean();
    const hoursMap = await this.timeEntryService.getApprovedHoursByTaskIds(
      tenantId,
      rows.map((r) => String(r._id)),
    );
    return rows.map((t) => this.normalize(t, hoursMap.get(String(t._id)) ?? 0));
  }

  async getById(tenantId: string, id: string) {
    const t = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!t) throw new NotFoundException('Task not found');
    const hours = await this.timeEntryService.getApprovedHoursForTask(
      tenantId,
      id,
    );
    return this.normalize(t, hours);
  }

  async create(tenantId: string, dto: CreateTaskDto) {
    const mandate = await this.mandateService.getById(tenantId, dto.mandateId);
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      mandateId: new Types.ObjectId(dto.mandateId),
      mandateName: (mandate as any).name,
      assignee: dto.assignee,
      assigneeUserId: dto.assigneeUserId
        ? new Types.ObjectId(dto.assigneeUserId)
        : null,
      priority: dto.priority,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      dueDate: new Date(dto.dueDate),
      estimateHrs: dto.estimateHrs,
      parentTaskId: dto.parentTaskId
        ? new Types.ObjectId(dto.parentTaskId)
        : null,
      dependsOnTaskId: dto.dependsOnTaskId
        ? new Types.ObjectId(dto.dependsOnTaskId)
        : null,
      depType: dto.depType ?? null,
      critical: dto.critical ?? false,
      phase: dto.phase ?? 'Delivery',
      recurring: dto.recurring ?? null,
    });
    // A brand-new task has no time entries yet — 0 without a query.
    return this.normalize(created.toObject(), 0);
  }

  async update(tenantId: string, id: string, dto: UpdateTaskDto) {
    const t = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!t) throw new NotFoundException('Task not found');
    if (dto.title !== undefined) t.title = dto.title;
    if (dto.assignee !== undefined) t.assignee = dto.assignee;
    if (dto.assigneeUserId !== undefined) {
      t.assigneeUserId = new Types.ObjectId(dto.assigneeUserId);
    }
    if (dto.status !== undefined) t.status = dto.status;
    if (dto.priority !== undefined) t.priority = dto.priority;
    if (dto.startDate !== undefined) t.startDate = new Date(dto.startDate);
    if (dto.dueDate !== undefined) t.dueDate = new Date(dto.dueDate);
    if (dto.estimateHrs !== undefined) t.estimateHrs = dto.estimateHrs;
    // loggedHrs intentionally not settable here anymore — it's
    // derived from Approved time entries. See UpdateTaskDto.
    if (dto.parentTaskId !== undefined) {
      t.parentTaskId = dto.parentTaskId
        ? new Types.ObjectId(dto.parentTaskId)
        : null;
    }
    if (dto.dependsOnTaskId !== undefined) {
      t.dependsOnTaskId = dto.dependsOnTaskId
        ? new Types.ObjectId(dto.dependsOnTaskId)
        : null;
    }
    if (dto.depType !== undefined) t.depType = dto.depType;
    if (dto.critical !== undefined) t.critical = dto.critical;
    if (dto.phase !== undefined) t.phase = dto.phase;
    await t.save();
    const hours = await this.timeEntryService.getApprovedHoursForTask(
      tenantId,
      id,
    );
    return this.normalize(t.toObject(), hours);
  }

  async delete(tenantId: string, id: string) {
    const res = await this.model.deleteOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!res.deletedCount) throw new NotFoundException('Task not found');
    return { deleted: true };
  }
}
