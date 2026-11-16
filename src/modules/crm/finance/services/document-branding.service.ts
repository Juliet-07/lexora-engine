import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as fs from 'fs';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../../auth/schemas/user.schema';
import {
  FinanceSettings,
  FinanceSettingsDocument,
} from '../schemas/finance-settings.schema';
import {
  PayslipTemplate,
  PayslipTemplateDocument,
} from '../../../hr/schemas/payroll.schema';
import {
  DEFAULT_DOCUMENT_BRANDING,
  DocumentBranding,
  toDataUrl,
} from '../../../../common/utils/pdf/branding.util';
import { mergeWithDefaults } from './finance-settings.logic';

// The legacy payslip accent — a tenant still on it never customised
// their payslip colour, so it is not carried into the shared palette.
const LEGACY_PAYSLIP_ACCENT = '#6366f1';

const readLogo = (logo?: { path?: string; mimeType?: string } | null) => {
  try {
    if (logo?.path && fs.existsSync(logo.path)) {
      return toDataUrl(fs.readFileSync(logo.path), logo.mimeType || 'image/png');
    }
  } catch {
    /* an unreadable logo is dropped rather than failing a document */
  }
  return null;
};

// The one place that answers "how should this tenant's documents look".
// Used by the finance PDFs (invoice, receipt, quote, purchase order) and
// by payslips, so they can never drift apart. Works for a tenant who has
// never opened Finance Settings: company name, address, logo and TIN
// then come from the tenant profile (and, once, from the old payslip
// branding so nothing they set up is lost).
@Injectable()
export class DocumentBrandingService {
  constructor(
    @InjectModel(FinanceSettings.name)
    private readonly settingsModel: Model<FinanceSettingsDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(PayslipTemplate.name)
    private readonly payslipModel: Model<PayslipTemplateDocument>,
  ) {}

  async resolve(tenantId: string): Promise<DocumentBranding> {
    const tid = new Types.ObjectId(tenantId);
    const [settings, tenant, legacy] = await Promise.all([
      this.settingsModel.findOne({ tenantId: tid }).lean(),
      this.userModel.findById(tid).lean(),
      this.payslipModel.findOne({ tenantId: tid }).lean(),
    ]);
    const profile: any = (tenant as any)?.tenantProfile ?? {};
    const b = mergeWithDefaults('branding', (settings as any)?.branding);
    const tax = mergeWithDefaults('tax', (settings as any)?.tax);
    const general = mergeWithDefaults('general', (settings as any)?.general);

    const legacyAccent =
      legacy?.accentColor && legacy.accentColor.toLowerCase() !== LEGACY_PAYSLIP_ACCENT
        ? legacy.accentColor
        : null;
    // Until the tenant saves branding, the old payslip colour (if they
    // had set one) still shows; after that, Finance Settings is the
    // only source.
    const headerColor =
      !settings?.branding?.headerColor && legacyAccent
        ? legacyAccent
        : b.headerColor;

    const addressText: string = b.address || legacy?.companyAddress || '';
    const addressLines = addressText
      ? addressText.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean)
      : [profile?.address?.city, profile?.address?.state, profile?.address?.country].filter(Boolean);

    const logoDataUrl = b.showLogo
      ? (readLogo((settings as any)?.logo) ||
        (legacy?.logoUrl && legacy.logoUrl.startsWith('data:') ? legacy.logoUrl : null) ||
        (profile?.logoUrl && String(profile.logoUrl).startsWith('data:') ? profile.logoUrl : null))
      : null;

    return {
      ...DEFAULT_DOCUMENT_BRANDING,
      headerColor,
      accentColor: b.accentColor,
      highlightColor: b.highlightColor,
      showLogo: b.showLogo,
      logoDataUrl,
      companyName: b.companyName || legacy?.companyName || profile?.businessName || 'Your firm',
      tagline: b.tagline,
      showTagline: b.showTagline,
      addressLines,
      tin: tax.tin || profile?.taxId || '',
      email: profile?.contactPerson?.email || (tenant as any)?.email || '',
      footerEnabled: b.footerWithAddressAndTin,
      watermarkDrafts: b.watermarkDrafts,
      headingFont: b.headingFont,
      bodyFont: b.bodyFont,
      numberFormat: general.numberFormat,
      dateFormat: general.dateFormat,
    };
  }
}
