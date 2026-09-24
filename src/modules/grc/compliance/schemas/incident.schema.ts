import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type IncidentDocument = Incident & Document;

// New Compliance sub-module — previously a frontend-only prototype
// (localStorage, seeded fake data) with no backend at all. The
// frontend's data shape here is taken as the spec: every field,
// enum value and sub-record below matches
// lexora-tenant/src/pages/grc/compliance/IncidentsBreaches.tsx
// exactly, so wiring the existing UI onto this needs no UI redesign.
export enum IncidentStatus {
  OPEN = 'Open',
  INVESTIGATING = 'Investigating',
  CLOSED = 'Closed',
}
export enum IncidentSeverity {
  CRITICAL = 'Critical',
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}
export enum ActionStatus {
  PENDING = 'Pending',
  IN_PROGRESS = 'In progress',
  DONE = 'Done',
}

@Schema({ _id: false })
export class IncidentImpact {
  @Prop({ default: 'None' }) financial: string;
  @Prop({ default: 'None' }) regulatory: string;
  @Prop({ default: 'None' }) client: string;
  @Prop({ default: 'None' }) reputational: string;
}
export const IncidentImpactSchema =
  SchemaFactory.createForClass(IncidentImpact);

@Schema({ _id: false })
export class IncidentFinding {
  @Prop({ required: true }) ref: string;
  @Prop({ required: true }) finding: string;
  @Prop({ enum: IncidentSeverity, required: true }) severity: IncidentSeverity;
  @Prop({ default: '' }) action: string;
}
export const IncidentFindingSchema =
  SchemaFactory.createForClass(IncidentFinding);

@Schema({ _id: false })
export class IncidentAction {
  @Prop({ required: true }) action: string;
  @Prop({ default: '' }) owner: string;
  @Prop({ default: null }) due: Date | null;
  @Prop({ enum: ActionStatus, default: ActionStatus.PENDING })
  status: ActionStatus;
}
export const IncidentActionSchema =
  SchemaFactory.createForClass(IncidentAction);

@Schema({ _id: false })
export class IncidentFile {
  @Prop({ required: true }) name: string;
  @Prop({ default: '' }) fileUrl: string;
  @Prop({ default: '' }) type: string;
  @Prop({ default: '' }) by: string;
  @Prop({ default: () => new Date() }) date: Date;
  @Prop({ default: '' }) size: string;
}
export const IncidentFileSchema = SchemaFactory.createForClass(IncidentFile);

@Schema({ _id: false })
export class IncidentLink {
  @Prop({ required: true }) type: string;
  @Prop({ required: true }) label: string;
}
export const IncidentLinkSchema = SchemaFactory.createForClass(IncidentLink);

@Schema({ _id: false })
export class IncidentLesson {
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) category: string;
  @Prop({ default: '' }) detail: string;
  @Prop({ default: '' }) by: string;
  @Prop({ default: () => new Date() }) date: Date;
}
export const IncidentLessonSchema =
  SchemaFactory.createForClass(IncidentLesson);

@Schema({ _id: false })
export class IncidentTimelineEntry {
  @Prop({ default: () => new Date() }) at: Date;
  @Prop({ required: true }) event: string;
  @Prop({ default: '' }) detail: string;
}
export const IncidentTimelineEntrySchema = SchemaFactory.createForClass(
  IncidentTimelineEntry,
);

@Schema({ timestamps: true, collection: 'compliance_incidents' })
export class Incident {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, index: true }) ref: string;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ default: 'Other' }) category: string;
  @Prop({ enum: IncidentSeverity, default: IncidentSeverity.LOW })
  severity: IncidentSeverity;
  @Prop({ enum: IncidentStatus, default: IncidentStatus.OPEN, index: true })
  status: IncidentStatus;

  @Prop({ default: null }) occurred: Date | null;
  @Prop({ required: true }) reported: Date;
  @Prop({ default: '' }) reportedBy: string;
  // Real link to the reporting user, resolved server-side — never
  // trusted from the client. Null when reported anonymously (the
  // link still exists internally so a genuine abuse case could be
  // traced, but reportedBy/anonymous are what the UI ever shows).
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reportedByUserId: Types.ObjectId | null;
  @Prop({ default: false }) anonymous: boolean;

  @Prop({ default: '' }) assignedTo: string;
  @Prop({ default: '—' }) escalatedTo: string;
  @Prop({ default: 'Not required' }) regulatoryReport: string;
  @Prop({ default: '—' }) linkedAudit: string;

  @Prop({ default: '' }) description: string;
  @Prop({ default: '' }) investigationNotes: string;
  @Prop({ default: '' }) persons: string;
  @Prop({ default: '' }) clients: string;
  @Prop({ type: [String], default: [] }) policies: string[];
  @Prop({ default: '' }) immediateActions: string;

  @Prop({ type: IncidentImpactSchema, default: () => ({}) })
  impact: IncidentImpact;
  @Prop({ type: [String], default: [] }) rootCauses: string[];
  @Prop({ default: '' }) rootNarrative: string;

  @Prop({ type: [IncidentFindingSchema], default: [] })
  findings: IncidentFinding[];
  @Prop({ type: [IncidentActionSchema], default: [] })
  actions: IncidentAction[];
  @Prop({ type: [IncidentFileSchema], default: [] }) files: IncidentFile[];
  @Prop({ type: [IncidentLinkSchema], default: [] }) links: IncidentLink[];
  @Prop({ type: [IncidentLessonSchema], default: [] })
  lessons: IncidentLesson[];
  @Prop({ type: [IncidentTimelineEntrySchema], default: [] })
  timeline: IncidentTimelineEntry[];
}
export const IncidentSchema = SchemaFactory.createForClass(Incident);
IncidentSchema.index({ tenantId: 1, ref: 1 }, { unique: true });
