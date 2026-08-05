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

export enum DealType {
  MA = 'M&A',
  JV = 'JV',
  RESTRUCTURE = 'Restructure',
  CAPITAL_RAISE = 'Capital Raise',
  DISPOSAL = 'Disposal',
  SPIN_OFF = 'Spin-off',
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
export type PrecedentFolderDocument = PrecedentFolder & Document;

@Schema({ timestamps: true, collection: 'deals_precedent_folders' })
export class PrecedentFolder {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;
  @Prop({ required: true, trim: true }) name: string;
}
export const PrecedentFolderSchema =
  SchemaFactory.createForClass(PrecedentFolder);

@Schema({ timestamps: true, collection: 'deals_precedents' })
export class Precedent {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ enum: DealType, required: true }) type: DealType;
  @Prop({ default: 'Rwanda' }) jurisdiction: string;
  @Prop({
    type: Types.ObjectId,
    ref: 'PrecedentFolder',
    required: true,
    index: true,
  })
  folderId: Types.ObjectId;
  @Prop({ required: true }) fileName: string;
  @Prop({ default: null }) fileUrl: string | null;
  @Prop({ default: null }) mimeType: string | null;
  @Prop({ default: 0 }) size: number;

  @Prop({ required: true }) content: string;
}
export const PrecedentSchema = SchemaFactory.createForClass(Precedent);
