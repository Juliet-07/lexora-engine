import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type IncidentDocument = Incident & Document;

export enum IncidentCategory {
  SECURITY = 'Security',
  OPERATIONAL = 'Operational',
  COMPLIANCE = 'Compliance',
  FRAUD = 'Fraud',
  ERROR = 'Error',
  SYSTEM_OUTAGE = 'System Outage',
}

export enum IncidentSeverity {
  CRITICAL = 'Critical',
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

export enum IncidentStatus {
  REPORTED = 'Reported',
  INVESTIGATING = 'Investigating',
  AWAITING_SIGNOFF = 'Awaiting Sign-off',
  CLOSED = 'Closed',
}

export enum RcaMethod {
  FIVE_WHYS = '5 Whys',
  FISHBONE = 'Fishbone',
}

@Schema({ timestamps: true, collection: 'grc_incidents' })
export class Incident {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) title: string;
  @Prop({ default: '' }) description: string;
  @Prop({ enum: IncidentCategory, required: true }) category: IncidentCategory;
  @Prop({ enum: IncidentSeverity, required: true, index: true })
  severity: IncidentSeverity;
  @Prop({ enum: IncidentStatus, default: IncidentStatus.REPORTED, index: true })
  status: IncidentStatus;
  @Prop({ required: true, default: () => new Date() }) reportedAt: Date;

  @Prop({ default: '' }) investigator: string;
  @Prop({ default: null }) dueDate: Date | null;

  @Prop({ enum: RcaMethod, default: null }) rcaMethod: RcaMethod | null;
  @Prop({ default: '' }) rcaNotes: string;
  @Prop({ default: '' }) correctiveActions: string;
  @Prop({ default: '' }) preventiveActions: string;

  @Prop({ default: '' }) lessonsLearned: string;
  @Prop({ default: '' }) signOffBy: string;
  @Prop({ default: null }) closedAt: Date | null;
}
export const IncidentSchema = SchemaFactory.createForClass(Incident);
