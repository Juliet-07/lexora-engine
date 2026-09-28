import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// A tenant-managed mandatory-training module for board onboarding
// (Step 4). Replaces the old fixed 3-item list (AML/CFT Awareness,
// Data Protection & Privacy, Anti-Bribery & Corruption) that used to
// live in lexora-board's onboardingMockData.ts with a real,
// tenant-authored catalog — the tenant creates/removes modules here
// (optionally attaching a real resource file or link), and every
// director's Step 4 is built from whatever the tenant currently has
// configured, the same "nothing configured → nothing blocking" rule
// already used for documentsToSign. Tenant-wide (not per-director),
// since mandatory compliance training is normally the same for every
// director, unlike the per-director documentsToSign/inductionPack
// snapshots.
@Schema({ timestamps: true })
export class BoardTrainingModule {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  // The real content "Start module" opens — an uploaded file (slides,
  // PDF, recording) or an external link the tenant pastes in. A
  // module with neither is still completable via self-attestation,
  // matching the rest of this feature's onboarding steps.
  @Prop({ default: null })
  resourceUrl: string | null;

  @Prop({ default: null })
  resourceMimeType: string | null;

  @Prop({ default: 0 })
  order: number;
}

export type BoardTrainingModuleDocument = BoardTrainingModule & Document;
export const BoardTrainingModuleSchema =
  SchemaFactory.createForClass(BoardTrainingModule);
