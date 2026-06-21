import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RequisitionTypeItemDto {
  @ApiProperty() @IsString() key: string;
  @ApiProperty() @IsString() label: string;
}

export class UpdateRequisitionTypesDto {
  @ApiProperty({ type: [RequisitionTypeItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequisitionTypeItemDto)
  items: RequisitionTypeItemDto[];
}

export class CreateRequisitionDto {
  @ApiProperty({ description: "References a RequisitionType item's key" })
  @IsString()
  typeKey: string;

  @ApiProperty() @IsString() title: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'urgent'])
  priority?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() justification?: string;
}

export class ReviewRequisitionDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsIn(['approved', 'rejected'])
  decision: string;

  @ApiPropertyOptional({ description: 'Feedback the employee will see' })
  @IsOptional()
  @IsString()
  reviewNote?: string;
}
