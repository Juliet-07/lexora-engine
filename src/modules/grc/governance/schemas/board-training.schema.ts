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
export class BoardOnboardingTrainingModule {
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

export type BoardOnboardingTrainingModuleDocument =
  BoardOnboardingTrainingModule & Document;
export const BoardOnboardingTrainingModuleSchema = SchemaFactory.createForClass(
  BoardOnboardingTrainingModule,
);

export type BoardTrainingDocument = BoardTraining & Document;

// General, ongoing board training — distinct from BoardTrainingModule
// (which is scoped to onboarding Step 4 only, and requires every
// module to be completed before onboarding can proceed). This is the
// PO's explicit feedback (2026-09): "the tenant should be able to
// create trainings (add document of training material), board members
// get it on their portal and can indicate if they have completed the
// training or not, it is an end to end process... If there is no
// material, they should be able to indicate they have completed the
// training with proof (so they upload a certificate pdf or image to
// serve as proof) and the tenant is able to access it on their end."
export enum TrainingCategory {
  GOVERNANCE = 'Governance',
  REGULATORY = 'Regulatory',
  RISK = 'Risk',
  ESG = 'ESG',
  CYBER = 'Cyber',
  FINANCE = 'Finance',
  ETHICS = 'Ethics',
  OTHER = 'Other',
}

export enum TrainingFormat {
  IN_PERSON = 'In-person',
  ONLINE = 'Online',
  SELF_PACED = 'Self-paced',
}

// Material: the director completed a resource the tenant attached
// (resourceUrl). Proof: no resource was attached, so the director
// instead uploaded their own certificate/evidence of completion.
export enum TrainingCompletionMethod {
  MATERIAL = 'Material reviewed',
  PROOF = 'Proof of completion uploaded',
}

@Schema({ _id: false })
export class TrainingCompletion {
  @Prop({ type: Types.ObjectId, ref: 'BoardMember', default: null })
  boardMemberId: Types.ObjectId | null;
  @Prop({ required: true }) name: string;
  @Prop({ required: true, lowercase: true }) email: string;
  @Prop({ required: true, default: () => new Date() }) completedAt: Date;
  @Prop({ enum: TrainingCompletionMethod, required: true })
  method: TrainingCompletionMethod;
  @Prop({ default: null }) proofFileUrl: string | null;
  @Prop({ default: null }) proofMimeType: string | null;
  @Prop({ default: null }) proofName: string | null;
}
export const TrainingCompletionSchema =
  SchemaFactory.createForClass(TrainingCompletion);

@Schema({ timestamps: true, collection: 'grc_governance_trainings' })
export class BoardTraining {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ enum: TrainingCategory, default: TrainingCategory.GOVERNANCE })
  category: TrainingCategory;

  @Prop({ default: '' })
  provider: string;

  @Prop({ enum: TrainingFormat, default: TrainingFormat.ONLINE })
  format: TrainingFormat;

  @Prop({ default: 0 })
  cpdHours: number;

  @Prop({ default: null })
  dueDate: Date | null;

  @Prop({ default: true })
  mandatory: boolean;

  // BoardMember ids this training is assigned to — empty means every
  // active board member (matches the PO's own reference build:
  // "leave empty for the whole board").
  @Prop({ type: [Types.ObjectId], default: [], ref: 'BoardMember' })
  assignedTo: Types.ObjectId[];

  // The real content a director opens to complete this training — an
  // uploaded file or a pasted link. A training with neither is still
  // completable, but only via proof upload (never bare self-
  // attestation with no evidence at all), since there is no material
  // to point to as having been "reviewed".
  @Prop({ default: null }) resourceUrl: string | null;
  @Prop({ default: null }) resourceMimeType: string | null;
  @Prop({ default: null }) resourceName: string | null;

  @Prop({ type: [TrainingCompletionSchema], default: [] })
  completions: TrainingCompletion[];
}
export const BoardTrainingSchema = SchemaFactory.createForClass(BoardTraining);
