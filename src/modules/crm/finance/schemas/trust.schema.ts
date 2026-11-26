import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum InterestTreatment {
  CLIENT_RETAINED = 'Client retained',
  FIRM_RETAINED = 'Firm retained',
  POOLED = 'Pooled',
  NO_INTEREST = 'No interest',
}

export enum TrustLedgerStatus {
  ACTIVE = 'Active',
  FROZEN = 'Frozen',
  CLOSING = 'Closing',
}

export enum TrustRiskLevel {
  STANDARD = 'Standard',
  EDD = 'EDD',
  PEP = 'PEP',
}

export enum TrustPortalAccess {
  ACTIVE = 'Active',
  INVITE_PENDING = 'Invite pending',
  DISABLED = 'Disabled',
}

// What a drawdown is for. Each kind has to be traceable to a real
// source document before it can be prepared — see TrustMovementService.
export enum TrustDrawdownType {
  INVOICE = 'Invoice',
  MANDATE = 'Mandate',
  THIRD_PARTY = 'Third-party expense',
  TRUST_TO_OFFICE = 'Trust-to-office',
  REFUND = 'Refund',
}

export enum TrustLinkType {
  INVOICE = 'Invoice',
  BILL = 'Bill',
  MANDATE = 'Mandate',
  DEPOSIT = 'Deposit',
}

export enum TrustMovementType {
  DEPOSIT = 'Deposit',
  DRAWDOWN = 'Drawdown',
  INTEREST = 'Interest',
}

export enum TrustMovementStatus {
  DRAFT = 'Draft',
  RECORDED = 'Recorded',
  AWAITING_AUTHORISATION = 'Awaiting authorisation',
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
}

// ── Trust ledgers — a per-client sub-ledger within the firm's real
// Trust-type bank account. The balance is never stored here — it's
// always computed live from real movements, the exact discipline
// BankAccount's own balance already follows. What matters most in
// trust accounting is that the sum of every client's real ledger
// balance always equals the trust bank account's own real balance;
// that equality is the actual "no commingling" guarantee, checked
// live rather than assumed. ─────────────────────────────────────

export type TrustLedgerDocument = TrustLedger & Document;

@Schema({ timestamps: true, collection: 'crm_trust_ledgers' })
export class TrustLedger {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // The real Trust-type BankAccount this ledger is a sub-ledger of.
  // Enforced at creation — a ledger can never be linked to an
  // Office account.
  @Prop({
    type: Types.ObjectId,
    ref: 'BankAccount',
    required: true,
    index: true,
  })
  bankAccountId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientUserId: Types.ObjectId;
  @Prop({ required: true }) clientName: string;

  @Prop({ type: Types.ObjectId, ref: 'Mandate', default: null })
  mandateId: Types.ObjectId | null;
  @Prop({ default: '' }) mandateName: string;

  @Prop({ default: 'USD' }) currency: string;
  @Prop({ enum: InterestTreatment, default: InterestTreatment.CLIENT_RETAINED })
  interestTreatment: InterestTreatment;

  @Prop({ default: null }) lastReconciledAt: Date | null;

  // ── Mandate / engagement ──────────────────────────────────────
  // The engagement-letter reference the ledger is controlled by.
  @Prop({ default: '' }) mandateReference: string;

  // ── Interest ──────────────────────────────────────────────────
  // Applied annual rate from the trust account agreement, in percent.
  @Prop({ default: 0 }) interestRate: number;
  // Interest has been credited up to (and excluding) this date — the
  // accrual engine starts from here, so a run never double-credits.
  @Prop({ type: Date, default: null }) interestCreditedThrough: Date | null;

  // ── Source of funds (AML/CFT) ─────────────────────────────────
  @Prop({ default: '' }) sourceOfFunds: string;
  @Prop({ default: '' }) expectedPurpose: string;
  @Prop({ default: '' }) sourceOfFundsNotes: string;

  // ── Controls & restrictions ───────────────────────────────────
  @Prop({ enum: TrustRiskLevel, default: TrustRiskLevel.STANDARD })
  riskLevel: TrustRiskLevel;
  // 0 = no limit. A request above this needs a second authoriser.
  @Prop({ default: 0 }) maxDrawdownPerRequest: number;
  // No ad-hoc drawdowns: every one has to draw against an invoice.
  @Prop({ default: false }) invoiceLinkedOnly: boolean;
  @Prop({ enum: TrustLedgerStatus, default: TrustLedgerStatus.ACTIVE })
  status: TrustLedgerStatus;

