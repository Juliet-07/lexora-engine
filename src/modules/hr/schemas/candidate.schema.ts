import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CandidateDocument = Candidate & Document;

export enum CandidateStage {
  SOURCED = 'sourced',
  SCREENING = 'screening',
  INTERVIEW = 'interview',
  OFFER = 'offer',
  HIRED = 'hired',
  REJECTED = 'rejected',
}

export enum CandidateSource {
  REFERRAL = 'referral',
  LINKEDIN = 'linkedin',
  JOB_BOARD = 'job_board',
  AGENCY = 'agency',
  WEBSITE = 'website',
  OTHER = 'other',
}

@Schema({ _id: false })
export class StageHistoryEntry {
  @Prop({ enum: CandidateStage, required: true })
  stage: CandidateStage;

  @Prop({ required: true, default: () => new Date() })
  enteredAt: Date;
}
export const StageHistoryEntrySchema =
  SchemaFactory.createForClass(StageHistoryEntry);

@Schema({ timestamps: true, collection: 'hr_candidates' })
export class Candidate {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ default: null })
  phone: string | null;

  @Prop({ required: true, trim: true })
  roleAppliedFor: string;

  @Prop({ enum: CandidateSource, default: CandidateSource.OTHER })
  source: CandidateSource;

  @Prop({ enum: CandidateStage, default: CandidateStage.SOURCED, index: true })
  stage: CandidateStage;

  @Prop({ default: 0, min: 0, max: 5 })
  rating: number;

  @Prop({ default: null })
  notes: string | null;

  @Prop({ default: null })
  rejectionReason: string | null;

  @Prop({ type: [StageHistoryEntrySchema], default: [] })
  stageHistory: StageHistoryEntry[];

  @Prop({ default: null })
  resumeUrl: string | null;
}

export const CandidateSchema = SchemaFactory.createForClass(Candidate);
