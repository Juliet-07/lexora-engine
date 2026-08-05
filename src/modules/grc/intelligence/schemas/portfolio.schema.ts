import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PortfolioWorkspaceDocument = PortfolioWorkspace & Document;

@Schema({ _id: false })
export class ScenarioDeal {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) sector: string;
  @Prop({ required: true }) stage: string;
  @Prop({ default: 0 }) value: number;
  @Prop({ default: 0 }) feeRate: number;
}
export const ScenarioDealSchema = SchemaFactory.createForClass(ScenarioDeal);

@Schema({ _id: false })
export class PortfolioSettings {
  @Prop({ default: 25 }) concentrationThreshold: number;
  @Prop({ default: 75 }) feeRecoveryTarget: number;
  @Prop({ default: 2.5 }) defaultFeeRate: number;
}
export const PortfolioSettingsSchema =
  SchemaFactory.createForClass(PortfolioSettings);

@Schema({ _id: false })
export class PortfolioScenario {
  @Prop({ default: false }) enabled: boolean;
  @Prop({ type: [ScenarioDealSchema], default: [] }) added: ScenarioDeal[];
  @Prop({ type: [String], default: [] }) removedDealIds: string[];
  @Prop({ type: Object, default: {} }) valueOverrides: Record<string, number>;
}
export const PortfolioScenarioSchema =
  SchemaFactory.createForClass(PortfolioScenario);

@Schema({ timestamps: true, collection: 'deal_intel_portfolio' })
export class PortfolioWorkspace {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  tenantId: Types.ObjectId;

  @Prop({ type: PortfolioSettingsSchema, default: () => ({}) })
  settings: PortfolioSettings;
  @Prop({ type: PortfolioScenarioSchema, default: () => ({}) })
  scenario: PortfolioScenario;
}
export const PortfolioWorkspaceSchema =
  SchemaFactory.createForClass(PortfolioWorkspace);
