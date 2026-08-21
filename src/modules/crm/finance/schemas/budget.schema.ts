import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── Budget — one document per tenant per period (YYYY-MM), with a
// real per-account budget line per the product owner's confirmed
// answer ("one by one" — per ledger account, not one lump revenue/
// expense figure). No automatic rollover between periods: each
// period is entered fresh unless the tenant explicitly copies a
// prior period as a starting point via a real, separate action —
// the rollover question wasn't confirmed, so nothing here assumes
// it. ─────────────────────────────────────────────────────────

@Schema({ _id: false })
export class BudgetLine {
  @Prop({ required: true }) accountCode: string;
  @Prop({ required: true }) accountName: string;
  @Prop({ required: true }) budgetedAmount: number;
}
export const BudgetLineSchema = SchemaFactory.createForClass(BudgetLine);

export type BudgetDocument = Budget & Document;

@Schema({ timestamps: true, collection: 'crm_budgets' })
export class Budget {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // YYYY-MM — one real budget per tenant per period.
  @Prop({ required: true, index: true }) period: string;

  @Prop({ type: [BudgetLineSchema], default: [] }) lines: BudgetLine[];
}
export const BudgetSchema = SchemaFactory.createForClass(Budget);
