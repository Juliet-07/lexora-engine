import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const SETTINGS_SECTIONS = [
  'general',
  'tax',
  'invoicing',
  'approvals',
  'banking',
  'branding',
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

// ── Defaults ──────────────────────────────────────────────────
// What a tenant sees before touching anything — chosen so that a tenant
// who never opens Finance Settings gets exactly the behaviour and the
// document look they had before this page existed.

export const FINANCE_SETTINGS_DEFAULTS = {
  general: {
    numberFormat: 'comma-dot', // 1,234,567.89
    dateFormat: 'DD MMM YYYY', // 14 Nov 2026
    multiCurrency: true,
    fiscalYearStartMonth: 1,
    reportingPeriods: 'monthly',
    lockClosedPeriods: false,
    autoClosePeriods: false,
    defaultAccounts: {
      revenue: '',
      receivable: '',
      payable: '',
      bank: '',
      retainedEarnings: '',
    },
    exchangeRateSource: 'central-bank',
    autoSyncRates: true,
    asset: {
      depreciationMethod: 'straight-line',
      capitalisationThreshold: 0,
      trackInsuranceExpiry: false,
    },
    trust: {
      interestTreatment: 'firm-retained',
      requireDrawdownApproval: true,
      autoReconcile: false,
    },
  },
  tax: {
    jurisdiction: 'rw',
    tin: '',
    standardVatRate: 18,
    vatRegistered: true,
    autoCalculateVat: true,
    categories: [
      { code: 'STD', name: 'Standard Rate', rate: 18, active: true },
      { code: 'ZR', name: 'Zero-Rated', rate: 0, active: true },
      { code: 'EXM', name: 'Exempt', rate: 0, active: true },
      { code: 'N/A', name: 'Non-Taxable', rate: null, active: true },
    ],
    whtCategories: [
      { name: 'Professional services (resident)', rate: 15 },
      { name: 'Professional services (non-resident)', rate: 15 },
      { name: 'Dividends (resident)', rate: 5 },
      { name: 'Dividends (non-resident)', rate: 15 },
      { name: 'Interest', rate: 15 },
      { name: 'Royalties', rate: 15 },
      { name: 'Public tenders / Government contracts', rate: 3 },
    ],
    // Which recurring filing reminders the daily tax job sends.
    reminders: { vat: true, paye: true, cit: true, pension: true },
  },
  invoicing: {
    defaultPaymentTerms: 'net-30',
    lateInterestRate: 0,
    applyLateFees: false,
    earlyPaymentDiscount: { enabled: false, percent: 2, days: 10 },
    dunning: {
      enabled: false,
      firstReminderDays: 0,
      secondReminderDays: 7,
      finalNoticeDays: 21,
    },
    invoiceFooter: '',
    creditNoteFooter: '',
  },
  approvals: {
    tiers: [] as any[],
    expenseLimits: [] as any[],
    rules: {
      selfApprovalRestriction: true,
      receiptRequired: true,
      receiptThreshold: 50,
      budgetCheck: false,
      escalateOnTimeout: false,
      escalationHours: 48,
    },
  },
  banking: {
    matchingTolerance: 0,
    autoMatchByReference: true,
    suggestRules: false,
    flagUnmatched: false,
    flagUnmatchedAfterDays: 7,
  },
  branding: {
    headerColor: '#4B0082',
    accentColor: '#7C3AED',
    highlightColor: '#C9A84C',
    companyName: '',
    tagline: '',
    address: '',
    headingFont: 'DM Sans',
    bodyFont: 'DM Sans',
    showLogo: true,
    showTagline: false,
    footerWithAddressAndTin: true,
    watermarkDrafts: true,
  },
};

@Schema({ _id: false })
export class BrandingLogo {
  @Prop({ required: true }) url: string;
  @Prop({ required: true }) path: string;
  @Prop({ default: '' }) name: string;
  @Prop({ default: '' }) mimeType: string;
}
export const BrandingLogoSchema = SchemaFactory.createForClass(BrandingLogo);

export type FinanceSettingsDocument = FinanceSettings & Document;

// One document per tenant. Each section is a plain object merged over
// the defaults on read, so a key added later shows up for existing
// tenants without a migration.
@Schema({ timestamps: true, collection: 'crm_finance_settings' })
export class FinanceSettings {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  tenantId: Types.ObjectId;

  @Prop({ type: Object, default: {} }) general: Record<string, any>;
  @Prop({ type: Object, default: {} }) tax: Record<string, any>;
  @Prop({ type: Object, default: {} }) invoicing: Record<string, any>;
  @Prop({ type: Object, default: {} }) approvals: Record<string, any>;
  @Prop({ type: Object, default: {} }) banking: Record<string, any>;
  @Prop({ type: Object, default: {} }) branding: Record<string, any>;

  @Prop({ type: BrandingLogoSchema, default: null })
  logo: BrandingLogo | null;
}
export const FinanceSettingsSchema =
  SchemaFactory.createForClass(FinanceSettings);

export type FinanceSettingsLogDocument = FinanceSettingsLog & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'crm_finance_settings_log' })
export class FinanceSettingsLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, index: true }) section: string;
  @Prop({ required: true }) summary: string;
  @Prop({ default: '' }) actorId: string;
  @Prop({ default: '' }) actorName: string;
}
export const FinanceSettingsLogSchema =
  SchemaFactory.createForClass(FinanceSettingsLog);