  // ── Retainer replenishment ────────────────────────────────────
  @Prop({ default: 0 }) minBalance: number;
  @Prop({ default: 0 }) replenishmentTarget: number;
  @Prop({ type: Date, default: null }) lastReplenishmentAt: Date | null;

  // ── Client portal & notifications ─────────────────────────────
  @Prop({ enum: TrustPortalAccess, default: TrustPortalAccess.DISABLED })
  portalAccess: TrustPortalAccess;
  @Prop({ default: '', lowercase: true, trim: true })
  portalContactEmail: string;
  @Prop({ type: [String], default: [] }) additionalPortalUsers: string[];
  @Prop({ default: 'Real-time' }) emailDigest: string;
  @Prop({
    type: {
      depositConfirmations: { type: Boolean, default: true },
      drawdownNotices: { type: Boolean, default: true },
      monthlyStatements: { type: Boolean, default: true },
      lowBalanceAlerts: { type: Boolean, default: true },
      interestCredits: { type: Boolean, default: true },
      reconciliationReports: { type: Boolean, default: false },
    },
    default: () => ({
      depositConfirmations: true,
      drawdownNotices: true,
      monthlyStatements: true,
      lowBalanceAlerts: true,
      interestCredits: true,
      reconciliationReports: false,
    }),
    _id: false,
  })
  notifyPrefs: {
    depositConfirmations: boolean;
    drawdownNotices: boolean;
    monthlyStatements: boolean;
    lowBalanceAlerts: boolean;
    interestCredits: boolean;
    reconciliationReports: boolean;
  };
}
export const TrustLedgerSchema = SchemaFactory.createForClass(TrustLedger);

// ── Trust movements — deposits post immediately (no dual control
// needed for money coming in); drawdowns require the same
// preparer-then-different-authoriser pattern Reconciliation and
// Period-close already use, since money leaving trust is the one
// action in this whole module that genuinely needs a second person
// checking it before it happens. ─────────────────────────────────

export type TrustMovementDocument = TrustMovement & Document;

@Schema({ timestamps: true, collection: 'crm_trust_movements' })
export class TrustMovement {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) ref: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'TrustLedger',
    required: true,
    index: true,
  })
  ledgerId: Types.ObjectId;

  @Prop({ enum: TrustMovementType, required: true }) type: TrustMovementType;
  @Prop({ required: true }) amount: number;
  @Prop({ default: '' }) reference: string;
  @Prop({ required: true }) date: Date;

  @Prop({ enum: TrustMovementStatus, default: TrustMovementStatus.RECORDED })
  status: TrustMovementStatus;

  @Prop({ required: true }) preparedBy: string;
  @Prop({ default: null }) authorisedBy: string | null;
  @Prop({ default: null }) authorisedAt: Date | null;

  // A drawdown is typically a trust-to-office transfer that settles
  // a real invoice — linked here for traceability, though the
  // actual invoice payment is a separate, deliberate action, not
  // something this movement performs automatically.
  @Prop({ type: Types.ObjectId, ref: 'Invoice', default: null })
  linkedInvoiceId: Types.ObjectId | null;

  @Prop({ default: null }) rejectedReason: string | null;

  // ── Traceability — the source document behind the money ───────
  // A movement that cannot be tied to a real document is how trust
  // money disappears, so a drawdown cannot be prepared without one.
  @Prop({ enum: TrustLinkType, default: null }) linkType: TrustLinkType | null;
  @Prop({ type: Types.ObjectId, default: null })
  linkId: Types.ObjectId | null;
  // Human reference of the linked document (INV-2026-0089, BILL-…, the
  // mandate ref, the original deposit's TM-…).
  @Prop({ default: '' }) linkRef: string;
  @Prop({ default: '' }) linkLabel: string;

  @Prop({ default: '' }) currency: string;
  @Prop({ default: '' }) narrative: string;
  @Prop({ default: '' }) internalNotes: string;

  // ── Deposit declaration ───────────────────────────────────────
  @Prop({ default: '' }) remitterName: string;
  @Prop({ default: '' }) sourceOfFunds: string;
  @Prop({ default: '' }) purpose: string;

  // ── Drawdown detail ───────────────────────────────────────────
  @Prop({ enum: TrustDrawdownType, default: null })
  drawdownType: TrustDrawdownType | null;
  @Prop({ default: '' }) payeeName: string;
  @Prop({ default: '' }) expenseCategory: string;
  @Prop({ default: '' }) paymentMethod: string;
  @Prop({ default: '' }) beneficiaryAccount: string;
  // Trust-to-office / invoice drawdowns: the office account the fees
  // land in, and the invoice payment that settled when it was approved.
  @Prop({ type: Types.ObjectId, default: null })
  officeBankAccountId: Types.ObjectId | null;
  @Prop({ default: '' }) settledPaymentRef: string;
  @Prop({ type: Date, default: null }) requestedDate: Date | null;

  // A request above the ledger's per-request limit needs two
  // authorisers (both different from the preparer and each other).
  @Prop({ default: false }) requiresAdditionalApproval: boolean;
  @Prop({ default: null }) firstAuthorisedBy: string | null;
  @Prop({ default: null }) firstAuthorisedById: string | null;
  @Prop({ default: null }) firstAuthorisedAt: Date | null;
  @Prop({ default: null }) preparedById: string | null;
  @Prop({ default: null }) authorisedById: string | null;

  // Interest credits only: the period the interest covers, and whether
  // it belongs to the client (credited to their ledger) or the firm.
  @Prop({ type: Date, default: null }) periodStart: Date | null;
  @Prop({ type: Date, default: null }) periodEnd: Date | null;
  @Prop({ default: false }) firmRetained: boolean;

  @Prop({
    type: [
      {
        name: String,
        url: String,
        path: String,
        mimeType: String,
        size: Number,
        uploadedAt: Date,
      },
    ],
    default: [],
    _id: false,
  })
  documents: {
    name: string;
    url: string;
    path: string;
    mimeType: string;
    size: number;
    uploadedAt: Date;
  }[];
}
export const TrustMovementSchema = SchemaFactory.createForClass(TrustMovement);

