import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VendorDocument = Vendor & Document;

export enum VendorCategory {
  TECHNOLOGY = 'Technology',
  PROFESSIONAL_SERVICES = 'Professional services',
  FINANCIAL_SERVICES = 'Financial services',
  FACILITIES_OPERATIONS = 'Facilities & operations',
  MARKETING_COMMUNICATIONS = 'Marketing & communications',
  OTHER = 'Other',
}

export enum VendorRisk {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
}

export enum VendorStatus {
  PENDING_DD = 'Pending DD',
  PENDING_APPROVAL = 'Pending approval',
  ACTIVE = 'Active',
  SUSPENDED = 'Suspended',
  OFFBOARDED = 'Offboarded',
}

export enum ContractStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  SIGNED = 'signed',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  TERMINATED = 'terminated',
}

export enum VendorApprovalStatus {
  NOT_REQUESTED = 'not_requested',
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

// Fixed, platform-defined checklist — every vendor goes through the
// same real due-diligence steps. A step is only ever "done" once a
// real document has been uploaded against it; there is no way to
// tick a box without evidence attached.
export const DD_CHECKLIST: { label: string; hint: string }[] = [
  {
    label: 'Company registration verification',
    hint: 'Verify legal existence and good standing',
  },
  {
    label: 'Beneficial ownership / directors',
    hint: 'Identify UBOs and check for PEP/sanctions matches',
  },
  {
    label: 'Financial stability assessment',
    hint: 'Review latest financials or credit reference',
  },
  {
    label: 'Professional indemnity / insurance',
    hint: 'Verify adequate coverage for services provided',
  },
  {
    label: 'Data processing impact assessment',
    hint: 'Will the vendor handle personal or client data?',
  },
  {
    label: 'Reference checks (minimum 2)',
    hint: 'Contact references from current or past clients',
  },
];

@Schema({ _id: true })
export class DdChecklistItem {
  @Prop({ required: true }) label: string;
  @Prop({ default: '' }) hint: string;
  // done is derived from whether a document is attached — never
  // set independently, so it's never possible for a step to read
  // "done" without real evidence behind it.
  @Prop({ default: false }) done: boolean;
  @Prop({ default: '' }) documentName: string;
  @Prop({ default: '' }) documentUrl: string;
  @Prop({ default: null }) uploadedAt: Date | null;
  @Prop({ default: '' }) uploadedBy: string;
}
export const DdChecklistItemSchema =
  SchemaFactory.createForClass(DdChecklistItem);

@Schema({ _id: true })
export class VendorContractHistoryEntry {
  @Prop({ required: true, default: () => new Date() }) at: Date;
  @Prop({ required: true }) label: string;
}
export const VendorContractHistorySchema = SchemaFactory.createForClass(
  VendorContractHistoryEntry,
);

@Schema({ _id: true })
export class VendorContract {
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) templateId: string;
  @Prop({ default: '' }) templateName: string;
  @Prop({ default: '' }) body: string;
  @Prop({ enum: ContractStatus, default: ContractStatus.DRAFT })
  status: ContractStatus;
  @Prop({ default: 0 }) value: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ default: null }) startDate: Date | null;
  @Prop({ default: null }) endDate: Date | null;
  @Prop({ default: null }) sentAt: Date | null;
  @Prop({ default: null }) signedAt: Date | null;
  @Prop({ default: '' }) signerName: string;
  @Prop({ default: '' }) signerEmail: string;
  @Prop({ type: [VendorContractHistorySchema], default: [] })
  history: VendorContractHistoryEntry[];
}
export const VendorContractSchema =
  SchemaFactory.createForClass(VendorContract);

@Schema({ _id: true })
export class VendorNote {
  @Prop({ required: true, default: () => new Date() }) at: Date;
  @Prop({ required: true }) author: string;
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) body: string;
}
export const VendorNoteSchema = SchemaFactory.createForClass(VendorNote);

@Schema({ _id: true })
export class VendorActivity {
  @Prop({ required: true, default: () => new Date() }) at: Date;
  @Prop({ required: true }) text: string;
}
export const VendorActivitySchema =
  SchemaFactory.createForClass(VendorActivity);

@Schema({ _id: false })
export class VendorSpendEntry {
  @Prop({ required: true }) month: string; // "2026-01"
  @Prop({ required: true }) amount: number;
}
export const VendorSpendEntrySchema =
  SchemaFactory.createForClass(VendorSpendEntry);

@Schema({ timestamps: true, collection: 'crm_vendors' })
export class Vendor {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) legalName: string;
  @Prop({ default: '' }) tradingName: string;
  @Prop({ enum: VendorCategory, default: VendorCategory.OTHER })
  category: VendorCategory;
  @Prop({ default: '' }) serviceSummary: string;
  @Prop({ default: '' }) jurisdiction: string;
  @Prop({ default: '' }) registrationNumber: string;
  @Prop({ default: '' }) taxId: string;

  @Prop({ default: '' }) contactName: string;
  @Prop({ default: '' }) contactTitle: string;
  @Prop({ default: '' }) contactEmail: string;
  @Prop({ default: '' }) contactPhone: string;
  @Prop({ default: '' }) website: string;

  @Prop({ default: '' }) engagementType: string;
  @Prop({ default: 0 }) annualValue: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ default: '' }) paymentTerms: string;
  @Prop({ default: '' }) budgetCode: string;
  @Prop({ type: [String], default: [] }) usedByModules: string[];

  @Prop({ enum: VendorRisk, default: VendorRisk.LOW }) risk: VendorRisk;
  @Prop({ default: 'Annual' }) reviewFrequency: string;
  @Prop({ enum: VendorStatus, default: VendorStatus.PENDING_DD, index: true })
  status: VendorStatus;

  @Prop({ default: null }) onboardedAt: Date | null;
  @Prop({ default: null }) nextReview: Date | null;
  @Prop({ default: '' }) justification: string;

  // ── Approval — real employee reference, not free text.
  // Eligibility (HOD/Manager only) is enforced at request time,
  // not just at display time. ──
  @Prop({ type: Types.ObjectId, ref: 'Employee', default: null })
  approverEmployeeId: Types.ObjectId | null;
  @Prop({ default: '' }) approverName: string;
  @Prop({
    enum: VendorApprovalStatus,
    default: VendorApprovalStatus.NOT_REQUESTED,
  })
  approvalStatus: VendorApprovalStatus;
  @Prop({ default: null }) approvalRequestedAt: Date | null;
  @Prop({ default: null }) approvalDecidedAt: Date | null;
  @Prop({ default: '' }) approvalDecisionNote: string;

  @Prop({ type: [DdChecklistItemSchema], default: [] })
  ddItems: DdChecklistItem[];
  @Prop({ type: [VendorContractSchema], default: [] })
  contracts: VendorContract[];
  @Prop({ type: [VendorNoteSchema], default: [] }) notes: VendorNote[];
  @Prop({ type: [VendorActivitySchema], default: [] })
  activity: VendorActivity[];
  @Prop({ type: [VendorSpendEntrySchema], default: [] })
  spend: VendorSpendEntry[];
}

export const VendorSchema = SchemaFactory.createForClass(Vendor);
