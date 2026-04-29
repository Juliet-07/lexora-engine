import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserType } from '../../../common/interfaces/user-role.enum';

export type SessionDocument = Session & Document;

@Schema({ timestamps: true })
export class Session {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: UserType })
  userType: UserType;

  // For tenant/client sessions — scope to tenant
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  refreshToken: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: null }) ipAddress: string;
  @Prop({ default: null }) userAgent: string;
  @Prop({ default: true })  isActive: boolean;
}

export const SessionSchema = SchemaFactory.createForClass(Session);