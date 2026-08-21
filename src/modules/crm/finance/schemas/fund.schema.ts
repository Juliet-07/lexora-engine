import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum FundStatus {
  FUNDRAISING = 'Fundraising',
  INVESTING = 'Investing',
  HARVESTING = 'Harvesting',
  WOUND_DOWN = 'Wound down',
}

// ── Fund — the entity itself. mgmtFeePct/carryPct/hurdlePct are
// captured here as the LPA's stated terms, but no fee, carry or
// waterfall calculation reads them yet — those need a confirmed
// methodology (European vs American waterfall, catch-up mechanism)
// before any real money-moving logic is built on top of them. ────

export type FundDocument = Fund & Document;

@Schema({ timestamps: true, collection: 'crm_funds' })
export class Fund {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: '' }) structure: string;
  @Prop({ default: '' }) jurisdiction: string;
  @Prop({ default: '' }) strategy: string;
  @Prop({ default: 0 }) targetSize: number;
  @Prop({ default: new Date().getFullYear() }) vintage: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ enum: FundStatus, default: FundStatus.FUNDRAISING })
  status: FundStatus;

  // Real Fund-type bank account this fund's capital sits in —
  // same segregation discipline Trust already follows.
  @Prop({ type: Types.ObjectId, ref: 'BankAccount', default: null })
  bankAccountId: Types.ObjectId | null;

  // LPA terms as stated — captured for reference and for display,
  // not yet used in any calculation.
  @Prop({ default: 0 }) mgmtFeePct: number;
  @Prop({ default: 0 }) carryPct: number;
  @Prop({ default: 0 }) hurdlePct: number;
}
export const FundSchema = SchemaFactory.createForClass(Fund);

// ── Capital commitments — one per LP per fund. The real, agreed
// obligation an LP has signed up for. Called and distributed
// amounts are never stored here — they're always computed live
// from real CapitalCall allocations (and, once built, real
// Distribution records), the same discipline every other
// live-computed balance in this system already follows. ─────────

export type CapitalCommitmentDocument = CapitalCommitment & Document;

@Schema({ timestamps: true, collection: 'crm_fund_capital_commitments' })
export class CapitalCommitment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Fund', required: true, index: true })
  fundId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  lpUserId: Types.ObjectId;
  @Prop({ required: true }) lpName: string;

  @Prop({ required: true }) commitment: number;
}
export const CapitalCommitmentSchema =
  SchemaFactory.createForClass(CapitalCommitment);

export enum CapitalCallAllocationStatus {
  UNFUNDED = 'Unfunded',
  PARTIALLY_FUNDED = 'Partially funded',
  FUNDED = 'Funded',
}

// A capital call, once issued, is a real documented obligation —
// each LP's pro-rata share is frozen at issuance into a real
// allocation line, the same reasoning invoice lines are frozen at
// creation rather than silently recalculated if commitments change
// later.
@Schema({ _id: true })
export class CapitalCallAllocation {
  @Prop({ type: Types.ObjectId, ref: 'CapitalCommitment', required: true })
  commitmentId: Types.ObjectId;
  @Prop({ required: true }) lpName: string;
  @Prop({ required: true }) amount: number;
  @Prop({ default: 0 }) fundedAmount: number;
  @Prop({
    enum: CapitalCallAllocationStatus,
    default: CapitalCallAllocationStatus.UNFUNDED,
  })
  status: CapitalCallAllocationStatus;
  @Prop({ default: null }) fundedAt: Date | null;
}
export const CapitalCallAllocationSchema = SchemaFactory.createForClass(
  CapitalCallAllocation,
);

export type CapitalCallDocument = CapitalCall & Document;

@Schema({ timestamps: true, collection: 'crm_fund_capital_calls' })
export class CapitalCall {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Fund', required: true, index: true })
  fundId: Types.ObjectId;

  @Prop({ required: true }) ref: string;
  @Prop({ required: true }) purpose: string;
  @Prop({ required: true }) totalAmount: number;
  @Prop({ required: true }) issuedOn: Date;
  @Prop({ required: true }) dueOn: Date;

  @Prop({ type: [CapitalCallAllocationSchema], default: [] })
  allocations: CapitalCallAllocation[];
}
export const CapitalCallSchema = SchemaFactory.createForClass(CapitalCall);