// ── Audit trail — an append-only record of everything done to trust
// money. There is deliberately no update or delete path for it
// anywhere: the schema is only ever written by TrustAuditService.log
// and read back. ──────────────────────────────────────────────────

export enum TrustAuditAction {
  LEDGER_CREATED = 'Ledger created',
  LEDGER_UPDATED = 'Ledger updated',
  DEPOSIT_RECORDED = 'Deposit recorded',
  DRAWDOWN_DRAFTED = 'Drawdown drafted',
  DRAWDOWN_PREPARED = 'Drawdown prepared',
  DRAWDOWN_FIRST_APPROVED = 'Drawdown first approval',
  DRAWDOWN_APPROVED = 'Drawdown approved',
  DRAWDOWN_REJECTED = 'Drawdown rejected',
  RECONCILIATION = 'Reconciliation',
  INTEREST_ACCRUAL = 'Interest accrual',
  INTEREST_CREDITED = 'Interest credited',
  FREEZE_APPLIED = 'Freeze applied',
  FREEZE_LIFTED = 'Freeze lifted',
  REPLENISHMENT_REQUESTED = 'Replenishment requested',
  DOCUMENT_ATTACHED = 'Document attached',
  REPORT_GENERATED = 'Report generated',
}

export type TrustAuditEntryDocument = TrustAuditEntry & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class TrustAuditEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ enum: TrustAuditAction, required: true, index: true })
  action: TrustAuditAction;

  @Prop({ type: Types.ObjectId, ref: 'TrustLedger', default: null })
  ledgerId: Types.ObjectId | null;
  @Prop({ default: 'All' }) clientName: string;
  @Prop({ type: Types.ObjectId, default: null })
  movementId: Types.ObjectId | null;

  @Prop({ default: '' }) details: string;
  @Prop({ default: null }) amount: number | null;
  @Prop({ default: '' }) currency: string;

  // Who did it. "System" for automatic runs (the interest engine).
  @Prop({ default: 'System' }) userName: string;
  @Prop({ default: null }) userId: string | null;
  @Prop({ default: '' }) ip: string;
}
export const TrustAuditEntrySchema =
  SchemaFactory.createForClass(TrustAuditEntry);
TrustAuditEntrySchema.index({ tenantId: 1, createdAt: -1 });
