import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Vendor,
  VendorDocument,
  VendorStatus,
  VendorApprovalStatus,
  DD_CHECKLIST,
} from '../schemas';
import {
  CreateVendorDto,
  UpdateVendorDto,
  AddVendorNoteDto,
  SaveVendorContractDto,
  AdvanceContractDto,
  RequestVendorApprovalDto,
  DecideVendorApprovalDto,
  AddVendorSpendDto,
} from '../dtos';
import {
  Employee,
  EmployeeDocument,
  EmployeeHierarchyRole,
} from '../../../hr/schemas/employee.schema';

// Real approver eligibility — enforced here, not just filtered in
// the UI. Anyone attempting to name an approver outside this set
// gets rejected server-side.
const ELIGIBLE_APPROVER_ROLES = [
  EmployeeHierarchyRole.MANAGER,
  EmployeeHierarchyRole.HEAD_OF_DEPARTMENT,
];

const REVIEW_MONTHS: Record<string, number> = {
  Quarterly: 3,
  'Semi-annual': 6,
  Annual: 12,
  Biennial: 24,
};

@Injectable()
export class VendorService {
  constructor(
    @InjectModel(Vendor.name) private readonly model: Model<VendorDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  private async getRawDoc(tenantId: string, id: string) {
    const doc = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!doc) throw new NotFoundException('Vendor not found');
    return doc;
  }

  private logActivity(v: VendorDocument, text: string) {
    v.activity.unshift({ at: new Date(), text } as any);
  }

