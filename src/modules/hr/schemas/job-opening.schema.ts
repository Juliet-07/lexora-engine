import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type JobOpeningDocument = JobOpening & Document;

export enum JobOpeningType {
  FULL_TIME = 'Full-time',
  PART_TIME = 'Part-time',
  CONTRACT = 'Contract',
}

export enum JobOpeningStatus {
  OPEN = 'Open',
  INTERVIEWING = 'Interviewing',
  FILLED = 'Filled',
}

@Schema({ timestamps: true, collection: 'hr_job_openings' })
export class JobOpening {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ type: Types.ObjectId, ref: 'HrTeam', default: null })
  teamId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'HrLocation', default: null })
  locationId: Types.ObjectId | null;

  @Prop({ enum: JobOpeningType, default: JobOpeningType.FULL_TIME })
  type: JobOpeningType;

  @Prop({ enum: JobOpeningStatus, default: JobOpeningStatus.OPEN, index: true })
  status: JobOpeningStatus;

  @Prop({ default: null })
  description: string | null;

  @Prop({ required: true, default: () => new Date() })
  postedDate: Date;

  @Prop({ default: null })
  filledAt: Date | null;

  @Prop({ default: null })
  vacancyNoticeSentAt: Date | null;
}

export const JobOpeningSchema = SchemaFactory.createForClass(JobOpening);
