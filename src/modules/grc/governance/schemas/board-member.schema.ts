import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BoardMemberDocument = BoardMember & Document;

export enum BoardMemberRole {
  CHAIR = 'Chair',
  VICE_CHAIR = 'Vice-Chair',
  EXECUTIVE_DIRECTOR = 'Executive Director',
  NON_EXECUTIVE_DIRECTOR = 'Non-Executive Director',
  INDEPENDENT_DIRECTOR = 'Independent Director',
}

export enum SkillCategory {
  FINANCE = 'Finance',
  LEGAL = 'Legal',
  RISK = 'Risk',
  STRATEGY = 'Strategy',
  TECHNOLOGY = 'Technology',
  GOVERNANCE = 'Governance',
  INDUSTRY = 'Industry',
  OTHER = 'Other',
}
export enum SkillLevel {
  BASIC = 'Basic',
  INTERMEDIATE = 'Intermediate',
  EXPERT = 'Expert',
}

@Schema({ _id: false })
export class ConflictDisclosure {
  @Prop({ required: true }) note: string;
  @Prop({ required: true, default: () => new Date() }) disclosedAt: Date;
}
export const ConflictDisclosureSchema =
  SchemaFactory.createForClass(ConflictDisclosure);

@Schema({ _id: false })
export class TrainingRecord {
  @Prop({ required: true }) title: string;
  @Prop({ required: true, default: () => new Date() }) completedAt: Date;
}
export const TrainingRecordSchema =
  SchemaFactory.createForClass(TrainingRecord);

@Schema({ _id: false })
export class BoardSkill {
  @Prop({ required: true }) name: string;
  @Prop({ enum: SkillCategory, required: true }) category: SkillCategory;
  @Prop({ enum: SkillLevel, required: true }) level: SkillLevel;
  @Prop({ default: 0 }) yearsExperience: number;
  @Prop({ default: true }) qualified: boolean;
  @Prop({ default: '' }) notes: string;
}
export const BoardSkillSchema = SchemaFactory.createForClass(BoardSkill);

@Schema({ timestamps: true, collection: 'grc_board_members' })
export class BoardMember {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // Deliberately NOT linked to Employee/User — a board member is a
  // registry entry, not a platform login.
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ enum: BoardMemberRole, required: true, index: true })
  role: BoardMemberRole;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  appointedAt: Date;

  @Prop({ required: true })
  termEnds: Date;

  @Prop({ default: '' })
  bio: string;

  @Prop({ type: Types.ObjectId, ref: 'BoardMember', default: null })
  successorId: Types.ObjectId | null;

  @Prop({ type: [ConflictDisclosureSchema], default: [] })
  conflicts: ConflictDisclosure[];

  @Prop({ type: [TrainingRecordSchema], default: [] })
  training: TrainingRecord[];

  @Prop({ type: [BoardSkillSchema], default: [] })
  skills: BoardSkill[];
  @Prop({ default: true })
  isActive: boolean;
}
export const BoardMemberSchema = SchemaFactory.createForClass(BoardMember);
