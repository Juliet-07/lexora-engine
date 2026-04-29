import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { QueryFilter } from 'mongoose';
import {
  Alert, AlertDocument, AlertStatus,
  ComplianceCase, CaseDocument, CaseStatus,
  AuditLog, AuditLogDocument,
} from './schemas/compliance.schema';
import {
  CreateAlertDto, UpdateAlertDto, CreateCaseDto, UpdateCaseDto,
  AddCaseNoteDto, AssignCaseDto, AuditLogFilterDto,
} from './dto/compliance.dto';
import { PaginationDto, paginate } from '../../common/pagination.dto';

@Injectable()
export class ComplianceService {
  constructor(
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    @InjectModel(ComplianceCase.name) private caseModel: Model<CaseDocument>,
    @InjectModel(AuditLog.name) private auditModel: Model<AuditLogDocument>,
  ) {}

  private generateCaseNumber(): string {
    const ts = Date.now().toString(36).toUpperCase();
    return `CASE-${ts}`;
  }

  // Alerts
  async createAlert(dto: CreateAlertDto, organizationId: string): Promise<AlertDocument> {
    return this.alertModel.create({
      ...dto,
      organizationId: new Types.ObjectId(organizationId),
      clientId: dto.clientId ? new Types.ObjectId(dto.clientId) : null,
      assignedTo: dto.assignedTo ? new Types.ObjectId(dto.assignedTo) : null,
    }) as any;
  }

  async findAlerts(organizationId: string, pagination: PaginationDto, status?: AlertStatus) {
    const query: any = { organizationId: new Types.ObjectId(organizationId) };
    if (status) query.status = status;

    const { skip, limit, page } = pagination;
    const [data, total] = await Promise.all([
      this.alertModel.find(query).skip(skip).limit(limit)
        .populate('clientId', 'firstName lastName email')
        .populate('assignedTo', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .lean(),
      this.alertModel.countDocuments(query),
    ]);
    return paginate(data, total, page, limit);
  }

  async findAlertById(id: string): Promise<AlertDocument> {
    const alert = await this.alertModel.findById(id).lean();
    if (!alert) throw new NotFoundException('Alert not found');
    return alert as AlertDocument;
  }

  async updateAlert(id: string, dto: UpdateAlertDto, userId: string): Promise<AlertDocument> {
    const update: any = { ...dto };
    if (dto.assignedTo) update.assignedTo = new Types.ObjectId(dto.assignedTo);
    if (dto.status === AlertStatus.RESOLVED) {
      update.resolvedAt = new Date();
      update.resolvedBy = userId;
    }

    const alert = await this.alertModel.findByIdAndUpdate(id, update, { new: true });
    if (!alert) throw new NotFoundException('Alert not found');
    return alert;
  }

  async resolveAlert(id: string, notes: string, userId: string): Promise<AlertDocument> {
    return this.updateAlert(id, { status: AlertStatus.RESOLVED, resolutionNotes: notes }, userId);
  }

  // Cases
  async createCase(dto: CreateCaseDto, organizationId: string, createdBy: string): Promise<CaseDocument> {
    return this.caseModel.create({
      ...dto,
      caseNumber: this.generateCaseNumber(),
      organizationId: new Types.ObjectId(organizationId),
      createdBy: new Types.ObjectId(createdBy),
      clientId: dto.clientId ? new Types.ObjectId(dto.clientId) : null,
      alertId: dto.alertId ? new Types.ObjectId(dto.alertId) : null,
      assignedTo: dto.assignedTo ? new Types.ObjectId(dto.assignedTo) : null,
    }) as any;
  }

  async findCases(organizationId: string, pagination: PaginationDto, status?: CaseStatus) {
    const query: any = { organizationId: new Types.ObjectId(organizationId) };
    if (status) query.status = status;

    const { skip, limit, page } = pagination;
    const [data, total] = await Promise.all([
      this.caseModel.find(query).skip(skip).limit(limit)
        .populate('clientId', 'firstName lastName email')
        .populate('assignedTo', 'firstName lastName email')
        .populate('createdBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .lean(),
      this.caseModel.countDocuments(query),
    ]);
    return paginate(data, total, page, limit);
  }

  async findCaseById(id: string): Promise<CaseDocument> {
    const c = await this.caseModel.findById(id)
      .populate('clientId', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email')
      .lean();
    if (!c) throw new NotFoundException('Case not found');
    return c as CaseDocument;
  }

  async updateCase(id: string, dto: UpdateCaseDto): Promise<CaseDocument> {
    const update: any = { ...dto };
    if (dto.status === CaseStatus.RESOLVED) update.resolvedAt = new Date();
    if (dto.status === CaseStatus.CLOSED) update.closedAt = new Date();
    if (dto.assignedTo) update.assignedTo = new Types.ObjectId(dto.assignedTo);

    const c = await this.caseModel.findByIdAndUpdate(id, update, { new: true });
    if (!c) throw new NotFoundException('Case not found');
    return c;
  }

  async assignCase(id: string, dto: AssignCaseDto): Promise<CaseDocument> {
    const c = await this.caseModel.findByIdAndUpdate(
      id,
      { assignedTo: new Types.ObjectId(dto.userId) },
      { new: true },
    );
    if (!c) throw new NotFoundException('Case not found');
    return c;
  }

  async addCaseNote(id: string, dto: AddCaseNoteDto, addedBy: string): Promise<CaseDocument> {
    const c = await this.caseModel.findByIdAndUpdate(
      id,
      {
        $push: {
          notes: { content: dto.content, addedBy, addedAt: new Date() },
        },
      },
      { new: true },
    );
    if (!c) throw new NotFoundException('Case not found');
    return c;
  }

  async resolveCase(id: string): Promise<CaseDocument> {
    return this.updateCase(id, { status: CaseStatus.RESOLVED });
  }

  // Audit Logs
  async createAuditLog(data: Partial<AuditLog>): Promise<AuditLogDocument> {
    return this.auditModel.create(data) as any;
  }

  async getAuditLogs(organizationId: string, pagination: PaginationDto, filters: AuditLogFilterDto) {
    const query: QueryFilter<AuditLogDocument> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (filters.userId) query.userId = new Types.ObjectId(filters.userId);
    if (filters.resource) query.resource = filters.resource;
    if (filters.action) query.action = { $regex: filters.action, $options: 'i' };

    const { skip, limit, page } = pagination;
    const [data, total] = await Promise.all([
      this.auditModel.find(query).skip(skip).limit(limit)
        .populate('userId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .lean(),
      this.auditModel.countDocuments(query),
    ]);
    return paginate(data, total, page, limit);
  }

  async getComplianceStats(organizationId: string) {
    const [alertStats, caseStats] = await Promise.all([
      this.alertModel.aggregate([
        { $match: { organizationId: new Types.ObjectId(organizationId) } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.caseModel.aggregate([
        { $match: { organizationId: new Types.ObjectId(organizationId) } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);
    return { alerts: alertStats, cases: caseStats };
  }
}
