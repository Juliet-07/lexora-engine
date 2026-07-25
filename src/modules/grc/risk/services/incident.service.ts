import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Incident, IncidentDocument, IncidentStatus } from '../schemas';
import {
  CreateIncidentDto,
  UpdateIncidentDto,
  SetIncidentStatusDto,
} from '../dtos';

@Injectable()
export class IncidentService {
  constructor(
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
  ) {}

  async create(tenantId: string, dto: CreateIncidentDto) {
    return this.incidentModel.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      description: dto.description ?? '',
      category: dto.category,
      severity: dto.severity,
      status: IncidentStatus.REPORTED,
      reportedAt: new Date(),
    });
  }

  async getAll(tenantId: string) {
    return this.incidentModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ reportedAt: -1 })
      .lean();
  }

  private async getRawDoc(
    tenantId: string,
    id: string,
  ): Promise<IncidentDocument> {
    const incident = await this.incidentModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  async update(tenantId: string, id: string, dto: UpdateIncidentDto) {
    const incident = await this.getRawDoc(tenantId, id);
    if (dto.investigator !== undefined)
      incident.investigator = dto.investigator;
    if (dto.dueDate !== undefined) incident.dueDate = new Date(dto.dueDate);
    if (dto.rcaMethod !== undefined) incident.rcaMethod = dto.rcaMethod;
    if (dto.rcaNotes !== undefined) incident.rcaNotes = dto.rcaNotes;
    if (dto.correctiveActions !== undefined)
      incident.correctiveActions = dto.correctiveActions;
    if (dto.preventiveActions !== undefined)
      incident.preventiveActions = dto.preventiveActions;
    if (dto.lessonsLearned !== undefined)
      incident.lessonsLearned = dto.lessonsLearned;
    if (dto.signOffBy !== undefined) incident.signOffBy = dto.signOffBy;
    await incident.save();
    return incident;
  }

  // Blocks ANY status change once closed — an improvement over the
  // original UI, which left its status buttons clickable regardless
  // of current state.
  async setStatus(tenantId: string, id: string, dto: SetIncidentStatusDto) {
    const incident = await this.getRawDoc(tenantId, id);
    if (incident.status === IncidentStatus.CLOSED) {
      throw new BadRequestException('This incident is closed.');
    }
    incident.status = dto.status;
    await incident.save();
    return incident;
  }

  async close(tenantId: string, id: string) {
    const incident = await this.getRawDoc(tenantId, id);
    if (incident.status === IncidentStatus.CLOSED) {
      throw new BadRequestException('This incident is already closed.');
    }
    if (!incident.signOffBy?.trim()) {
      throw new BadRequestException(
        'Sign-off name is required before closing.',
      );
    }
    incident.status = IncidentStatus.CLOSED;
    incident.closedAt = new Date();
    await incident.save();
    return incident;
  }
}
