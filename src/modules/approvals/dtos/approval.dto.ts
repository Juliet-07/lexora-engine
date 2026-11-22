import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WorkflowStepDto {
  @IsString() @IsNotEmpty() @MaxLength(60) name: string;
  @IsIn(['Reviewer', 'Approver']) kind: 'Reviewer' | 'Approver';
  @IsArray() @ArrayMaxSize(20) @IsMongoId({ each: true }) userIds: string[];
}

export class SaveWorkflowDto {
  @IsArray() @ArrayMaxSize(50) @IsMongoId({ each: true }) drafterIds: string[];
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps: WorkflowStepDto[];
}

export class SubmitApprovalDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class DecideApprovalDto {
  @IsIn(['Approved', 'Sent back']) decision: 'Approved' | 'Sent back';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
