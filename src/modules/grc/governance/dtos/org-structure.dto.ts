import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsMongoId, IsIn } from 'class-validator';
import { OrgStructureNodeType } from '../schemas';

export class CreateOrgStructureNodeDto {
  @ApiProperty({ enum: OrgStructureNodeType })
  @IsEnum(OrgStructureNodeType)
  type: OrgStructureNodeType;

  @ApiProperty() @IsString() name: string;

  @ApiPropertyOptional() @IsOptional() @IsString() subtitle?: string;

  @ApiPropertyOptional({
    description: 'Parent node id — omit to create a root-level node.',
  })
  @IsOptional()
  @IsMongoId()
  parentId?: string;
}

export class UpdateOrgStructureNodeDto {
  @ApiPropertyOptional({ enum: OrgStructureNodeType })
  @IsOptional()
  @IsEnum(OrgStructureNodeType)
  type?: OrgStructureNodeType;

  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() subtitle?: string | null;

  // Explicit null is allowed here (and preserved, not stripped) to
  // move a node back to being a root — @IsOptional() in class-validator
  // skips remaining validators for both undefined AND null.
  @ApiPropertyOptional({
    description: 'New parent node id, or null to make this a root-level node.',
    nullable: true,
  })
  @IsOptional()
  @IsMongoId()
  parentId?: string | null;
}

export class MoveOrgStructureNodeDto {
  @ApiProperty({ enum: ['up', 'down'] })
  @IsIn(['up', 'down'])
  direction: 'up' | 'down';
}
