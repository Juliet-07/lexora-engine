import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WatchlistEntryDocument = WatchlistEntry & Document;

export enum WatchlistType {
  SANCTIONS     = 'sanctions',
  PEP           = 'pep',
  ADVERSE_MEDIA = 'adverse_media',
  INTERNAL_BLOCK = 'internal_block',
}

export enum WatchlistEntityType {
  INDIVIDUAL   = 'individual',
  ORGANIZATION = 'organization',
}

@Schema({ timestamps: true, collection: 'watchlist_entries' })
export class WatchlistEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  tenantId: Types.ObjectId;

  // Auto-generated WL001, WL002 ...
  @Prop({ required: true })
  entryId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: null })
  aliases: string | null; // aka, alternate names

  @Prop({ type: String, enum: WatchlistEntityType, required: true })
  entityType: WatchlistEntityType;

  @Prop({ type: String, enum: WatchlistType, required: true })
  listType: WatchlistType;

  @Prop({ default: null })
  country: string | null;

  @Prop({ default: null })
  source: string | null; // e.g. 'OFAC SDN', 'EU Consolidated', 'Internal Risk Team'

  @Prop({ default: null })
  reason: string | null;

  @Prop({ default: true })
  isActive: boolean;

  // For entries synced from OpenSanctions — store their ID
  @Prop({ default: null })
  externalId: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  addedBy: Types.ObjectId | null;
}

export const WatchlistEntrySchema = SchemaFactory.createForClass(WatchlistEntry);
WatchlistEntrySchema.index({ tenantId: 1, name: 'text', aliases: 'text' });
WatchlistEntrySchema.index({ tenantId: 1, listType: 1 });
