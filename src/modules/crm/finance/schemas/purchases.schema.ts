import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── Vendors ───────────────────────────────────────────────────
// Outstanding/aged-payables figures are never stored here — always
// computed live from real Bills, same reasoning as Aged Receivables
// on the Sales side. A stored "outstanding" number would just be
// another value to keep in sync and inevitably forget to.

export type VendorDocument = Vendor & Document;

@Schema({ timestamps: true, collection: 'crm_vendors' })
export class Vendor {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: '' }) tin: string;
  @Prop({ default: '' }) category: string;
  @Prop({ default: 'Net 30' }) terms: string;
  @Prop({ default: 'USD' }) currency: string;
  // Real address to notify when a PO is issued — without this, "Issue
  // to vendor" would have nowhere to actually send anything.
  @Prop({ default: '' }) email: string;
  // Whether this vendor is a non-resident subject to WHT — same 15%
  // rate the Tax module already owns, not redefined here.
  @Prop({ default: false }) wht: boolean;
}
export const VendorSchema = SchemaFactory.createForClass(Vendor);

// ── Purchase orders ──────────────────────────────────────────

export type PurchaseOrderDocument = PurchaseOrder & Document;

export enum PoStatus {
  DRAFT = 'Draft',
  ISSUED = 'Issued',
  FULFILLED = 'Fulfilled',
  CANCELLED = 'Cancelled',
}

@Schema({ _id: true })
export class PoLine {
  @Prop({ required: true }) description: string;
  @Prop({ required: true }) qty: number;
  @Prop({ required: true }) unit: number;
  // Matches the reference PO format's per-line Discount/Tax columns —
  // a free-text tax label (e.g. "Tax on Purchases", "Exempt") rather
  // than a computed VAT rate, since these read as category labels on
  // the sample, not a percentage the system calculates.
  @Prop({ default: 0 }) discountPct: number;
  @Prop({ default: '' }) taxLabel: string;
}
export const PoLineSchema = SchemaFactory.createForClass(PoLine);

@Schema({ timestamps: true, collection: 'crm_purchase_orders' })
export class PurchaseOrder {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) ref: string;

  @Prop({ type: Types.ObjectId, ref: 'Vendor', required: true, index: true })
  vendorId: Types.ObjectId;
  @Prop({ required: true }) vendorName: string;
  @Prop({ default: '' }) vendorTin: string;

  @Prop({ default: 'USD' }) currency: string;
  // Internal workflow state — used for actions and filtering, but
  // deliberately never printed on the issued document itself. A
  // vendor doesn't need to see "Draft"/"Issued" on their own copy.
  @Prop({ enum: PoStatus, default: PoStatus.DRAFT, index: true })
  status: PoStatus;
  @Prop({ default: null }) issuedOn: Date | null;
  @Prop({ default: null }) expectedDelivery: Date | null;
  @Prop({ default: '' }) notes: string;

  // Delivery details section, matching the reference format — all
  // optional, since the sample itself shows most of these blank.
  @Prop({ default: '' }) deliveryAddress: string;
  @Prop({ default: '' }) deliveryAttention: string;
  @Prop({ default: '' }) deliveryPhone: string;
  @Prop({ default: '' }) deliveryInstructions: string;

  // No stored total — always the sum of qty*unit across lines,
  // computed in PurchaseOrderService, same reasoning as Invoice.
  @Prop({ type: [PoLineSchema], default: [] }) lines: PoLine[];
}
export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);

// ── Bills ─────────────────────────────────────────────────────

export type BillDocument = Bill & Document;

export enum BillStatus {
  AWAITING_APPROVAL = 'Awaiting approval',
  APPROVED = 'Approved',
  SCHEDULED = 'Scheduled',
  PAID = 'Paid',
  REJECTED = 'Rejected',
}

@Schema({ timestamps: true, collection: 'crm_bills' })
export class Bill {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) ref: string;

  @Prop({ type: Types.ObjectId, ref: 'Vendor', required: true, index: true })
  vendorId: Types.ObjectId;
  @Prop({ required: true }) vendorName: string;

  // Optional link back to the PO this bill fulfils — a bill doesn't
  // require one, matching how not every vendor spend goes through a
  // formal PO.
  @Prop({ type: Types.ObjectId, ref: 'PurchaseOrder', default: null })
  poId: Types.ObjectId | null;

  @Prop({ required: true }) description: string;
  @Prop({ default: '' }) category: string;
  @Prop({ required: true }) dueOn: Date;
  @Prop({ required: true }) amount: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({
    enum: BillStatus,
    default: BillStatus.AWAITING_APPROVAL,
    index: true,
  })
  status: BillStatus;
  @Prop({ default: false }) recurring: boolean;
  @Prop({ default: null }) approvedBy: string | null;
  @Prop({ default: null }) paidAt: Date | null;
}
export const BillSchema = SchemaFactory.createForClass(Bill);

// ── Expense claims ────────────────────────────────────────────

export type ExpenseClaimDocument = ExpenseClaim & Document;

export enum ClaimStatus {
  SUBMITTED = 'Submitted',
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
  PAID = 'Paid',
}

@Schema({ timestamps: true, collection: 'crm_expense_claims' })
export class ExpenseClaim {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) ref: string;

  @Prop({ type: Types.ObjectId, required: true })
  employeeUserId: Types.ObjectId;
  @Prop({ required: true }) employee: string;

  @Prop({ required: true }) description: string;

  // Rechargeable claims are real WIP disbursements once approved —
  // this is the mandate they bill against.
  @Prop({ type: Types.ObjectId, ref: 'Mandate', default: null })
  mandateId: Types.ObjectId | null;
  @Prop({ default: null }) mandateName: string | null;

  @Prop({ required: true }) amount: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ default: false }) rechargeable: boolean;
  @Prop({ enum: ClaimStatus, default: ClaimStatus.SUBMITTED, index: true })
  status: ClaimStatus;

  // Set once a rechargeable, approved claim has genuinely been
  // pulled onto a real invoice as a disbursement line — from that
  // point it's excluded from the WIP register, same rule as
  // TimeEntry.invoiceId.
  @Prop({ type: Types.ObjectId, ref: 'Invoice', default: null })
  invoiceId: Types.ObjectId | null;
}
export const ExpenseClaimSchema = SchemaFactory.createForClass(ExpenseClaim);

// ── Expense policies ──────────────────────────────────────────
// Small, real, tenant-configurable reference data rather than a
// hardcoded display list — a firm's per diem/mileage/limits genuinely
// differ and should be editable, not baked into the frontend.

export type ExpensePolicyDocument = ExpensePolicy & Document;

@Schema({ timestamps: true, collection: 'crm_expense_policies' })
export class ExpensePolicy {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) rule: string;
  @Prop({ required: true }) value: string;
}
export const ExpensePolicySchema = SchemaFactory.createForClass(ExpensePolicy);
