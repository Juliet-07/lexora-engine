import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ChargeType {
  FIXED = 'Fixed Charge',
  FLOATING = 'Floating Charge',
  DEBENTURE = 'Debenture',
  MORTGAGE = 'Mortgage',
  LIEN = 'Lien',
  PLEDGE = 'Pledge',
}

export enum ChargeStatus {
  ACTIVE = 'Active',
  SATISFIED = 'Satisfied',
}

export type RegisteredChargeDocument = RegisteredCharge & Document;

// Statutory register of charges (Governance → Organisation Structure →
// Register of Charges): every charge, debenture or mortgage the
// company has granted over its assets, from creation to satisfaction.
@Schema({ timestamps: true, collection: 'grc_registered_charges' })
export class RegisteredCharge {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ enum: ChargeType, required: true })
  chargeType: ChargeType;

  @Prop({ required: true, trim: true })
  chargeHolder: string;

  @Prop({ required: true })
  dateCreated: Date;

  @Prop({ type: Date, default: null })
  dateSatisfied: Date | null;

  // Tenant base currency.
  @Prop({ default: 0, min: 0 })
  amountSecured: number;

  @Prop({ default: '' }) propertyCharged: string;
  @Prop({ default: '' }) regRef: string;
  @Prop({ default: '' }) description: string;

  @Prop({ enum: ChargeStatus, default: ChargeStatus.ACTIVE })
  status: ChargeStatus;

  @Prop({
    type: [
      {
        name: String,
        fileUrl: String,
        mimeType: String,
        size: Number,
        uploadedAt: Date,
      },
    ],
    default: [],
  })
  documents: {
    name: string;
    fileUrl: string;
    mimeType: string;
    size: number;
    uploadedAt: Date;
  }[];
}
export const RegisteredChargeSchema =
  SchemaFactory.createForClass(RegisteredCharge);
