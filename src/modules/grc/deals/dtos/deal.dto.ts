import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsIn,
  ValidateNested,
  IsEmail,
  IsBoolean,
  IsInt,
  Matches,
} from 'class-validator';
import { DealPartySide, DealType, partySide } from '../schemas';
import { Transform } from 'class-transformer';
import {
  DEAL_STAGES,
  DealStatus,
  DDWorkstream,
  DDStatus,
  Materiality,
  CPType,
  CPStatus,
} from '../schemas';
import { Type } from 'class-transformer';

export class CreateDealDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() clientId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() counterparty?: string;
  @ApiProperty({ enum: DealType }) @IsEnum(DealType) type: DealType;
  @ApiPropertyOptional() @IsOptional() @IsString() leadPartner?: string;
  @ApiProperty() @IsNumber() value: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() targetClose?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() longstopDate?: string;
}

export class CreateFolderDto {
  @ApiProperty() @IsString() name: string;
}

export class SetStageDto {
  @ApiProperty({ enum: DEAL_STAGES }) @IsIn(DEAL_STAGES) stage: string;
}

export class SetStatusDto {
  @ApiProperty({ enum: DealStatus }) @IsEnum(DealStatus) status: DealStatus;
}

export class UpdateTermSheetDto {
  @ApiPropertyOptional() @IsOptional() @IsString() structure?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() consideration?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() conditions?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() exclusivity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() confidentiality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timeline?: string;
}

export class AddDDItemDto {
  @ApiProperty({ enum: DDWorkstream })
  @IsEnum(DDWorkstream)
  workstream: DDWorkstream;
  @ApiProperty() @IsString() item: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
}

export class UpdateDDItemDto {
  @ApiPropertyOptional({ enum: DDStatus })
  @IsOptional()
  @IsEnum(DDStatus)
  status?: DDStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() finding?: string;
  @ApiPropertyOptional({ enum: Materiality })
  @IsOptional()
  @IsEnum(Materiality)
  materiality?: Materiality;
}

export class UpdateContractSectionBodyDto {
  @ApiProperty() @IsString() body: string;
}

export class AddContractCommentDto {
  @ApiProperty() @IsString() author: string;
  @ApiProperty() @IsString() text: string;
  // Which side the comment is from, if from one.
  @ApiPropertyOptional({ enum: ['Party A', 'Party B'] })
  @IsOptional()
  @IsIn(['Party A', 'Party B'])
  party?: string;
  // An internal note is for the deal team only.
  @ApiPropertyOptional() @IsOptional() @IsBoolean() internal?: boolean;
  // The words of the clause the comment is about.
  @ApiPropertyOptional() @IsOptional() @IsString() quote?: string;
}

export class AddCommentReplyDto {
  @ApiProperty() @IsString() author: string;
  @ApiProperty() @IsString() text: string;
  @ApiPropertyOptional({ enum: ['Party A', 'Party B'] })
  @IsOptional()
  @IsIn(['Party A', 'Party B'])
  party?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() internal?: boolean;
}

export class SendContractReviewDto {
  // The emails to send to, from the parties who may review it. Everyone
  // with review access when left out.
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsEmail({}, { each: true })
  recipients?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() message?: string;
}

export class RemindContractReviewDto {
  // Only these reviewers; every reviewer who has not answered when left out.
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsEmail({}, { each: true })
  recipients?: string[];
}

export class SetContractVariableDto {
  @ApiProperty() @IsString() @Matches(/^\w+$/) key: string;
  @ApiProperty() @IsString() value: string;
}

export class AddCPDto {
  @ApiProperty({ enum: CPType }) @IsEnum(CPType) type: CPType;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsString() responsible?: string;
  @ApiProperty() @IsDateString() deadline: string;
}

export class UpdateCPDto {
  @ApiPropertyOptional({ enum: CPStatus })
  @IsOptional()
  @IsEnum(CPStatus)
  status?: CPStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() evidence?: string;
}

export class AddSigningChecklistDto {
  @ApiProperty() @IsString() item: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
}

export class SendForSigningDto {
  @ApiProperty({ description: 'The deal contract to be signed' })
  @IsString()
  contractId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() message?: string;
}

export class RemindSignatoryDto {
  @ApiPropertyOptional({ description: 'Omit to remind everyone still to sign' })
  @IsOptional()
  @IsInt()
  index?: number;
}

export class SendExecutedCopiesDto {
  @ApiPropertyOptional() @IsOptional() @IsString() message?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includeCertificate?: boolean;
}

export class PublicSignDto {
  @ApiProperty({ description: 'Full name as typed by the signatory' })
  @IsString()
  name: string;
  @ApiProperty({ enum: ['typed', 'drawn'] })
  @IsIn(['typed', 'drawn'])
  method: string;
  @ApiPropertyOptional({
    description: 'A drawn signature as a PNG data URL (method = drawn)',
  })
  @IsOptional()
  @IsString()
  signatureData?: string;
  @ApiProperty() @IsBoolean() consent: boolean;
}

export class UpdateSigningDetailsDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() signingDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() venue?: string;
}

export class AddPostCompletionDto {
  @ApiProperty() @IsString() item: string;
  @ApiProperty() @IsDateString() dueDate: string;
}

export class DealPartyPermissionsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() dataRoom?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() contractReview?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() offerReview?: boolean;
}

export class AddPartyDto {
  @ApiProperty({ enum: DealPartySide })
  @Transform(({ value }) => partySide(value))
  @IsEnum(DealPartySide)
  side: DealPartySide;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional({
    description: 'The person who signs for this side (one per side).',
  })
  @IsOptional()
  @IsBoolean()
  authorizedSignatory?: boolean;
  @ApiPropertyOptional({ type: DealPartyPermissionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DealPartyPermissionsDto)
  permissions?: DealPartyPermissionsDto;
}

export class UpdatePartyDto extends PartialType(AddPartyDto) {}

export class SubmitReviewDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: ['Approved', 'Changes Requested'] })
  @IsIn(['Approved', 'Changes Requested'])
  decision: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class RenameContractDto {
  @ApiProperty() @IsString() name: string;
}

export class AddRedlineDto {
  @ApiProperty() @IsInt() lineIndex: number;
  @ApiProperty() @IsString() comment: string;
}

export class ProposeChangeDto {
  @ApiProperty({ description: 'Index of the line in the section' })
  @IsInt()
  lineIndex: number;
  @ApiProperty({
    description:
      'The line as it should read. Further lines (new paragraphs) go on new lines.',
  })
  @IsString()
  text: string;
  @ApiPropertyOptional({
    enum: DealPartySide,
    description:
      'Which side is proposing it. Defaults to the side with the pen.',
  })
  @IsOptional()
  @Transform(({ value }) => (value ? partySide(value) : value))
  @IsEnum(DealPartySide)
  party?: DealPartySide;
}

export class UpdateCommercialTermsDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() feeRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() feeRecovered?: number;
}
