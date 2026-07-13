import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ContractTemplate,
  ContractTemplateDocument,
  AVAILABLE_MERGE_FIELDS,
} from '../schemas/contract-template.schema';
import { CreateContractTemplateDto, UpdateContractTemplateDto } from '../dtos';

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

@Injectable()
export class ContractTemplateService {
  constructor(
    @InjectModel(ContractTemplate.name)
    private readonly templateModel: Model<ContractTemplateDocument>,
  ) {}

  async getAll(
    tenantId: string,
    workerCategory?: string,
  ): Promise<ContractTemplateDocument[]> {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (workerCategory) query.workerCategory = workerCategory;
    return this.templateModel.find(query).sort({ name: 1 }).lean() as any;
  }

  async getById(
    tenantId: string,
    templateId: string,
  ): Promise<ContractTemplateDocument> {
    const template = await this.templateModel.findOne({
      _id: templateId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!template) throw new NotFoundException('Contract template not found');
    return template;
  }

  async create(
    tenantId: string,
    dto: CreateContractTemplateDto,
  ): Promise<ContractTemplateDocument> {
    this.validatePlaceholders(dto.body);
    return this.templateModel.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      workerCategory: dto.workerCategory,
      body: dto.body,
      description: dto.description ?? null,
      category: dto.category ?? 'contract',
      requiresSignature: dto.requiresSignature ?? true,
    });
  }

  async update(
    tenantId: string,
    templateId: string,
    dto: UpdateContractTemplateDto,
  ): Promise<ContractTemplateDocument> {
    const template = await this.getById(tenantId, templateId);

    if (dto.body !== undefined) {
      this.validatePlaceholders(dto.body);
      template.body = dto.body;
    }
    if (dto.name !== undefined) template.name = dto.name;
    if (dto.description !== undefined) template.description = dto.description;
    if (dto.isActive !== undefined) template.isActive = dto.isActive;
    if (dto.category !== undefined) template.category = dto.category as any;
    if (dto.requiresSignature !== undefined)
      template.requiresSignature = dto.requiresSignature;

    await template.save();
    return template;
  }

  async delete(tenantId: string, templateId: string): Promise<void> {
    const deleted = await this.templateModel.findOneAndDelete({
      _id: templateId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Contract template not found');
  }

  // Catches a typo'd or invented placeholder at SAVE time —
  // {{salry}} instead of {{salary}} — rather than letting it sit
  // silently unreplaced in a real generated contract months later.
  private validatePlaceholders(body: string): void {
    const found = new Set<string>();
    let match;
    while ((match = PLACEHOLDER_PATTERN.exec(body)) !== null) {
      found.add(match[1]);
    }
    const invalid = Array.from(found).filter(
      (f) => !AVAILABLE_MERGE_FIELDS.includes(f as any),
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Unknown placeholder(s): ${invalid.map((f) => `{{${f}}}`).join(', ')}. ` +
          `Available fields: ${AVAILABLE_MERGE_FIELDS.map((f) => `{{${f}}}`).join(', ')}.`,
      );
    }
  }

  getAvailableMergeFields(): readonly string[] {
    return AVAILABLE_MERGE_FIELDS;
  }
}