  // ═══════════════════════════════════════════════════════════
  // REGISTRY
  // ═══════════════════════════════════════════════════════════

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getById(tenantId: string, id: string) {
    const v = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!v) throw new NotFoundException('Vendor not found');
    return v;
  }

  async create(tenantId: string, dto: CreateVendorDto) {
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      legalName: dto.legalName,
      tradingName: dto.tradingName ?? '',
      category: dto.category,
      serviceSummary: dto.serviceSummary ?? '',
      jurisdiction: dto.jurisdiction ?? '',
      registrationNumber: dto.registrationNumber ?? '',
      taxId: dto.taxId ?? '',
      contactName: dto.contactName ?? '',
      contactTitle: dto.contactTitle ?? '',
      contactEmail: dto.contactEmail ?? '',
      contactPhone: dto.contactPhone ?? '',
      website: dto.website ?? '',
      engagementType: dto.engagementType ?? '',
      annualValue: dto.annualValue ?? 0,
      currency: dto.currency ?? 'USD',
      paymentTerms: dto.paymentTerms ?? '',
      budgetCode: dto.budgetCode ?? '',
      usedByModules: dto.usedByModules ?? [],
      risk: dto.risk ?? undefined,
      reviewFrequency: dto.reviewFrequency ?? 'Annual',
      justification: dto.justification ?? '',
      status: VendorStatus.PENDING_DD,
      ddItems: DD_CHECKLIST.map((c) => ({
        label: c.label,
        hint: c.hint,
        done: false,
        documentName: '',
        documentUrl: '',
        uploadedAt: null,
        uploadedBy: '',
      })),
      activity: [{ at: new Date(), text: 'Vendor registered' }],
    });
    return created.toObject();
  }

  async update(tenantId: string, id: string, dto: UpdateVendorDto) {
    const v = await this.getRawDoc(tenantId, id);
    Object.entries(dto).forEach(([key, value]) => {
      if (value === undefined) return;
      if (key === 'nextReview') {
        (v as any).nextReview = new Date(value as string);
      } else {
        (v as any)[key] = value;
      }
    });
    await v.save();
    return v.toObject();
  }

  async setStatus(tenantId: string, id: string, status: VendorStatus) {
    const v = await this.getRawDoc(tenantId, id);
    v.status = status;
    this.logActivity(v, `Status changed to ${status}`);
    await v.save();
    return v.toObject();
  }

  // ═══════════════════════════════════════════════════════════
  // DUE DILIGENCE — a checklist item can only be marked done by
  // attaching a real document to it. There is no separate "toggle"
  // path that skips the upload.
  // ═══════════════════════════════════════════════════════════

  async uploadDdEvidence(
    tenantId: string,
    id: string,
    itemId: string,
    uploadedBy: string,
    file: Express.Multer.File,
  ) {
    const v = await this.getRawDoc(tenantId, id);
    const item = v.ddItems.find((d: any) => String(d._id) === itemId);
    if (!item) throw new NotFoundException('Checklist item not found');

    item.documentName = file.originalname;
    item.documentUrl = `/uploads/crm/vendors/${file.filename}`;
    item.uploadedAt = new Date();
    item.uploadedBy = uploadedBy;
    item.done = true;

    this.logActivity(v, `Evidence uploaded for "${item.label}"`);
    await v.save();
    return v.toObject();
  }

  async removeDdEvidence(tenantId: string, id: string, itemId: string) {
    const v = await this.getRawDoc(tenantId, id);
    const item = v.ddItems.find((d: any) => String(d._id) === itemId);
    if (!item) throw new NotFoundException('Checklist item not found');

    item.documentName = '';
    item.documentUrl = '';
    item.uploadedAt = null;
    item.uploadedBy = '';
    item.done = false;

    this.logActivity(v, `Evidence removed for "${item.label}"`);
    await v.save();
    return v.toObject();
  }

  // ═══════════════════════════════════════════════════════════
  // NOTES
  // ═══════════════════════════════════════════════════════════

  async addNote(
    tenantId: string,
    id: string,
    author: string,
    dto: AddVendorNoteDto,
  ) {
    const v = await this.getRawDoc(tenantId, id);
    v.notes.unshift({
      at: new Date(),
      author,
      title: dto.title,
      body: dto.body ?? '',
    } as any);
    await v.save();
    return v.toObject();
  }

  // ═══════════════════════════════════════════════════════════
  // CONTRACTS
  // ═══════════════════════════════════════════════════════════

  async saveContract(tenantId: string, id: string, dto: SaveVendorContractDto) {
    const v = await this.getRawDoc(tenantId, id);

    if (dto.contractId) {
      const existing = v.contracts.find(
        (c: any) => String(c._id) === dto.contractId,
      );
      if (!existing) throw new NotFoundException('Contract not found');
      if (dto.title !== undefined) existing.title = dto.title;
      if (dto.body !== undefined) existing.body = dto.body;
      if (dto.value !== undefined) existing.value = dto.value;
      if (dto.currency !== undefined) existing.currency = dto.currency;
      if (dto.startDate !== undefined)
        existing.startDate = new Date(dto.startDate);
      if (dto.endDate !== undefined) existing.endDate = new Date(dto.endDate);
      if (dto.signerName !== undefined) existing.signerName = dto.signerName;
      if (dto.signerEmail !== undefined) existing.signerEmail = dto.signerEmail;
      this.logActivity(v, `Contract "${existing.title}" updated`);
      await v.save();
      return v.toObject();
    }

    v.contracts.unshift({
      title: dto.title,
      templateId: dto.templateId ?? '',
      templateName: dto.templateName ?? '',
      body: dto.body ?? '',
      value: dto.value ?? 0,
      currency: dto.currency ?? v.currency,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      signerName: dto.signerName ?? '',
      signerEmail: dto.signerEmail ?? '',
      history: [{ at: new Date(), label: 'Draft created from template' }],
    } as any);
    this.logActivity(
      v,
      `Contract "${dto.title}" drafted${dto.templateName ? ` from ${dto.templateName}` : ''}`,
    );
    await v.save();
    return v.toObject();
  }

  async advanceContract(
    tenantId: string,
    id: string,
    contractId: string,
    dto: AdvanceContractDto,
  ) {
    const v = await this.getRawDoc(tenantId, id);
    const c = v.contracts.find((c: any) => String(c._id) === contractId);
    if (!c) throw new NotFoundException('Contract not found');

    c.status = dto.status;
    if (dto.status === 'sent') c.sentAt = new Date();
    if (dto.status === 'signed') c.signedAt = new Date();
    c.history.push({
      at: new Date(),
      label: dto.label ?? `Status set to ${dto.status}`,
    } as any);

    this.logActivity(v, dto.label ?? `Contract "${c.title}" → ${dto.status}`);
    await v.save();
    return v.toObject();
  }

  async deleteContract(tenantId: string, id: string, contractId: string) {
    const v = await this.getRawDoc(tenantId, id);
    const c = v.contracts.find((c: any) => String(c._id) === contractId);
    if (!c) throw new NotFoundException('Contract not found');
    v.contracts = v.contracts.filter(
      (x: any) => String(x._id) !== contractId,
    ) as any;
    v.markModified('contracts');
    await v.save();
    return v.toObject();
  }

  // ═══════════════════════════════════════════════════════════
  // APPROVAL — real employee reference, restricted server-side to
  // Manager / Head of Department, exactly as requested.
  // ═══════════════════════════════════════════════════════════

  async getEligibleApprovers(tenantId: string) {
    const employees = await this.employeeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        hierarchyRole: { $in: ELIGIBLE_APPROVER_ROLES },
      })
      .select('firstName lastName jobTitle hierarchyRole userId')
      .lean();
    return employees.map((e: any) => ({
      employeeId: String(e._id),
      name: `${e.firstName} ${e.lastName}`.trim(),
      jobTitle: e.jobTitle,
      hierarchyRole: e.hierarchyRole,
    }));
  }

  async requestApproval(
    tenantId: string,
    id: string,
    dto: RequestVendorApprovalDto,
  ) {
    const employee = await this.employeeModel.findOne({
      _id: dto.approverEmployeeId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!employee) throw new NotFoundException('Employee not found');
    if (!ELIGIBLE_APPROVER_ROLES.includes(employee.hierarchyRole)) {
      throw new BadRequestException(
        'Only employees who are a Head of Department or Manager can be set as an approver.',
      );
    }

    const v = await this.getRawDoc(tenantId, id);
    v.approverEmployeeId = employee._id as any;
    v.approverName = `${employee.firstName} ${employee.lastName}`.trim();
    v.approvalStatus = VendorApprovalStatus.PENDING;
    v.approvalRequestedAt = new Date();
    v.approvalDecidedAt = null;
    v.approvalDecisionNote = '';
    v.status = VendorStatus.PENDING_APPROVAL;

    this.logActivity(v, `Approval requested from ${v.approverName}`);
    await v.save();
    return v.toObject();
  }

  async decideApproval(
    tenantId: string,
    id: string,
    dto: DecideVendorApprovalDto,
  ) {
    const v = await this.getRawDoc(tenantId, id);
    if (v.approvalStatus !== VendorApprovalStatus.PENDING) {
      throw new BadRequestException(
        'This vendor has no pending approval request.',
      );
    }

    v.approvalStatus =
      dto.decision === 'approved'
        ? VendorApprovalStatus.APPROVED
        : VendorApprovalStatus.REJECTED;
    v.approvalDecidedAt = new Date();
    v.approvalDecisionNote = dto.note ?? '';

    if (dto.decision === 'approved') {
      v.status = VendorStatus.ACTIVE;
      if (!v.onboardedAt) v.onboardedAt = new Date();
      const months = REVIEW_MONTHS[v.reviewFrequency] ?? 12;
      const next = new Date();
      next.setMonth(next.getMonth() + months);
      v.nextReview = next;
      this.logActivity(v, `Approved by ${v.approverName} — vendor activated`);
    } else {
      v.status = VendorStatus.PENDING_DD;
      this.logActivity(v, `Rejected by ${v.approverName}`);
    }

    await v.save();
    return v.toObject();
  }

  // ═══════════════════════════════════════════════════════════
  // SPEND — manual tracking for now; a natural future hook for
  // real Finance-sourced figures once that connection is built.
  // ═══════════════════════════════════════════════════════════

  async addSpendEntry(tenantId: string, id: string, dto: AddVendorSpendDto) {
    const v = await this.getRawDoc(tenantId, id);
    const existing = v.spend.find((s) => s.month === dto.month);
    if (existing) {
      existing.amount = dto.amount;
    } else {
      v.spend.push({ month: dto.month, amount: dto.amount } as any);
    }
    await v.save();
    return v.toObject();
  }
}
