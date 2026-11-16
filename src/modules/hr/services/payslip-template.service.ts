import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PayslipTemplate, PayslipTemplateDocument } from '../schemas';
import { UpdatePayslipTemplateDto } from '../dtos';
import { DocumentBrandingService } from '../../crm/finance/services/document-branding.service';
import { DocumentBranding } from '../../../common/utils/pdf/branding.util';

@Injectable()
export class PayslipTemplateService {
  constructor(
    @InjectModel(PayslipTemplate.name)
    private readonly templateModel: Model<PayslipTemplateDocument>,
    private readonly brandingService: DocumentBrandingService,
  ) {}

  // The payslip no longer has branding of its own: logo, colour, company
  // name, address and footer come from Finance Settings → Document
  // Branding so every document a tenant issues looks the same. The
  // template keeps only what is payslip-specific (which sections show).
  async getEffective(tenantId: string): Promise<{
    template: PayslipTemplateDocument;
    branding: DocumentBranding;
  }> {
    const stored = await this.getOrCreateTemplate(tenantId);
    const branding = await this.brandingService.resolve(tenantId);
    const footerParts = branding.footerEnabled
      ? [
          branding.companyName,
          branding.addressLines.join(', '),
          branding.tin ? `TIN ${branding.tin}` : '',
        ].filter(Boolean)
      : [];
    const template = {
      ...(stored.toObject() as any),
      logoUrl: branding.logoDataUrl,
      accentColor: branding.headerColor,
      companyName: branding.companyName,
      companyAddress: branding.addressLines.join(', ') || null,
      footerNote: footerParts.join('  ·  ') || null,
    } as PayslipTemplateDocument;
    return { template, branding };
  }

  async getOrCreateTemplate(
    tenantId: string,
  ): Promise<PayslipTemplateDocument> {
    const tId = new Types.ObjectId(tenantId);
    const existing = await this.templateModel.findOne({ tenantId: tId });
    if (existing) return existing;

    return this.templateModel.create({ tenantId: tId });
  }

  async updateTemplate(
    tenantId: string,
    dto: UpdatePayslipTemplateDto,
  ): Promise<PayslipTemplateDocument> {
    const tId = new Types.ObjectId(tenantId);
    return this.templateModel.findOneAndUpdate(
      { tenantId: tId },
      { $set: dto },
      { upsert: true, new: true },
    );
  }
}
