import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsEmail,
  IsDateString,
  IsBoolean,
  ValidateIf,
  IsMongoId,
  IsNumber,
  IsArray,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  BoardMemberRole,
  BoardMemberLifecycleStatus,
  SkillCategory,
  SkillLevel,
  TrainingType,
  ConflictType,
  SuccessionStageName,
  SuccessionStageStatus,
} from '../schemas';

export class CreateBoardMemberDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: BoardMemberRole })
  @IsEnum(BoardMemberRole)
  role: BoardMemberRole;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsDateString() appointedAt: string;
  @ApiProperty() @IsDateString() termEnds: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() idNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() taxResidency?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  otherDirectorships?: string[];
}

// ── Real, atomic appointment: creates the board member's own login
// AND generates their appointment-letter contract together, in one
// backend transaction — the exact same discipline
// CreateClientWithContractDto/createClientWithContract already
// enforces for a client (see tenant/services/tenant-client.service.ts),
// now mirrored for a director. A board member is never left behind
// without a contract already generated for them to sign.
export class CreateBoardMemberWithContractDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: BoardMemberRole })
  @IsEnum(BoardMemberRole)
  role: BoardMemberRole;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsDateString() appointedAt: string;
  @ApiProperty() @IsDateString() termEnds: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() idNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() taxResidency?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  otherDirectorships?: string[];

  // ── Contract template selection — same picker
  // (GET /tools/contract-templates/available) the KYC onboarding
  // wizard uses.
  @ApiProperty() @IsMongoId() templateId: string;
  @ApiProperty({ enum: ['platform', 'tenant'] })
  @IsEnum(['platform', 'tenant'])
  templateSource: 'platform' | 'tenant';
  @ApiProperty() @IsString() contractTitle: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) value?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;

  // ── Additional contract-merge fields — same vocabulary
  // CONTRACT_MERGE_FIELDS declares (see contract.schema.ts). All
  // optional and blank if left empty.
  @ApiPropertyOptional() @IsOptional() @IsString() scopeOfWork?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantCompanyJurisdiction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clientJurisdiction?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leadProfessionalName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leadProfessionalTitle?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientRepresentativeName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientRepresentativeTitle?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  commencementDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() engagementDuration?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantRegisteredAddress?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientRegisteredAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceCategory?: string;
}

export class UpdateBoardMemberDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ enum: BoardMemberRole })
  @IsOptional()
  @IsEnum(BoardMemberRole)
  role?: BoardMemberRole;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() termEnds?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() idNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() taxResidency?: string;
  @ApiPropertyOptional({ enum: BoardMemberLifecycleStatus })
  @IsOptional()
  @IsEnum(BoardMemberLifecycleStatus)
  lifecycleStatus?: BoardMemberLifecycleStatus;
}

export class RecordConflictDto {
  @ApiProperty() @IsString() note: string;
  @ApiPropertyOptional({ enum: ConflictType })
  @IsOptional()
  @IsEnum(ConflictType)
  type?: ConflictType;
}

export class LogTrainingDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() completedAt?: string;
  @ApiPropertyOptional({ enum: TrainingType })
  @IsOptional()
  @IsEnum(TrainingType)
  type?: TrainingType;
  @ApiPropertyOptional() @IsOptional() @IsString() provider?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() hours?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
}

export class SetSuccessorDto {
  @ApiProperty({
    description: 'Board member ID to set as successor, or null to clear',
    nullable: true,
  })
  @ValidateIf((o) => o.successorId !== null)
  @IsMongoId()
  successorId: string | null;
}

export class AddSkillDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: SkillCategory })
  @IsEnum(SkillCategory)
  category: SkillCategory;
  @ApiProperty({ enum: SkillLevel }) @IsEnum(SkillLevel) level: SkillLevel;
  @ApiPropertyOptional() @IsOptional() @IsNumber() yearsExperience?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() qualified?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateRemunerationDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() annualRetainer?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() committeeChairFee?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  meetingAttendanceFee?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  lastReviewedAt?: string;
}

class CommitteeMembershipDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isChair?: boolean;
}

export class SetCommitteesDto {
  @ApiProperty({ type: [CommitteeMembershipDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommitteeMembershipDto)
  committees: CommitteeMembershipDto[];
}

export class UpdateAttendanceDto {
  @ApiProperty() @IsNumber() @Min(0) @Max(100) attendancePercentage: number;
}

export class AddOtherDirectorshipDto {
  @ApiProperty() @IsString() value: string;
}

export class InitiateSuccessionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() triggerType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() triggeredBy?: string;
}

export class UpdateSuccessionStageDto {
  @ApiProperty({ enum: SuccessionStageName })
  @IsEnum(SuccessionStageName)
  stageName: SuccessionStageName;
  @ApiProperty({ enum: SuccessionStageStatus })
  @IsEnum(SuccessionStageStatus)
  status: SuccessionStageStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateRiskAssessmentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() criticality?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skillsAtRisk?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  committeeRolesAtRisk?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() regulatoryImpact?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() diversityImpact?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  institutionalKnowledgeRating?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() internalCandidates?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() externalCandidates?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timeToReplaceEstimate?: string;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((o) => o.interimSuccessorId !== null)
  @IsOptional()
  @IsMongoId()
  interimSuccessorId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() interimNotes?: string;
}

export class AddSuccessionCandidateDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() source?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skillsMatch?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() bnrPreCleared?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() availability?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assessmentStatus?: string;
}

export class InitiateOffboardingDto {
  @ApiProperty() @IsString() reason: string;
  @ApiProperty() @IsDateString() effectiveDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// ═══════════════════════════════════════════════════════════════
// BOARD PORTAL — self-service onboarding form submissions. Mirrors
// the PO's own reference build (lexora-board's onboardingMockData.ts)
// field-for-field: a past directorship (Fit & Proper) or a current
// one (Documents & COI) share this same three-field shape there too.
// ═══════════════════════════════════════════════════════════════

export class BoardDirectorshipEntryDto {
  @ApiProperty() @IsString() company: string;
  @ApiProperty() @IsString() position: string;
  @ApiPropertyOptional() @IsOptional() @IsString() detail?: string;
}

export class OnboardingYesNoAnswerDto {
  @ApiProperty() @IsString() questionId: string;
  @ApiProperty() @IsBoolean() yes: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() detail?: string;
}

export class SubmitFitProperDto {
  @ApiProperty() @IsString() fullName: string;
  @ApiProperty() @IsDateString() dob: string;
  @ApiProperty() @IsString() idNumber: string;
  @ApiProperty() @IsString() nationality: string;
  @ApiProperty() @IsString() address: string;
  @ApiPropertyOptional({ type: [BoardDirectorshipEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BoardDirectorshipEntryDto)
  directorships?: BoardDirectorshipEntryDto[];
  @ApiPropertyOptional({ type: [OnboardingYesNoAnswerDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnboardingYesNoAnswerDto)
  answers?: OnboardingYesNoAnswerDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() referenceName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceRelationship?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() referenceEmail?: string;
}

export class SubmitDocumentsCoiDto {
  @ApiProperty({ type: [String], description: "'charter' | 'conduct' | 'nda'" })
  @IsArray()
  @IsString({ each: true })
  signedDocumentIds: string[];
  @ApiProperty() @IsBoolean() holdsOtherDirectorships: boolean;
  @ApiPropertyOptional({ type: [BoardDirectorshipEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BoardDirectorshipEntryDto)
  currentDirectorships?: BoardDirectorshipEntryDto[];
  @ApiPropertyOptional({ type: [OnboardingYesNoAnswerDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnboardingYesNoAnswerDto)
  answers?: OnboardingYesNoAnswerDto[];
}

export class SubmitOnboardingTrainingDto {
  @ApiProperty({ type: [String], description: "'aml' | 'privacy' | 'abc'" })
  @IsArray()
  @IsString({ each: true })
  completedModuleIds: string[];
}

export class SubmitInductionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() scheduledDate?: string;
}
