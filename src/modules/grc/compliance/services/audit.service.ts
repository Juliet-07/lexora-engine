import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AuditEngagement,
  AuditEngagementDocument,
  AuditEngagementStatus,
  NEXT_STATUS,
} from '../schemas';
import {
  CreateAuditDto,
  SetAuditStatusDto,
  AddRequestDto,
  SetRequestStatusDto,
  AddFindingDto,
  UpdateFindingDto,
} from '../dtos';

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditEngagement.name)
    private readonly model: Model<AuditEngagementDocument>,
  ) {}

  async create(tenantId: string, dto: CreateAuditDto) {
    return this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      type: dto.type,
      scope: dto.scope ?? '',
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      status: AuditEngagementStatus.PLANNED,
      requests: [],
      findings: [],
    });
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  private async getRawDoc(
    tenantId: string,
    id: string,
  ): Promise<AuditEngagementDocument> {
    const a = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!a) throw new NotFoundException('Audit engagement not found');
    return a;
  }

  async setStatus(tenantId: string, id: string, dto: SetAuditStatusDto) {
    const a = await this.getRawDoc(tenantId, id);
    if (NEXT_STATUS[a.status] !== dto.status) {
      throw new BadRequestException(
        `Cannot move directly from ${a.status} to ${dto.status}.`,
      );
    }
    a.status = dto.status;
    await a.save();
    return a;
  }

  async addRequest(tenantId: string, id: string, dto: AddRequestDto) {
    const a = await this.getRawDoc(tenantId, id);
    a.requests.push({
      description: dto.description,
      assignedTo: dto.assignedTo ?? '',
      dueDate: new Date(dto.dueDate),
    } as any);
    a.markModified('requests');
    await a.save();
    return a;
  }

  async setRequestStatus(
    tenantId: string,
    id: string,
    index: number,
    dto: SetRequestStatusDto,
  ) {
    const a = await this.getRawDoc(tenantId, id);
    const r = a.requests[index];
    if (!r) throw new NotFoundException('Request not found');
    r.status = dto.status;
    a.markModified('requests');
    await a.save();
    return a;
  }

  async addFinding(tenantId: string, id: string, dto: AddFindingDto) {
    const a = await this.getRawDoc(tenantId, id);
    a.findings.push({
      observation: dto.observation,
      condition: dto.condition ?? '',
      criteria: dto.criteria ?? '',
      cause: dto.cause ?? '',
      consequence: dto.consequence ?? '',
      recommendation: dto.recommendation ?? '',
      severity: dto.severity,
      status: 'Open',
      managementResponse: '',
      remediationDueDate: null,
      createdAt: new Date(),
    } as any);
    a.markModified('findings');
    await a.save();
    return a;
  }

  async updateFinding(
    tenantId: string,
    id: string,
    index: number,
    dto: UpdateFindingDto,
  ) {
    const a = await this.getRawDoc(tenantId, id);
    const f = a.findings[index];
    if (!f) throw new NotFoundException('Finding not found');
    if (dto.managementResponse !== undefined)
      f.managementResponse = dto.managementResponse;
    if (dto.remediationDueDate !== undefined)
      f.remediationDueDate = new Date(dto.remediationDueDate);
    if (dto.status !== undefined) f.status = dto.status;
    a.markModified('findings');
    await a.save();
    return a;
  }
}
