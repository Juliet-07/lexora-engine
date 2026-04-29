import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, } from 'mongoose';
import type { QueryFilter } from 'mongoose';
import { Client, ClientDocument } from './schemas/client.schema';
import {
  CreateClientDto,
  UpdateClientDto,
  UpdateClientStatusDto,
  UpdateRiskLevelDto,
  ClientFilterDto,
} from './dto/client.dto';
import { PaginationDto, paginate } from '../../common/pagination.dto';

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel(Client.name) private clientModel: Model<ClientDocument>,
  ) {}

  async createClient(
    dto: CreateClientDto,
    organizationId: string,
  ): Promise<ClientDocument> {
    return this.clientModel.create({
      ...dto,
      organizationId: new Types.ObjectId(organizationId),
      assignedTo: dto.assignedTo ? new Types.ObjectId(dto.assignedTo) : null,
    });
  }

  async findAll(
    organizationId: string,
    pagination: PaginationDto,
    filters: ClientFilterDto,
  ) {
    const query: QueryFilter<ClientDocument> = {
      organizationId: new Types.ObjectId(organizationId),
    };

    if (filters.status) query.status = filters.status;
    if (filters.riskLevel) query.riskLevel = filters.riskLevel;
    if (filters.type) query.type = filters.type;
    if (filters.search) {
      query.$or = [
        { firstName: { $regex: filters.search, $options: 'i' } },
        { lastName: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
        { companyName: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const { skip, limit, page } = pagination;
    const [data, total] = await Promise.all([
      this.clientModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .populate('assignedTo', 'firstName lastName email')
        .lean(),
      this.clientModel.countDocuments(query),
    ]);

    return paginate(data, total, page, limit);
  }

  async findById(id: string, organizationId: string): Promise<ClientDocument> {
    const client = await this.clientModel
      .findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .populate('assignedTo', 'firstName lastName email')
      .lean();

    if (!client) throw new NotFoundException('Client not found');
    return client as ClientDocument;
  }

  async updateClient(
    id: string,
    dto: UpdateClientDto,
    organizationId: string,
  ): Promise<ClientDocument> {
    const client = await this.clientModel.findOneAndUpdate(
      { _id: id, organizationId: new Types.ObjectId(organizationId) },
      dto,
      { new: true },
    );
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async updateStatus(
    id: string,
    dto: UpdateClientStatusDto,
    organizationId: string,
  ): Promise<ClientDocument> {
    const client = await this.clientModel.findOneAndUpdate(
      { _id: id, organizationId: new Types.ObjectId(organizationId) },
      { status: dto.status },
      { new: true },
    );
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async updateRiskLevel(
    id: string,
    dto: UpdateRiskLevelDto,
    organizationId: string,
  ): Promise<ClientDocument> {
    const client = await this.clientModel.findOneAndUpdate(
      { _id: id, organizationId: new Types.ObjectId(organizationId) },
      { riskLevel: dto.riskLevel },
      { new: true },
    );
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async linkClientToOrganization(
    clientId: string,
    newOrgId: string,
  ): Promise<ClientDocument> {
    const client = await this.clientModel.findByIdAndUpdate(
      clientId,
      { organizationId: new Types.ObjectId(newOrgId) },
      { new: true },
    );
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async deleteClient(id: string, organizationId: string): Promise<void> {
    const client = await this.clientModel.findOneAndDelete({
      _id: id,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!client) throw new NotFoundException('Client not found');
  }

  async getClientStats(organizationId: string) {
    const stats = await this.clientModel.aggregate([
      { $match: { organizationId: new Types.ObjectId(organizationId) } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          highRisk: { $sum: { $cond: [{ $eq: ['$riskLevel', 'high'] }, 1, 0] } },
          criticalRisk: { $sum: { $cond: [{ $eq: ['$riskLevel', 'critical'] }, 1, 0] } },
        },
      },
    ]);
    return stats[0] || { total: 0, active: 0, pending: 0, highRisk: 0, criticalRisk: 0 };
  }
}
