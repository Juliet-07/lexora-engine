import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PolicyTemplateStatus } from '../schemas';

export class PolicyTemplateSectionDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string;
}

export class UpsertPolicyTemplateDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiProperty() @IsString() category: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @ApiProperty({ type: [PolicyTemplateSectionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PolicyTemplateSectionDto)
  sections: PolicyTemplateSectionDto[];

  @ApiProperty({ enum: PolicyTemplateStatus })
  @IsEnum(PolicyTemplateStatus)
  status: PolicyTemplateStatus;
}

export class SetPolicyTemplateStatusDto {
  @ApiProperty({ enum: PolicyTemplateStatus })
  @IsEnum(PolicyTemplateStatus)
  status: PolicyTemplateStatus;
}
