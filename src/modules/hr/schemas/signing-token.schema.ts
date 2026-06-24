import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SigningTokenDocument = SigningToken & Document;

// Deliberately a separate document from Contract — a token has its
// own lifecycle (issued, expires, consumed) distinct from the
// contract's own status field. Also means a contract can be
// re-sent (a NEW token issued) without overwriting a single token
// field on the contract itself, and old tokens stay as history.
@Schema({ timestamps: true, collection: 'hr_contract_signing_tokens' })
export class SigningToken {
  @Prop({ type: Types.ObjectId, ref: 'Contract', required: true, index: true })
  contractId: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  token: string; // cryptographically random, opaque

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: null })
  consumedAt: Date | null; // null means still valid/unused

  @Prop({ required: true, lowercase: true })
  issuedToEmail: string; // must match the contract's signerEmail at signing time
}

export const SigningTokenSchema = SchemaFactory.createForClass(SigningToken);
