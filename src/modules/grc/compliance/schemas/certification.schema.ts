import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CertificationDocument = Certification & Document;

export enum RenewalStage {
  CURRENT = 'Current',
  RENEWAL_INITIATED = 'Renewal initiated',
  DOCUMENTATION_GATHERING = 'Documentation gathering',
  APPLICATION_SUBMITTED = 'Application submitted',
  APPROVED = 'Approved',
  EXPIRED = 'Expired',
}

@Schema({ _id: false })
export class CertEvidence {
  @Prop({ required: true }) name: string;
  @Prop({ default: null }) fileUrl: string | null;
  @Prop({ default: null }) mimeType: string | null;
  @Prop({ default: 0 }) size: number;
  @Prop({ required: true, default: () => new Date() }) uploadedAt: Date;
  @Prop({ required: true }) uploadedBy: string;
}
export const CertEvidenceSchema = SchemaFactory.createForClass(CertEvidence);

@Schema({ timestamps: true, collection: 'compliance_certifications' })
export class Certification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: '' }) issuingBody: string;
  @Prop({ default: '' }) certificateNumber: string;
  @Prop({ required: true }) issueDate: Date;
  @Prop({ required: true }) expiryDate: Date;
  @Prop({ default: '' }) renewalRequirements: string;
  @Prop({ default: 0 }) cost: number;
  @Prop({ default: 'RWF' }) currency: string;
  @Prop({ default: '' }) responsiblePerson: string;
  @Prop({ default: 60 }) leadTimeDays: number;
  @Prop({ enum: RenewalStage, default: RenewalStage.CURRENT })
  renewalStage: RenewalStage;
  @Prop({ type: [CertEvidenceSchema], default: [] }) evidence: CertEvidence[];
}
export const CertificationSchema = SchemaFactory.createForClass(Certification);
