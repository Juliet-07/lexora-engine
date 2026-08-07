import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EsgOrgContextDocument = EsgOrgContext & Document;
export type EsgScoreHistoryDocument = EsgScoreHistory & Document;

@Schema({ _id: false })
export class PeerAverage {
  @Prop({ default: 0 }) environmental: number;
  @Prop({ default: 0 }) social: number;
  @Prop({ default: 0 }) governance: number;
}
export const PeerAverageSchema = SchemaFactory.createForClass(PeerAverage);

// Singleton per tenant — the shared context every intensity metric,
// benchmark and pillar score reads from. Get-or-create, same pattern
// as PortfolioWorkspace.
@Schema({ timestamps: true, collection: 'esg_org_context' })
export class EsgOrgContext {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  tenantId: Types.ObjectId;

  @Prop({ default: 0 }) employees: number;
  @Prop({ default: 0 }) floorAreaSqm: number;
  @Prop({ default: 0 }) revenueMillions: number;
  @Prop({ default: '' }) sector: string;

  @Prop({ type: PeerAverageSchema, default: () => ({}) })
  peerAverage: PeerAverage;
}
export const EsgOrgContextSchema = SchemaFactory.createForClass(EsgOrgContext);

// One row per closed period — a manually confirmed snapshot of the
// three pillar scores at that point in time, used for the Dashboard's
// year-on-year trend chart. Snapshotting the *current* period is an
// explicit action (see ContextService.snapshotHistory), same spirit
// as Valuation's version snapshots — it doesn't happen silently.
@Schema({ timestamps: true, collection: 'esg_score_history' })
export class EsgScoreHistory {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) period: string;
  @Prop({ required: true }) e: number;
  @Prop({ required: true }) s: number;
  @Prop({ required: true }) g: number;
}
export const EsgScoreHistorySchema =
  SchemaFactory.createForClass(EsgScoreHistory);
EsgScoreHistorySchema.index({ tenantId: 1, period: 1 }, { unique: true });
