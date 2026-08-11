import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsArray,
  IsBoolean,
  IsMongoId,
} from 'class-validator';
import { MandateType, Rag, FeeStructure } from '../schemas';

export class CreateMandateDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsMongoId() clientUserId: string;
  @ApiProperty() @IsString() clientName: string;
  @ApiProperty({ enum: MandateType }) @IsEnum(MandateType) type: MandateType;

  @ApiPropertyOptional() @IsOptional() @IsString() manager?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() teamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() teamName?: string;

  @ApiProperty() @IsDateString() targetDate: string;
  @ApiProperty() @IsNumber() budget: number;
  @ApiProperty({ enum: FeeStructure })
  @IsEnum(FeeStructure)
  feeStructure: FeeStructure;

  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;

  // Purely informational right now (no real task-generation system
  // yet) — echoed back in the create response so the frontend's
  // "template applied" toast has real numbers rather than guessed
  // ones, exactly like the confirmed prototype's own toast.
  @ApiPropertyOptional() @IsOptional() @IsString() templateName?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() templateTaskCount?: number;
}

export class UpdateMandateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: Rag }) @IsOptional() @IsEnum(Rag) rag?: Rag;
  @ApiPropertyOptional() @IsOptional() @IsString() manager?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() teamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() teamName?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  team?: string[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() targetDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() budget?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() actualCost?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() billed?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() wip?: number;
  @ApiPropertyOptional({ enum: FeeStructure })
  @IsOptional()
  @IsEnum(FeeStructure)
  feeStructure?: FeeStructure;
  @ApiPropertyOptional() @IsOptional() @IsNumber() progress?: number;
}

export class ClearConflictCheckDto {}

export class AddMilestoneDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsDateString() date: string;
}

export class UpdateMilestoneDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional({ enum: ['pending', 'in_progress', 'completed'] })
  @IsOptional()
  @IsEnum(['pending', 'in_progress', 'completed'])
  status?: 'pending' | 'in_progress' | 'completed';
}

export class SetClosureItemDto {
  @ApiProperty() @IsBoolean() done: boolean;
}

// ── Workspace ─────────────────────────────────────────────────

export class CreateMessageDto {
  @ApiProperty() @IsString() author: string;
  @ApiProperty() @IsString() body: string;
}

export class CreateNoteDto {
  @ApiProperty() @IsString() author: string;
  @ApiProperty() @IsString() body: string;
}

export class CreateFolderDto {
  @ApiProperty() @IsString() folder: string;
}

export class FileClientDocumentDto {
  @ApiProperty() @IsString() folder: string;
}
