import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CourseDocument = Course & Document;
export type CourseEnrollmentDocument = CourseEnrollment & Document;

export enum CourseKind {
  VIDEO = 'video',
  PPTX = 'pptx',
  LINK = 'link',
}

export enum EnrollmentStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

@Schema({ _id: false })
export class CourseAsset {
  @Prop({ required: true }) fileName: string;
  @Prop({ required: true }) mimeType: string;
  @Prop({ default: null }) url: string | null; // internally-hosted file path
  @Prop({ default: null }) externalUrl: string | null; // embed/large-file link
  @Prop({ default: 0 }) size: number;
}
export const CourseAssetSchema = SchemaFactory.createForClass(CourseAsset);

@Schema({ _id: false })
export class AssessmentQuestion {
  @Prop({ required: true }) key: string;
  @Prop({ required: true }) prompt: string;
  @Prop({ type: [String], required: true }) options: string[];
  // Never sent to the employee-facing course view — only the
  // tenant's own edit view and server-side grading ever read this.
  @Prop({ required: true }) correctIndex: number;
}
export const AssessmentQuestionSchema =
  SchemaFactory.createForClass(AssessmentQuestion);

@Schema({ _id: false })
export class CourseAssessment {
  @Prop({ required: true, default: 70 }) passMark: number;
  @Prop({ type: [AssessmentQuestionSchema], default: [] })
  questions: AssessmentQuestion[];
}
export const CourseAssessmentSchema =
  SchemaFactory.createForClass(CourseAssessment);

@Schema({ timestamps: true, collection: 'hr_courses' })
export class Course {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: null })
  description: string | null;

  @Prop({ required: true, trim: true })
  category: string;

  @Prop({ enum: CourseKind, required: true })
  kind: CourseKind;

  @Prop({ default: false })
  mandatory: boolean;

  @Prop({ required: true, min: 1 })
  durationMinutes: number;

  @Prop({ type: CourseAssetSchema, required: true })
  asset: CourseAsset;

  @Prop({ type: CourseAssessmentSchema, required: true })
  assessment: CourseAssessment;
}
export const CourseSchema = SchemaFactory.createForClass(Course);

@Schema({ timestamps: true, collection: 'hr_course_enrollments' })
export class CourseEnrollment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true, index: true })
  courseId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true, index: true })
  employeeId: Types.ObjectId;

  @Prop({ required: true })
  employeeName: string;

  @Prop({ enum: EnrollmentStatus, default: EnrollmentStatus.IN_PROGRESS })
  status: EnrollmentStatus;

  @Prop({ default: 0 })
  progressPercent: number;

  @Prop({ default: 0 })
  lastPositionSeconds: number;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ default: null })
  bestScore: number | null;

  @Prop({ default: null })
  lastScore: number | null;

  @Prop({ default: null })
  completedAt: Date | null;
}
export const CourseEnrollmentSchema =
  SchemaFactory.createForClass(CourseEnrollment);
