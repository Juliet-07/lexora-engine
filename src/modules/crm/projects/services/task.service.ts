import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument_ } from '../schemas';
import { CreateTaskDto, UpdateTaskDto } from '../dtos';
import { MandateService } from './mandate.service';

@Injectable()
export class TaskService {
  constructor(
    @InjectModel(Task.name) private readonly model: Model<TaskDocument_>,
    private readonly mandateService: MandateService,
  ) {}

  async getAll(
    tenantId: string,
    filters: { mandateId?: string; assigneeUserId?: string } = {},
  ) {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (filters.mandateId)
      query.mandateId = new Types.ObjectId(filters.mandateId);
    if (filters.assigneeUserId)
      query.assigneeUserId = new Types.ObjectId(filters.assigneeUserId);
    return this.model.find(query).sort({ createdAt: -1 }).lean();
  }

  async getById(tenantId: string, id: string) {
    const t = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!t) throw new NotFoundException('Task not found');
    return t;
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
      dueDate: new Date(dto.dueDate),
      estimateHrs: dto.estimateHrs,
      phase: dto.phase ?? 'Delivery',
      recurring: dto.recurring ?? null,
    });
    return created.toObject();
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
    if (dto.dueDate !== undefined) t.dueDate = new Date(dto.dueDate);
    if (dto.estimateHrs !== undefined) t.estimateHrs = dto.estimateHrs;
    if (dto.loggedHrs !== undefined) t.loggedHrs = dto.loggedHrs;
    if (dto.phase !== undefined) t.phase = dto.phase;
    await t.save();
    return t.toObject();
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
