import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { PlatformModuleKey } from '../../../common/interfaces/user-role.enum';

export type PlatformModuleDocument = PlatformModule & Document;

@Schema({ timestamps: true })
export class PlatformModule {
  @Prop({ required: true, unique: true, enum: PlatformModuleKey })
  key: PlatformModuleKey;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description: string;

  @Prop({ default: null })
  iconUrl: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const PlatformModuleSchema =
  SchemaFactory.createForClass(PlatformModule);
