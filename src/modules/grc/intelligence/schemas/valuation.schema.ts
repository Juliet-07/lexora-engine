import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ValuationDocument = Valuation & Document;

export enum BlendConfidence {
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

@Schema({ _id: false })
export class DCFAssumptions {
  @Prop({ default: 1_000_000 }) baseRevenue: number;
  @Prop({ default: 10 }) growthRate: number;
  @Prop({ default: 20 }) ebitdaMargin: number;
  @Prop({ default: 30 }) taxRate: number;
  @Prop({ default: 4 }) daPct: number;
  @Prop({ default: 6 }) capexPct: number;
  @Prop({ default: 10 }) wcPct: number;
  @Prop({ default: 16 }) wacc: number;
  @Prop({ default: 3 }) terminalGrowth: number;
  @Prop({ default: 0 }) netDebt: number;
  @Prop({ default: 1_000_000 }) sharesOutstanding: number;
}
export const DCFAssumptionsSchema =
  SchemaFactory.createForClass(DCFAssumptions);

@Schema({ _id: false })
export class CompRow {
  @Prop({ required: true }) company: string;
  @Prop({ default: '' }) country: string;
  @Prop({ default: '' }) sector: string;
  @Prop({ default: 0 }) marketCap: number;
  @Prop({ default: 0 }) revenue: number;
  @Prop({ default: 0 }) ebitda: number;
}
export const CompRowSchema = SchemaFactory.createForClass(CompRow);

@Schema({ _id: false })
export class PrecedentRow {
  @Prop({ required: true }) target: string;
  @Prop({ default: '' }) acquirer: string;
  @Prop({ default: new Date().getFullYear() }) year: number;
  @Prop({ default: 0 }) value: number;
  @Prop({ default: 0 }) revenue: number;
  @Prop({ default: 0 }) ebitda: number;
  @Prop({ default: '' }) sector: string;
}
export const PrecedentRowSchema = SchemaFactory.createForClass(PrecedentRow);

@Schema({ _id: false })
export class NavInputs {
  @Prop({ default: 0 }) bookAssets: number;
  @Prop({ default: 0 }) ppeUplift: number;
  @Prop({ default: 0 }) intangibleWriteDown: number;
  @Prop({ default: 0 }) liabilities: number;
}
export const NavInputsSchema = SchemaFactory.createForClass(NavInputs);

@Schema({ _id: false })
export class DdmInputs {
  @Prop({ default: 0 }) dividend: number;
  @Prop({ default: 3 }) growth: number;
  @Prop({ default: 15 }) requiredReturn: number;
}
export const DdmInputsSchema = SchemaFactory.createForClass(DdmInputs);

@Schema({ _id: false })
export class MethodBlendEntry {
  @Prop({ default: 0 }) weight: number;
  @Prop({ default: '' }) rationale: string;
  @Prop({ enum: BlendConfidence, default: BlendConfidence.MEDIUM })
  confidence: BlendConfidence;
  @Prop({ default: false }) enabled: boolean;
}
export const MethodBlendEntrySchema =
  SchemaFactory.createForClass(MethodBlendEntry);

@Schema({ _id: false })
export class Blend {
  @Prop({
    type: MethodBlendEntrySchema,
    default: () => ({
      weight: 50,
      rationale: 'Primary method.',
      confidence: 'Medium',
      enabled: true,
    }),
  })
  DCF: MethodBlendEntry;
  @Prop({
    type: MethodBlendEntrySchema,
    default: () => ({
      weight: 20,
      rationale: 'Add peers to activate.',
      confidence: 'Low',
      enabled: false,
    }),
  })
  Comparables: MethodBlendEntry;
  @Prop({
    type: MethodBlendEntrySchema,
    default: () => ({
      weight: 20,
      rationale: 'Add precedents to activate.',
      confidence: 'Low',
      enabled: false,
    }),
  })
  Precedents: MethodBlendEntry;
  @Prop({
    type: MethodBlendEntrySchema,
    default: () => ({
      weight: 10,
      rationale: 'Asset floor.',
      confidence: 'Medium',
      enabled: true,
    }),
  })
  NAV: MethodBlendEntry;
  @Prop({
    type: MethodBlendEntrySchema,
    default: () => ({
      weight: 0,
      rationale: 'Not applicable.',
      confidence: 'Low',
      enabled: false,
    }),
  })
  DDM: MethodBlendEntry;
}
export const BlendSchema = SchemaFactory.createForClass(Blend);

@Schema({ _id: false })
export class ValuationHistoryEntry {
  @Prop({ required: true }) version: number;
  @Prop({ required: true }) at: string;
  @Prop({ required: true }) change: string;
  @Prop({ required: true }) blendedEv: number;
}
export const ValuationHistoryEntrySchema = SchemaFactory.createForClass(
  ValuationHistoryEntry,
);

@Schema({ timestamps: true, collection: 'deal_intel_valuations' })
export class Valuation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ default: 'USD' }) currency: string;
  @Prop({ default: '' }) advisor: string;
  @Prop({ type: DCFAssumptionsSchema, default: () => ({}) })
  dcf: DCFAssumptions;
  @Prop({ type: [CompRowSchema], default: [] }) comps: CompRow[];
  @Prop({ default: 25 }) privateDiscount: number;
  @Prop({ type: [PrecedentRowSchema], default: [] }) precedents: PrecedentRow[];
  @Prop({ type: NavInputsSchema, default: () => ({}) }) nav: NavInputs;
  @Prop({ type: DdmInputsSchema, default: () => ({}) }) ddm: DdmInputs;
  @Prop({ type: BlendSchema, default: () => ({}) }) blend: Blend;
  @Prop({ type: [ValuationHistoryEntrySchema], default: [] })
  history: ValuationHistoryEntry[];
}
export const ValuationSchema = SchemaFactory.createForClass(Valuation);
