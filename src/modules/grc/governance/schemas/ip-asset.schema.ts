import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum IpAssetType {
  TRADEMARK = 'Trademark',
  PATENT = 'Patent',
  COPYRIGHT = 'Copyright',
  TRADE_SECRET = 'Trade Secret',
  DOMAIN = 'Domain Name',
  DESIGN = 'Design',
}

export enum IpAssetStatus {
  REGISTERED = 'Registered',
  ACTIVE = 'Active',
  PENDING = 'Pending',
  EXPIRED = 'Expired',
  LAPSED = 'Lapsed',
  ABANDONED = 'Abandoned',
}

export type IpAssetDocument = IpAsset & Document;

// Intellectual property register (Governance → Organisation Structure
// → Intellectual Property). The expiry date and every deadline on an
// asset are what feed the Compliance Calendar (see IpAssetService
// #getCalendarEntries) — they are never copied anywhere, so a date
// edited here is what the calendar shows.
@Schema({ timestamps: true, collection: 'grc_ip_assets' })
export class IpAsset {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ enum: IpAssetType, required: true })
  type: IpAssetType;

  @Prop({ default: '' }) owner: string;
  @Prop({ default: '' }) regNo: string;

  @Prop({ type: Date, default: null })
  filingDate: Date | null;

  // null = does not expire (copyright, trade secret, …).
  @Prop({ type: Date, default: null })
  expiryDate: Date | null;

  @Prop({ default: '' }) jurisdiction: string;

  @Prop({ enum: IpAssetStatus, default: IpAssetStatus.PENDING })
  status: IpAssetStatus;

  // Estimated value, tenant base currency.
  @Prop({ default: 0, min: 0 })
  value: number;

  @Prop({ default: '' }) description: string;

  @Prop({ type: [String], default: [] })
  licensees: string[];

  // Dated actions beyond the expiry itself — an annuity payment, a
  // response to an office action, an opposition window…
  @Prop({
    type: [
      {
        label: { type: String, required: true },
        dueDate: { type: Date, required: true },
        done: { type: Boolean, default: false },
        doneAt: { type: Date, default: null },
      },
    ],
    default: [],
  })
  deadlines: {
    _id?: Types.ObjectId;
    label: string;
    dueDate: Date;
    done: boolean;
    doneAt: Date | null;
  }[];

  @Prop({
    type: [
      {
        name: String,
        fileUrl: String,
        mimeType: String,
        size: Number,
        uploadedAt: Date,
      },
    ],
    default: [],
  })
  documents: {
    name: string;
    fileUrl: string;
    mimeType: string;
    size: number;
    uploadedAt: Date;
  }[];
}
export const IpAssetSchema = SchemaFactory.createForClass(IpAsset);
