import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClauseDocument = Clause & Document;

export enum ClauseCategory {
  CONFIDENTIALITY = 'Confidentiality',
  CONSIDERATION = 'Consideration',
  CONDITIONS_PRECEDENT = 'Conditions Precedent',
  WARRANTIES = 'Warranties',
  INDEMNITIES = 'Indemnities',
  BOILERPLATE = 'Boilerplate',
  DISPUTE_RESOLUTION = 'Dispute Resolution',
  GOVERNANCE = 'Governance',
}

@Schema({ timestamps: true, collection: 'deals_clauses' })
export class Clause {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) title: string;
  @Prop({ enum: ClauseCategory, required: true }) category: ClauseCategory;
  @Prop({ default: 'Rwanda' }) jurisdiction: string;
  @Prop({ required: true }) body: string;
  @Prop({ default: false }) approved: boolean;
  @Prop({ default: 1 }) version: number;
}
export const ClauseSchema = SchemaFactory.createForClass(Clause);

export type PrecedentDocument = Precedent & Document;

export enum DealType {
  MA = 'M&A',
  JV = 'JV',
  RESTRUCTURE = 'Restructure',
  CAPITAL_RAISE = 'Capital Raise',
  DISPOSAL = 'Disposal',
  SPIN_OFF = 'Spin-off',
}

@Schema({ _id: false })
export class PrecedentSection {
  @Prop({ type: Types.ObjectId, ref: 'Clause', default: null })
  clauseId: Types.ObjectId | null;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) body: string;
}
export const PrecedentSectionSchema =
  SchemaFactory.createForClass(PrecedentSection);

@Schema({ timestamps: true, collection: 'deals_precedents' })
export class Precedent {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ enum: DealType, required: true }) type: DealType;
  @Prop({ default: 'Rwanda' }) jurisdiction: string;
  @Prop({ type: [PrecedentSectionSchema], default: [] })
  sections: PrecedentSection[];
}
export const PrecedentSchema = SchemaFactory.createForClass(Precedent);
