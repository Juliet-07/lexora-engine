import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// What a tenant has changed about the Health Score: module weights,
// indicator weights / floors / targets, and the management commentary
// that goes into the report. One document per tenant.
@Schema({ timestamps: true, collection: 'grc_health_score_settings' })
export class GrcHealthScoreSettings {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  tenantId: Types.ObjectId;

  // { grc: 25, finance: 25, … } — only modules the tenant changed.
  @Prop({ type: Object, default: {} })
  moduleWeights: Record<string, number>;

  // { 'finance.current_ratio': { floor, target, weight }, … }
  @Prop({ type: Object, default: {} })
  indicators: Record<
    string,
    { weight?: number; floor?: number; target?: number }
  >;

  @Prop({ default: '' }) ceoNote: string;

  // { grc: 'text', finance: 'text', … }
  @Prop({ type: Object, default: {} })
  moduleComments: Record<string, string>;

  @Prop({ default: null }) commentaryUpdatedAt: Date | null;
  @Prop({ default: '' }) updatedBy: string;
}
export type GrcHealthScoreSettingsDocument = GrcHealthScoreSettings & Document;
export const GrcHealthScoreSettingsSchema = SchemaFactory.createForClass(
  GrcHealthScoreSettings,
);

// One row per tenant per month (the latest score calculated in that
// month), which is what the Trend tab draws. History therefore starts
// from the first time the score was calculated — nothing is back-filled.
@Schema({ timestamps: true, collection: 'grc_health_score_snapshots' })
export class GrcHealthScoreSnapshot {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) period: string; // YYYY-MM

  @Prop({ type: Number, default: null }) composite: number | null;

  // { grc: 71.2, finance: null, … }
  @Prop({ type: Object, default: {} })
  modules: Record<string, number | null>;

  @Prop({ default: 0 }) measured: number;
  @Prop({ default: 0 }) total: number;
}
export type GrcHealthScoreSnapshotDocument = GrcHealthScoreSnapshot & Document;
export const GrcHealthScoreSnapshotSchema = SchemaFactory.createForClass(
  GrcHealthScoreSnapshot,
);
GrcHealthScoreSnapshotSchema.index(
  { tenantId: 1, period: 1 },
  { unique: true },
);
