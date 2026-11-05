import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PolicyTemplateStatus, PolicyTemplateAppliesTo } from '../schemas';

export class PolicyTemplateSectionDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string;
}

export class UpsertPolicyTemplateDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiProperty() @IsString() category: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional({
    description:
      'The whole policy as one rich-text document. Heading 1–3 become the ' +
      "tenant policy's sections and the table of contents.",
  })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({
    type: [PolicyTemplateSectionDto],
    description: 'Legacy. Send `body` instead.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PolicyTemplateSectionDto)
  sections?: PolicyTemplateSectionDto[];

  @ApiPropertyOptional({
    description:
      'Cover page (rich text, merge fields allowed). Empty = no cover page.',
  })
  @IsOptional()
  @IsString()
  coverPage?: string;

  @ApiPropertyOptional({
    description: "Add a table of contents page built from the body's headings",
  })
  @IsOptional()
  @IsBoolean()
  tocEnabled?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() tocTitle?: string;

  @ApiProperty({ enum: PolicyTemplateStatus })
  @IsEnum(PolicyTemplateStatus)
  status: PolicyTemplateStatus;

  @ApiPropertyOptional({ enum: PolicyTemplateAppliesTo })
  @IsOptional()
  @IsEnum(PolicyTemplateAppliesTo)
  appliesTo?: PolicyTemplateAppliesTo;
}

export class SetPolicyTemplateStatusDto {
  @ApiProperty({ enum: PolicyTemplateStatus })
  @IsEnum(PolicyTemplateStatus)
  status: PolicyTemplateStatus;
}
