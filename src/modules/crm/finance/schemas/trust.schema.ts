import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum InterestTreatment {
  CLIENT_RETAINED = 'Client retained',
  FIRM_RETAINED = 'Firm retained',
  POOLED = 'Pooled',
}

export enum TrustMovementType {
  DEPOSIT = 'Deposit',
  DRAWDOWN = 'Drawdown',
  INTEREST = 'Interest',
}

export enum TrustMovementStatus {
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
}
export const TrustMovementSchema = SchemaFactory.createForClass(TrustMovement);
