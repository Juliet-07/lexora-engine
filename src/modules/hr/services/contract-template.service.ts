import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PlatformContractTemplate,
  PlatformContractTemplateDocument,
  PlatformTemplateStatus,
} from '../../super_admin/schemas/contract-template.schema';

// HR no longer authors its own contract templates — a template is
// now authored and published by the super admin (lexora-super-admin
// → Contract Templates, module "hr"), the same place every other
// module's templates come from. This service is a thin, read-only
// proxy: tenants list and pick from PUBLISHED, moduleKey: 'hr'
// platform templates — they can no longer create, edit, or delete
// one from here. The historical, tenant-authored `hr_contract_templates`
// collection (schemas/contract-template.schema.ts) is left untouched
// and unused by new code — existing generated contracts keep their
// own denormalized templateName/renderedBody, so nothing reads it.
@Injectable()
export class ContractTemplateService {
  constructor(
    @InjectModel(PlatformContractTemplate.name)
    private readonly platformTemplateModel: Model<PlatformContractTemplateDocument>,
  ) {}

  async getAll(
    workerCategory?: string,
  ): Promise<PlatformContractTemplateDocument[]> {
    const query: any = {
      moduleKey: 'hr',
      status: PlatformTemplateStatus.PUBLISHED,
    };
    // A template with no hrWorkerCategory set applies to either —
    // only a template explicitly scoped to the OTHER category is
    // excluded.
    if (workerCategory) {
      query.$or = [
        { hrWorkerCategory: workerCategory },
        { hrWorkerCategory: null },
        { hrWorkerCategory: { $exists: false } },
      ];
    }
    return this.platformTemplateModel.find(query).sort({ title: 1 }).lean();
  }

  async getById(templateId: string): Promise<PlatformContractTemplateDocument> {
    const template = await this.platformTemplateModel
      .findOne({
        _id: templateId,
        moduleKey: 'hr',
        status: PlatformTemplateStatus.PUBLISHED,
      })
      .lean();
    if (!template)
      throw new NotFoundException(
        'Contract template not found or not published',
      );
    return template as any;
  }
}
