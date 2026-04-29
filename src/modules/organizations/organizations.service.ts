import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Organization,
  OrganizationDocument,
  OrgStatus,
} from './schemas/organization.schema';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  AssignPlanDto,
  UpdateOrgStatusDto,
} from './dto/organization.dto';
import { PaginationDto, paginate } from '../../common/pagination.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name)
    private orgModel: Model<OrganizationDocument>,
  ) {}

  async createOrganization(dto: CreateOrganizationDto): Promise<OrganizationDocument> {
    const existing = await this.orgModel.findOne({ slug: dto.slug });
    if (existing) throw new ConflictException('Organization slug already taken');
    return this.orgModel.create(dto);
  }

  async findAll(pagination: PaginationDto) {
    const { skip, limit, page } = pagination;
    const [data, total] = await Promise.all([
      this.orgModel.find().skip(skip).limit(limit).lean(),
      this.orgModel.countDocuments(),
    ]);
    return paginate(data, total, page, limit);
  }

  async findById(id: string): Promise<OrganizationDocument> {
    const org = await this.orgModel.findById(id).lean();
    if (!org) throw new NotFoundException('Organization not found');
    return org as OrganizationDocument;
  }

  async findBySlug(slug: string): Promise<OrganizationDocument> {
    const org = await this.orgModel.findOne({ slug }).lean();
    if (!org) throw new NotFoundException('Organization not found');
    return org as OrganizationDocument;
  }

  async updateOrganization(id: string, dto: UpdateOrganizationDto): Promise<OrganizationDocument> {
    const org = await this.orgModel.findByIdAndUpdate(id, dto, { new: true });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async assignPlan(id: string, dto: AssignPlanDto): Promise<OrganizationDocument> {
    const update: any = { plan: dto.plan };
    if (dto.maxUsers) update.maxUsers = dto.maxUsers;
    if (dto.expiresAt) update.planExpiresAt = new Date(dto.expiresAt);

    const org = await this.orgModel.findByIdAndUpdate(id, update, { new: true });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async updateStatus(id: string, dto: UpdateOrgStatusDto): Promise<OrganizationDocument> {
    const org = await this.orgModel.findByIdAndUpdate(id, { status: dto.status }, { new: true });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async deactivateOrganization(id: string): Promise<OrganizationDocument> {
    return this.updateStatus(id, { status: OrgStatus.INACTIVE });
  }

  async deleteOrganization(id: string): Promise<void> {
    const org = await this.orgModel.findByIdAndDelete(id);
    if (!org) throw new NotFoundException('Organization not found');
  }
}
