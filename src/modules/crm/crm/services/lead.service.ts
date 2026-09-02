import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lead, LeadDocument, LeadStage, LeadStatus } from '../schemas';
import {
  CreateLeadDto,
  UpdateLeadDto,
  MoveLeadStageDto,
  MarkLeadLostDto,
  ConvertLeadDto,
} from '../dtos';
import { ClientPipelineService } from './client-pipeline.service';
import { TenantClientsService } from 'src/modules/tenant/services/tenant-client.service';

@Injectable()
export class LeadService {
  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    private readonly clientPipelineService: ClientPipelineService,
    private readonly tenantClientsService: TenantClientsService,
  ) {}

  async create(tenantId: string, dto: CreateLeadDto): Promise<LeadDocument> {
    if (!dto.contactName?.trim() && !dto.companyName?.trim()) {
      throw new BadRequestException(
        'Provide at least a contact name or a company name.',
      );
    }
    return this.leadModel.create({
      tenantId: new Types.ObjectId(tenantId),
      contactName: dto.contactName?.trim() || null,
      companyName: dto.companyName?.trim() || null,
      contactEmail: dto.contactEmail?.trim() || null,
      contactPhone: dto.contactPhone?.trim() || null,
      industry: dto.industry?.trim() || null,
      source: dto.source,
      sourceNote: dto.sourceNote?.trim() || null,
      notes: dto.notes?.trim() || null,
      assignedToUserId: dto.assignedToUserId
        ? new Types.ObjectId(dto.assignedToUserId)
        : null,
      stage: LeadStage.LEAD,
      status: LeadStatus.OPEN,
    });
  }

  async getAll(tenantId: string) {
    return this.leadModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getById(tenantId: string, id: string): Promise<LeadDocument> {
    const lead = await this.leadModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateLeadDto,
  ): Promise<LeadDocument> {
    const lead = await this.getById(tenantId, id);
    if (dto.contactName !== undefined)
      lead.contactName = dto.contactName.trim() || null;
    if (dto.companyName !== undefined)
      lead.companyName = dto.companyName.trim() || null;
    if (dto.contactEmail !== undefined)
      lead.contactEmail = dto.contactEmail.trim() || null;
    if (dto.contactPhone !== undefined)
      lead.contactPhone = dto.contactPhone.trim() || null;
    if (dto.industry !== undefined) lead.industry = dto.industry.trim() || null;
    if (dto.source !== undefined) lead.source = dto.source;
    if (dto.sourceNote !== undefined)
      lead.sourceNote = dto.sourceNote.trim() || null;
    if (dto.notes !== undefined) lead.notes = dto.notes.trim() || null;
    if (dto.assignedToUserId !== undefined)
      lead.assignedToUserId = dto.assignedToUserId
        ? new Types.ObjectId(dto.assignedToUserId)
        : null;
    await lead.save();
    return lead;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const deleted = await this.leadModel.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Lead not found');
  }

  // Drag-and-drop between the two pre-conversion board columns —
  // Active/Retained/Past live on the real Client Pipeline instead,
  // handled by ClientPipelineService.
  async moveStage(
    tenantId: string,
    id: string,
    dto: MoveLeadStageDto,
  ): Promise<LeadDocument> {
    const lead = await this.getById(tenantId, id);
    if (lead.status !== LeadStatus.OPEN) {
      throw new ConflictException(
        'This lead is no longer open — it has already converted or been marked lost.',
      );
    }
    lead.stage = dto.stage;
    if (dto.stage === LeadStage.PROSPECT && !lead.reachedProspectAt) {
      lead.reachedProspectAt = new Date();
    }
    await lead.save();
    return lead;
  }

  async markLost(
    tenantId: string,
    id: string,
    dto: MarkLeadLostDto,
  ): Promise<LeadDocument> {
    const lead = await this.getById(tenantId, id);
    if (lead.status !== LeadStatus.OPEN) {
      throw new ConflictException('This lead is not currently open.');
    }
    lead.status = LeadStatus.LOST;
    lead.lostAt = new Date();
    lead.lostReason = dto.reason?.trim() || null;
    await lead.save();
    return lead;
  }

  // Converts a lead into a real, logged-in client account by calling
  // the SAME atomic createClientWithContract flow a tenant uses to
  // manually add a client — the real contract generated here is
  // what eventually activates this client's real credentials once
  // countersigned, exactly as it would for any other new client. On
  // success, a ClientPipelineRecord is created (stage: active) and
  // this lead is stamped as converted with a link to the new
  // account.
  async convert(
    tenantId: string,
    id: string,
    actingUserId: string,
    dto: ConvertLeadDto,
  ) {
    const lead = await this.getById(tenantId, id);
    if (lead.status !== LeadStatus.OPEN) {
      throw new ConflictException('This lead is not currently open.');
    }
    if (!lead.reachedProspectAt) {
      throw new BadRequestException(
        'A lead must reach Prospect stage before converting.',
      );
    }

    const email = dto.email?.trim() || lead.contactEmail;
    if (!email) {
      throw new BadRequestException(
        'This lead has no email on file — provide one to convert.',
      );
    }

    const fullName = lead.contactName || lead.companyName;
    if (!fullName) {
      throw new BadRequestException(
        'This lead has no contact or company name on file.',
      );
    }

    const phoneNumber =
      dto.phoneNumber?.trim() || lead.contactPhone || undefined;

    const result = await this.tenantClientsService.createClientWithContract(
      {
        fullName,
        email,
        phoneNumber,
        clientType: dto.clientType,
        templateId: dto.templateId,
        templateSource: dto.templateSource,
        contractTitle: dto.contractTitle,
        contractType: dto.contractType,
      },
      tenantId,
      actingUserId,
    );

    const newClientId = (result.data as any)._id;

    await this.clientPipelineService.create(
      tenantId,
      newClientId.toString(),
      (lead._id as Types.ObjectId).toString(),
    );

    lead.status = LeadStatus.CONVERTED;
    lead.convertedAt = new Date();
    lead.convertedClientId = newClientId;
    await lead.save();

    return {
      lead,
      client: result.data,
      message: result.message,
    };
  }

  async getStats(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const [leadsCount, prospectsCount] = await Promise.all([
      this.leadModel.countDocuments({
        tenantId: tId,
        stage: LeadStage.LEAD,
        status: LeadStatus.OPEN,
      }),
      this.leadModel.countDocuments({
        tenantId: tId,
        stage: LeadStage.PROSPECT,
        status: LeadStatus.OPEN,
      }),
    ]);
    return { leads: leadsCount, prospects: prospectsCount };
  }

  async getFunnel(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const [totalLeads, reachedProspect, converted, clientCounts] =
      await Promise.all([
        this.leadModel.countDocuments({ tenantId: tId }),
        this.leadModel.countDocuments({
          tenantId: tId,
          reachedProspectAt: { $ne: null },
        }),
        this.leadModel.countDocuments({
          tenantId: tId,
          status: LeadStatus.CONVERTED,
        }),
        this.clientPipelineService.getCounts(tenantId),
      ]);

    const clientTotal =
      clientCounts.active + clientCounts.retained + clientCounts.past;

    return {
      totalLeads,
      reachedProspect,
      converted,
      leadToProspectRate:
        totalLeads > 0 ? Math.round((reachedProspect / totalLeads) * 100) : 0,
      prospectToClientRate:
        reachedProspect > 0
          ? Math.round((converted / reachedProspect) * 100)
          : 0,
      clientRetentionRate:
        clientTotal > 0
          ? Math.round((clientCounts.retained / clientTotal) * 100)
          : 0,
    };
  }
}
