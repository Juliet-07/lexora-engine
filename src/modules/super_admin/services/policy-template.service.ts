import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PolicyTemplate,
  PolicyTemplateDocument,
  PolicyTemplateStatus,
  PolicyTemplateAppliesTo,
} from '../schemas';
import { UpsertPolicyTemplateDto } from '../dtos';

@Injectable()
export class PolicyTemplateService {
  constructor(
    @InjectModel(PolicyTemplate.name)
    private readonly model: Model<PolicyTemplateDocument>,
  ) {}

  // ── Super Admin — sees everything, draft and published ────────

  async getAllForAdmin() {
    return this.model.find().sort({ category: 1, title: 1 }).lean();
  }

  async getOneForAdmin(id: string) {
    const t = await this.model.findById(id).lean();
    if (!t) throw new NotFoundException('Template not found');
    return t;
  }

  async create(dto: UpsertPolicyTemplateDto) {
    const created = await this.model.create({
      ...dto,
      publishedAt:
        dto.status === PolicyTemplateStatus.PUBLISHED ? new Date() : null,
    });
    return created.toObject();
  }

  async update(id: string, dto: UpsertPolicyTemplateDto) {
    const existing = await this.model.findById(id);
    if (!existing) throw new NotFoundException('Template not found');
    Object.assign(existing, dto);
    if (
      dto.status === PolicyTemplateStatus.PUBLISHED &&
      !existing.publishedAt
    ) {
      existing.publishedAt = new Date();
    }
    await existing.save();
    return existing.toObject();
  }

  async setStatus(id: string, status: PolicyTemplateStatus) {
    const existing = await this.model.findById(id);
    if (!existing) throw new NotFoundException('Template not found');
    existing.status = status;
    if (status === PolicyTemplateStatus.PUBLISHED && !existing.publishedAt) {
      existing.publishedAt = new Date();
    }
    await existing.save();
    return existing.toObject();
  }

  async delete(id: string) {
    const res = await this.model.deleteOne({ _id: id });
    if (!res.deletedCount) throw new NotFoundException('Template not found');
    return { deleted: true };
  }

  // ── Tenant-facing — published only, optionally by category ────

  // appliesTo defaults to POLICY when omitted — but templates created
  // before this field existed have no `appliesTo` stored at all, so
  // "wants Policy templates" matches anything NOT explicitly flagged
  // Governance-Code-only (never breaks the existing Policy template
  // picker), while "wants Governance Code templates" matches only
  // documents explicitly flagged that way (a legacy/undefined
  // document was never authored for Governance Codes, so it correctly
  // stays out of that list).
  async getPublished(category?: string, appliesTo?: PolicyTemplateAppliesTo) {
    const filter: Record<string, unknown> = {
      status: PolicyTemplateStatus.PUBLISHED,
    };
    if (category) filter.category = category;
    if (appliesTo === PolicyTemplateAppliesTo.GOVERNANCE_CODE) {
      filter.appliesTo = PolicyTemplateAppliesTo.GOVERNANCE_CODE;
    } else {
      filter.appliesTo = { $ne: PolicyTemplateAppliesTo.GOVERNANCE_CODE };
    }
    return this.model.find(filter).sort({ category: 1, title: 1 }).lean();
  }
}
