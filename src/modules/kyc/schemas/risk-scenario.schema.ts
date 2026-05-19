import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RiskScenarioDocument = RiskScenario & Document;

/**
 * A scenario is a named combination of risk rules joined by AND/OR logic.
 * When all conditions in the scenario are met, the scenario's action fires.
 *
 * Example:
 *   "High-Value Cross-Border"
 *   IF amount > 10000 AND country IN ['IR','KP','MM']
 *   THEN flag_high + create_alert
 */
@Schema({ timestamps: true, collection: 'risk_scenarios' })
export class RiskScenario {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  // Array of rule IDs that must all be evaluated
  @Prop({ type: [Types.ObjectId], ref: 'RiskRule', default: [] })
  ruleIds: Types.ObjectId[];

  // 'AND' = all rules must match, 'OR' = any rule matches
  @Prop({ type: String, enum: ['AND', 'OR'], default: 'AND' })
  logic: 'AND' | 'OR';

  @Prop({
    type: String,
    enum: ['flag_high', 'flag_medium', 'flag_low', 'create_alert', 'block'],
    required: true,
  })
  action: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
}

export const RiskScenarioSchema = SchemaFactory.createForClass(RiskScenario);
